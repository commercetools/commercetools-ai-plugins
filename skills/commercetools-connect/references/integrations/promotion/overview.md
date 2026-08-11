---
name: promotion-integration-overview
description: Integrate an external promotion/loyalty engine (Talon.One, Voucherify, Dovetech, Eagle Eye, …) into commercetools via a Connect connector — the workflow (native-first check → use / customise / build → config → evaluate + redeem). The promotion sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - promotions
    - checkout
    - connect
---

# Promotion connector — integrate an external promotion engine

This is the **promotion integration sub-area** of [commercetools-connect](../../../SKILL.md): promotions, coupons, vouchers, or loyalty are decided by an **external engine**, and you'll wire it up with a Connect connector. The parent skill owns the type-agnostic build/publish/certify lifecycle and the production-readiness gate; this sub-area owns the promotion-specific shape end to end — from "should this even be a connector?" through using, customising, or building one.

A promotion integration is **two jobs**, and the connector is **two applications** that mirror them:

- **promotion-evaluator** (a `service` registered as a **cart API Extension**) — the **evaluate** half. On cart changes, commercetools calls it *synchronously*; it sends the cart to the engine, gets back the discount effects, and writes them onto the cart (normally via `setDirectDiscounts`). Nothing is consumed — this is a **quote**.
- **redemption-syncer** (an `event` driven by an **OrderCreated Subscription**) — the **redeem** half. After the order is placed, it *asynchronously* tells the engine the promotion was actually used: redeem the coupon, close the session, award loyalty points — and, for a full integration, roll that back when the order is cancelled or returned.

> **Evaluate vs. redeem is the mistake to internalize first.** "Why is the coupon still showing as unused / why are no loyalty points awarded / why is there nothing in the engine's dashboard?" is almost always because only the *evaluator* is wired. Evaluating a cart consumes nothing; only the redeem call does. They are different engine endpoints and different Connect apps here.

Two things make promotions **harder than tax**, and both are decided before you write code:

