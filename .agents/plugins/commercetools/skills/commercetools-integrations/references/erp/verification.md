---
name: erp-connector-verification
description: "Verify a commercetools Connect ERP connector end to end — Order becomes a sales order exactly once and links back, master data lands re-runnably, stock converges, accounts and invoices appear — plus the failure paths to force and the traps that look like bugs (async imports, eventual consistency, sync loops, stale-overwrite)."
when_to_use:
  - "Proving an ERP integration works before calling it done"
  - "Diagnosing an ERP connector that passes unit tests but misbehaves against a real project"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - erp
    - integration
---

# Verify the ERP round trip

An ERP connector that passes unit tests can still be broken in ways that only show up against real systems: the order arrives twice, the stock number is a day old, the nightly run dies at 80%, or a merchandiser's edit is silently reverted. Verify against a **sandbox project pointed at the ERP's test client** — and re-verify the numbers against production master data before go-live, because test clients rarely hold the same prices and stock.

Verify **per flow**. A green order export says nothing about inventory.

## Order export

1. **Subscription registered.** `GET /{projectKey}/subscriptions` returns your Subscription with the expected Message types. Allow up to a minute before concluding it is missing — a Subscription create/update/delete takes that long to take effect ([Subscriptions](https://docs.commercetools.com/api/projects/subscriptions.md)). A `postDeploy` that silently didn't run is the most common cause of "nothing happens" — check it first ([lifecycle-scripts.md](../../../commercetools-connect/references/lifecycle-scripts.md)).
2. **One order, one ERP document.** Place an Order that qualifies for the agreed trigger; confirm exactly one sales order in the ERP, with the `orderNumber` visible on it.
3. **The link is written back.** The Order carries the ERP sales-order number in `SyncInfo` (or the agreed Custom Field). Without this, reconciliation is guesswork.
4. **Non-qualifying orders don't leak.** Place an order that fails the trigger (unpaid, unapproved) and confirm the ERP has nothing — and that the handler still **acked**.
5. **Redelivery is a no-op.** Re-deliver the same message. No second ERP document, no second `SyncInfo` entry, and the handler acks (`102/200/201/202/204` — [Deployment behavior](https://docs.commercetools.com/connect/deployment-behavior-and-environments.md)).
6. **Amounts reconcile.** Line prices, freight, surcharges, discounts, and tax on the ERP document match the Order within the agreed rounding tolerance. Check a discounted, multi-line, freight-bearing order — not a one-line test order.

## Master data inbound (products, classification, prices)

1. **A change at the source lands.** Change a product and a price in the ERP test client, run the flow, and confirm the mapped fields in commercetools — and only the mapped fields.
2. **Re-running is safe.** Run the same batch twice: no duplicate Products, Variants, or Prices, and versions increment only where data actually changed.
3. **Imports complete, not just submit.** For Import API flows, poll the ImportContainer and confirm the operations reached a terminal state. ImportOperations are deleted 48 h after creation ([Import Operations](https://docs.commercetools.com/api/import-export/import-operation.md)), so one still waiting on a reference disappears rather than resolving — and a silent partial import looks exactly like success.
4. **Attribute ownership holds.** Edit an ERP-owned attribute in the Merchant Center as a user whose team permissions exclude that Attribute Group: the edit must be blocked. If it isn't — the group exists but no team permission restricts it — the next sync must win, and someone must know that.
5. **Prices resolve on a cart.** Add the SKU to a cart in the relevant currency/country/customer-group/channel context and confirm the imported price is the one selected. Imported-but-unselectable prices are the classic scope-mapping bug.
6. **The full load fits the window.** Run the real volume, not a sample: confirm it completes inside the 30-minute job budget with chunking and checkpointing, and that a killed run resumes instead of restarting.

## Inventory

1. **Quantities converge.** Pick SKUs across several locations; compare the ERP number, the buffer, and `InventoryEntry.availableQuantity` per supply Channel. Then order one and re-check: the delta must be explainable, allowing for ~10 s eventual consistency on order-driven changes.
2. **Unmapped locations are visible, not silent.** Feed a location that isn't in the map: the run must report it, not write a channel-less entry.
3. **The threshold fires.** Drive a SKU below `LOW_STOCK_THRESHOLD` and confirm the real-time ERP check happens (and only then).
4. **Oversell behaves as agreed.** With the agreed `InventoryMode`, attempt to order more than is available and confirm the documented outcome — blocked, accepted, or backordered.
5. **Drift is repairable.** Skip a sync deliberately (or drop a message), then run reconciliation and confirm the numbers converge without manual work.

## Customers, B2B accounts, invoices

1. **B2C export links by `externalId`.** Register a customer; the ERP account appears once and the ERP id is written to `Customer.externalId`. Re-run: still one account.
2. **No loop.** Update the customer once and confirm exactly one update on the ERP side and no follow-on write back into commercetools. Watch the logs for a second cycle — this is where self-change filtering earns its keep.
3. **B2B hierarchy lands.** An ERP account with branches produces the Business Unit tree, Associates with roles, and the ship-to/bill-to addresses in the right lists.
4. **Contract pricing resolves for the account.** A cart placed as an Associate of that Business Unit gets the negotiated price, not the base price.
5. **Invoice write-back.** Post an invoice in the ERP; the Order shows the document number and a working PDF URL, and re-sending the same document updates rather than duplicating.

## Failure paths (do not skip)

Only provable by breaking things on purpose:

- **ERP unreachable.** Point the connector at a dead host. Every flow must behave as documented — retry, queue, or fail loudly — and **no order may be silently lost**.
- **ERP slow.** Inject latency beyond `ERP_REQUEST_TIMEOUT_MS`. Event handlers must not exceed their ack budget; jobs must fail cleanly and resume.
- **Bad credentials / not allowlisted.** Deploy with a wrong secret: `postDeploy` must fail the deployment rather than defer the failure to 02:00.
- **Malformed ERP payload.** Send a batch with a bad record: the record is rejected and reported, the rest of the batch still lands, and the run doesn't die.
- **Stale update.** Replay an older ERP change after a newer one. The older one must be skipped, not applied.
- **Duplicate delivery.** Re-deliver every event flow's message. All must be no-ops.

## Traps that look like bugs

| What you see | What it actually is |
|---|---|
| "The import said OK but nothing changed" | Import API is asynchronous — nobody polled the container, or operations are unresolved pending references (held 48 h) |
| Stock differs from the ERP right after an order | Eventual consistency (~10 s) on order-driven changes; `ProductVariantAvailability` and Product Search lag further |
| Stock differs from the ERP permanently | Relative deltas instead of absolute quantities, an unmapped location, or a lost message with no reconcile job |
| Two sales orders for one commercetools Order | Redelivery with one-sided idempotency — `SyncInfo` not checked, or no stable key for the ERP to dedupe on |
| An order the ERP never got, marked exported | Handler acked before the ERP write succeeded |
| Imported prices exist but carts show the old price | Price scope mismatch (currency/country/customer group/channel), or Embedded vs Standalone mismatch with how the project reads prices |
| Products keep being re-created | Missing or non-deterministic `key`s |
| Endless updates between the systems | No self-change filtering |
| A merchandiser edit reverts overnight | Two owners for one attribute — expected behavior, unacceptable process; fix ownership, not the sync |
| The nightly job fails only at real volume | No chunking/checkpointing inside the 30 min job budget, or no backoff on `429`/`5xx` |
| First run after an idle period times out | `sandbox` deployments scale to zero and need ~15 s to boot |
| Everything works in test, prices are wrong in production | Verified against the ERP test client only — test master data is not production master data |

## Checklist
- [ ] Verified **per flow**, not once for the connector
- [ ] Subscription registration confirmed by API call, not assumed (plus `GET /{projectKey}/extensions` if a flow uses an API Extension)
- [ ] Order → sales order proven exactly once, with the ERP number linked back and amounts reconciled on a realistic order
- [ ] Non-qualifying orders proven not to leak, and still acked
- [ ] Master-data flow proven re-runnable; imports polled to a terminal state; full volume completes in the job budget
- [ ] Imported prices proven to resolve on a cart in every scope in use
- [ ] Stock convergence checked per location, threshold behavior and oversell policy exercised, reconciliation proven to repair drift
- [ ] Customer/B2B linking proven with no loop; hierarchy, addresses, and contract pricing verified
- [ ] Invoice write-back idempotent, PDF URL reachable from the buyer portal
- [ ] ERP-unreachable, ERP-slow, bad-credentials, malformed-payload, stale-update, and duplicate-delivery paths all exercised
- [ ] Numbers re-verified against production master data before go-live
