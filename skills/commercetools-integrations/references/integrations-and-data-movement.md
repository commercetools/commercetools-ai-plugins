# Integrations and Data Movement

**Source:** "Integrations and Data Movement" presentation (Professional Services Americas)

---

## Integration Architecture Patterns

Three primary patterns are used to integrate commercetools with the surrounding commerce stack. The right choice depends on coupling tolerance, data volume, latency requirements, and operational complexity.

### 1. Direct Integration

The calling system calls the CT API (or vice versa) without an intermediary.

**When to use:**
- Low-volume, real-time interactions (e.g., storefront reading a product)
- Simple integration with a single upstream or downstream system
- Latency-sensitive operations where middleware would add unacceptable delay

**Trade-offs:**
- Tight coupling — the caller must handle CT API errors, rate limits, and retry logic directly
- No central place to inspect or replay failed messages
- Schema changes on either side require updates to the calling code

### 2. Middleware / Integration Platform

A middleware layer (MuleSoft, Boomi, Azure Integration Services, AWS Step Functions, custom Node/Java service) sits between CT and external systems. It handles transformation, routing, retry, and error handling.

**When to use:**
- Multiple systems need to exchange data with CT (PIM, ERP, OMS, WMS all integrated through one layer)
- Data transformation is complex (e.g., ERP product format is very different from CT product draft)
- Retry, dead-letter queue, and audit trail requirements are strict
- Fan-out needed: one CT event must notify several downstream systems

**Trade-offs:**
- Adds operational overhead: the middleware must be deployed, monitored, and maintained
- Can become a bottleneck or single point of failure if not designed for high availability
- Correct — schema mapping lives in one place, making changes easier to manage

### 3. Event Bus

An event bus (AWS EventBridge, Google Pub/Sub, Kafka, Azure Event Hub) decouples producers and consumers entirely. CT publishes events via Subscriptions; consumers subscribe to topics they care about.

**When to use:**
- High-volume, fan-out scenarios (many consumers, many event types)
- Independent teams own different consumer services
- Event replay is needed (e.g., reprocess all order-created events after a consumer bug)
- Loose coupling is a hard requirement

**Trade-offs:**
- Eventual consistency — consumers may be behind by seconds to minutes
- Requires schema governance for event payloads
- DLQ (dead-letter queue) handling adds operational complexity
- CT subscriptions are at-least-once delivery; consumers must be idempotent

---

## CT's Role in the Commerce Architecture

Commercetools is a **commerce platform**, not a general-purpose data store. Understanding where CT is and is not the system of record is the most important design decision in any integration.

### Where CT IS the system of record

| Data Domain | Notes |
|---|---|
| Cart and checkout state | CT owns the cart lifecycle from creation to order |
| Orders | CT is the order of record at the point of purchase; OMS may own fulfillment state afterward |
| Customer profiles (commerce identity) | CT stores commerce-specific customer data: addresses, password, customer group, loyalty number |
| Discount and promotion rules | Cart discounts, product discounts, discount codes — defined and evaluated in CT |
| Tax categories and rates (platform tax mode) | CT evaluates taxes using stored tax categories and rates |

### Where CT is NOT the system of record (CT is the consumer)

| Data Domain | Actual Owner | CT's Role |
|---|---|---|
| Product content and attributes | PIM (Akeneo, inRiver, Contentful, etc.) | Stores published product data for cart/search serving |
| Pricing | ERP, pricing engine (e.g., Vendavo) | Stores prices for serving; receives updates via sync |
| Inventory levels | WMS or ERP | Stores inventory for availability checks; receives updates via sync |
| Fulfillment state | OMS (Manhattan, Blue Yonder, custom) | Reflects OMS state via order/shipment state updates |
| Customer identity and authentication | IDP (Auth0, Cognito, Okta) | Stores commerce profile; `externalId` links to IDP user |
| Financial/accounting data | ERP | CT does not replace an ERP; order totals flow to ERP for settlement |

**Design principle:** When two systems can write the same field, version conflicts are unavoidable. Choose one owner per data domain and make the other a read replica or consumer.

---

## Common Integration Points

### PIM Integration

**Purpose:** Sync product content (names, descriptions, images, attributes) from the PIM to CT.

**Recommended approach:** Use the CT **Import API** for bulk and periodic syncs. Use direct REST for real-time single-product updates.

**Key considerations:**
- CT Product Types define the attribute schema. The PIM's attribute model must be mapped to a CT Product Type before any products are imported.
- Product Type attributes cannot be easily changed once products exist. Design the mapping carefully upfront.
- Images: CT stores image URLs, not binary files. Host images on a CDN and store the CDN URL in CT.
- Localized fields (name, description, slug) use a `LocalizedString` map (`{ "en": "...", "de": "..." }`). Ensure PIM locale codes match CT project locales.

### ERP Integration

**Purpose:** Sync pricing, inventory levels, and potentially order settlement data.

**Pricing sync:**
- Use **Standalone Prices** (preferred over embedded variant prices) for externally managed pricing. Standalone prices support channels and customer groups out of the box.
- ERP sends price updates → integration layer creates/updates `StandalonePrice` resources via Import API or REST.
- Price changes in CT are eventually consistent with the ERP; design for a sync lag of seconds to minutes.

