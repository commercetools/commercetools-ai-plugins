---
name: shipping-connector-verification
description: "Verify a commercetools Connect shipping connector end to end — quote appears, shopper-visible option, Order priced with the quoted amount, label booked, tracking on the Parcel — plus the traps that look like bugs: the extension that blocks every cart, quoted options invisible to matching-cart, sandbox list rates instead of negotiated rates, and duplicate Deliveries."
metadata:
  contentType: REFERENCE
  area:
    - connect
    - shipping
    - integration
---

# Verify the shipping round trip

A shipping connector that passes unit tests can still be broken in three ways that only show up against a real project: the shopper can't see the option, the shopper can't check out at all, or the price on the Order isn't the price the carrier will invoice. Verify against a **sandbox project with a real carrier account** before calling it done.

## The round trip

Run these in order; each one fails differently.

1. **The extension is registered.** `GET /{projectKey}/extensions` returns your Cart extension with the destination and trigger you expect. A `postDeploy` that silently didn't run is the single most common cause of "nothing happens" — check this first, not last ([lifecycle-scripts.md](../../../commercetools-connect/references/lifecycle-scripts.md)).
2. **A quote happens.** Create a Cart, set a shipping address, and confirm from the connector logs (correlated by `X-Correlation-ID`) that exactly **one** carrier call was made, with the origin, destination, and weight you expect.
3. **The option is visible to the shopper.** Path A: `GET /shipping-methods/matching-cart?cartId=…` returns the methods with the correct tier resolved (`isMatching` on the rate/tier). Path B: your connector's option-list endpoint returns the quoted options, and the storefront reads *that*, not `matching-cart`. Verify whichever one the storefront actually calls — this is the failure that unit tests never catch.
4. **The price lands on the Cart.** Apply the chosen option and read the Cart's `shippingInfo`: the amount matches the carrier quote exactly, `shippingMethodName` is what you expect, and the tax on the shipping line is present and correct.
5. **The rate survives to the Order.** Place the Order and confirm `shippingInfo.price` on the Order equals the quoted amount. A rate that changes between quote and order is a cache-TTL or re-quote bug.
6. **Idempotence of the hot path.** Make an unrelated Cart update (change a custom field, set an email). Confirm **no** carrier call was made — the short-circuit works. This is what keeps the extension inside its budget in production.
7. **Label booked once.** For an in-scope execution app: trigger the Order Message, confirm a shipment exists at the carrier, and confirm the Order has one `Delivery` with your computed `deliveryKey`.
8. **Tracking is on the Parcel.** The Order's Parcel carries `trackingData` with the carrier's `trackingId` and `carrier`, and the number resolves on the carrier's tracking page.
9. **Redelivery is a no-op.** Re-deliver the same Subscription message. No second label, no second Delivery, and the handler acks (`102/200/201/202/204`).

## Failure-path checks (do not skip)

These are the ones that hurt in production, and they can only be proven by breaking things on purpose.

- **Carrier down.** Point the connector at an unreachable carrier host (or force the timeout). The Cart update must still succeed and the agreed fallback must apply. If carts fail, the connector is fail-closed — go back and confirm that is what the user actually chose.
- **Carrier slow.** Inject latency above `CARRIER_TIMEOUT_MS`. The extension must return within its budget on the fallback path, not ride the carrier's timeout into an `ExtensionNoResponse`.
- **Bad credentials.** Deploy with a wrong API key. `postDeploy` must fail the deployment, not defer the failure to the first shopper.
- **Address the carrier rejects** (undeliverable postcode, PO box for an express service). The shopper must see "no option", not a 500 that blocks the cart.

## Traps that look like bugs

| What you see | What it actually is |
|---|---|
| The storefront shows no shipping options, but the connector logs a successful quote | Path B: quoted rates landed as a **custom shipping method**, which is not a Shipping Method and never appears in `matching-cart`. The storefront must call the connector's option-list endpoint. → [shipping-contract.md](./shipping-contract.md) |
| Every cart update fails with an extension error | Carrier call on the hot path exceeding the extension budget, or a fail-closed error path. The platform does not retry within the API call — the whole update fails |
| Rates are plausible but consistently higher than expected | The carrier **sandbox** may not price against your negotiated account rates — confirm what it returns in the carrier's docs, and re-verify against a production carrier account before go-live |
| Prices are right in one country and wrong in another | Origin (`SHIP_FROM_*`) or unit system misconfigured; or dimensional-weight divisor differs per carrier region |
| Tier prices never change with weight | The Project's `shippingRateInputType` isn't set, or isn't the type your tiers use — tiers only apply when it is configured |
| The score is rejected or rounds oddly | Cart Score must be a **non-negative integer** — scale fractional values and scale the tiers with them |
| A shipping predicate that should match doesn't | Cart Score isn't addressable in predicates; mirror it to a Cart custom field → [shipping-predicates.md](../../../commercetools-commerce-patterns/references/shipping-predicates.md) |
| The rate stops updating after the cart is frozen | `HardFreeze` blocks shipping-method updates; the quote-late pattern needs `SoftFreeze` → [dynamic-shipping-costs.md](../../../commercetools-commerce-patterns/references/dynamic-shipping-costs.md) |
| Two labels for one order | Redelivery with no idempotency handle — `deliveryKey` not recomputed, or not re-checked before booking |
| Tracking never appears | Subscription not registered, the wrong Message type subscribed, or the OMS (not this connector) actually owns the write-back |
| Shipping is untaxed on the Order | Custom shipping method emitted without `taxCategory`, or `External` tax mode without `externalTaxRate` |
| Deliveries exceed what was ordered | commercetools does not validate delivered quantities against ordered ones — the guard is yours |

## Checklist

- [ ] Extension registered and confirmed via `GET /{projectKey}/extensions`
- [ ] Exactly one carrier call per rate-relevant change; **zero** on unrelated Cart updates
- [ ] Options visible through the endpoint the storefront actually calls
- [ ] Cart `shippingInfo` and the placed Order carry the quoted amount, with correct tax
- [ ] Carrier-down, carrier-slow, bad-credentials, and rejected-address paths each exercised deliberately
- [ ] Label booked once; `deliveryKey` present; redelivery is a no-op
- [ ] Tracking number on the Parcel and resolvable at the carrier
- [ ] Rates re-verified against a **production** carrier account before go-live
- [ ] Fail-open/fail-closed behavior matches what the user chose and what the README says
