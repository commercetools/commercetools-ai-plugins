---
name: marketplace-connector-contract
description: The marketplace sync contract — seller sync, offer/inventory/price sync, order import and order routing (syncInfo), fulfilment status, reconciliation job; idempotent upsert by marketplace id, split multi-seller orders, full pitfall catalog. The marketplace sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - marketplace
    - connect
---

# The marketplace sync contract

Everything each app must do, and the pitfalls that silently break it. Which apps you build follows from **role and direction** ([overview.md](./overview.md)); how sellers and offers are modeled is [config-from-requirements.md](./config-from-requirements.md). These rules sit on top of the parent skill's contracts — [service-applications.md](../../service-applications.md), [event-applications.md](../../event-applications.md), [job-applications.md](../../job-applications.md), [security.md](../../security.md) — and add what is marketplace-specific.

## The rule that spans every app: upsert by the marketplace's id, never blind-create

Every write, in either direction, is an **upsert keyed on a stable marketplace identifier**:

| Entity | Key | Upsert mechanics |
|---|---|---|
| Seller | Channel `key` = `seller-<marketplaceSellerId>` | get-by-key → create if 404, else update |
| Seller profile blob | CustomObject `container` + `key` | `POST /custom-objects` is create-or-update — idempotent for free |
| Offer / listing | Product `key` = marketplace listing id (Variant `key`/`sku` per variant) | get-by-key → create or update actions |
| Offer price | StandalonePrice `key` = `<sku>-<sellerId>-<currency>`, or the embedded Price with the seller's channel | update the seller's price only — never rewrite prices of other sellers |
| Offer stock | InventoryEntry `key` = `<sku>-<sellerId>`, or query by `sku` + `supplyChannel` | one entry per seller per SKU |
| Inbound marketplace order | Order `orderNumber` = marketplace order id | query by `orderNumber` first; import only if absent |
| Outbound order hand-off | the Order's `syncInfo` entry for that seller's Channel | read `syncInfo` before pushing; skip if already recorded |

Webhooks and Subscription messages are **at-least-once**: every payload can arrive twice. A create-on-every-payload design produces duplicate Products, duplicate sellers, and duplicate orders — the most common marketplace-integration failure.

## App 1 — seller sync (inbound, `service` webhook or `job` poll)

- **Authenticate the caller.** The marketplace calls you, so validate *its* proof — signature, shared secret, or JWT — before any write ([security.md](../../security.md)). An unauthenticated seller endpoint lets anyone create Channels and Products in the Project. (`AuthorizationHeaderAuthentication` is the *reverse* mechanism, for commercetools calling your endpoint as an Extension destination; it does not authenticate inbound marketplace traffic.)
- **Upsert the seller Channel** by key, with the roles the model requires (`InventorySupply`, and `ProductDistribution` when the seller prices independently). Store the profile payload in a CustomObject and/or Channel Custom Fields.
- **Only create a Store per seller if isolation was a requirement** — and remember a Store is capped at 100 Product Selections.
- **Offboard by deactivating, not deleting.** Remove the Channel from Stores, deactivate the seller's Product Selection / delist their offers, and stop syncing. A Channel referenced by an InventoryEntry, Line Item, Store, or Price [cannot be deleted](https://docs.commercetools.com/api/projects/channels.md#delete-channel) until those references are gone — the documented order is Carts → Orders → Stores → Channel. Deleting a departed seller's historical Orders to satisfy that is technically the documented path, but it destroys order history; deactivation is the right offboarding move.
- **Idempotent** — the same seller webhook twice must be a no-op.

## App 2 — offer / inventory / price sync

### Inbound (operator): marketplace → commercetools

