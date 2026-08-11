---
name: promotion-connector-contract
description: The two-app promotion connector contract — the evaluator API Extension (effect→action mapping, setDirectDiscounts, coupon feedback, call reduction, 200-not-202, fail-open) and the redemption-syncer Subscription (redeem/rollback lifecycle, idempotency). Full pitfall catalog. The promotion sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - promotions
    - connect
---

# The two-app promotion contract

Everything the evaluator and the redemption-syncer must do, and the pitfalls that silently break each. Grounded in the public Talon.One and Voucherify integrations; which of those to actually use, and what to fix when forking one, is [public-connectors.md](./public-connectors.md). Engine-side payloads are the vendor's to document — read their API docs.

The type-agnostic mechanics — extension registration, envelope decoding, ack semantics — are the parent skill's [service-applications.md](../../service-applications.md) and [event-applications.md](../../event-applications.md). This file covers only what is promotion-specific.

## App 1 — the evaluator (cart API Extension)

### What triggers it

An API Extension on the `cart` resource, `actions: [Create, Update]`, registered by the app's `postDeploy`. Promotion engines bill and rate-limit per call and sit on the cart hot path, so **condition the trigger** to fire only on carts worth evaluating:

```json
{
  "resourceTypeId": "cart",
  "actions": ["Create", "Update"],
  "condition": "cartState = \"Active\" and lineItems is not empty"
}
```

