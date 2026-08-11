---
name: connector-selection
description: Decide whether the user's payment use case is already covered by a certified/public commercetools payment connector, or whether it needs a custom (Organization) connector — checked against live marketplace/docs data, not a hardcoded matrix.
when_to_use:
  - "Deciding between a public/certified connector and building a custom one"
  - "Checking whether a PSP, payment method, or capability is already supported before wiring or building"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
---

# Is a certified connector enough?

Before wiring or building anything, answer one question: **does a connector that already does what the user needs exist?** Getting this wrong is expensive in both directions — building a custom connector when a public one covers you wastes weeks; assuming a public connector supports a method it doesn't surfaces only at integration time.

There are two kinds of connector ([docs](https://docs.commercetools.com/checkout/connectors-and-applications.md#payment-connectors)):

- **Public connectors** — listed in the Connect marketplace, ready to install. Some are built by commercetools (e.g. Adyen, PayPal), some by third parties (e.g. Stripe). If one covers the use case, this is almost always the right choice: install + configure, don't build.
- **Organization (custom/private) connectors** — deployed for your organization only. These come in two flavors that matter a lot here: a **fork** of an existing public connector's open-source repo (you extend it), or a connector built **from scratch** off the [payment integration template](https://docs.commercetools.com/connect/templates/payment-integration.md). Both are [commercetools-connect](../../../SKILL.md) tasks.

The common-but-tricky case: **a certified connector exists for the PSP, but the user's specific requirement isn't covered by the public version.** Don't jump straight to "build custom" — that throws away a working, maintained connector. Walk the ladder below.

## Don't hardcode "what's supported" — check it live

The set of supported PSPs, payment methods, integration types, and capabilities **changes over time** (new methods via Adyen, new public connectors, new connector versions). So do not rely on a memorized matrix. Determine fit from current sources, in order:

1. Run the skill's `docs-search` step and/or query the commercetools Knowledge MCP for "supported PSPs payment methods payment connectors".
2. Read the live **Supported PSPs, Payment Integration Types, and payment methods** table: [connectors-and-applications.md](https://docs.commercetools.com/checkout/connectors-and-applications.md#supported-psps-payment-integration-types-and-payment-methods).
3. Browse the live **Connect marketplace** for installable connectors and their versions: [merchant-center/connect.md](https://docs.commercetools.com/merchant-center/connect.md). For a third-party connector (e.g. Stripe), its own repo/README is the source of truth for capabilities and config keys.

State explicitly to the user that you're checking current data, and cite what you found — capabilities differ by **connector version**, so name the version.

**Verify it's an actual Connect connector — and ask the user.** Apply the parent skill's general rule ([SKILL.md → Marketplace listings are not all Connect connectors](../../../SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending)): the marketplace lists integrations that are **not necessarily commercetools Connect connectors**, and it can be out of sync with what's actually deployable, so confirm a candidate is a real Connect connector (Connect affordance / repo / `connect.yaml`; the **Connect CLI registry is authoritative** over the listing) before treating it as rung 1/2. If a good-match option turns out to be a non–Connect (partner/SaaS) integration, surface it but **warn that this skill does not cover using non–Connect connectors** and offer the build/fork path instead.

## The fit check

Compare the requirements gathered in Step 1 against what a candidate public connector actually supports. Check each dimension:

| Dimension | Question | If not covered → which rung |
|---|---|---|
| **PSP** | Is the user's PSP available as a public connector? | No public connector → rung 4 (build from template), or pick a different PSP. |
| **Payment methods** | Does it support the methods they need (cards, wallets, BNPL, local methods)? | Method missing → fork to add it (rung 3), or another connector/PSP. |
| **Integration type** | Drop-in vs. web components — does the connector offer what the storefront needs? | Type missing → may force the other type, else fork (rung 3). |
| **Capabilities** | Capture mode (manual/auto), saved payment methods, partial/multi capture & refund, regions/currencies | Re-check as config (rung 2) first; if genuinely missing → fork (rung 3). |
| **Compliance/region** | Is it available + certified for the user's region and currencies? | Not available in region → fork/build, or different PSP. |
| **Special requirements** | Each open-ended requirement from Step 1 (B2B PO numbers, subscriptions, split payments, custom fraud/risk hooks, PSP metadata/descriptors, surcharging, stored-credential mandates…) — does the public connector do it? | Re-check as config (rung 2); if it's bespoke processor logic → fork (rung 3); if it implies a PSP with no connector → rung 4. |

Most capability gaps for a *supported* PSP are actually **config**, not missing features (e.g. partial refunds = a connector flag + a PSP-account setting). So before concluding anything needs building, confirm the gap can't be closed by configuration — that's the job of [config-from-requirements.md](./config-from-requirements.md). The special requirements are where this matters most: some are config, some are a small fork, some are neither — judge each on its own.

## The decision ladder

Walk these in order and **stop at the first that fits** — each later rung is more work and more to maintain, so don't skip ahead.

1. **Public connector covers everything** → install + configure (Step 2). Don't build anything. The common, recommended case.
2. **Supported PSP, gap looks like a capability** → first prove it isn't **config**. Most "missing" behaviors on a supported PSP (partial refunds, manual capture, saved cards, layout) are `connect.yaml` toggles, sometimes paired with a PSP-account setting. If a config closes the gap, you're back at rung 1. → [config-from-requirements.md](./config-from-requirements.md).
3. **Supported PSP, genuine gap that config can't close** → **fork/extend the public connector**. Its repo is open source (e.g. `stripe/stripe-commercetools-checkout-app`); add the missing behavior to your fork and deploy it as an Organization connector. You keep the working processor/enabler contract, the session auth, the Payment-ownership model — and only change the delta. This is far cheaper and safer than rebuilding, and it's a [commercetools-connect](../../../SKILL.md) task (extending an existing connector).
4. **No public connector for the PSP at all** → build from the [payment integration template](https://docs.commercetools.com/connect/templates/payment-integration.md) → [commercetools-connect](../../../SKILL.md). The from-scratch path, justified only when there's nothing to fork.

Only rungs 3–4 leave this skill (hand off to build/extend); the skill resumes once the resulting connector is deployed. Record the decision, the rung, and the connector version checked in the requirements block — so the rest of the work is grounded in a real, confirmed connector, not an assumed one.

## Checklist
- [ ] Checked live marketplace + supported-PSPs docs (not memory); cited the connector + version
- [ ] Verified the candidate is a **deployable Connect connector** (not a partner/SaaS listing); asked the user, and warned if they chose a non–Connect integration this skill doesn't cover
- [ ] PSP, methods, integration type, capabilities, region each compared to the requirements
- [ ] Apparent capability gaps re-checked as **config** (rung 2) before considering any build
- [ ] When a public connector exists but has a real gap, chose **fork/extend** (rung 3) over build-from-scratch
- [ ] Decision + rung + connector version recorded: configure (1), config (2), fork (3 → commercetools-connect), or build (4 → commercetools-connect)
