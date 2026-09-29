---
name: erp-connector-contract
description: "The runtime contract for each flow of a commercetools Connect ERP connector — order export, master-data inbound, inventory, customer and B2B account replication, invoice write-back — with the trigger, API, idempotency key, and ERP-down behavior per flow, the Connect runtime budgets that constrain ERP batch reality, and the pitfall catalog (connectivity, sync loops, stock drift, duplicate sales orders)."
when_to_use:
  - "Designing or reviewing the per-flow runtime behavior of an ERP connector before writing code"
  - "Deciding Import API vs HTTP API, event vs job, and the idempotency key for an ERP flow"
  - "Debugging duplicate sales orders, stock drift, sync loops, or a stalled bulk import"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - erp
    - integration
---

# The ERP connector contract, flow by flow

Read this before writing code. Each flow below is a separate application with its own trigger, write API, and idempotency key — the docs' best practice is explicitly to keep Products, Prices, Inventory, Customers, and Orders as **separate integrations** ([Integration best practices](https://docs.commercetools.com/tutorials/erp-integration.md#integration-best-practices)). Field-level mapping is [data-mapping.md](./data-mapping.md); the type-agnostic application mechanics are the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill's ([event](../../../commercetools-connect/references/event-applications.md), [service](../../../commercetools-connect/references/service-applications.md), [job](../../../commercetools-connect/references/job-applications.md)).

## The flow table — fill this in for the project

| Flow | Direction | Application | Trigger | Write API | Idempotency key |
|---|---|---|---|---|---|
| Order export | CT → ERP | `event` | `OrderCreated` (or a state Message) Subscription | ERP / middleware endpoint | `orderNumber` (or Order `id`) |
| Order document write-back | ERP → CT | `service` | middleware webhook | HTTP API update actions | ERP document number |
| Product / classification inbound | ERP → CT | `job` (pull) or `service` (push) | schedule or webhook | Import API (bulk) / HTTP API (delta) | resource `key` |
| Price inbound | ERP → CT | `job` or `service` | schedule or webhook | Import API / HTTP API | Standalone Price `key` (or variant `sku` + price scope) |
| Inventory inbound | ERP → CT | `job` or `service` | frequent schedule or webhook | HTTP API (`InventoryEntry`) or Import API | `sku` + supply Channel |
| B2C customer export | CT → ERP | `event` | `CustomerCreated` / `CustomerAddressChanged` | ERP / middleware | Customer `id` → ERP account id |
| B2B account inbound | ERP → CT | `job` or `service` | schedule or webhook | HTTP API (Business Units, Associates) | Business Unit `key` |
| Invoice / financial doc inbound | ERP → CT | `service` or `job` | webhook or schedule | HTTP API (Order Custom Fields) | invoice number |