Validate any predicate you write against the [conditional triggers](https://docs.commercetools.com/api/projects/api-extensions.md#conditional-triggers) docs — a predicate that fails to evaluate returns `400 ExtensionPredicateEvaluationFailed` and breaks the cart operation, so a wrong condition is worse than none.

### What it must return

An API Extension response is **update actions applied before the cart persists**. For a promotion connector that is normally:

- **`setDirectDiscounts`** — the engine's discounts. **The action replaces the whole array**, so always emit the complete current set, never a delta. Order the array deliberately: Direct Discounts have no `sortOrder` and apply **in array order**.
- **`setCustomField`** (coupon result) — whether the entered code was accepted, and why not if rejected. This is how the storefront shows "code invalid" (see below).
- **`setCustomField`** (cart hash) — the promo-relevant cart fingerprint, for call reduction.
- **`setCustomField`** (campaign messaging) — optional: "spend €10 more for free shipping" style engine copy the storefront renders.

Mapping engine effects to Direct Discount drafts — the shape is `{ value, target }`, the same vocabulary as Cart Discounts:

| Engine effect | `value` | `target` |
|---|---|---|
| % off eligible items | `relative` (`permyriad`) | `lineItems` (+ predicate) |
| Fixed amount off items | `absolute` | `lineItems` |
| Fixed price for items ("3 for €5") | `fixed` | `lineItems` / `pattern` |
| % or amount off the cart total | `relative` / `absolute` | `totalPrice` |
| Free / discounted shipping | `relative` (10000 permyriad) / `absolute` | `shipping` |
| Free gift item | `giftLineItem` | *(none — the draft carries the product/variant)* |
| Buy X get Y at a discount | `relative` **only** | `multiBuyLineItems` / `multiBuyCustomLineItems` |

Fetch the authoritative field shapes with the parent skill's `openApi-schemata.mjs --resource-name api-Cart-write` (`CartSetDirectDiscountsAction`, `DirectDiscountDraft`, `CartDiscountValueDraft`, `CartDiscountTarget`) rather than trusting a copied list. Two mapping details that bite:

- **`relative` values are permyriad** (1/10000), not percent — 10% is `1000`. An engine returning `10` becomes a 0.1% discount if you forward it raw.
- **The target discriminator is `shipping`, not `shippingCost`** — the type name (`CartDiscountShippingCostTarget`) and the discriminator value differ. Getting this wrong is a rejected action, not a silent miscalculation.
- **Multi-buy targets take a percentage only.** `multiBuyLineItems` / `multiBuyCustomLineItems` accept a `relative` value; an engine effect expressing "buy 3, pay €5" as a fixed amount must map to `pattern` (which accepts an amount, a fixed price, or a percentage) or to `lineItems`, not to a multi-buy target.
- **A `giftLineItem` discount needs a product that exists in commercetools.** An engine effect granting a free item the catalog doesn't have cannot be expressed; decide up front whether unmatched gift effects are dropped (with a log) or fail.

### Rejecting a coupon code without breaking the cart

The shopper types an invalid code. It is tempting to return `400` with `errors` — **don't**: that fails the entire cart update, so the shopper's real change (adding an item, setting an address) is lost too, and the storefront gets a generic platform error.

Instead: return `200`, write the validation outcome to a custom field, and let the storefront read it. A valid code produces discounts *and* a success flag; an invalid one produces no discounts and a rejection reason. Reserve `400 { errors: [...] }` for genuinely invalid *requests*, not for business-rule outcomes. The public Voucherify integration stores codes and their status in cart custom fields for exactly this reason.

### The response-status trap

An HTTP API Extension **must return `200` or `201`**. Any other status — **including `202`** — is treated as a failure to respond properly and **fails the triggering cart operation** ([docs](https://docs.commercetools.com/api/projects/api-extensions.md#response)). A successful no-op is `200` with `{}` or `{ actions: [] }`. Same trap as the tax sub-area; pin it with a test.

### Latency and fail mode

The extension couples its latency and uptime to every cart operation: **1 s connection limit, 2 s response limit by default**, configurable per extension up to **10 s** (per-project increases available via support request, subject to performance review). The docs' own target is to respond fast rather than to use the whole budget. So:

- Keep the outbound engine call on a tight timeout **under** the extension budget, aborting yourself rather than letting the platform time out.
- **Default to fail-open for promotions.** Return `200` with no discount actions when the engine errors or times out: a promotion outage then degrades to "no promotions today" instead of "nobody can add to cart". This is the **opposite** default from a compliance-driven tax integration, where an untaxed cart may be unacceptable. If the business genuinely requires fail-closed (e.g. engine-managed contract pricing that must never be missing), say so explicitly in the README.
- Fail-open has a consequence to state: a cart can persist **without** discounts the customer expected. Make the next successful evaluation self-healing — because the evaluator always writes the complete `directDiscounts` array, the following cart update repairs it automatically.

### Call reduction (the biggest cost lever)

Skip the engine when nothing promotion-relevant changed: hash the promo-relevant cart fields (line items + quantities + prices, customer/group, shipping method, entered code, currency/country) into a cart custom field. On the next call, if the hash matches, return `{ actions: [] }` immediately. The certified tax connectors use the same `hashCart` pattern ([tax-contract.md](../tax/tax-contract.md)).

Note what the hash is **not** for: it is not a substitute for engine-side idempotency, and it must include **everything** the engine's rules can match on — a hash that omits the customer group will serve one segment's discount to another.

### Re-trigger and chaining

Two things people conflate:

- **Your response does not re-invoke you.** The extension is called *before the result is persisted* and its returned actions are applied within that same operation — writing `setDirectDiscounts` in the response is not a fresh cart update and does not recurse.
- **Out-of-band cart writes by your own connector do.** If another app (an `event` handler, a `job`) updates the cart via the API, that *is* a cart update and *will* trigger the evaluator. Filter your own changes ([event-applications.md](../../event-applications.md)) or you get a call loop and duplicate engine charges.

Also plan for **coexistence**: a project may already have a tax extension on `cart`, and a project allows at most **25 extensions**. When both promotions and tax extend the cart, discounts must be applied **before** tax is computed, since tax is calculated on discounted amounts. commercetools supports [extension chaining](https://docs.commercetools.com/api/projects/api-extensions.md#extension-chaining) with declared dependencies (bounded: max 5 direct dependencies, max 3 layers deep, no cycles — violations surface as `ExtensionChainTooWide` / `ExtensionChainTooDeep` / `CircularDependency`). If a promotion connector lands in a project that already has a tax connector, work the ordering out deliberately rather than hoping.

One more limit: an extension response carries **at most 100 update actions**. A large cart with per-line-item discounts plus custom fields can approach it — prefer fewer, broader-targeted Direct Discounts over one draft per line item.

### Keep the mapping pure and testable

The cart→request and effects→actions mapping is deterministic — keep it a **pure function** with no network, so the whole evaluation is unit-testable without a deployment, a cart, or a token. Assert: each effect type maps to the right value/target, permyriad conversion, money minor-unit handling, the complete-array replacement, hash short-circuit returns `[]`, invalid code returns `200` + rejection field (not `400`).

## App 2 — the redemption-syncer (OrderCreated Subscription)

### What triggers it

A Connect **`event` application**: you register a **Subscription** on the `order` resource for `OrderCreated` (plus `OrderStateChanged` / return messages if rollback is in scope) in the app's `postDeploy`; Connect provisions the queue and delivers each message as an HTTP `POST` to the app's endpoint. Envelope decoding (base64 `message.data` on GCP), PlatformFormat vs CloudEventsFormat, message-type filtering, and ack semantics are all the parent skill's [event-applications.md](../../event-applications.md) — don't re-derive them here.

### What it must do

- **Re-fetch the Order by id** from `resource.id` — don't trust the possibly stale or omitted payload.
- **Redeem in the engine**: consume the coupon, close the customer session, award loyalty points. This is the call that makes the promotion real and the only one that shows up in the engine's reporting.
- **Be idempotent on a stable key — the order id.** Redelivery is guaranteed, not hypothetical, and this is the one place where a bug costs money: a double redemption double-awards points and can consume a single-use coupon twice. Prefer the engine's own idempotency key / duplicate guard, and treat "already redeemed" as **success**, not an error to retry.
- **Ack correctly.** Reply `200` for handled *and* irrelevant-but-acked messages; return non-2xx only for transient failures you *want* redelivered.

### What it must not do

- **Don't redeem from the cart.** Only an order is a purchase. Redeeming at cart-evaluation time consumes coupons and awards points for carts that are abandoned — the single most damaging design error in this sub-area.
- **Don't treat commercetools as the ledger for points/balances.** The engine is the system of record. Mirroring a balance onto a Customer custom field is fine for display; reading it back as authoritative is not.

### Full lifecycle (if in scope)

- **Cancel → roll back** the redemption and claw back points, on the order states the merchant designates as cancellations.
- **Return → partial rollback**, on return-shipment state changes.
- **Order edit → re-evaluate**: note that changing discounts on an existing Order is **not** a plain cart update — it needs the [Order Edits `setDirectDiscounts`](https://docs.commercetools.com/api/projects/order-edits.md) action.

Drive these off **merchant-configured order-state lists** in config, not hardcoded state names — state keys differ per project ([config-from-requirements.md](./config-from-requirements.md)).

## Identity: the session key

An external engine tracks a **session/profile**; commercetools tracks a cart and a customer. The mapping must be stable across the whole journey:

- Use the **cart id** as the engine session key, and the **customer id** (or a stable anonymous id) as the profile key.
- **Cart merge on login is the trap.** When an anonymous cart merges into a customer's cart, the cart identity the engine has been evaluating can disappear, and per-customer usage limits may be attributed to the wrong profile. Decide explicitly what happens: re-evaluate under the surviving cart id, and re-key or close the abandoned session.
- Carry the same key into the redemption call, so the engine can tie the redeem back to the session it evaluated.

## Pitfall catalog

| Pitfall | Symptom | Fix |
|---|---|---|
| Extension returns `202` | Every cart update fails | Return `200`/`201` only |
| Invalid coupon returned as `400` | Shopper's whole cart update fails; generic error in the UI | Return `200` + rejection reason in a custom field |
| Redeeming at cart time | Coupons consumed and points awarded for abandoned carts | Redeem only in the `OrderCreated` syncer |
| Non-idempotent redemption | Redelivery double-redeems / double-awards points | Stable key = order id; "already redeemed" = success |
| `setDirectDiscounts` emitted as a delta | Old discounts linger or vanish unpredictably | Always write the complete array |
| `relative` value forwarded as percent | 10% becomes 0.1% | Convert to permyriad (10% = `1000`) |
| Native Discount Codes still expected to work | Codes silently have no effect once Direct Discounts are set | Exclusivity is by design; pick one owner ([config-from-requirements.md](./config-from-requirements.md#how-discounts-land-on-the-cart)) |
| No hash / no trigger condition | Engine called on every cart keystroke; bill and rate limits blow up | Condition the trigger; hash promo-relevant fields |
| Hash omits a field the engine matches on | Wrong segment's discount served from a stale evaluation | Hash everything the rules can read |
| Own connector writes the cart out-of-band | Evaluator re-triggers in a loop; duplicate engine charges | Self-change filtering |
| Promotion + tax extension ordering unmanaged | Tax computed on undiscounted amounts | Order via extension chaining/dependencies; discounts before tax |
| >100 actions in one response | Cart operation fails | Fewer, broader-targeted Direct Discounts |
| Extension destination = base URL | Platform's calls 404 the app | Register destination as `<CONNECT_SERVICE_URL>/promotionEvaluator` |
| `postDeploy` doesn't register the extension / custom type | Evaluator never fires, or `setCustomField` fails on a missing type | Wire `connector:post-deploy` idempotently for both |
| Cart merge on login ignored | Usage limits attributed to the wrong profile; session orphaned | Re-key/close the session on merge |
| Gift effect for a product not in the catalog | Mapping throws or silently drops the reward | Decide drop-with-log vs fail; assert it |
| Legacy SDK | Fails the parent skill's pinned-version gate | `@commercetools/platform-sdk@^8` + `@commercetools/ts-client@^4` |

## Test-first checklist (mirror in the suite)

Evaluator
- [ ] Each engine effect type maps to the right `value`/`target`; permyriad conversion asserted
- [ ] Complete-array replacement asserted (previous discounts don't leak)
- [ ] Returns `200` (asserted — the `202` regression is the one to pin)
- [ ] Invalid coupon → `200` + rejection custom field, **not** `400`
- [ ] Hash short-circuit returns `{ actions: [] }`; hash covers every engine-visible field
- [ ] Fail-open asserted for engine error **and** engine timeout
- [ ] Action count stays within the 100-action cap for a large cart

Syncer
- [ ] Decodes the envelope; acks irrelevant/test messages
- [ ] Re-fetches the Order by id
- [ ] Redeems idempotently on the order id; "already redeemed" treated as success
- [ ] Nothing is redeemed for a cart that never became an order
- [ ] (If in scope) rollback on configurable cancel/return states
