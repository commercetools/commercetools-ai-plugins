---
name: giftcard-connector-selection
description: Decide whether to use a public gift card connector directly, customize/fork one, or build a new one from the gift card template — using live marketplace data, plus the sample connector for PoC. The gift card sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - giftcard
    - connect
---

# Use it, customize it, or build it?

This answers Step 1.5 of [overview.md](./overview.md): given the requirements, do you **use** an existing connector directly, **customize/fork** one, or **build** a new one from the template? The answer is **system-specific** — it depends entirely on whether *that* gift card management system has a public connector.

## Check live data first — don't answer from memory

Supported systems and connectors change. Before deciding:

1. Search the **Connect marketplace** (via the Merchant Center [Connect](https://docs.commercetools.com/merchant-center/connect.md) view) and the gift-card docs via the `docs-search` script or the Knowledge MCP. Filter for Public Connectors of type **Gift Cards**.
2. Compare the requirements system-by-capability (balance, redeem, partial redemption, multiple cards, refund/reverse, currency, region).
3. **Name the connector and version** you checked, and record it in the requirements block.

## The gift card landscape (verify, but this is the shape)

| System | Public connector? | Source available? | Default rung |
|---|---|---|---|
| **Sample / mock** (commercetools) | ✅ Yes — for **test/PoC only** | n/a (simulation) | Use for PoC; **never production** |
| **Voucherify** | ✅ Yes ([`commercetools/connect-giftcard-integration-voucherify`](https://github.com/commercetools/connect-giftcard-integration-voucherify)) | ✅ **Open source** | **1 (use)** — or **3 (fork)** since the source is open |
| **In-house / store-credit / other platform** | ❌ Usually none | — (only the generic template) | **4 (build from template)** |

The practical consequence: **"just use a connector" works for Voucherify; most other systems are a build-from-template job.** A request to integrate an in-house or niche gift-card system is a build, not a marketplace install — there is nothing to install. State this plainly to the user early, because it changes the effort estimate.

## The ladder (stop at the first rung that fits)

### Rung 1 — Use a public connector directly (Voucherify; sample for PoC)

If a Public Connector of type Gift Cards exists and covers the requirements, **install and configure it** ([install an Organization/Public Connector](https://docs.commercetools.com/merchant-center/connect.md#install-and-manage-connectors)). This is the cheapest, most maintainable path. Hand it the config you derive in [config-from-requirements.md](./config-from-requirements.md). Installation mechanics (CLI auth, scopes, `deployment create`) are the commercetools-connect skill's [deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md); it is **not** the `connectorstaged` flow.

The **sample gift card connector** is a special case of rung 1: install it to validate the *checkout wiring* (the Payment Integration renders, the enabler loads, balance/redeem round-trips) before a real system exists. It **simulates only** — codes like `Valid-10000-EUR` (success), `Valid-0010000-EUR` (forced failure), `Valid-0-EUR` (no balance) drive the outcome and **no payment is made** ([docs](https://docs.commercetools.com/checkout/connectors-and-applications.md#sample-gift-card-connector)). Never ship it as the production integration.

### Rung 2 — A gap that config can close

A "missing" behavior is often a config value or a Merchant Center Payment Integration setting: the currency, which operations are enabled, the fallback pairing, display/labels. Re-check the apparent gap against the connector's configuration surface before forking. Details in [config-from-requirements.md](./config-from-requirements.md).

### Rung 3 — Customize/fork the public connector (Voucherify)

If there's a genuine gap config can't close **and the connector is open source** (Voucherify's is), fork it, add only the delta, and deploy as an **Organization connector**. Don't rebuild — you'd throw away a working codebase (its session/JWT handling, balance/redeem flow, Payment lifecycle, and enabler are substantial). Hand off to [commercetools-connect](../../../commercetools-connect/SKILL.md) for the fork's build/stage/publish lifecycle, then return to this flow once deployed.

### Rung 4 — Build a new one from the gift card template (the common case)

No public connector for the system → build from the [gift card integration template](https://github.com/commercetools/connect-giftcard-integration-template). The template (TypeScript, Fastify, `@commercetools/connect-payment-sdk`) ships **both apps** with the Connect plumbing done — session/JWT authentication, the commercetools client, the route skeleton, the Payment lifecycle wiring — but the calls to *your* gift card service are **stubs you implement** (the template ships a mock in their place).

What you actually write on rung 4:
- The **processor** balance/redeem logic: `code` → your system's balance/redeem API, response → the commercetools Payment transaction (see [giftcard-contract.md](./giftcard-contract.md)).
- The **processor** post-order operations (`modifyPayment`): refund/reverse against your system, if in scope.
- The **enabler** UI for capturing the gift card code (and PIN, if the system needs one).
- Config + scopes ([config-from-requirements.md](./config-from-requirements.md)).

Because rung 4 is the most work, it's where the template's own contract bites (session-vs-JWT auth per route, the "always pair with a fallback" rule, partial-redemption remainder handling, idempotent redeem). Those are catalogued in [giftcard-contract.md](./giftcard-contract.md).

The full build/stage/publish/certify lifecycle for rungs 3–4 is the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill; return to this gift card flow once the connector is deployed.

## Recording the decision

In the requirements block, note: **system · rung · connector name + version checked · why**. Example:

> *Gift card: Voucherify · rung 1 (use) · checked marketplace 2026-07 — Voucherify public connector present and covers balance/redeem/refund for our single-currency (EUR) store · configuring it, paired with the existing Adyen PSP integration.*

> *Gift card: in-house store-credit ledger · rung 4 (build) · checked marketplace 2026-07 — no public connector for our ledger · building both apps from the gift card template, paired with the existing Stripe integration.*
