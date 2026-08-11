---
name: marketplace-verification
description: Verify a marketplace connector round trip — seller linked, offer sellable with per-seller price and stock, order imported or routed once, multi-seller order split correctly — and the traps that look like bugs but aren't (channel-less price leak, aggregated availability, throttled feeds). The marketplace sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - marketplace
    - connect
---

# Verify the marketplace round trip

Don't declare done until a **seller**, an **offer**, and an **order** each flow end to end, and a **multi-seller order** splits correctly. Run the checks for your role ([overview.md](./overview.md)); locally, without a real queue, POST the base64 message envelope straight to the event app's endpoint ([test an event application locally](https://docs.commercetools.com/connect/test-applications-locally.md#test-an-event-application)).

## Check 1 — the seller exists and is usable, not just present

Create or change a seller on the marketplace side, then confirm:

- The seller **Channel** exists with the expected `key` (`seller-<marketplaceSellerId>`) and the roles the model needs (`InventorySupply`, `ProductDistribution` where the seller prices independently).
- Profile data landed where the model says (CustomObject / Channel Custom Fields).
- If Store-per-seller is in scope: the Store exists, references that Channel, and its Product Selection is assigned.
- Re-send the same seller webhook: **nothing duplicates** and no version conflict is raised.

A seller that exists only as a CustomObject with no Channel is the tell that the model is incomplete — stock and price have nothing to scope to.

## Check 2 — the offer is sellable, per seller

Create or update a listing, then confirm end to end (not just "the Product appeared"):

- The Product/Variant exists, keyed on the marketplace listing id, published according to the configured publish/staging decision.
- A **Price carrying the seller's distribution channel** exists — and the *amount is exact*, cents included (this is where float→cent bugs surface).
- An **InventoryEntry for `sku` + the seller's supply channel** exists with the expected quantity.
- **Add it to a Cart** in the seller's context (Store-bound if Store-per-seller, otherwise with the seller's channels on the Line Item) and confirm the correct price and availability are selected. A Product that exists but can't be added at the seller's price is not a working offer.
- **Second seller, same SKU:** sync a second seller's offer for the same SKU and confirm **no second Product** is created — only an additional price and inventory entry.
- **Delist:** unpublish / remove from the selection / drop stock to zero on the marketplace side and confirm it stops being sellable.

## Check 3 — the order flows once

**Seller role (inbound import):** place a test order on the marketplace, then confirm one Order exists with `orderNumber` = the marketplace order id, the right `store`, per-line `supplyChannel`, correct `totalPrice`, and a `syncInfo` entry against the `OrderImport` channel. **Re-deliver the same payload and confirm no second Order.**

**Operator role (outbound routing):** place an order in commercetools with lines from **two different sellers**, then confirm:

- Each seller received **one** payload containing **only their own lines** — with correct quantities and prices.
- The Order carries a `syncInfo` entry **per seller Channel** with the marketplace's `externalId`.
- **Redeliver the `OrderCreated` message: nothing is pushed again** (the `syncInfo` short-circuit works). This is the single most valuable assertion in the suite.
- Force one seller's push to fail: on retry, only the failed seller is re-pushed.

## Check 4 — fulfilment splits per seller

Ship one seller's lines and cancel another's, then confirm the per-line states (and Deliveries/Parcels) reflect both independently, and that each status reached the marketplace. If the whole Order flips to one state, per-line tracking is missing ([marketplace-contract.md](./marketplace-contract.md)).

## The traps (behavior that looks like a bug — or hides one)

### Trap 1 — the channel-less price leak

A price written **without** a distribution channel is visible in **every** Store, so a seller's price appears on other sellers' storefronts, and Store-based price filtering looks broken. It isn't: Stores only filter prices that *have* a channel — a channel-less price is inherited everywhere. Assert the channel on every seller price.

### Trap 2 — availability looks wrong because it's aggregated

`ProductVariant.availability` summarizes stock and lags real-time by seconds; with several sellers per SKU it reads as one blended number, and Order-driven stock changes are [eventually consistent (up to ~10 s)](https://docs.commercetools.com/api/inventory-overview.md#inventory-checks-and-consistency). Verify per-seller stock by querying the **InventoryEntry** for `sku` + `supplyChannel`, and verify storefront behavior through a Store-bound Cart — not by eyeballing the aggregate.

### Trap 3 — "sync stopped" is usually throttling

Marketplaces rate-limit feeds hard. A sync that suddenly stops landing offers is typically `429` backpressure or a batch-size violation, not a logic bug. Confirm backoff/retry and that the reconciliation job resumes **from its checkpoint** rather than restarting the whole catalog.

### Trap 4 — sandbox marketplaces don't behave like production

Sandbox accounts may cap sellers or listings, expire data, return canned payloads, or omit webhook signatures. Verify the **contract** (upsert, idempotency, mapping, ack, auth) against the sandbox; verify **real persistence and volume behavior** against a controlled production account, and clean up test sellers, listings, and orders afterwards.

### Trap 5 — the seller you can't remove

Offboarding fails because the seller's Channel is referenced by inventory, Line Items, Stores, or Prices, and it [cannot be deleted](https://docs.commercetools.com/api/projects/channels.md#delete-channel) while any reference exists — including historical Orders. That's expected. Verify the *deactivation* path instead: unassigned from Stores, offers delisted, sync stopped, historical Orders intact.

## Verification checklist

- [ ] Seller Channel (and Store, if modeled) created with the right key and roles; re-delivery is a no-op
- [ ] Offer sellable: price **with channel** and exact amount, InventoryEntry with **supply channel**, add-to-cart proven in the seller's context
- [ ] Second seller of the same SKU adds price + stock, **no duplicate Product**
- [ ] Delist path proven
- [ ] Inbound order: one Order per marketplace order id, `totalPrice` correct, `syncInfo` recorded, redelivery creates nothing
- [ ] Outbound order: one payload per seller with only their lines, `syncInfo` per seller channel, **redelivery pushes nothing**, partial failure retries only the failed seller
- [ ] Fulfilment states tracked per line; split shipment and mixed ship/cancel proven
- [ ] Reconciliation job resumes from checkpoint; backoff verified under throttling
- [ ] No secrets or payload dumps in logs; error responses carry no stack traces
- [ ] Test sellers/listings/orders cleaned up on both sides
