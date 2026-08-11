---
name: tax-integration-overview
description: Integrate an external tax service (Avalara, Vertex, TaxJar, …) into commercetools via a Connect connector — the two-app workflow (requirements → is-a-certified-connector-enough → config → calculate + record). The tax sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - tax
    - connect
---

# Tax connector — integrate an external tax service (backend-focused)

This is the **tax integration sub-area** of [commercetools-connect](../../../SKILL.md): you need an external tax engine to compute (and file) tax on carts and orders, and you'll do it with a Connect connector. For the deep, type-agnostic build/publish/certify lifecycle and the production-readiness gate, that's the parent connect skill; this sub-area owns the tax-specific shape end to end — from "is there a connector already?" through configuring, forking, or building one.

A tax integration is **two jobs**, and the connector is **two applications** that mirror them:

- **tax-calculator** (a `service` registered as a **cart API Extension**) — the **calculate** half. On cart changes, commercetools calls it *synchronously*; it asks the tax engine for the tax on the current cart and returns cart update actions that put the tax onto the cart. This is a **quote** — nothing is filed.
- **order-syncer** (an `event` driven by an **OrderCreated Subscription**) — the **record** half. After an order is placed, it *asynchronously* records the finalized order as a transaction in the tax engine (for reporting/filing), and — for a full integration — commits/voids/refunds as the order's lifecycle changes.

This two-app split is not incidental: it's the architecture the official [tax integration template](https://docs.commercetools.com/connect/templates/tax-integration.md) ships, the one the certified Avalara connector implements, and the one the [tax integration tutorial](https://docs.commercetools.com/tutorials/tax-integration.md) documents. Calculation must be synchronous (it blocks the cart so the shopper sees correct tax); recording must be asynchronous (filing must not block or fail checkout).

> **Calculation vs. recording is the mistake to internalize first.** "Why don't my transactions show up in the tax provider's dashboard?" is almost always because only the *calculator* is wired: the calculate API stores nothing; only the *record* API (the order-syncer) persists a transaction. They are different endpoints on the provider and different Connect apps here.

## Workflow

When integrating tax, follow these steps in order. The heart is **Step 1 → Step 1.5 → Step 2 → Step 4** (requirements → is a certified connector enough? → config → the two apps).

### Step 0 — Gather context (required, run first)

The mandatory grounding step: pull the latest verified documentation as context for you (the agent). Use the parent connect skill's docs-search script with tax-focused terms. **Do not skip it, and do not replace it with another tool**:

```bash
node scripts/docs-search.mjs \
  --query "<tax terms from the user's request, e.g. 'tax connector external tax API extension cart tax order sync'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-connect" \
  --limit 10
```

(Run it from the `commercetools-connect` skill root.) Use its output as primary grounding. You *may additionally* use the commercetools Knowledge MCP or `https://docs.commercetools.com/tutorials/tax-integration` for deeper follow-up.

### Step 1 — Extract requirements (before any config or code)

