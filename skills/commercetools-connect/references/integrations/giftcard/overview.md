---
name: giftcard-integration-overview
description: Integrate a gift card management system into commercetools as a Checkout payment method via a Connect connector — the two-app workflow (requirements → use a public connector, customize/fork one, or build a new one → config → balance + redeem + refund). The gift card sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - giftcard
    - connect
---

# Gift card connector — integrate a gift card management system

This is the **gift card integration sub-area** of [commercetools-connect](../../../SKILL.md): you want customers to pay with gift cards (or store credit / vouchers) at checkout, and you'll do it with a Connect connector that talks to a gift card management system. For the deep, type-agnostic build/publish/certify lifecycle and the production-readiness gate, that's the parent connect skill; this sub-area owns the gift-card-specific shape end to end — from "is there a connector already?" through configuring, forking, or building one.

A gift card Connector manages the communication between the merchant, [Checkout](https://docs.commercetools.com/checkout/), and the gift card management system, exposing gift cards as a **payment method** in the checkout flow ([Gift card Connectors](https://docs.commercetools.com/checkout/connectors-and-applications.md#gift-card-connectors)). It supports checking a card's **balance** in real time, **applying** its value toward the purchase, **partial payments** (the card covers part of the total and another payment method covers the rest), and **multiple gift cards** on one transaction.

Like a payment connector, a gift card connector is **two applications** built from the [gift card integration template](https://github.com/commercetools/connect-giftcard-integration-template):

- **processor** (a `service`) — the backend middleware to the gift card system. It checks balances, redeems value, and **owns the commercetools Payment object** (creates it, adds/updates transactions). Its behavior is driven by its `connect.yaml` config; it authenticates callers with a Checkout Session (balance/redeem) or a JWT/OAuth token (post-order operations via the Payment Intents API).
- **enabler** (an `assets` bundle) — a browser JS library that renders the gift-card input UI and calls the processor. Checkout loads it based on your Payment Integration configuration; it can also be embedded directly in a custom frontend.

> **The rule to internalize first: never ship a gift card integration alone.** A gift card Payment Integration must always be configured **alongside at least one other Payment Integration** ([docs](https://docs.commercetools.com/checkout/connectors-and-applications.md#gift-card-connectors)). A gift card often can't cover the full cart total; without a fallback method the shopper is stuck when the balance falls short. This is a configuration requirement, not a nice-to-have.

## Gift card connectors are consumed by Checkout

Unlike a raw payment connector (which you can wire into a custom storefront with no Checkout product), the gift card flow is designed around commercetools **Checkout**: Checkout renders the gift-card Payment Integration, drives balance/redeem through the enabler+processor, emits [gift card Messages](https://docs.commercetools.com/checkout/messages.md#gift-card-messages) (`gift_card_balance_*`, `gift_card_redeem_*`) you subscribe to via the [Browser SDK](https://docs.commercetools.com/checkout/browser-sdk.md), and drives post-order operations (refund/reverse) through the [Payment Intents API](https://docs.commercetools.com/checkout/payment-intents-api.md). If your team is wiring the *storefront* side of that (rendering the integration, reacting to gift card messages), that's the [commercetools-checkout](../../../../commercetools-checkout/SKILL.md) skill; **this** sub-area is the connector behind it.

## Workflow

When integrating gift cards, follow these steps in order. The heart is **Step 1 → Step 1.5 → Step 2 → Step 3** (requirements → use/customize/build? → config → the two apps).

### Step 0 — Gather context (required, run first)

The mandatory grounding step: pull the latest verified documentation as context for you (the agent). Use the parent connect skill's docs-search script with gift-card-focused terms. **Do not skip it, and do not replace it with another tool**:

```bash
node scripts/docs-search.mjs \
  --query "<gift card terms from the user's request, e.g. 'gift card connector checkout balance redeem payment method'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-connect" \
  --limit 10
```

(Run it from the `commercetools-connect` skill root.) Use its output as primary grounding. You *may additionally* use the commercetools Knowledge MCP or `https://docs.commercetools.com/checkout/connectors-and-applications` for deeper follow-up.

### Step 1 — Extract requirements (before any config or code)

Gift card behavior is downstream of business facts, and the wrong default silently produces a broken checkout. Extract these first; each maps to a config key in Step 2 or a rung in Step 1.5. Ask the user (don't assume):

1. **Which gift card system, and why?** A dedicated gift-card/loyalty platform (e.g. Voucherify), an in-house ledger, or a store-credit service. Do they already have an account + API credentials?
2. **Is there a public connector for it?** Voucherify has one; most systems don't. This decides configure-vs-build (Step 1.5) and changes the effort estimate — say it early.
3. **Region and project?** e.g. `europe-west1.gcp`, project `my-project` — the CT API/Auth/Session hosts and JWKS/issuer config are region-specific.
4. **Which fallback payment method(s)?** The gift card integration is configured alongside another Payment Integration (PSP). Which one, and is it already deployed? (Non-negotiable — see the rule above.)
5. **Currency handling?** A single connector deployment is typically scoped to one currency; a multi-currency storefront may need multiple deployments or a system that handles conversion. Confirm the currencies in scope.
6. **Partial + multiple cards?** Should one cart accept multiple gift cards, and combine a card with a PSP payment for the remainder? (Usually yes — confirm the system supports partial redemption.)
7. **Post-order operations?** On cancellation/return, should redeemed value be **refunded/reversed** back to the card? → drives whether you implement the Payment Intents `refundPayment`/`reversePayment` operations, not just balance+redeem.
8. **Anything special or non-standard? (always ask — open-ended)** Expiry rules, per-transaction caps, PIN/security-code entry, fraud checks, combining with discount codes, B2B store credit, or a specific gift-card account/program id. Capture each as its own requirement line; **don't force it into a slot above.**

Write these as a short requirements block and **confirm with the user** before deriving config. Each special requirement feeds the Step 1.5 fit-check (it may push "configure" → "fork" or "build"). If the user surfaces nothing special, a sane default is: system chosen → one currency → partial + multiple cards on → paired with an existing PSP integration → balance + redeem + refund → and say so explicitly.

### Step 1.5 — Use a public connector, customize one, or build a new one? (decide before wiring or building)

This is the core routing decision the user asked for. With the requirements in hand, answer: **does a connector that already does this exist for this gift card system?** Don't answer from memory — the marketplace changes. Check **live** data (the [Connect marketplace](https://docs.commercetools.com/merchant-center/connect.md) + the gift-card docs, via the `docs-search` script / Knowledge MCP), and **name the connector + version** you checked.

Then walk the **ladder** — stop at the first rung that fits, because each later one is more to build and maintain:

1. **Use a public connector directly** → if a Public Connector of type Gift Cards covers the system (e.g. Voucherify) or you just need a proof of concept (the **sample gift card connector** — see below), install + configure it (Step 2). Don't build.
2. **Public connector, gap looks like a capability** → prove it isn't **config** first. Many "missing" behaviors (currency, which operations are enabled, fallback pairing) are `connect.yaml` values or Merchant Center Payment Integration settings → back to rung 1.
3. **Customize/fork a connector's code** → genuine gap config can't close **and** an open-source connector exists for the system → fork it, add only the delta, deploy as an Organization connector. Don't rebuild a working one.
4. **Build a new one from the template** → no connector for the system → build from the [gift card integration template](https://github.com/commercetools/connect-giftcard-integration-template). The template ships both apps with the Connect + session/JWT plumbing done; you implement the calls to *your* gift card service and the mapping. This is the common case.

The **sample gift card connector** (installable from the marketplace) is for test/PoC only — it simulates payments with codes like `Valid-10000-EUR` and makes no real payment ([docs](https://docs.commercetools.com/checkout/connectors-and-applications.md#sample-gift-card-connector)). Use it to validate the checkout wiring before a real system exists; it is not a production integration.

Record the decision, the rung, and the version in the requirements block. Details and the landscape table: [connector-selection.md](./connector-selection.md). Rungs 3–4 switch to the parent [commercetools-connect](../../../SKILL.md) skill for the build/stage/publish lifecycle, then return here.

### Step 2 — Derive the config from the requirements

Translate the Step 1 answers into concrete `connect.yaml` values for the chosen connector (or your own), with a one-line **why** for each. The mapping, the CT envelope keys, least-privilege scopes, and a worked example are in [config-from-requirements.md](./config-from-requirements.md). Key decisions that live here:

- The commercetools connection block (`CTP_PROJECT_KEY`, `CTP_AUTH_URL`, `CTP_API_URL`, `CTP_SESSION_URL`, `CTP_JWKS_URL`, `CTP_JWT_ISSUER`) — region-specific; the session/JWKS/issuer values are what let the processor validate Checkout sessions and Merchant Center JWTs.
- **Currency** config (one deployment ≈ one currency for the template/Voucherify) and the gift-card-system credentials.
- **Secured vs standard config** — the gift card system API secret and the CT client secret are `securedConfiguration`; URLs, currency, and behavioral toggles are `standardConfiguration`.
- The **API-client scopes** the connector needs (`manage_payments`, `manage_orders`, `view_sessions`, `view_api_clients`, `manage_checkout_payment_intents`, `introspect_oauth_tokens`).

### Step 3 — Build/verify the two apps (the main body of work), test-first

**Tests come before implementation.** The rules that make a gift card integration correct — balance and redeem being session-authenticated, redeem creating/updating the commercetools Payment idempotently, partial redemption leaving a remainder for the fallback method, refund/reverse going through the Payment Intents route — are invisible at the call site and tedious to reproduce by hand. Each is one cheap assertion. Write the test first.

Read [giftcard-contract.md](./giftcard-contract.md) and build, in order — **test first for each**:

1. **Processor — balance + redeem** (session-authenticated): `POST /balance` (`{ code }`) checks the gift card system and reports the balance and whether it covers the cart; `POST /redeem` (`{ code, redeemAmount }`) redeems value against the system and records it on the commercetools Payment. Handle insufficient balance (partial redemption, remainder to the fallback method) and zero balance.
2. **Processor — post-order operations** (`POST /payment-intents/:id`, JWT/OAuth, `manage_checkout_payment_intents`): implement `modifyPayment` for the operations in scope (refund, reverse/rollback). Driven by the [Payment Intents API](https://docs.commercetools.com/checkout/payment-intents-api.md), not by the enabler.
3. **Enabler** — the frontend touchpoint that renders the gift-card input and calls the processor with the session. Thin slice; contract is in [giftcard-contract.md](./giftcard-contract.md).

**Mock the outbound boundary** (the gift card system, the CT APIs) and assert on what your code *decided* — which endpoint, what body, what it did with the response. The suite must run with zero deployment and zero secrets. What to assert/mock per app is in [giftcard-contract.md](./giftcard-contract.md).

### Step 4 — Verify the round trip

Don't declare done until a real gift card leaves a trace: a balance check returns the correct amount, a redeem creates a commercetools **Payment** with a transaction, the remainder (if any) is covered by the fallback method, and — if in scope — a refund/reverse through the Payment Intents API returns value to the card. See [verification.md](./verification.md), which also covers the traps that look like bugs: the **sample connector only simulates** (nothing is really redeemed), and a gift card integration **shown alone with no fallback** looks broken when the balance is short.

## References

| Need | Reference |
|---|---|
| **Use / customize / build?**: the ladder (public connector · fork · build-from-template), the sample connector, live-marketplace check, landscape table | [connector-selection.md](./connector-selection.md) |
| **Requirements → config mapping**: the CT connection block, currency, gift-card-system credentials, least-privilege scopes; the `connect.yaml` envelope; worked example | [config-from-requirements.md](./config-from-requirements.md) |
| **The two-app contract**: enabler (session-driven UI) + processor (balance/redeem session-auth, payment-intents modifyPayment for refund/reverse); partial/multiple cards; idempotency; full pitfall catalog | [giftcard-contract.md](./giftcard-contract.md) |
| **Verify the round trip**: balance → redeem → Payment transaction → fallback remainder → refund/reverse; the sample-only-simulates and no-fallback traps | [verification.md](./verification.md) |
| Build/publish/certify lifecycle, deploy, scopes, production-readiness gate (type-agnostic) | [commercetools-connect](../../../SKILL.md) |
| Storefront side: rendering the gift-card Payment Integration, reacting to gift card Messages | [commercetools-checkout](../../../../commercetools-checkout/SKILL.md) |

Adding another gift card system later means adding a sibling provider note and extending the selection table — the two-app architecture, the contract, and the flow do not change.

## Checklist

Requirements
- [ ] Gift card system chosen + account/credentials; region + project
- [ ] **Fallback Payment Integration identified** (gift card is never shipped alone); currency scope confirmed
- [ ] Partial + multiple cards decided; post-order refund/reverse decided
- [ ] Asked the open-ended "anything special?" question; each special requirement its own line
- [ ] Requirements block written and confirmed; specials fed into the Step 1.5 fit-check

Use / customize / build (decide before wiring/building)
- [ ] Checked **live** marketplace + gift-card docs (not memory); named the connector + version
- [ ] Ladder rung chosen: use public (1) · config-closes-gap (2) · fork/customize (3) · build from template (4)
- [ ] For a real gap on a system with a public connector, chose fork over rebuild
- [ ] Used the sample connector only for PoC, not production

Config (the deliverable)
- [ ] Only documented `connect.yaml` envelope fields; file at the repo root
- [ ] CT connection block + JWKS/issuer set for the region; currency configured
- [ ] Scopes = `manage_payments`, `manage_orders`, `view_sessions`, `view_api_clients`, `manage_checkout_payment_intents`, `introspect_oauth_tokens`
- [ ] Gift-card-system secret + CT client secret in `securedConfiguration`; URLs/currency in `standardConfiguration`

The two apps (build test-first — do not write a function body before its red test)
- [ ] `/balance` and `/redeem` session-authenticated; redeem creates/updates the Payment idempotently
- [ ] Partial redemption leaves a remainder for the fallback method; zero balance handled
- [ ] `/payment-intents/:id` refund/reverse implemented (if in scope), JWT/OAuth-authenticated
- [ ] Boundary mocked; suite runs with no deployment/secrets

Verification
- [ ] Balance check returns the correct amount; redeem creates a Payment transaction
- [ ] Remainder covered by the fallback method; refund/reverse returns value (if in scope)
- [ ] Understood: the sample connector only simulates; a gift card shown with no fallback is a config error, not a bug
