---
name: giftcard-verification
description: Verify a gift card connector round trip — balance check, redeem creates a Payment transaction, remainder covered by the fallback method, refund/reverse — and the traps that look like bugs (the sample connector only simulates; a gift card shown with no fallback). The gift card sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - giftcard
    - connect
---

# Verify the gift card round trip

Don't declare done until a gift card has left a trace where it should: the balance reads correctly, a redeem records a transaction on a commercetools **Payment**, any remainder is covered by the fallback method, and — if in scope — a refund/reverse returns value. Two checks below regularly look broken when they're actually correct — read the traps.

## Check 1 — balance reads correctly (and doesn't redeem)

Drive a balance check for a known card (in Checkout, via the gift-card Payment Integration; or POST `{ code }` to the processor's `/balance` with a valid session):

- The response reports the correct **balance** and whether it covers the cart. In Checkout this surfaces as the `gift_card_balance_success` [Message](https://docs.commercetools.com/checkout/messages.md#gift-card-messages) with `amount` and `isBalanceSufficient`.
- **The balance did not change** from checking it. A balance call that redeems or reserves value is a bug — check again and confirm the amount is unchanged.

## Check 2 — redeem records a Payment transaction, remainder to fallback

Redeem the card (Checkout drives this, or POST `{ code, redeemAmount }` to `/redeem` with a session), then inspect the cart's Payment:

- A commercetools **Payment** exists with a transaction for the redeemed amount (`gift_card_redeem_success` in Checkout).
- If the balance was **less than the cart total**, the outstanding amount is left for the **fallback Payment Integration** (the PSP), and completing the order requires paying that remainder. A short balance should never block checkout — it should route the rest to the fallback method.
- Multiple cards, if used, each add their own transaction.

## Check 3 — refund / reverse (if in scope)

For a post-order operation, drive it through the [Payment Intents API](https://docs.commercetools.com/checkout/payment-intents-api.md) (not the enabler):

- A refund returns value to the card and records a refund transaction on the Payment.
- A reverse/rollback unwinds a redemption; automated reversals require the connector to support `reversePayment`.

## The two traps (correct behavior that looks like a bug)

### Trap 1 — the sample connector only simulates

The **sample gift card connector** makes no real payment. Codes drive the outcome: `Valid-10000-EUR` simulates success, `Valid-0010000-EUR` forces a failure, `Valid-0-EUR` simulates a zero-balance card ([docs](https://docs.commercetools.com/checkout/connectors-and-applications.md#sample-gift-card-connector)). Amounts are in the currency's minor units (e.g. `500` = 5 CHF). So "it works with the sample but nothing settles in our gift card system" is **expected** — the sample never calls a real system. Use it to prove the *checkout wiring*, then verify real redemption against the actual connector.

### Trap 2 — a gift card shown with no fallback looks broken

A gift card Payment Integration configured **alone** (no PSP alongside it) strands the shopper the moment the balance is short: there's no way to pay the remainder. This looks like a connector failure but is a **configuration error** — the gift card integration must be configured alongside another Payment Integration ([docs](https://docs.commercetools.com/checkout/connectors-and-applications.md#gift-card-connectors)). Before debugging the connector, confirm a fallback method is present in the Checkout Application.

## Verification checklist

- [ ] Balance check returns the correct amount and does **not** change the balance
- [ ] Redeem records a transaction on a commercetools Payment
- [ ] Short balance leaves a remainder covered by the fallback PSP integration (checkout not blocked)
- [ ] Multiple cards each record a transaction (if in scope)
- [ ] Refund/reverse via the Payment Intents API returns/unwinds value (if in scope)
- [ ] Understood: the sample connector only simulates — verify real redemption against the real connector
- [ ] Understood: a gift card with no fallback method is a config error, not a connector bug