Tax behavior is downstream of business facts, and the wrong default silently produces wrong or missing tax. Extract these first; each maps to a config key in Step 2 or a rung in Step 1.5. Ask the user (don't assume):

1. **Which tax engine, and why?** Avalara/Vertex (enterprise US sales tax + global, compliance/filing), TaxJar (simpler US sales tax), or another. Do they already have an account + credentials?
2. **Where do they have nexus / an obligation to collect?** Which countries/states. This decides which destinations produce non-zero tax and is a frequent "why is tax zero?" cause (see [verification.md](./verification.md)).
3. **Region and project?** e.g. `europe-west1.gcp`, project `my-project` — the API host and config are region-specific.
4. **Do they need transaction recording / filing, or just calculation at checkout?** Calculation-only (rare) is one app; recording (the norm for compliance) needs the order-syncer too. → decides whether you build one app or two.
5. **Order lifecycle beyond creation?** Should cancellations **void** the filed transaction and returns **refund** it? → drives whether the syncer subscribes to `OrderStateChanged`/return messages, not just `OrderCreated`.
6. **Product tax categories / codes?** Are products taxed differently (clothing, food, digital, luxury)? Where is the tax code stored — a Product attribute, a Tax Category, or a Custom Field? → drives the tax-code mapping in the calculator.
7. **Tax-exempt buyers?** B2B/non-profit/government exemptions, exemption certificates or entity-use codes → stored on the Customer (Custom Field) and passed through.
8. **B2B / included-in-price / rounding needs?** VAT-inclusive pricing (`includedInPrice`), `taxCalculationMode` (LineItem vs UnitPrice), `taxRoundingMode`.
9. **Anything special or non-standard? (always ask — open-ended)** Marketplace/multi-seller, cross-border/customs, multi-currency, address validation, invoicing, or a specific engine account/company code. Capture each as its own requirement line; **don't force it into a slot above.**

Write these as a short requirements block and **confirm with the user** before deriving config. Each special requirement feeds the Step 1.5 fit-check (it may push "configure" → "fork" or "custom"). If the user surfaces nothing special, a sane default is: engine chosen → destination has nexus → calculation **and** recording → `ExternalAmount` tax mode → tax code from a Product attribute → and say so explicitly.

### Step 1.5 — Is a certified connector enough? (decide before wiring or building)

With the requirements in hand, answer the question the rest of the flow assumes: **does a connector that already does this exist for this engine?** Don't answer from memory — the marketplace changes. Check **live** data (the Connect marketplace + the tax-integration docs, via the `docs-search` script / Knowledge MCP), and **name the connector + version** you checked. The tax landscape as of writing: **Avalara and Vertex have certified public connectors; TaxJar does not** (build from template). See [connector-selection.md](./connector-selection.md).

Then walk the **ladder** — stop at the first rung that fits, because each later one is more to build and maintain:

1. **Public connector covers everything** → install + configure (Step 2). Don't build. Installing it (CLI auth, scopes, `deployment create`) is the parent skill's [deployment-installation.md](../../deployment-installation.md); it is **not** the `connectorstaged` flow.
2. **Supported engine, gap looks like a capability** → prove it isn't **config** first. Most "missing" behaviors (which order states commit/void, tax-code source, exemptions) are `connect.yaml` values or Merchant Center settings → back to rung 1. See [config-from-requirements.md](./config-from-requirements.md).
3. **Supported engine, genuine gap config can't close** → **fork/extend the public connector** (Avalara's is open source; see [avalara.md](./avalara.md)); add only the delta and deploy as an Organization connector. Don't rebuild a working, maintained connector. Hand off to [commercetools-connect](../../../SKILL.md) for the build/publish lifecycle.
4. **No public connector for the engine at all (e.g. TaxJar)** → build from the [tax integration template](https://docs.commercetools.com/connect/templates/tax-integration.md). The template ships both apps as stubs; you implement the engine calls and the mapping. The exact contract, gotchas, and a worked engine are in [tax-contract.md](./tax-contract.md) and [avalara.md](./avalara.md) (with TaxJar as the from-scratch example).

Record the decision, the rung, and the version in the requirements block.

### Step 2 — Derive the config from the requirements

Translate the Step 1 answers into concrete `connect.yaml` values for the chosen connector (or your own), with a one-line **why** for each. The mapping and the provider-specific key names/defaults are in [config-from-requirements.md](./config-from-requirements.md) and [avalara.md](./avalara.md). Key decisions that live here:

- **Tax mode: `ExternalAmount` (recommended) vs `External`.** `ExternalAmount` means the engine's exact amounts are authoritative — no re-derivation, no rounding drift between what's filed and what's shown. `External` has commercetools compute from a rate you supply. The docs and the certified connector both prefer `ExternalAmount`. → [config-from-requirements.md](./config-from-requirements.md#tax-mode).
- **API-client scopes** the connector needs — declare them in `inheritAs.apiClient.scopes` so Connect provisions a least-privilege client (`manage_extensions`, `manage_subscriptions`, `view_orders`), rather than hand-supplying `CTP_CLIENT_ID/SECRET`.
- **Secured vs standard config** — the engine API token/credentials are `securedConfiguration`; region and behavioral toggles are `standardConfiguration`.

### Step 3 — The extension trigger & call-reduction (reference)

The API Extension is what makes the calculator fire. External tax engines bill per call and rate-limit, so the trigger **condition** matters: fire only when the cart can actually be taxed and is worth taxing (`taxMode="ExternalAmount"`, a shipping address is set, line items exist), and consider hashing the cart to skip redundant calls. Full contract and the call-reduction pattern: [tax-contract.md](./tax-contract.md).

### Step 4 — Build/verify the two apps (the main body of work), test-first

**Tests come before implementation.** The rules that make a tax integration correct — the extension returning `200`/`201` (not `202`), taxing *shipping and custom line items* too (or the Order can't be created in `ExternalAmount` mode), idempotent recording, committing only on the right order states — are invisible at the call site and tedious to reproduce by hand. Each is one cheap assertion. Write the test first.

Read [tax-contract.md](./tax-contract.md) and build, in order — **test first for each**:

1. **Calculator (API Extension)** — map cart → engine request; call the engine's *calculate* API; map the response to `setLineItemTaxAmount` + `setCustomLineItemTaxAmount` + `setShippingMethodTaxAmount` + `setCartTotalTax` (and `changeTaxMode` if you own that); respond `200` fast; decide fail-open vs fail-closed.
2. **Order-syncer (Subscription)** — on `OrderCreated`, re-fetch the Order by id, map it to the engine's *record/commit* transaction API, POST idempotently (stable `transaction_id` = order id). For a full integration, also handle cancel→void and return→refund.

**Mock the outbound boundary** (the tax engine, the CT APIs) and assert on what your code *decided* — which endpoint, what body, what it did with the response. The suite must run with zero deployment and zero secrets. What to assert/mock per app is in [tax-contract.md](./tax-contract.md).

### Step 5 — Verify the round trip

Don't declare done until a real cart carries engine-computed tax and a real order shows up as a transaction. The **`taxedPrice`** appears on the cart (it's absent until the extension is registered and firing), and — with a **live** engine account whose **nexus** covers the destination — a transaction is recorded. See [verification.md](./verification.md), which also covers the two traps that make people think it's broken when it isn't: **sandbox accounts often don't persist transactions**, and **an engine returns zero tax where you have no nexus.**

## References

| Need | Reference |
|---|---|
| **Is a certified connector enough?**: certified (Avalara/Vertex) vs fork vs build-from-template (TaxJar); live-marketplace check; per-engine dimension table | [connector-selection.md](./connector-selection.md) |
| **Requirements → config mapping**: tax mode, nexus, tax-code source, exemptions, scopes; the `connect.yaml` envelope; worked example | [config-from-requirements.md](./config-from-requirements.md) |
| **The two-app contract**: the calculator (ExternalAmount, all four tax actions, 200-not-202, fail modes, call reduction) and the syncer (commit/void/refund lifecycle, idempotency); full pitfall catalog | [tax-contract.md](./tax-contract.md) |
| **Avalara specifics (ground truth from the certified connector)**: exact `connect.yaml` keys, AvaTax createTransaction (quote vs commit), tax-code/entity-use mapping, MC config app, address validation — plus TaxJar as the build-from-template contrast | [avalara.md](./avalara.md) |
| **Verify the round trip**: taxedPrice on the cart, transaction recorded; the sandbox-doesn't-persist and no-nexus-means-zero traps | [verification.md](./verification.md) |
| Build/publish/certify lifecycle, deploy, scopes, production-readiness gate (type-agnostic) | [commercetools-connect](../../../SKILL.md) |

Adding another engine later (Sovos, ONESOURCE) means adding a sibling reference like `avalara.md` and extending the selection table — the two-app architecture, the contract, and the flow do not change.

## Checklist

Requirements
- [ ] Engine chosen + account/credentials; **nexus regions** known; region + project
- [ ] Calculation-only vs calculation+recording decided; order lifecycle (void/refund) decided
- [ ] Tax-code source (Product attribute / Tax Category / Custom Field) and exemption model identified
- [ ] Asked the open-ended "anything special?" question; each special requirement its own line
- [ ] Requirements block written and confirmed; specials fed into the Step 1.5 fit-check

Connector fit (decide before wiring/building)
- [ ] Checked **live** marketplace + tax docs (not memory); named the connector + version
- [ ] Ladder rung chosen: configure (1) · config-closes-gap (2) · fork/extend (3) · build from template (4)
- [ ] For a real gap on an engine with a public connector, chose fork over rebuild

Config (the deliverable)
- [ ] Tax mode chosen (`ExternalAmount` unless a reason not to) with rationale
- [ ] Only documented `connect.yaml` envelope fields; file at the repo root
- [ ] `inheritAs.apiClient.scopes` = `manage_extensions`, `manage_subscriptions`, `view_orders` (least-privilege)
- [ ] Engine credentials in `securedConfiguration`; region/toggles in `standardConfiguration`

The two apps (build test-first — do not write a function body before its red test)
- [ ] Calculator returns `200`/`201` (never `202`); taxes line items **and custom line items and shipping**; `changeTaxMode` if it owns the mode
- [ ] Extension trigger conditioned to reduce engine calls (mode set, address present, non-empty)
- [ ] Syncer re-fetches the Order by id; records idempotently on stable `transaction_id`; commits/voids/refunds on the right states (if in scope)
- [ ] Boundary mocked; suite runs with no deployment/secrets

Verification
- [ ] `taxedPrice` present on the cart after a cart update (extension registered + firing)
- [ ] With a live account whose nexus covers the destination, a transaction is recorded
- [ ] Understood: sandbox may not persist transactions; zero tax at a no-nexus destination is correct, not a bug