**Inventory sync:**
- CT `InventoryEntry` is keyed by `sku` + optional `supplyChannel`.
- ERP sends stock level updates → integration sets `quantityOnStock` via `changeQuantity` or `addQuantity` update actions.
- For multi-warehouse, map each warehouse to a CT Channel of type `InventorySupply`.

**Order settlement:**
- After order creation in CT, order data (line items, totals, taxes) must flow to the ERP for financial processing.
- Use CT Subscriptions (`OrderCreated` message) to trigger the outbound flow to the ERP.

### WMS Integration

**Purpose:** Receive fulfilled inventory updates and shipment confirmations from the warehouse.

**Outbound (CT → WMS):** Use subscriptions on `OrderCreated` or order state transitions to notify the WMS of new orders to pick/pack/ship.

**Inbound (WMS → CT):** WMS posts shipment confirmations; integration calls CT to set `ShipmentState`, add `ParcelTracking`, and transition the order state.

### OMS Integration

**Purpose:** OMS owns the fulfillment workflow. CT creates the order; OMS drives it to completion.

**Outbound (CT → OMS):** Subscription on `OrderCreated` pushes new order payload to OMS. Include all line items, shipping address, and custom fields needed for fulfillment routing.

**Inbound (OMS → CT):** OMS posts state updates back to CT via REST. Common update actions: `transitionState`, `setShipmentState`, `addReturnInfo`, `addParcelToDelivery`.

**Version conflict caution:** If both CT (via storefront) and OMS (via integration) update the same order concurrently, `409 Concurrent Modification` errors occur. Coordinate which system drives updates after order creation.

### Marketing Tools (ESP, CDP)

**Purpose:** Sync customer profiles and order history to email/SMS platforms or customer data platforms.

**Pattern:** CT Subscriptions on customer changes and order events push data to marketing systems. Use the `CustomerAddressChanged`, `OrderCreated`, and `OrderStateChanged` message types.

**PII caution:** Customer email addresses and order details are PII. Ensure the event bus and any intermediate storage comply with your GDPR/privacy obligations. The ChangeSubscription pattern (which omits PII from the payload and fetches on demand) is preferable when event bus retention policies cannot be tightly controlled.

---

## CT-Specific Integration Considerations

### API Rate Limits

CT enforces rate limits per project. Exceeding them returns `429 Too Many Requests`.

**Key practices:**
- Instrument your integration layer to read `X-RateLimit-Remaining` from every CT response header. Alert when it drops below 20%.
- For known high-volume events (initial data load, Black Friday), request a rate limit increase from CT support at least 2 weeks in advance.
- Use the Import API for bulk operations — it is asynchronous and designed for high-volume ingestion without consuming per-second request quota in the same way as synchronous REST calls.
- Implement exponential backoff with jitter on `429` responses.

### Batch Strategies

**Import API (async, recommended for bulk):**
- Group up to 200,000 operations per ImportContainer
- Monitor ImportSummary to track completion
- Handle `validationFailed` and `rejected` operations with alerting and replay logic

**Direct REST batch (sync, low volume):**
- Send requests in parallel but stay within rate limits
- Each request must include the current resource `version`; cache versions to reduce fetch overhead
- On `409 Concurrent Modification`, re-fetch and retry with backoff

**Chunking:** Break large datasets into chunks of 500–1,000 records per batch. Smaller chunks are easier to retry on partial failure and produce faster intermediate progress signals.

### Idempotency

CT does not natively support client-generated idempotency keys on most REST endpoints. Design for idempotency in your integration layer:

- **Use `key` fields:** Most CT resources support a client-assigned `key`. Use the source system's identifier as the CT `key`. An upsert-style Import API call will update an existing resource if the key already exists, avoiding duplicates.
- **Check before create:** For REST creates where Import API is not available, query for the resource by `key` before creating. If it exists, update instead.
- **Subscription consumers:** Use `sequenceNumber` (on Message subscriptions) or `resourceVersion` to detect already-processed events. Store the last processed value in a persistent store (e.g., DynamoDB, Redis).

### Data Transformation and Schema Mapping

**Localized strings:** CT represents localizable fields as `LocalizedString` maps. Source systems often provide a flat locale-specific string. Your integration must construct the map from all available locales.

**Money:** CT uses `centAmount` (integer) + `currencyCode` for prices. Never pass floating-point amounts. Convert source system decimal prices to centAmount by multiplying by 100 (or by the appropriate factor for currencies with non-two-decimal precision).

**References:** CT resources reference each other by `typeId` + `id` (or `key`). When importing, prefer `key`-based references where supported — they are more stable across environments than IDs and do not require a lookup.

**Date/time:** CT uses ISO 8601 UTC (`2024-01-15T10:30:00.000Z`). Ensure source system timestamps are converted to UTC before sending to CT.

### Environment Promotion

Integration configuration (extension URLs, subscription endpoints, type definitions) must be managed per environment (dev, staging, prod). Common patterns:

- **Infrastructure as Code:** Store extension and subscription configurations in IaC (Terraform, Pulumi) parameterized by environment. Apply to each environment as part of the CI/CD pipeline.
- **Config export/import:** Use the commercetools Sync tool or custom scripts to promote configuration objects (types, states, tax categories) from staging to production.
- **Never share API clients across environments.** Each environment (dev, staging, prod) must have its own API client with its own credentials and scopes.
