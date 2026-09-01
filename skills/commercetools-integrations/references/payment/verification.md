---
name: payment-connector-verification
description: Verify a connector payment round trip by finding the commercetools Payment the processor wrote and confirming its transaction state.
when_to_use:
  - "Confirming a test payment actually closed the loop into commercetools"
  - "Checking that the processor created a Payment with a successful transaction"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
---

# Verifying the round trip

A connector payment is only "done" when it has left a trace in commercetools. The processor (not your frontend) creates the [Payment](https://docs.commercetools.com/api/projects/payments.md) and adds its transactions — so verification means *finding the Payment the processor wrote* and confirming its transaction reached a terminal success state. The Payment's `paymentMethodInfo.paymentInterface` is whatever the connector's `PAYMENT_INTERFACE` is set to (Stripe default `checkout-stripe`).

## What success looks like

After a successful `dropin.submit()`:

1. The enabler's `onComplete` fires (or the browser is sent to `MERCHANT_RETURN_URL`).
2. The processor has created a Payment whose `paymentMethodInfo.paymentInterface` matches the connector (e.g. `stripe`) and added a transaction:
   - `Charge` / state `Success` for immediate capture (`STRIPE_CAPTURE_METHOD=automatic`), or
   - `Authorization` / state `Success` for authorize-now/capture-later (`manual`).

   The interface value comes from `PAYMENT_INTERFACE` (Stripe default `checkout-stripe`).
3. The Payment is linked to the cart (`cart.paymentInfo.payments`).

## Finding the Payment

The cart is the anchor — read it back and follow `paymentInfo`:

```bash
# Get the cart; paymentInfo.payments holds the Payment references the processor linked
curl -s "{api}/{projectKey}/carts/{cartId}" -H "Authorization: Bearer {token}"
```

Then fetch each referenced Payment and inspect its transactions:

```bash
curl -s "{api}/{projectKey}/payments/{paymentId}" -H "Authorization: Bearer {token}"
```

Look for, in the Payment:
- `paymentMethodInfo.paymentInterface` = the connector's interface
- `transactions[]` containing a `Charge` or `Authorization` with `state: "Success"`
- `interfaceId` set to the PSP's payment/intent reference
- optionally `interfaceInteractions[]` holding the raw PSP payload (audit trail)

If you prefer a query, filter payments by interface and recency, or by `interfaceId` if you captured the PSP reference. Reading scopes needed: `view_payments` (and `view_orders` to read the cart).

## If the Payment is missing or stuck

| Symptom | Likely cause | Where |
|---|---|---|
| No Payment at all | `submit()` never reached the processor; or processor 401/502 | contract pitfalls 2, 4, 7 |
| Payment exists, transaction stuck `Pending` | async PSP webhook not delivered/verified | provider reference → webhook setup; [backend-integration.md → webhook reconciliation](./backend-integration.md#webhook-reconciliation) |
| Payment with `Failure` transaction | declined card / PSP rejection | check PSP dashboard + the test card used |
| Duplicate Payments | frontend also creating Payments (wrong path) | the processor owns the Payment — don't create it yourself |

## Checklist
- [ ] `onComplete` fired or return URL was reached
- [ ] Cart `paymentInfo.payments` references at least one Payment
- [ ] That Payment has a `Success` `Charge`/`Authorization` transaction
- [ ] `paymentInterface` matches the connector; `interfaceId` is set
- [ ] No duplicate Payments (a sign the frontend wrongly created one)
