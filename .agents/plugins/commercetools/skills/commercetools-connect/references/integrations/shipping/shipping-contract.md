---
name: shipping-connector-contract
description: "The runtime contract for a commercetools Connect shipping connector — how an externally quoted rate lands on the Cart (setShippingRateInput over native tiers vs setCustomShippingMethod/addCustomShippingMethod) and what each costs at matching-cart, the rate API Extension's latency and fail-open budget, the label and tracking write-back via Delivery/Parcel/TrackingData, Single vs Multiple shipping mode, and the pitfall catalog."
metadata:
  contentType: REFERENCE
  area:
    - connect
    - shipping
    - integration
---

# The shipping connector contract

Read this before writing code. Unlike payment or gift cards, shipping has **no prescribed connector contract** — no enabler, no processor, no session handshake. What it has instead is one architectural decision that is expensive to reverse, and two application shapes built on the parent skill's type-agnostic patterns ([service-applications.md](../../service-applications.md), [event-applications.md](../../event-applications.md), [job-applications.md](../../job-applications.md)).

Scope of this file: the **commercetools side** of that contract. The carrier's own contract — auth, rate and label payloads, service/package codes, whether it supports idempotency keys — is the carrier's to document; read it from their current API docs, not from here and not from memory.

Sections: [The landing decision](#the-landing-decision-read-first) · [Rate application](#application-1--the-rate-application-service) · [Label and tracking application](#application-2--the-label--tracking-application-event) · [Multiple shipping mode](#multiple-shipping-mode) · [Pitfalls](#pitfall-catalog)

## The landing decision (read first)

A carrier gives you a number. There are three ways that number becomes the shipping price on a Cart, and they differ in what the **storefront** can see. Get this wrong and the integration works in tests and shows nothing at checkout.

| | **A — score/classification over native tiers** | **B — custom shipping method** | **C — quote once, late** |
|---|---|---|---|
| Update action | `setShippingRateInput` (`Score` or `Classification`) | `setCustomShippingMethod` (`Single`) / `addCustomShippingMethod` (`Multiple`) | `setCustomShippingMethod` after `freezeCart` |
| Who computes the price | commercetools, from the tier table | your connector, verbatim from the carrier | your connector, verbatim |
| Appears in `GET /shipping-methods/matching-cart` | **Yes** — the matching tier is resolved and flagged `isMatching` | **No** — it is not a Shipping Method | No |
| Multiple carrier options side by side | Yes, one Shipping Method per option | Only via your own endpoint | No — one price |
| Arbitrary carrier amounts | No — must fit tiers or a `priceFunction` | Yes | Yes |
| Cost | the Project's single `shippingRateInputType`; tier tables to maintain | storefront must source the option list from you | needs a freeze step in the checkout flow |

**A is the default when the rate is a function of something you can reduce to one integer** (weight, dimensional weight, distance band, zone index). The storefront keeps using `matching-cart` unchanged; your extension only supplies the score. Tier types and the price function are in [Shipping and Delivery Overview → tiered shipping rates](https://docs.commercetools.com/api/shipping-delivery-overview.md#tiered-shipping-rates) and [Shipping Methods](https://docs.commercetools.com/api/projects/shippingMethods.md).

**B is required when the carrier's amount is genuinely arbitrary** — negotiated account rates, surcharges, fuel, live service-level pricing. Its consequence is architectural, not cosmetic: since a custom shipping method is not a Shipping Method, **`matching-cart` will never list your quoted options**. The storefront must fetch the option list from a connector endpoint and then apply the chosen one. Plan that endpoint deliberately (see below); discovering it late means reworking the checkout UI.

**C is the documented low-effort path** when you need one exact price and don't need an option list — cart freeze plus `setCustomShippingMethod`, fully worked in [dynamic-shipping-costs.md](../../../../commercetools-commerce-patterns/references/dynamic-shipping-costs.md). Note that reference's own warning: the freeze must use `SoftFreeze`, because `HardFreeze` blocks shipping-method updates and this pattern silently breaks under it.

Mixing A and B in one connector is legitimate (A for the standard ladder, B for a quoted express option), but say so explicitly — the storefront then has two sources of options and must merge them.

### Field shapes you'll actually emit

`setCustomShippingMethod` requires `shippingMethodName` and `shippingRate`, and optionally takes `taxCategory`, `externalTaxRate`, `custom`, and `estimatedDelivery` (`from`/`until`) — the natural home for a carrier's delivery-window promise. `addCustomShippingMethod` (Multiple mode) additionally requires `shippingKey` and `shippingAddress`, and accepts `shippingRateInput` and `deliveries`. `ShippingRateDraft` is `price` (required) plus optional `freeAbove` and `tiers`. Confirm the exact current shape from the Cart OAS rather than from memory:

```bash
node scripts/openApi-schemata.mjs \
  --resource-name "api-Cart-write" \
  --app-name "<current-app>" --model "<current-model>" --skill-name "commercetools-connect"
```

**Tax is not free here.** A custom shipping method carries no tax category of its own — supply `taxCategory`, or `externalTaxRate` when the Project is in `External` tax mode. If an external tax connector also extends the Cart, the shipping rate must land **before** tax is computed — order the two deliberately with [extension chaining](https://docs.commercetools.com/api/projects/api-extensions.md#extension-chaining) rather than hoping, and note the project cap of 25 extensions. Coordinate with [tax](../tax/overview.md).

## Application 1 — the rate application (`service`)

Registered as a **Cart API Extension** (usually on Cart create + update; add Order create if the price must be re-validated at order time). Everything about this app is governed by the extension contract in [service-applications.md](../../service-applications.md) — this section is the shipping-specific part of it.

### The budget is the design

An extension must respond within **2 s by default, 10 s self-service maximum** ([API Extensions](https://docs.commercetools.com/api/projects/api-extensions.md)), and the platform does **not** retry within the API call — a failed or absent response fails the whole Cart update (`ExtensionBadResponse`, `ExtensionNoResponse`). Carrier rate APIs, and multi-carrier rate shopping in particular, are the classic way to blow that budget. So:

- **Set an outbound timeout strictly under the extension budget**, with headroom for your own work. Make it configuration, not a constant.
- **Rate-shop in parallel, and degrade rather than wait.** Return the carriers that answered; don't let the slowest define the response.
- **Short-circuit when nothing rate-relevant changed.** Hash the inputs that actually move the price — shipping address, line-item quantities/SKUs, weight, chosen service level — store the hash and the quote on the Cart (custom field or `CustomObject`), and return no update actions when the hash matches. Most Cart updates in a checkout flow don't change any of them, and each avoided carrier call is a round trip you keep inside the budget — measure the carrier's actual latency and size the timeout from that, not from a number quoted here. Your own response does not re-invoke you — the returned actions are applied inside the same operation — but the storefront's *next* call, applying the shopper's chosen option, is a fresh Cart update that does re-trigger the extension. The short-circuit is what stops that from being a second carrier call.
- **Cache per quote-relevant hash, not per cart**, with a TTL short enough that a stale rate can't reach an Order.

### Fail-open is a business decision, and shipping usually wants it

A down carrier must not make carts unusable. The workable default is: fall back to a **native Shipping Method** provisioned by `postDeploy` (a "Standard" rate that always matches), log the degradation with the correlation ID, and let checkout continue. But fail-open means a cart can be priced below cost, so **get the decision from the user** and record it, along with what the fallback rate is. Whatever you pick, state it in the connector README ([deployment-installation.md](../../deployment-installation.md)).

Return `200` with your update actions. Do not use the extension to signal "no shipping available" by erroring — model unavailability as *no matching option*, and let the shipping predicate or an empty option list express it.

### The option-list endpoint (path B only)

If quoted options can't come from `matching-cart`, the connector needs a second, plain HTTP route on the same `service` app — an inbound endpoint the storefront BFF calls to get `[{ carrier, serviceLevel, price, estimatedDelivery }]`. This is **not** an API Extension: the 5-minute service timeout applies, and you authenticate the caller yourself ([security.md](../../security.md)). Keep it and the extension reading the same cached quote so the list and the applied price cannot disagree.

## Application 2 — the label & tracking application (`event`)

Build this **only if commercetools talks to the carrier directly**. If an OMS or WMS books shipments, this belongs to the OMS connector — [order-management](../order-management/overview.md). Two writers on the same `Delivery`/`Parcel` data is a defect.

Subscribe to the Order Messages that mark "ready to ship" for this business — typically `OrderCreated` plus an `OrderStateChanged`/`OrderShipmentStateChanged` gate; don't book a label the instant an Order exists unless payment and fulfilment really are settled. Envelope decoding, ack semantics, and re-fetch-by-ID are the parent contract ([event-applications.md](../../event-applications.md)).

The write-back is three Order update actions, in order:

1. **`addDelivery`** — the shipment. Always set `deliveryKey` to a value you can recompute (e.g. `order.id`+shipment index): it is your idempotency handle. In `Multiple` shipping mode also set `shippingKey` to bind the Delivery to the right shipping entry.
2. **`addParcelToDelivery`** — the physical parcel(s), with measurements and items.
3. **`setParcelTrackingData`** — `TrackingData` carries `trackingId`, `carrier`, `provider`, `providerTransaction`, and `isReturn` (use it for return labels so they don't read as outbound shipments).

Confirm the current field shapes from the Order OAS (`--resource-name "api-Order-write"`) rather than from memory.

**Idempotency, statelessly.** Redelivery is guaranteed to happen. Before booking, re-fetch the Order and check whether a Delivery with your computed `deliveryKey` already exists; if it does, ack and stop. Where the carrier API supports an idempotency key, send one derived from the same value — that closes the window between "label bought" and "Delivery written". Never keep a local dedup store.

**Deliveries are not validated against quantities.** commercetools does not check that delivered quantities stay within the ordered ones ([Shipping and Delivery Overview](https://docs.commercetools.com/api/shipping-delivery-overview.md)) — over-shipment is your connector's problem to prevent.

Store the carrier's shipment identifier on the Delivery's custom fields (a Type created idempotently in `postDeploy`, see [lifecycle-scripts.md](../../lifecycle-scripts.md)) so a later status update or void can find it.

### Optional `job`

Use one where the carrier has no outbound webhook: poll tracking status for open shipments and update the Order, or reconcile bookings against carrier records. Standard job rules apply — own your locking and checkpointing ([job-applications.md](../../job-applications.md)).

## Multiple shipping mode

`Multiple` mode (split shipments, per-line-item methods and addresses) changes the whole surface:

- Rates are per shipping entry, keyed by `shippingKey`; use `addShippingMethod` / `addCustomShippingMethod`, not `setShippingMethod` / `setCustomShippingMethod`.
- Line items are bound to addresses through `itemShippingAddresses` + `shippingDetails`.
- Quoting is per group, so one Cart update can mean several carrier calls — the latency budget gets tighter, not looser. This is often the case that forces path A or an asynchronous quote.
- Deliveries must carry `shippingKey` — optional in the `addDelivery` schema, so the platform won't reject you for omitting it; without it the Delivery isn't bound to a shipping entry, which is a silent data bug rather than an error.

`shippingMode` is fixed once the Cart is created. Decide it in requirements (Step 1), not while coding. Concepts: [Shipping and Delivery Overview](https://docs.commercetools.com/api/shipping-delivery-overview.md); a worked multi-address example: [Multiple Shipping Addresses and Methods](https://docs.commercetools.com/tutorials/multiple-shipping-addresses-methods.md).

## Pitfall catalog

| Symptom | Cause | Fix |
|---|---|---|
| Quoted options never appear at checkout | Landed as a custom shipping method; the storefront reads `matching-cart`, which only returns Shipping Methods | Path A, or add the connector option-list endpoint and change the storefront to use it |
| Every cart update is slow, then carts start failing | Carrier call on the hot path with no short-circuit; extension exceeds its budget | Input hash + cached quote; outbound timeout under the budget; parallel rate shopping |
| Carts can't be updated at all during a carrier outage | Fail-closed extension | Fail-open to the `postDeploy`-provisioned fallback Shipping Method (business decision, documented) |
| Tier prices never change | Project `shippingRateInputType` not set, or not the type your tiers use | Set the Project's `shippingRateInputType`; tiers only apply when it is configured |
| Cart Score can't be used in a shipping predicate | Score isn't addressable in predicates | Mirror it to a Cart custom field — [shipping-predicates.md](../../../../commercetools-commerce-patterns/references/shipping-predicates.md) |
| Score rejected or price wrong for fractional values | Cart Score must be a non-negative integer | Scale (×10/×100) and scale the tiers to match |
| Shipping line has no tax / wrong tax | Custom shipping method supplied without `taxCategory`, or `External` tax mode without `externalTaxRate` | Supply the tax category or external rate; coordinate with the tax extension |
| Freeze-and-quote pattern silently stops updating the rate | `HardFreeze` blocks shipping-method updates | Use `SoftFreeze` — [dynamic-shipping-costs.md](../../../../commercetools-commerce-patterns/references/dynamic-shipping-costs.md) |
| Duplicate labels / duplicate Deliveries | Message redelivery with no idempotency handle | Recomputable `deliveryKey`, re-fetch-and-check before booking, carrier idempotency key |
| Tracking number never reaches the Order | Subscription not registered (`postDeploy` failed quietly), or the Message type isn't subscribed | Verify the Subscription exists; check `postDeploy` actually ran — [lifecycle-scripts.md](../../lifecycle-scripts.md) |
| Rates differ between test and production | The carrier's sandbox may not return your negotiated account rates (check what its docs say it returns) | Verify against a production carrier account before go-live — [verification.md](./verification.md) |
| Design needs dozens of near-identical Shipping Methods | Carrier × service level × zone enumerated natively | Quote instead of enumerate; the 100-method soft limit is real |
| Can't register the extension at all | Project already at the 25-API-Extension maximum | Consolidate extensions, or reconsider path A (no per-cart carrier call) |

## Checklist

- [ ] Landing mechanism (A / B / C) chosen deliberately; the `matching-cart` consequence stated to the user
- [ ] If path B: option-list endpoint designed, authenticated, and sharing the extension's cached quote
- [ ] Outbound carrier timeout configured **under** the extension budget; rate shopping parallelized
- [ ] Input-hash short-circuit implemented, so a Cart update that can't change the price makes no carrier call
- [ ] Fail-open/fail-closed decided by the user, fallback Shipping Method provisioned in `postDeploy`, documented in the README
- [ ] Tax on the shipping line handled (`taxCategory` or `externalTaxRate`); interaction with a tax extension considered
- [ ] `estimatedDelivery` populated when the carrier returns a delivery window
- [ ] Label/tracking app built **only** if no OMS owns shipment booking
- [ ] `deliveryKey` recomputable; re-fetch-and-check before booking; carrier idempotency key where available
- [ ] `shippingKey` set on rates and Deliveries in `Multiple` mode
- [ ] Over-shipment guarded in connector code (the platform does not validate it)
- [ ] Carrier boundary mocked in tests; timeout, outage, and duplicate-delivery paths each have a test