The documented default directions per domain are in [Typical ERP data flows](https://docs.commercetools.com/tutorials/erp-integration.md#typical-erp-data-flows) — confirm each with the user rather than adopting them silently.

## Flow 1 — Order export (CT → ERP)

The canonical ERP flow, and the one Connect makes cheapest: an `OrderCreated` Message reaches an `event` application with no queue, topic, or function to provision yourself ([Replicate orders with Connect](https://docs.commercetools.com/tutorials/erp-integration.md#replicate-orders-with-connect)).

Contract:

- **At-least-once, no ordering.** Assume redelivery and out-of-order arrival. Ack with `102`/`200`/`201`/`202`/`204`; any other status is a negative ack and the message is retried, with push backoff after too many. Unacknowledged messages are retained for 7 days.
- **Ack fast, then work — but only if the work survives the ack.** The ack timeout is 10 s and the request timeout is 5 min. If the ERP call can exceed the ack window, the safe shape is: ack, and make the ERP call idempotent so a redelivery cannot double-post.
- **Re-fetch, don't trust the payload.** Fetch the Order by id before exporting; the Message may be stale, and a Change-type Subscription carries no resource body.
- **Gate on the business trigger, not just on creation.** If the ERP must only see paid or approved orders, subscribe to the state Message that represents that, or filter and no-op (still acking) on orders that don't qualify. Exporting unpaid orders creates ERP documents nobody wants to cancel.
- **Write the ERP identity back.** The `Order` has **no `externalId`**. Use `SyncInfo` via the `updateSyncInfo` update action (with a Channel representing the ERP), or a dedicated Custom Field. Do both only if you can say which one reconciliation reads. `SyncInfo` also gives you the "already exported" check for free.
- **Duplicate protection lives on both sides.** Send a stable business key (`orderNumber`) the ERP can deduplicate on, *and* check `SyncInfo`/the Custom Field before posting. One-sided protection fails the first time the queue redelivers.
- **ERP down.** Do not ack-and-drop. Either negative-ack and let the retry/backoff work for you (bounded outage), or ack and persist the order into a retry store a `job` drains (long outage) — and say which you chose in the README. Silent loss here means an order that was paid for and never fulfilled.

## Flow 2 — Master-data inbound: products, classification, prices (ERP → CT)

Two shapes; pick by who initiates.

- **Pull (`job`)** — the connector polls the ERP/middleware or picks up a file drop on a schedule. Use for nightly and hourly batches. The job request times out after **30 minutes**, so a full catalog load must chunk and checkpoint (store the cursor in a CustomObject) so the next run resumes rather than restarts.
- **Push (`service`)** — the middleware calls your authenticated endpoint per change or per batch. Use for near-real-time deltas. The service request times out after 5 minutes: accept, validate, respond, and do long work asynchronously rather than holding the connection.

**Import API vs HTTP API** — the decision that most affects throughput ([Choose the right API](https://docs.commercetools.com/tutorials/product-data-integrations.md#choose-the-right-api)):

| Use | When | Notes |
|---|---|---|
| [Import API](https://docs.commercetools.com/api/import-export/overview.md) | Initial load, scheduled bulk refresh, multi-source data arriving out of order | Asynchronous; up to **20 resources per request**; automatic reference resolution holds unresolved operations for **48 hours**; status comes either from polling ImportOperations or from subscribing to [Import API Events](https://docs.commercetools.com/api/events.md) — pick one and say which (polling is simplest for a `job` that already runs on a schedule) |
| HTTP API | Incremental deltas, small volumes, when you need immediate per-resource success/failure | Upsert by `key`: fetch, create on 404, else update with actions on the current `version`; you own retries, backoff, and concurrency |

In practice, both: Import API for the load and periodic refresh, HTTP API for event-driven deltas.

Contract:

- **Keys everywhere.** Set a deterministic `key` on every resource from the ERP's own identifier. Keys are what make imports and upserts idempotent and re-runnable — without them, a re-run duplicates.
- **Never await an import.** Submitting is not completing. Record the container/operation ids and check status on the next run or in a separate reconcile job; do not block a request or an event handler on completion.
- **Respect attribute ownership.** Write only the attributes the ERP owns. Restrict them in a restricted AttributeGroup so Merchant Center edits can't fight the sync ([Integrate product data](https://docs.commercetools.com/tutorials/product-data-integrations.md#multiple-sources-of-product-data)).
- **Products and prices are separate flows.** The docs are explicit: import product data without price or stock, and handle those separately. Embedded vs Standalone Prices is a modeling decision with hard consequences — Standalone supports up to 50 000 prices per variant and the modular variant model *requires* it ([Pricing overview](https://docs.commercetools.com/api/pricing-and-discounts-overview.md)).
- **Publishing is a decision.** Decide whether an inbound change publishes immediately or stages for review, and say so; a sync that silently publishes half-mapped products is worse than one that stages.
- **Back-pressure is expected at ERP volumes.** Ramp gradually, retry `429`/`5xx` with exponential backoff and jitter, and cap concurrency. A batch loop with no backoff turns one slow minute into a failed nightly run.

## Flow 3 — Inventory (ERP → CT)

Its own flow, at its own cadence, and the one where being wrong is visible to customers.

- **One `InventoryEntry` per SKU + supply Channel.** Map ERP plants/warehouses/locations to supply Channels explicitly, and create the Channels in `postDeploy` — an unmapped location silently lands in the general (channel-less) pool. Set the quantity absolutely from the ERP where you can; relative deltas drift the moment one message is lost or replayed.
- **Sell the buffer, not the truth.** The documented pattern is a **threshold**: let commercetools deplete stock without calling the ERP per order, and only make a real-time check against the master system once the threshold is reached ([Integration patterns → Inventory](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md#inventory-data)). Agree the buffer and the threshold with the user — they are business decisions with a revenue and an oversell cost.
- **Pick `InventoryMode` deliberately.** `None`, `TrackOnly`, `ReserveOnOrder`, `ReserveOnCart` differ in *when* stock is checked and reserved; only `ReserveOnCart` blocks adding more than is available ([Manage inventory with the Cart](https://docs.commercetools.com/learning-model-your-product-catalog/inventory-modeling/cart-inventory.md)). The connector doesn't own this setting, but the sync design depends on it.
- **Consistency is not instant.** Order-driven changes to `availableQuantity`/`quantityOnStock` are eventually consistent (up to ~10 s); direct API updates are strongly consistent. `ProductVariantAvailability` and its reflection in Product Search lag further. Never compare a fresh ERP number against a just-ordered commercetools number and call the delta a bug.
- **Watch the Product payload.** `ProductVariantAvailability` aggregates every `InventoryEntry` for a SKU into the Product JSON, so a location-per-warehouse explosion inflates product responses. Map only the locations that are actually sellable.
- **Carry the extras the ERP knows**: `restockableInDays`, expected delivery, and per-line quantity limits (`minCartQuantity`/`maxCartQuantity`) are all things the ERP usually owns and the storefront can use.

## Flow 4 — Customers and B2B accounts

- **B2C usually flows out.** On `CustomerCreated` (and address/profile Messages), create or update the ERP account, then write the ERP account id to the Customer's `externalId` — the field exists for exactly this ([Plan integrations → Customer](https://docs.commercetools.com/tutorials/implementation-guide/plan-integrations.md)). Upsert by `externalId`, never blind-create, or you mint duplicate accounts on redelivery.
- **B2B usually flows in.** ERP accounts become Business Units with Associates; keep the ERP hierarchy in the Business Unit parent/child structure and link by `key`. Mapping detail: [data-mapping.md](./data-mapping.md); modeling: [business-unit-hierarchy.md](../../../commercetools-commerce-patterns/references/business-unit-hierarchy.md).
- **Filter self-changes.** Your own write produces a Message that would trigger another export. Suppress it (compare against the last synced payload/hash, or check a `lastSyncedAt` Custom Field) or you build an infinite loop that looks like the ERP "flapping".
- **The synchronous-registration question.** The ERP tutorial documents relaying a middleware's successful customer creation back to the frontend synchronously with an **API Extension** ([Inbound data flow](https://docs.commercetools.com/tutorials/erp-integration.md#inbound-data-flow-erp-to-composable-commerce)). The Integration patterns module, meanwhile, recommends putting synchronous logic in your application/BFF and treats a blocking Extension as the option of last resort — it adds latency to every request, has a 2 s default budget (raisable per Extension via `setTimeoutInMs`, documented maximum 10 s), and should respond in well under that ([Integration options](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-options.md)). Both are current docs. Present the trade-off: if registration must fail when the ERP refuses the account, an Extension is the mechanism; if it can be asynchronous, use a Subscription and reconcile. Never use an Extension for a side effect.
- **PII has a lifecycle.** Deletion and anonymization must propagate, or not, by explicit decision — record it.

## Flow 5 — Financial documents back (ERP → CT)

- **Invoices land on the Order as Custom Fields**, with the rendered PDF stored at a URL-accessible location (CDN or file storage) and referenced from the Custom Field, so it is reachable from the buyer portal and Merchant Center ([Outbound data flow](https://docs.commercetools.com/tutorials/erp-integration.md#outbound-data-flow-composable-commerce-to-erp)). Register the Custom Types in `postDeploy`.
- **Idempotent by document number.** Re-sent invoices must update, not append a duplicate. If several documents can attach to one Order, model a list (or CustomObjects keyed by order + document number) rather than overwriting a single field.
- **Credit limit and payment terms** flow the same way onto the Business Unit or Customer, and are read at checkout — decide whether a stale credit limit blocks or allows the order, and where that check runs (BFF, not an Extension, unless the block must be unconditional).

## Cross-cutting constraints

**Connectivity.** Connect applications call outbound over the public internet and expose HTTPS endpoints. For **Connect application egress** there is no documented private-network or VPN attachment and no documented stable egress IP to hand an ERP team for an allowlist. (Don't confuse this with the documented private connectivity for the *inbound* direction — your own infrastructure reaching the commercetools API — which is a different problem.) If the ERP is on-premise or IP-allowlists callers, an internet-reachable façade — the middleware or an API gateway — must sit in front of it, and your connector talks to that. Surface this in Step 1, not at deployment.

**Runtime budgets** ([Deployment behavior](https://docs.commercetools.com/connect/deployment-behavior-and-environments.md)):

| Application | Limit that bites in ERP work |
|---|---|
| `event` | 10 s ack timeout; 5 min request timeout; at-least-once, no ordering; unacked retained 7 days |
| `job` | 30 min request timeout → chunk + checkpoint every batch |
| `service` | 5 min request timeout; scales on request count |
| API Extension (if used) | 2 s default budget, raisable per Extension to a documented 10 s max — an ERP round trip rarely fits |
| `sandbox` deployments | Scale to zero when idle; ~15 s cold start can look like a timeout in a nightly window |

**Ordering and last-write-wins.** No ordering guarantee means a stale update can overwrite a newer one. Carry the ERP's own change timestamp or document version and skip writes that are older than what you already applied.

**Observability.** Log the ERP document/batch identifier and the commercetools resource key on every write, and propagate correlation ids, or a partial nightly failure is unattributable. Poison-message and replay handling: [observability-operations.md](../../../commercetools-connect/references/observability-operations.md).

## Pitfall catalog

| What you see | What it actually is |
|---|---|
| The same sales order appears twice in the ERP | Redelivery with one-sided idempotency — `SyncInfo`/Custom Field not checked before posting, or no stable business key for the ERP to dedupe on |
| Orders in commercetools that the ERP never received | Handler acked before the ERP call succeeded, with no retry store; or a non-qualifying order was filtered without anyone deciding that |
| Stock is right in the ERP and wrong in commercetools | Relative deltas instead of absolute quantities, an unmapped location falling into the channel-less pool, or a lost/duplicated message with no reconcile job |
| Oversells despite frequent syncs | No buffer/threshold, or an `InventoryMode` that never checks stock at order creation |
| "Inventory looks stale right after ordering" | Eventual consistency (~10 s) on order-driven changes; `ProductVariantAvailability` and search lag further — not a sync bug |
| The nightly job dies part-way, every time | 30 min job timeout with no chunking/checkpointing; or no backoff against `429`/`5xx` |
| An import "succeeded" but nothing changed | Import is asynchronous — the container was never polled; or operations sit unresolved waiting for a reference — ImportOperations are **deleted 48 h after creation**, so one still waiting disappears rather than resolving |
| Products re-created instead of updated on every run | Missing or non-deterministic `key`s |
| Prices update in the ERP but never in commercetools | Price flow bundled into the product flow and skipped when the product hash didn't change; or writing Embedded Prices while the Project reads Standalone (or vice versa) |
| Endless updates ping-ponging between the systems | No self-change filtering — your own write triggers the Message that triggers your write |
| A field the merchandiser edits keeps reverting | Two owners for one attribute; the ERP-owned set is not read-only |
| Duplicate customer accounts in the ERP | Blind-create instead of upsert by `externalId` |
| Cart or customer-create calls got slow after go-live | An ERP/middleware call placed inside an API Extension — move it to the BFF, or accept and engineer the budget |
| The connector works in preview and times out at 06:00 | Sandbox scale-to-zero cold start inside a tight batch window; or the ERP's own batch window overlapping yours |
| Deploy fails only in production | Credentials or endpoints differ per environment and are not config; or the ERP allowlists the wrong caller |

## Checklist
- [ ] One application per flow, with trigger, write API, and idempotency key written down per row of the flow table
- [ ] Order export: re-fetches the Order, gated on the agreed business trigger, dedupes on both sides, writes `SyncInfo` or a Custom Field back
- [ ] ERP-down behavior chosen and documented per flow (negative-ack retry vs ack + retry store) — never silent loss
- [ ] Import API vs HTTP API chosen per domain with the volume reason stated; imports polled, never awaited
- [ ] Deterministic `key`s on every imported resource; upserts, never blind-creates
- [ ] Inventory: absolute quantities, locations mapped to supply Channels, buffer/threshold agreed with the user, reconcile job in place
- [ ] Self-change filtering in place on every bidirectional-looking pair
- [ ] Jobs chunk and checkpoint inside the 30 min budget; backoff on `429`/`5xx`
- [ ] No ERP call on a synchronous critical path unless the user chose it knowing the budget
- [ ] Custom Types, Channels, and Subscriptions registered idempotently in `postDeploy`, removed in `preUndeploy`
- [ ] ERP document ids and commercetools keys logged on every write
