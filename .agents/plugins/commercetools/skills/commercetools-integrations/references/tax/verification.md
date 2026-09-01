---
name: tax-verification
description: Verify a tax connector round trip — taxedPrice on the cart, transaction recorded in the engine — and the two traps that look like bugs but aren't (sandbox doesn't persist; no nexus means zero tax). The tax sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - tax
    - connect
---

# Verify the tax round trip

Don't declare done until tax has left a trace in **both** places it should: on the cart (calculation) and in the engine (recording). Two of the three checks below regularly look broken when they're actually correct — read the traps.

## Check 1 — the cart carries engine-computed tax

Drive a cart update (add a line item, set the shipping address) and inspect the cart:

- **`taxedPrice` is present.** Before the API Extension is registered and firing, `taxedPrice` is simply **absent** — that's the tell that the extension isn't wired, not that tax is zero. After it fires, `taxedPrice.totalNet` / `totalGross` / `totalTax` are populated.
- **The version jumped more than your update alone would explain.** The extension's `setLineItemTaxAmount` / `setShippingMethodTaxAmount` / `setCartTotalTax` actions are extra writes — an add-line-item that lands the cart several versions higher is the extension firing.
- **Shipping and custom line items are taxed**, not just line items — otherwise Order creation will later fail in `ExternalAmount` mode.

A minimal driver: create a cart in `ExternalAmount` mode, set a destination address **in a nexus region**, add a priced line item, and read back `taxedPrice`. (Same flow a storefront BFF would run.)

## Check 2 — the order is recorded as a transaction

Place an order (convert the cart), let the `OrderCreated` subscription deliver (or, locally without Pub/Sub, POST the base64 `OrderCreated` envelope to the syncer directly), then:

- The syncer returns a positive ack (`204`/`200`).
- The engine's API confirms the transaction (by `transaction_id` = order id).
- **It appears in the engine's dashboard** — the calculator's quote never does; only this recording step surfaces there.

## The two traps (correct behavior that looks like a bug)

### Trap 1 — the sandbox doesn't persist transactions

Several engines' **sandbox** environments accept `POST .../transactions` (returning `201`) but **don't store** the record: a subsequent GET returns canned demo data, and **nothing shows in the sandbox dashboard**. TaxJar's sandbox behaves exactly this way. So an empty Transactions tab after a successful sync is **expected on sandbox**, not a failure.

To actually see recorded transactions, use a **live** account:
- Switch the engine base URL / sandbox flag to live and supply the live token.
- Use a destination in a region the **live** account has nexus in.
- Treat these as real records — **delete the test transactions afterward** (engines expose a delete-transaction API) so they don't pollute filing/reporting.

Verify the *contract* (payload accepted, idempotency, mapping) on sandbox; verify *visibility* on live.

### Trap 2 — no nexus means zero tax (correctly)

A tax engine only collects where you have **nexus** (a tax obligation). A destination outside your configured nexus correctly returns **zero tax** — `amount_to_collect: 0`, `taxedPrice.totalTax: 0`. This is not a wiring bug; it's the engine doing its job. Before concluding "tax isn't calculating," confirm the destination is a nexus region (check the engine account's nexus settings — e.g. TaxJar `GET /v2/nexus/regions`). A cart shipping to a nexus region should return non-zero tax; one shipping elsewhere should return zero.

## Verification checklist

- [ ] `taxedPrice` present on the cart after a cart update (extension registered + firing)
- [ ] Line items **and** custom line items **and** shipping all carry tax (Order creation succeeds)
- [ ] Order placed → syncer acks → transaction confirmed via the engine API
- [ ] Transaction visible in the dashboard **on a live account** (sandbox may not persist)
- [ ] Non-zero tax at a **nexus** destination; zero at a non-nexus destination (both correct)
- [ ] Live test transactions cleaned up afterward
