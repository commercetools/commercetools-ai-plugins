---
name: promotion-verification
description: Verify a promotion connector round trip — discounts on the cart, redemption recorded in the engine — and the traps that look like bugs but aren't (inert native discount codes, zero discount from an inactive campaign, self-healing fail-open, cart merge on login). The promotion sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - promotions
    - connect
---

# Verify the promotion round trip

Don't declare done until the promotion has left a trace in **both** places it should: on the cart (evaluation) and in the engine (redemption). Several of the checks below regularly look broken when they're correct — read the traps.

## Check 1 — the cart carries engine-computed discounts

Drive a cart update (add a line item, enter a coupon code) and inspect the cart:

- **`directDiscounts` is populated.** This is the direct tell that the evaluator fired and mapped effects. Before the API Extension is registered and firing, it is simply **empty** — that means "not wired", not "no promotions apply".
- **The totals moved.** `totalPrice` reflects the discount, and the per-item breakdown (`discountedPricePerQuantity`, and `discountOnTotalPrice` for a total-price target) shows where it landed. Confirm the exact reference/field shapes against the current schema with this skill's `openApi-schemata.mjs --resource-name api-Cart-read` rather than a remembered field list.
- **The version jumped more than your update alone would explain.** The evaluator's `setDirectDiscounts` and `setCustomField` actions are extra writes folded into the same operation.
- **The coupon-result custom field is set** — accepted, or rejected with a reason. An entered-but-invalid code should leave the cart update **successful** with a rejection reason, never a failed request.

A minimal driver: create a cart, add a priced line item that a **currently active** campaign matches, read back `directDiscounts` and the totals. (Same flow a storefront BFF would run.)

## Check 2 — the order is redeemed in the engine

Place an order (convert the cart), let the `OrderCreated` subscription deliver (or, locally without Pub/Sub, POST the base64 envelope to the syncer directly), then:

- The syncer returns a positive ack (`200`/`204`).
- The engine's API confirms the redemption — coupon marked used, session closed, points awarded — keyed on the order id.
- **It appears in the engine's reporting/dashboard.** Cart evaluation never does; only redemption surfaces there. If the dashboard is empty, suspect "only the evaluator is wired" before suspecting the engine.

## Check 3 — redelivery does not double-redeem

This is the check people skip and the one that costs money. POST the **same** `OrderCreated` envelope twice and assert the engine shows **one** redemption and **one** point award. At-least-once delivery makes this a certainty in production, not an edge case.

## The traps (correct behavior that looks like a bug)

### Trap 1 — native Discount Codes stopped working

Expected. Direct Discounts and Discount Codes are [mutually exclusive](https://docs.commercetools.com/api/pricing-and-discounts-overview.md#direct-discounts): once a Direct Discount is on the cart, matching project Cart Discounts are **ignored**. A pre-existing native promo code that "silently does nothing" after the connector goes live is the exclusivity rule working as designed — not a regression. If both are genuinely required, the ownership decision was wrong; revisit Step 1 of [overview.md](./overview.md).

### Trap 2 — zero discount is usually a correct answer

An engine returns nothing when no rule matches: the campaign isn't active, its schedule hasn't started, the budget is exhausted, the coupon is expired or already at its usage limit, the customer isn't in the targeted segment, or you're pointed at a **sandbox/dev environment whose campaigns differ from production**. Before concluding "discounts aren't calculating", verify in the engine's UI that an active campaign actually matches the test cart. Confirm the wiring separately with a rule you know matches — an unconditional "1% off everything" test campaign is the fastest way to separate "not wired" from "nothing matched".

Related: check the engine environment the connector points at. Evaluating against sandbox while inspecting the production dashboard produces exactly the "nothing is happening" symptom.

### Trap 3 — discounts disappeared after an unrelated cart update

If the connector is **fail-open** (the recommended default), an engine error or timeout produces a cart update with **no** discounts — the customer's discount vanishes mid-session. That is the fail-open contract working, and because the evaluator always writes the *complete* `directDiscounts` array, the next successful evaluation **self-heals** it. Verify both halves deliberately: force an engine failure and confirm the cart update still succeeds, then let the next update repair the discounts. If you see a stuck empty state instead, the evaluator is emitting deltas rather than the full array.

### Trap 4 — usage limits attributed to the wrong shopper

Log in with an anonymous cart that already carries an evaluated session. If the anonymous cart merges into the customer's cart, the cart identity the engine has been tracking can change, so per-customer usage limits and loyalty attribution can land on the wrong profile — or a single-use coupon can be spent twice across the two identities. Verify the anonymous → known transition explicitly; it is not covered by any happy-path test.

### Trap 5 — points awarded for a cart that never became an order

Create a cart with a points-earning promotion, evaluate it, then **abandon it**. The engine must show no redemption and no points. If it doesn't, redemption is happening at evaluation time — see [promotion-contract.md](./promotion-contract.md).

## Verification checklist

- [ ] `directDiscounts` populated and totals reduced after a cart update (extension registered + firing)
- [ ] Coupon accepted → discount applied; coupon invalid → cart update **succeeds** with a rejection reason
- [ ] Order placed → syncer acks → redemption/points confirmed via the engine API and visible in its reporting
- [ ] Same envelope delivered twice → exactly **one** redemption and **one** point award
- [ ] Abandoned cart → **no** redemption, **no** points
- [ ] Forced engine failure → cart update still succeeds (fail-open), and the next update self-heals the discounts
- [ ] Anonymous → logged-in cart merge verified; usage limits and attribution land on the right profile
- [ ] Cancellation/return → rollback observed in the engine (if in scope)
- [ ] Understood: inert native Discount Codes and zero discount from a non-matching campaign are correct, not bugs
