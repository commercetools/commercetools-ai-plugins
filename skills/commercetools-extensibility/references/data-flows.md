# Data Flows

**Source:** "Data Flows" presentation (Customer Success Engineering)

---

## What Are Subscriptions?

In an event-driven architecture, multiple decoupled systems communicate with each other via events. Commercetools subscriptions allow you to be notified of events on the platform via event messages or resource change notifications.

Subscriptions are used to trigger an asynchronous background process in response to an event on the commercetools platform. A subscription delivers one of two payload types:
- A **Message** — represents a specific change or action on a resource (order created, product published, customer password updated)
- A **Change notification** — a lightweight signal that any change occurred on a resource (no details about what changed)

Messages can be pulled via the REST API or pushed into a message queue by creating a subscription.

**Common use cases:**
- Product published/unpublished → notify downstream search index or CDN
- Order created → send confirmation email, notify OMS/WMS/ERP
- Cart created or modified → push to downstream systems for abandonment flows
- Order state changes → update BI/data warehouse
- Price, category, channel, or customer changes → fan out to multiple subscribers

**Documentation:**
- [Create a subscription](https://docs.commercetools.com/api/projects/subscriptions#create-a-subscription)
- [Subscription tutorial](https://docs.commercetools.com/tutorials/subscriptions)
- [AWS EventBridge subscriptions](https://docs.commercetools.com/tutorials/subscriptions-eventbridge)
- [Message types](https://docs.commercetools.com/api/message-types)
- [Delivery payloads](https://docs.commercetools.com/api/projects/subscriptions#delivery)

---

## Message Payloads and Delivery Guarantees

**Payload size limit:** 256 KB (varies by queue). If the payload exceeds this, the message will contain a `payloadNotIncluded` field rather than the full payload. Retrieve the complete message via the Messages Query HTTP API.

**Retry behavior:**
- `TemporaryError` — CT retries for up to 48 hours; after that, messages may be dropped
- `ConfigurationError` — CT retries for up to 24 hours (production) or 1 hour (dev/staging); then transitions to `ConfigurationErrorDeliveryStopped` and messages are dropped

**At-least-once delivery:** Subscriptions guarantee at-least-once delivery, not exactly-once. Build idempotent consumers that use `sequenceNumber` or `resourceVersion` to detect and skip duplicates.

**Supported queue destinations:** SQS, Google Pub/Sub, Azure Service Bus, AWS EventBridge, SNS

---

## API Extensions

API Extensions intercept API calls **before** the resource is persisted, allowing your custom code to validate or modify the resource.

**How it works:**
1. A CT API call (e.g., cart update) triggers the configured extension
2. CT calls your extension endpoint synchronously
3. Your code returns HTTP 200 with optional `updateActions` (up to 100), or HTTP 4xx/5xx to reject the call
4. CT applies any returned update actions and persists the resource (or returns an error to the caller if your extension rejected)

**Return values:**
- HTTP 200 with a list of update actions → CT applies them before saving
- HTTP 200 with no actions → CT saves the resource as-is
- HTTP 4xx/5xx → the original API call fails and the caller receives an error

**Example — tax integration flow:**
1. Cart update triggers the API Extension
2. Extension calls tax provider (e.g., Avalara, Vertex) to calculate taxes for all cart items
3. Tax provider response is transformed into `setLineItemTaxRate` / `setCartTotalTax` update actions
4. CT persists the cart with external tax amounts applied

**Timeout limits (hard limits):**
- Default platform-wide timeout: **2 seconds**
- Can be increased via support request based on a documented use case
- The increased platform-wide limit does not take effect until the timeout on the individual extension is also updated
- If your extension exceeds the timeout, **the entire originating API call fails**

**Extension hosting:** Extensions must be hosted in your own infrastructure:
- AWS Lambda
- Azure Functions
- Google Cloud Functions
- HTTP REST endpoints

**When to use vs. alternatives:**
- Use an extension only for logic that **must execute before the API call succeeds** (validation, synchronous enrichment)
- If the logic can run after the fact, a **Subscription** is more appropriate and has no timeout risk
- If the logic can run from the calling application code, do it there instead

---

## Environment Build Order of Operations

Most implementations require cloud infrastructure (Lambda functions, queue listeners, API gateways) before data can be loaded. Infrastructure-as-code tools (Azure Resource Manager, Google Deployment Manager, Terraform) are used to provision environments in a repeatable way.

**Critical ordering constraint:** Configure the project schema before importing any data. Resources that define structure must exist before the resources that depend on them.

**Recommended order:**
1. Create project and configure project settings (currencies, languages, countries)
2. Create **Tax Categories**
3. Create **Types** (custom types for extensibility)
4. Create **States** (workflow states for orders, products, etc.)
5. Create **Product Types** (attribute schema — must exist before products)
6. Create **Categories** (can reference parent categories; Import API handles dependency order automatically)
7. Create **Channels** (supply and distribution channels)
8. Create **Shipping Methods** and **Zones**
9. Create **Cart Discounts** and **Discount Codes**
10. Import **Customers** (required before importing orders that reference customers)
11. Import **Products** and **Product Variants** (requires product types)
12. Import **Standalone Prices** / **Inventory Entries**
13. Import **Orders** (requires customers and products to already exist)

**Key gotcha:** Products cannot be imported before their Product Type exists. Customers must exist before orders that reference them are imported. Violating this ordering produces dependency errors that are difficult to diagnose at scale.

---

## Import API vs. REST API for Bulk Data Flows

The **Import API** is the preferred path for bulk data loading into commercetools.

| Characteristic | Import API | REST API (direct) |
|---|---|---|
| Execution model | Asynchronous | Synchronous |
| Dependency handling | Automatic (e.g., parent categories resolved) | Manual — caller must order requests |
| Error surfacing | Per-operation status queryable after the fact | Immediate per-request HTTP error |
| Supported resources | Products, variants, prices, categories, customers, orders, inventory, types, states, tax categories, custom objects, shopping lists | All resources |
| Best for | Initial data load, periodic bulk sync, PIM/ERP integration | Real-time single-resource updates |

**Import API flow:**
1. Create an **ImportContainer** (logical grouping for an import batch)
2. Post an **ImportRequest** to the resource-specific endpoint (e.g., `/import/product-drafts`)
3. CT returns an **ImportResponse** listing the new **ImportOperations** and their initial validation status
4. Poll **ImportSummary** to track aggregate progress across all operations in the container
5. Query operations in `validationFailed` or `rejected` state for detailed error messages
6. On success, operation state transitions to `imported`

**Best practices for large-scale imports (millions of records):**
- Keep the maximum number of operations per container to **200,000** if you need to query import summaries, operation statuses, or delete a container
- **Notify the CT support team in advance** for large data events (initial load, periodic bulk sync) — they schedule the event calendar and monitor for unusual load in the multi-tenant environment
- Check resource limits in the documentation; work with Professional Services if you need to exceed documented limits
- Work with Professional Services to design an import strategy for millions-of-records scenarios to avoid impacting your own services and neighbors in the multi-tenant environment

---

## Common Integration Data Flow Patterns

### PIM → commercetools

**Pattern:** PIM is the system of record for product content. Changes in the PIM trigger an export (via webhook or scheduled job) that feeds into CT Import API.

**Flow:**
1. PIM change event (product update, new variant, attribute change)
2. Integration layer transforms PIM data model to CT product draft / product variant import format
3. Import API call with `importOperations` for changed products
4. Monitor import status; handle `validationFailed` / `rejected` with alerting

**Gotcha:** Product type attributes in CT must match the PIM attribute schema. Schema mismatches cause `validationFailed` import operations — validate mappings in a staging environment before production cutover.

**Delta sync:** For ongoing sync, send only changed records (delta), not full catalog. Use PIM-side change timestamps or event streams to identify deltas. A full catalog reimport at scale creates unnecessary load.

### OMS → commercetools (order state sync)

**Pattern:** OMS is the system of record for fulfillment state. OMS updates are pushed back into CT to keep order status current for customer-facing channels.

**Flow:**
1. OMS fulfillment event (shipped, delivered, cancelled, returned)
2. Integration layer maps OMS status to CT `OrderState`, `ShipmentState`, or `ReturnInfo`
3. CT REST API call: `transitionState` or `updateOrder` with the appropriate update action
4. Subscription on CT order resource notifies downstream systems of the state change

**Conflict resolution:** Use CT's optimistic concurrency (resource `version` field). If a `409 Concurrent Modification` error is returned, fetch the current version and retry. In high-throughput OMS integrations, implement exponential backoff with jitter.

### ERP → commercetools (inventory and price sync)

**Pattern:** ERP is the system of record for inventory levels and pricing. Periodic or event-driven sync pushes updates into CT.

**Flow (inventory):**
1. ERP inventory update event
2. Integration maps SKU/location to CT `InventoryEntry` (identified by `sku` + `supplyChannel`)
3. `addInventory` or `changeQuantity` update action on the inventory entry

**Flow (pricing):**
1. ERP price change event
2. Integration maps to CT `StandalonePrice` (preferred for managed prices) or embedded price on the product variant
3. Import API or direct REST call to create/update the price

**Gotcha — ordering for prices:** Standalone prices require the product and variant to already exist in CT. If the ERP sync runs before the PIM sync completes, price imports will fail with `ReferencedResourceNotFound`. Sequence your pipeline so product data lands before price data.

---

## Event-Driven vs. Synchronous Integration

| Approach | When to Use | Trade-offs |
|---|---|---|
| **Event-driven (subscriptions)** | Downstream systems need to react to CT state changes; loose coupling required; high volume of changes | Async — eventual consistency; requires idempotent consumers; retry/DLQ handling needed |
| **Synchronous (direct API call)** | Real-time validation required; upstream system needs immediate confirmation; low volume | Tight coupling; extension timeouts are fatal; scales poorly under load |
| **Polling** | Downstream system cannot receive push events; simple operational requirements | Latency proportional to poll interval; wastes API quota if nothing changed; proven at 10k–100k+ orders/day with CT Messages API |

**Data ownership principle:** Define a single system of record for each data domain:
- Product content → PIM owns it; CT is the consumer
- Pricing → ERP or pricing engine owns it; CT stores it for serving
- Inventory → WMS/ERP owns it; CT stores it for cart reservation
- Orders → CT creates them; OMS owns fulfillment state

When two systems can mutate the same field, version conflicts become frequent. Design integrations so writes flow in one direction per data domain.

---

## Version Conflict Handling in Batch Imports

CT uses optimistic concurrency. Every resource has a `version` integer that increments on each update. A write must supply the current `version` or it is rejected with a `409 Concurrent Modification` error.

**In batch imports:**
- The Import API handles versioning internally — you do not send a `version` field
- Direct REST batch updates require you to fetch the current version before each update
- In high-throughput batches, conflicts accumulate when multiple workers update the same resource concurrently

**Recommended pattern for REST batch updates:**
1. Fetch the resource (get current `version`)
2. Apply update with the fetched `version`
3. On `409`, re-fetch and retry (exponential backoff, max 3–5 retries)
4. Log persistent failures for manual review

**Parallel worker caution:** If multiple workers process the same resource type concurrently, partition the work so each resource is owned by exactly one worker at a time. For example, partition by product key or customer ID.
