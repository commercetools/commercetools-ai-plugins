---
name: promotion-connector-selection
description: Decide whether native commercetools discounts suffice, or whether to use a public promotion connector as-is, customise/fork one, or build one for your own promotion service — with the live-marketplace check and the per-engine landscape. The promotion sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - promotions
    - connect
---

# Native, use, customise, or build?

This answers Step 1.5 of [overview.md](./overview.md). Promotions differ from payment and tax in one decisive way: **commercetools ships a capable promotion engine of its own**, so the first question is not "which connector?" but "does this need a connector at all?"

## Rung 0 first — is this native?

Before any marketplace lookup, test the requirement against the native surface:

| Native primitive | Covers |
|---|---|
| [Product Discounts](https://docs.commercetools.com/api/projects/productDiscounts.md) | Percentage/absolute off a price before the cart, predicate-scoped |
| [Cart Discounts](https://docs.commercetools.com/api/projects/cartDiscounts.md) | Spend thresholds, tiered discounts, item/shipping/total targets, buy-X-get-Y (`multiBuy*`), free gifts (`giftLineItem`), `pattern` targets, per-Store scoping |
| [Discount Codes](https://docs.commercetools.com/api/projects/discountCodes.md) | Promo/coupon codes with max-applications and per-customer limits |
| [Discount Groups](https://docs.commercetools.com/api/projects/discount-groups.md) | "Only the best of these N discounts applies", plus deactivating a whole campaign in one request |
| Project `discountCombinationMode` | `Stacking` vs `BestDeal` across Product and Cart Discounts |
| [Direct Discounts](https://docs.commercetools.com/api/pricing-and-discounts-overview.md#direct-discounts) | A discount computed elsewhere and applied to **one** cart/order/quote |

The docs' own [common discount use cases](https://docs.commercetools.com/api/pricing-and-discounts-overview.md#common-discount-use-cases) table maps most standard promotions onto these, and notes that further needs (geofencing, bulk discount codes, stacked discounts) are supported **in combination with API Extensions** — i.e. some requirements are a small extension over native, not a whole promotion platform.

**Stop at rung 0** when the requirement is: percentage or fixed off, spend thresholds, buy-X-get-Y, free gift, free shipping, a promo code with usage limits, campaign windows, best-of-N. Building a connector for these adds a per-call cost, a latency budget on the cart, and an availability dependency — for behavior the platform already has. Say so plainly and stop.

**Go past rung 0** when the requirement needs capabilities that are genuinely a promotion *platform*: unique-code generation at scale, referral programs, loyalty points/tiers/wallets, cross-channel (POS + web) shared budgets, CDP-driven per-customer targeting, geofencing, real-time campaign experimentation, or a marketing team that must author rules in their own tool of record.

Also check the **converse**: if the customer already owns an engine licence and their marketing team works in it daily, "use native instead" is usually not a real option even when the discount math is simple — the requirement is *authoring in the engine*, which is rung 1+.

## Check live data — don't answer from memory

Listings and their capabilities change. Before deciding among rungs 1/3/4:

1. Search the **Connect marketplace** ([`marketplace.commercetools.com/connectors`](https://marketplace.commercetools.com/connectors)) and the [Promotions & Loyalty](https://marketplace.commercetools.com/integrations/promotions-and-loyalty) listings, plus the docs via the `docs-search` script or the Knowledge MCP.
2. **Distinguish an installable Connect connector from a partner integration you self-host** — apply the commercetools-connect skill's [Marketplace listings are not all Connect connectors](../../../commercetools-connect/SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending) rule; don't re-derive it here. It bites especially hard in this category: promotions & loyalty is crowded with partner-operated SaaS, so a listing is *weak* evidence that anything is deployable via Connect. Treating one as installable is a planning error, not a detail.
3. Compare the requirements engine-by-capability (evaluation, coupon codes, loyalty, rollback on cancel, POS, regions).
4. **Name the connector and version** you checked, and record it in the requirements block.

## The promotion landscape (verify, but this is the shape)

Promotions & loyalty is a **crowded** category compared with tax — several vendors have marketplace listings, and at least two have public source. As checked 2026-07:

| Engine | Marketplace presence | Source available? | Default rung |
|---|---|---|---|
| **Talon.One** | ✅ Listed, with a Connect connector | ✅ **MIT** ([`composable-com/ct-connect-talonone`](https://github.com/composable-com/ct-connect-talonone)) — maintained by **Orium**, not Talon.One | **1 (use)** — or **3 (customise)**, since the source is public. **Check you have the right repo:** Talon.One's own commercetools repos are a separate, PoC-grade accelerator ([public-connectors.md](./public-connectors.md)) |
| **Voucherify** | ✅ Listed (plus a separate Gift Card listing) | ✅ **MIT** ([`voucherifyio/commerce-tools-integration`](https://github.com/voucherifyio/commerce-tools-integration)) — but a **standalone Node service**, not a Connect app | **3 (customise/port)** — see the caveat below |
| **Dovetech Campaigns**, **Eagle Eye**, **NULogic**, **Annex Cloud**, **Currency Alliance**, **SheerID** | ✅ Listed | Vendor-private — check the listing | **1 (use)** if the listing covers it; otherwise partner conversation |
| In-house / unsupported engine | ❌ Nothing to install | — | **4 (build)** |

Two consequences worth stating to the user early, because they change the effort estimate:

- **"Just use the Talon.One connector" is a real answer** — but name the repo, because there are three. The MIT-licensed **Connect** connector is Orium's; Talon.One's own commercetools repos are an accelerator their docs label proof-of-concept, not production. If the requirements fit the Connect connector, this is rung 1 and cheap.
- **Voucherify's public integration is not a Connect connector.** It is an MIT-licensed standalone Node service that registers its own API Extensions and is documented for Heroku/self-hosted deployment. Using it *as Connect* means porting it into a Connect app (`connect.yaml`, lifecycle scripts, endpoint↔route wiring) — that is rung 3 work, not a marketplace install. Its logic (coupon validation, cart-custom-field code storage, redemption on payment) is excellent reference material either way.

## The ladder (stop at the first rung that fits)

### Rung 1 — Use a public connector as-is

A public connector exists and covers the requirements → **install and configure it**. Cheapest and most maintainable; the vendor/partner keeps it current. Installation (CLI auth, scopes, `deployment create --connector-key`, or Merchant Center install) is the commercetools-connect skill's [deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md). Hand it the config you derive in [config-from-requirements.md](./config-from-requirements.md).

Before concluding a requirement forces a fork, check whether it is a **setting** (rung 2) — promotion connectors typically expose effect mapping, attribute/custom-field mapping, tax category for discount line items, and which order states trigger redemption as configuration.

### Rung 2 — A gap that config can close

Usually a config value or Merchant Center setting: which engine effects map to which cart actions, where the coupon code is read from, which attributes are forwarded to the engine as cart/customer properties, which order states redeem vs roll back, sandbox vs live. Re-check the apparent gap against the connector's configuration surface before forking. Mapping in [config-from-requirements.md](./config-from-requirements.md).

### Rung 3 — Customise/fork a public connector

A genuine gap config can't close **and** the connector is public (Talon.One's and Voucherify's both are, MIT) → fork it, add only the delta, deploy as an **Organization connector**. Don't rebuild: the effect-to-action mapping, session/identity handling, and lifecycle registration are the bulk of the work and already exist.

This is also the rung where you **fix what you inherit**. The public connectors predate parts of the current Connect guidance, and forking is the moment to correct it — hand-supplied `CTP_CLIENT_ID/SECRET/SCOPE` instead of `inheritAs.apiClient.scopes`, non-secrets sitting in `securedConfiguration`, missing loop guards. The concrete list is in [public-connectors.md](./public-connectors.md). Hand off to [commercetools-connect](../../../commercetools-connect/SKILL.md) for the fork's build/stage/publish lifecycle.

### Rung 4 — Build for your own promotion service

No connector for the engine — an in-house promotion service, or a vendor with no listing → build it.

**Note the difference from payment and tax: there is no promotion-integration template.** Payment and tax each have one; promotions do not — check the current template list in [connect-cli.md](../../../commercetools-connect/references/connect-cli.md) and the [Connect docs](https://docs.commercetools.com/connect/development.md) rather than assuming one has appeared. So rung 4 here means scaffolding a plain connector with the Connect CLI declaring two applications, and implementing the contract yourself. Budget accordingly: this is more work than the equivalent tax rung 4, where a template hands you both app stubs.

What you actually write on rung 4:

- The **evaluator**: cart → your service's evaluate request; response effects → `setDirectDiscounts` (+ custom fields for coupon validity/messaging); the loop guard; fail-open. → [promotion-contract.md](./promotion-contract.md)
- The **redemption-syncer**: order → redeem/commit call, idempotent on order id; optional rollback on cancel/return.
- Lifecycle scripts that idempotently register the Extension, the Subscription, and the custom type holding the coupon code. → [lifecycle-scripts.md](../../../commercetools-connect/references/lifecycle-scripts.md)
- Config + scopes ([config-from-requirements.md](./config-from-requirements.md)).

Because you own the engine side too, rung 4 has one advantage worth using: **you can design the service's API to be idempotent and cart-hash-friendly from the start** (a stable session key per cart, an idempotent redeem keyed on order id), which removes most of the pitfalls in [promotion-contract.md](./promotion-contract.md) by construction.

The full build/stage/publish/certify lifecycle for rungs 3–4 is the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill; return to this promotion flow once the connector is deployed.

## Recording the decision

In the requirements block, note: **engine · rung · connector name + version checked · why**. Examples:

> *Promotions: none · rung 0 · checked requirements 2026-07 — "20% off orders over €100 plus a SUMMER promo code" is Cart Discount + Discount Code; no engine, no connector.*

> *Promotions: Talon.One · rung 3 (customise) · checked marketplace 2026-07, public MIT connector `composable-com/ct-connect-talonone` · fits except loyalty-point rollback on returns, which config can't express → fork and add the return handler; also migrating its hand-supplied CTP credentials to `inheritAs.apiClient.scopes`.*

> *Promotions: in-house "PromoSvc" · rung 4 (build) · checked marketplace 2026-07 — no listing, and no promotion template exists → scaffolding `service` + `event` with the Connect CLI.*