1. **commercetools already has a promotion engine.** Product Discounts, Cart Discounts, Discount Codes, Discount Groups, multi-buy/pattern targets, and gift line items cover a large share of real requirements natively — with no connector to run, secure, and pay per call. A connector is the right answer when the requirement genuinely exceeds that surface; it is the wrong answer when it merely restates it. This is **rung 0** of the ladder below and you must rule it out explicitly, not silently.
2. **An external engine and native Discount Codes cannot both own a cart.** Direct Discounts and Discount Codes are [mutually exclusive](https://docs.commercetools.com/api/pricing-and-discounts-overview.md#direct-discounts): once a Direct Discount is on a Cart or Order, matching project Cart Discounts are ignored. So "the engine does promotions **and** we keep our native discount codes" is not a coherent design on the same cart — see [promotion-contract.md](./promotion-contract.md).

## Workflow

Follow these steps in order. The heart is **Step 1 → Step 1.5 → Step 2 → Step 4** (requirements → which path → config → the two apps).

### Step 0 — Gather context (required, run first)

The mandatory grounding step: pull the latest verified documentation as context for you (the agent). Use the parent connect skill's docs-search script with promotion-focused terms. **Do not skip it, and do not replace it with another tool**:

```bash
node scripts/docs-search.mjs \
  --query "<promotion terms from the user's request, e.g. 'cart discount direct discounts discount codes external promotion engine API extension'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-connect" \
  --limit 10
```

(Run it from the `commercetools-connect` skill root.) Use its output as primary grounding. You *may additionally* use the commercetools Knowledge MCP or [`pricing-and-discounts-overview`](https://docs.commercetools.com/api/pricing-and-discounts-overview.md) for deeper follow-up.

### Step 1 — Extract requirements (before any config or code)

Promotion behavior is downstream of marketing intent, and the wrong default silently gives money away or blocks checkout. Extract these first; each maps to a config key in Step 2 or a rung in Step 1.5. Ask the user (don't assume):

1. **Which engine, and why?** Talon.One, Voucherify, Dovetech, Eagle Eye, NULogic, an in-house service, or undecided. Do they already have an account + API credentials? If undecided, Step 1.5 may end at rung 0 (native).
2. **What can't commercetools do natively?** Name the specific requirement — bulk/unique code generation at scale, referral or loyalty programs, geofencing, per-customer targeting from a CDP, cross-channel (POS + web) budgets, real-time campaign experimentation. If the answer is "percentage off, spend thresholds, buy-X-get-Y, a promo code" — **that is native** ([Cart Discounts](https://docs.commercetools.com/api/projects/cartDiscounts.md) + [Discount Codes](https://docs.commercetools.com/api/projects/discountCodes.md)) and you should say so.
3. **Who owns promotions after this — the engine or commercetools?** Because Direct Discounts and Discount Codes are mutually exclusive, a split ownership model on the same cart doesn't work. Get an explicit answer: **all engine**, or **native with the engine only for a carved-out case**.
4. **Coupon/voucher codes?** Does the shopper type a code? Then decide where the code lives (a **cart custom field**, since native Discount Codes are off the table) and how an invalid code is reported back to the storefront.
5. **Loyalty points, wallets, or gift cards?** Points/balances are the engine's system of record — decide what (if anything) is mirrored into commercetools. **Gift cards are a payment method, not a discount** → that's the [gift card sub-area](../giftcard/overview.md), not this one. This split matters in practice because the same vendor often does both (Voucherify has a separate Gift Card listing): a voucher that reduces the cart total is a promotion, while stored value that *pays* for the order is a Payment.
6. **Order lifecycle beyond creation?** Should a cancellation or return **roll back** the redemption and claw back points? → drives whether the syncer subscribes to `OrderStateChanged` / return messages, not just `OrderCreated`.
7. **Region and project?** e.g. `europe-west1.gcp`, project `my-project` — host and config are region-specific.
8. **Fail-open or fail-closed?** If the engine is slow or down, does the cart proceed **without** promotions (fail-open, the usual answer for promotions) or does the cart update fail (fail-closed)? See Step 3.
9. **Anything special or non-standard? (always ask — open-ended)** B2B/quotes, multi-store or multi-currency budgets, marketplace/multi-seller, POS + web shared budgets, subscription/recurring orders, existing native discounts to migrate. Capture each as its own requirement line; **don't force it into a slot above.**

Write these as a short requirements block and **confirm with the user** before deriving config. Each special requirement feeds the Step 1.5 fit-check.

### Step 1.5 — Native, use, customise, or build? (decide before wiring or building)

This is the decision the rest of the flow assumes. Don't answer from memory — the marketplace changes. Check **live** data (the [Connect marketplace](https://marketplace.commercetools.com/connectors) and the promotions/loyalty listings, via the `docs-search` script / Knowledge MCP), and **name the connector + version** you checked. Details, the live-check procedure, and the per-engine landscape are in [connector-selection.md](./connector-selection.md).

Then walk the **ladder** — stop at the first rung that fits, because each later one is more to build and maintain:

0. **Native commercetools discounts are enough** → build **no connector**. Model it with Cart Discounts, Discount Codes, and Discount Groups. The docs' own [common discount use cases](https://docs.commercetools.com/api/pricing-and-discounts-overview.md#common-discount-use-cases) table maps most standard promotions to native primitives. Say this plainly and stop.
1. **A public connector for the engine covers everything** → install + configure it (Step 2). Don't build. Installation (CLI auth, scopes, `deployment create`) is the parent skill's [deployment-installation.md](../../deployment-installation.md); it is **not** the `connectorstaged` flow.
2. **Public connector, gap looks like a capability** → prove it isn't **config** first. Most "missing" behaviors (which effects map to which action, attribute/custom-field mapping, which order states redeem vs roll back) are `connect.yaml` values or Merchant Center settings → back to rung 1. See [config-from-requirements.md](./config-from-requirements.md).
3. **Public connector, genuine gap config can't close** → **fork/customise it.** The Talon.One Connect connector and the Voucherify integration are both MIT-licensed and public, so this is a real option — add only the delta and deploy as an Organization connector. Don't rebuild a working codebase. Provider specifics, and the known issues worth fixing while you're in there, are in [public-connectors.md](./public-connectors.md).
4. **No connector for the engine at all (an in-house or unsupported promotion service)** → **build it.** Note the difference from payment and tax: **there is no promotion-integration template.** You scaffold a plain `service` + `event` connector with the Connect CLI and implement the contract yourself — [connect-cli.md](../../connect-cli.md) for the scaffold, [promotion-contract.md](./promotion-contract.md) for what to build.

**Ask the user to choose between rungs 1, 3, and 4 explicitly** once you have the live landscape — "use the public connector as-is", "customise/fork it", or "build one for our own promotion service" are materially different amounts of work and the choice is theirs, not yours. Present rung 0 first if it applies at all. Record the decision, the rung, and the version in the requirements block.

### Step 2 — Derive the config from the requirements

Translate the Step 1 answers into concrete `connect.yaml` values, with a one-line **why** for each. The mapping, the `connect.yaml` envelope, and a worked example are in [config-from-requirements.md](./config-from-requirements.md). The decisions that live here:

- **How discounts land on the cart: `setDirectDiscounts` (recommended) vs. negative custom line items vs. engine-managed native codes.** This is the promotion equivalent of choosing a tax mode, and it is the one choice that leaks into the storefront. → [config-from-requirements.md](./config-from-requirements.md#how-discounts-land-on-the-cart).
- **Where the coupon code lives** — a cart custom field plus the custom type that `postDeploy` creates idempotently.
- **API-client scopes** — declare them in `inheritAs.apiClient.scopes` so Connect provisions a least-privilege client (`manage_extensions`, `manage_subscriptions`, `view_orders`, plus `manage_types` if `postDeploy` creates the custom type), rather than hand-supplying `CTP_CLIENT_ID/SECRET`.
- **Secured vs standard config** — the engine API key is `securedConfiguration`; region, behavioral toggles, and attribute mappings are `standardConfiguration`.

### Step 3 — The extension trigger, call reduction, and the loop guard (reference)

The API Extension is what makes the evaluator fire, and promotions are the sub-area where the hot path bites hardest: engines bill and rate-limit per call, and **your own `setDirectDiscounts` write is itself a cart update**, so a naive evaluator re-triggers itself. Three things to get right — full detail in [promotion-contract.md](./promotion-contract.md):

- **Condition the trigger** so it only fires on carts worth evaluating (`Active` cart state, non-empty).
- **Short-circuit on an unchanged promo-relevant cart hash** stored in a custom field — this is both the cost control and the loop guard.
- **Decide fail-open vs fail-closed and mean it.** For promotions the usual answer is **fail-open**: a down promo engine should return no discounts, not break every cart update. That is the opposite of a compliance-driven tax integration — state the choice in the connector README.

### Step 4 — Build/verify the two apps (the main body of work), test-first

**Tests come before implementation.** The rules that make a promotion integration correct — the extension returning `200`/`201` (never `202`), not looping on its own writes, redeeming exactly once under redelivery, rolling back on cancel — are invisible at the call site and miserable to reproduce by hand. Each is one cheap assertion. Write the test first.

Read [promotion-contract.md](./promotion-contract.md) and build, in order — **test first for each**:

1. **Evaluator (API Extension)** — map cart → engine session/evaluate request; call the engine; map effects → `setDirectDiscounts` (+ custom fields for coupon validity and campaign messaging); respond `200` fast; fail-open on engine error.
2. **Redemption-syncer (Subscription)** — on `OrderCreated`, re-fetch the Order by id, redeem/close/award in the engine, idempotently on a stable key (the order id). For a full integration, also handle cancel/return → rollback.

**Mock the outbound boundary** (the engine, the commercetools APIs) and assert on what your code *decided* — which endpoint, what body, what it did with the response. The suite must run with zero deployment and zero secrets.

### Step 5 — Verify the round trip

Don't declare done until a discount is visible on a real cart **and** a real order shows as redeemed in the engine. See [verification.md](./verification.md), which also covers the traps that look like bugs but aren't — a coupon that "works twice", points awarded on an abandoned cart, and the cart-merge-on-login identity switch.

## References

| Need | Reference |
|---|---|
| **Native, use, customise, or build?**: the rung-0 native check, the live-marketplace procedure, the per-engine landscape (Talon.One, Voucherify, Dovetech, Eagle Eye, NULogic, in-house) | [connector-selection.md](./connector-selection.md) |
| **Requirements → config mapping**: how discounts land on the cart, coupon-code custom field, scopes, the `connect.yaml` envelope; worked example | [config-from-requirements.md](./config-from-requirements.md) |
| **The two-app contract**: the evaluator (effect→action mapping, `setDirectDiscounts`, the self-trigger loop guard, 200-not-202, fail-open) and the redemption-syncer (redeem/rollback lifecycle, idempotency); full pitfall catalog | [promotion-contract.md](./promotion-contract.md) |
| **Which public integration to use, and what to fix when forking**: Talon.One's Connect connector is a third party's while the vendor's own repo is a PoC accelerator; Voucherify's is a port, not an install. Points at each repo and the vendor docs for config/API facts instead of copying them | [public-connectors.md](./public-connectors.md) |
| **Verify the round trip**: discount on the cart, redemption in the engine; the double-redemption, abandoned-cart, and cart-merge traps | [verification.md](./verification.md) |
| Build/publish/certify lifecycle, deploy, scopes, production-readiness gate (type-agnostic) | [commercetools-connect](../../../SKILL.md) |

Adding another engine later means a short section in [public-connectors.md](./public-connectors.md) naming which artifact is the production one, plus a row in the selection table — not a copy of that engine's configuration reference. The two-app architecture, the contract, and the flow do not change.

**Related:** discount stacking order, `sortOrder` semantics, Discount Groups, and Direct-Discounts-block-Discount-Codes as **domain** concepts live in [commercetools-commerce-patterns](../../../../commercetools-commerce-patterns/SKILL.md); this sub-area covers the *connector* that drives them. Gift cards and stored value as a **payment method** are the [gift card sub-area](../giftcard/overview.md).

## Checklist

Requirements
- [ ] Engine chosen (or deliberately deferred) + account/credentials; region + project
- [ ] The specific requirement native discounts **cannot** meet is named — not just restated as "promotions"
- [ ] Promotion ownership decided: **all engine** or **native + carved-out case** (never split on one cart)
- [ ] Coupon-code entry path decided (custom field + invalid-code feedback), or explicitly out of scope
- [ ] Loyalty/points mirroring decided; gift cards routed to the [gift card sub-area](../giftcard/overview.md) if applicable
- [ ] Rollback-on-cancel/return decided; fail-open vs fail-closed decided
- [ ] Asked the open-ended "anything special?" question; each special requirement its own line
- [ ] Requirements block written and confirmed; specials fed into the Step 1.5 fit-check

Path (decide before wiring/building)
- [ ] **Rung 0 ruled out explicitly** — native Cart Discounts/Discount Codes/Discount Groups can't do it, and you said why
- [ ] Checked **live** marketplace + docs (not memory); named the connector + version
- [ ] **User asked to choose** between use-as-is (1), customise/fork (3), and build-new (4)
- [ ] Rung recorded with rationale; for a real gap on a supported engine, chose fork over rebuild
- [ ] If rung 4: understood there is **no promotion template** — plain `service` + `event` scaffold

Config (the deliverable)
- [ ] Discount application mechanism chosen (`setDirectDiscounts` unless a reason not to) with rationale
- [ ] Discount-Codes-are-now-inert consequence stated to the user
- [ ] Only documented `connect.yaml` envelope fields; file at the repo root
- [ ] `inheritAs.apiClient.scopes` least-privilege (+ `manage_types` only if `postDeploy` creates types)
- [ ] Engine credentials in `securedConfiguration`; region/toggles/mappings in `standardConfiguration`

The two apps (build test-first — do not write a function body before its red test)
- [ ] Evaluator returns `200`/`201` (never `202`); fail-open on engine error/timeout
- [ ] **Loop guard**: promo-relevant cart hash in a custom field; own writes don't re-trigger evaluation
- [ ] Extension trigger conditioned to reduce engine calls (cart `Active`, non-empty)
- [ ] Syncer re-fetches the Order by id; redeems idempotently on a stable key; rolls back on cancel/return (if in scope)
- [ ] Boundary mocked; suite runs with no deployment/secrets

Verification
- [ ] Discount visible on the cart (`directDiscounts` + `discountOnTotalPrice`/`discountedPricePerQuantity`) after a cart update
- [ ] Order placed → syncer acks → redemption/points confirmed via the engine API
- [ ] Redelivering the same message does **not** redeem twice
- [ ] Cart-merge-on-login and anonymous→known session identity verified