- **Upsert the Product by listing key**; when several sellers sell the same SKU, resolve to the **one** shared Product and add the seller's *price and stock*, not a second Product.
- **Every price carries the seller's distribution channel.** A channel-less price is visible in every Store — the cross-seller price leak.
- **Every InventoryEntry carries the seller's supply channel** (`sku` + `supplyChannel`). Writing stock without a channel makes it global stock for all sellers.
- **Map deliberately.** Localized names/descriptions, currency, and money precision are where feeds go wrong: build the [LocalizedString](https://docs.commercetools.com/api/types.md#localizedstring) from the marketplace's locale rather than hardcoding one, derive the currency per seller/country rather than hardcoding it, and convert to `centAmount` in **integer minor units** — multiply *then* round, never cast a float first (a `(long) price * 100` style conversion silently drops the cents). High-precision cases: [money types](https://docs.commercetools.com/api/types.md#money).
- **Keep the mapping a pure function** — no network calls — so it is unit-testable without a deployment or token.
- **Don't publish blind.** Decide whether an imported offer is published immediately or staged for review, and make it explicit in config.
- **Bulk belongs in the Import API.** Initial and periodic full loads go through the [Import API](https://docs.commercetools.com/api/import-export/overview.md) (asynchronous, dependency-resolving, keyed → idempotent); the webhook path handles deltas. Keep them separate apps.

### Outbound (seller role): commercetools → marketplace

- Driven by **Subscription messages** on products, prices, inventory, Product Selections, and Stores — the [`product-export` template](https://docs.commercetools.com/connect/templates/product-export.md) is the closest existing shape (full export endpoint + incremental updater).
- **Re-fetch the resource by id** from `resource.id`; don't map from a possibly-stale or truncated payload. With no ordering guarantee, re-fetching makes the export converge on current state instead of replaying old deltas.
- **Scope what you export** — which Store / Product Selection / channel defines "listed on this marketplace". Exporting the whole catalog to a marketplace that only sells a subset is a compliance and delisting problem.
- **Delist explicitly.** Unpublish, removal from a Product Selection, and stock hitting zero each need a defined outbound action; otherwise you keep selling items you no longer carry.
- **Respect the marketplace's feed contract** — batch sizes, schedules, and rate limits. Retry `429`/`5xx` with exponential backoff.

## App 3 — orders

### Inbound (seller role): import a marketplace order

- **Dedupe on `orderNumber`** = the marketplace order id: query first, import only if absent. Order has no top-level `externalId`, so `orderNumber` (or a Custom Field) *is* the link.
- Use [Order Import](https://docs.commercetools.com/api/projects/orders-import.md) — it creates an Order without a Cart. Set `store`, per-line `supplyChannel`/`distributionChannel`, and per-line `custom` fields for the marketplace line id. Note `totalPrice` must be set explicitly (it is **not** derived from the line items) and negative prices/quantities are not rejected — validate the payload yourself.
- Record the inbound sync with `updateSyncInfo` against a Channel with role `OrderImport`.
- Decide the **inventory mode** deliberately: stock was already committed on the marketplace side, so double-decrementing local stock is a real risk.

### Outbound (operator): route lines to sellers

- Triggered by an **`OrderCreated`** MessageSubscription (registered idempotently in `postDeploy` — get-then-create, never delete-then-recreate).
- **Decode the envelope** before use: the GCP transport wrapper is `{ "message": { "data": "<base64>" } }`, and the message body is PlatformFormat or CloudEventsFormat depending on config. Validate the type, then ack-and-ignore anything you don't handle (including the platform's test messages).
- **Re-fetch the Order by id**, then **group Line Items by seller** (their `supplyChannel`, or the seller reference you set at add-to-cart). Push **one payload per seller** — a multi-seller order is N seller orders downstream.
- **Record `updateSyncInfo`** per seller Channel (role `OrderExport`) with the marketplace's id and `syncedAt`, and **read `syncInfo` first** so a redelivered message doesn't double-submit. That's your idempotency mechanism; combine it with the marketplace's own idempotency key if it has one.
- **Ack correctly** — `2xx` (the event contract treats `102/200/201/202/204` as "don't redeliver") for handled *and* deliberately-ignored messages; non-2xx only for transient failures you want redelivered.
- **Partial failure is normal.** If seller A's push succeeds and seller B's fails, don't re-push A on retry — per-seller `syncInfo` makes the retry converge instead of duplicating.

## App 4 — fulfilment, cancellation, and return status

- One Order, many sellers → **track per line, not per order.** Use Line Item `state` (ItemStates) transitions for per-seller progress, and Deliveries/Parcels for split shipments; an order-level `shipmentState` alone can't express "seller A shipped, seller B cancelled".
- Tracking numbers, carrier, and shipment events flow back per seller shipment; cancellations and returns must map to the marketplace's own state machine, not just a local status field.
- **Self-change filtering** wherever a domain syncs both ways: a status you write inbound raises a message your outbound app would push straight back. Mark connector-originated writes (a `syncSource` Custom Field, or compare against `syncInfo`) and skip them. One-way per domain avoids this entirely.

## App 5 — reconciliation `job`

Events drop, feeds throttle, and webhooks get lost — a marketplace integration without a sweep drifts silently. A scheduled `job` that pages the marketplace (and commercetools) and repairs differences: missing offers, stock divergence, orders never imported, orders never exported (empty `syncInfo`). **Checkpoint** progress (e.g. in a CustomObject) so a restart resumes mid-run rather than restarting, respect the 30-min job timeout, own your overlap locking, and keep every unit of work an upsert so a re-run can't double-write. Keep the initial bulk migration a **separate** job from ongoing reconciliation.

## Pitfall catalog

| Pitfall | Symptom | Fix |
|---|---|---|
| Create-on-every-payload | Duplicate sellers / Products / Orders after redelivery | Upsert by the marketplace id (table above) |
| One Product per seller for the same SKU | Splintered catalog, duplicate PDPs, unusable search and reporting | One Product; per-seller Prices + InventoryEntries |
| Price without a distribution channel | One seller's price shows in every Store | Always set `channel` on seller prices |
| InventoryEntry without a supply channel | Seller stock becomes global stock; overselling | `sku` + `supplyChannel` per seller |
| Availability read as a single number | Storefront shows aggregated stock across sellers | Read per-channel availability; a Store-bound Cart filters by its supply channels |
| Trusting the payload | Stale offers overwrite newer ones; deltas replayed out of order | Re-fetch by `resource.id` |
| Envelope not decoded | Handler sees base64 garbage / crashes | Decode `message.data` (base64 → JSON), then validate the type |
| Wrong ack | Handled message redelivered forever, or failures silently dropped | `2xx` for handled/ignored; non-2xx only for retryable |
| No `syncInfo` check before export | Multi-seller order pushed twice on redelivery | Read `syncInfo`, write `updateSyncInfo` per seller channel |
| Order imported without `orderNumber` dedupe | Duplicate Orders for one marketplace order | Query by `orderNumber` first |
| `totalPrice` assumed to be calculated on import | Wrong order totals | Set `totalPrice` explicitly; validate the draft |
| One Subscription (or Extension) per seller | Hits the 50-Subscription / 25-Extension Project limit | One Subscription per message type; fan out in the handler |
| Float → cents conversion | Cents dropped or inflated on every offer | Multiply then round in integer minor units |
| Hardcoded currency/locale/region | Works for one seller/market, breaks the rest | Derive from the payload/config; region from `CTP_REGION` |
| Seller offboarded by deleting the Channel | Delete fails; sync half-broken | Deactivate: unassign from Stores, delist offers, stop syncing |
| No self-change filter on a two-way domain | Status ping-pong, runaway API calls | Mark connector writes and skip; prefer one-way per domain |
| Unauthenticated inbound webhook | Anyone can write Products/Orders | Validate signature/secret/JWT in-app |
| Secrets or PII in logs / stack traces in responses | Compliance incident | Generic error responses; structured logs without payload dumps |
| Route ≠ `connect.yaml` `endpoint` | Platform traffic 404s | Mount the router at the app's `endpoint` base path |
| Legacy SDK | Fails the parent skill's pinned-version gate | `@commercetools/platform-sdk@^8` + `@commercetools/ts-client@^4` |

## Test-first checklist (mirror in the suite)

Seller sync
- [ ] Rejects unauthenticated / bad-signature calls (parameterized auth matrix)
- [ ] Upserts the Channel by key; second delivery is a no-op
- [ ] Roles and profile storage asserted; offboarding deactivates rather than deletes

Offer / inventory / price sync
- [ ] Same-SKU second seller adds a price + inventory entry, does **not** create a second Product
- [ ] Every written price has a channel; every InventoryEntry has a supply channel
- [ ] Money conversion asserted on a value with non-zero cents; locale/currency taken from input
- [ ] Delist path asserted (unpublish / removed from selection / zero stock)
- [ ] Outbound: re-fetches by id, exports only in-scope products

Orders
- [ ] Inbound: duplicate marketplace order id imports once; `totalPrice` set; `syncInfo` recorded
- [ ] Outbound: multi-seller order produces one payload per seller with only that seller's lines
- [ ] Redelivered `OrderCreated` pushes nothing (`syncInfo` short-circuit)
- [ ] Partial failure retries only the failed seller
- [ ] Envelope/ack matrix covered

Fulfilment + reconciliation
- [ ] Per-line state transitions asserted; split shipment maps per seller
- [ ] Self-change filter asserted on any two-way domain
- [ ] Reconciliation resumes from checkpoint after a simulated failure; repairs are upserts
- [ ] Boundary mocked; suite runs with no deployment and no secrets
