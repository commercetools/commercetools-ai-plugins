---
name: payment-integration-overview
description: Integrate a deployed commercetools payment connector into a custom storefront — the backend-focused workflow (requirements → config → BFF/Order/capture-refund/webhook). The payment sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
---

# Payment connector — direct integration (backend-focused)

This is the **payment integration sub-area** of [commercetools-connect](../../../SKILL.md): you have (or will deploy) a payment connector and need to wire it into your own storefront and own the backend around it. For *building* a connector from the template, or the deploy/certify lifecycle, that's the parent connect skill; this sub-area is about *integrating* a deployed one.

Build the **server side** of a direct payment-connector integration: gather the user's payment requirements, turn them into the **right provider config**, then implement the backend around the payment.

A payment Connector is a Connect application built from the [payment integration template](https://docs.commercetools.com/connect/templates/payment-integration.md), shipping **two applications**:

- **processor** (a `service`) — talks to the PSP, orchestrates payment operations, and **owns the commercetools Payment object** (creates it, adds transactions). Its behavior is driven by its `connect.yaml` config. You authenticate to it with a Checkout Session.
- **enabler** (an `assets` bundle) — a browser JS library on top of the PSP's UI components. It renders the payment UI and calls the processor. This is the *frontend* touchpoint — necessary, but a thin slice of the work.

This is the **direct-connector** path: you wire the connector into your own storefront and **own the backend** (sessions, Orders, refunds). You do **not** use `@commercetools/checkout-browser-sdk` (that's the hosted Checkout product → [commercetools-checkout](../../../../commercetools-checkout/SKILL.md)); you do **not** create Payment objects yourself (the processor does); and capture/refund go through the **processor**, not the Checkout Payment Intents API. If you're building the connector itself, that's [commercetools-connect](../../../SKILL.md).

> "Checkout" is overloaded. Lowercase = the buying journey (always present). Uppercase **Checkout** = the commercetools product that runs that journey for you. On *this* path there is a checkout, but no Checkout *product* — which is exactly why the Payment is owned by the processor and refunds use the processor's routes, not the Payment Intents API. See [backend-integration.md](./backend-integration.md#who-creates-the-payment-revisited).

## Workflow

When integrating a deployed payment connector, always follow these steps in order. The heart of the workflow is **Step 1 → Step 1.5 → Step 2 → Step 4** (requirements → is a certified connector enough? → config → backend); the frontend (Step 3) is a reference.

### Step 0 — Gather context (required, run first)

The mandatory grounding step: it pulls the latest verified documentation as context for you (the agent). Use the parent connect skill's docs-search script with payment-focused query terms. **Do not skip it, and do not replace it with another tool**:

```bash
node scripts/docs-search.mjs \
  --query "<payment terms from the user's request, e.g. 'payment connector processor session capture refund webhook'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-connect" \
  --limit 10
```

(Run it from the `commercetools-connect` skill root, where `scripts/docs-search.mjs` lives.) Use its output as primary grounding. You *may additionally* use the commercetools Knowledge MCP or `https://docs.commercetools.com` for deeper follow-up.

### Step 1 — Extract requirements (do this before any config or code)

Config is downstream of requirements. The connector's *behavior* — when money is taken, whether cards are saved, whether you can partially refund — is set by `connect.yaml` values, and the wrong default silently bakes in the wrong behavior. So extract the requirements first; each answer maps to a concrete config key in Step 2. Ask the user (don't assume):

1. **Which PSP / connector, and is it deployed?** Get the connector and version and, if deployed, its **processor URL** and **enabler URL** (Merchant Center deployment view, or the Connect deployments API).
2. **Region and project?** e.g. `europe-west1.gcp`, project `my-project` — the Sessions API host and the `CTP_*_URL` config are region-specific.
3. **Capture mode?** Charge immediately, or authorize now and capture later (on fulfillment)? → drives the capture-method config and *when* you create the Order.
4. **Saved payment methods / returning customers?** Should cards be saved for reuse? → drives the save-cards config and requires a `customerId` on the cart.
5. **Refunds / partial captures?** Will the business do partial refunds or split captures? → drives the multi-operations config.
6. **Which payment methods**, and **drop-in vs. web components**? Drop-in (one element) is the default; web components give per-method layout control.
7. **Storefront origin(s) and post-payment return URL?** → drives CORS and the return-URL config (a frequent silent breaker).
8. **Sync or async settlement?** Some methods/PSPs finalize via webhook → drives whether Order creation waits on the webhook.
9. **Anything special or non-standard? (always ask — open-ended)** The eight questions above cover the common shape, but they don't cover everything, and the requirements that decide config-vs-fork-vs-custom are often the ones a fixed list never asks. So explicitly ask the user: *"Beyond the above, are there any specific constraints or behaviors you need?"* Prompt with examples to jog memory — compliance/regulatory (PCI scope, SCA/3DS exemptions, local mandates), B2B (purchase-order numbers, invoices, multi-buyer approval), subscriptions/recurring or installments, multi-currency or per-market pricing, marketplace split payments/payouts, existing PSP contract terms or a specific PSP account/merchant id, custom fraud or risk-scoring, surcharging, stored-credential mandates, or anything that must appear on the PSP side (metadata, descriptors). Capture each as its own requirement line; **don't force it into one of the eight slots.**

Write these as a short requirements block and **confirm with the user** before deriving config. Flag every special requirement explicitly — each is a candidate that may not be a config toggle, so it directly feeds the Step 1.5 fit-check (could push the decision from "configure" to "fork" or "custom"). If the user just says "make Stripe work" and surfaces nothing special, default to: deployed Stripe connector → immediate capture → no saved cards → single capture/refund → drop-in → and say so explicitly.

### Step 1.5 — Is a certified connector enough? (decide before wiring or building)

With the requirements in hand, answer the prior question the rest of the skill assumes: **does a connector that already does this exist?** Don't answer from memory — supported PSPs, methods, and capabilities change. Check **live** data (the Connect marketplace + the "Supported PSPs" docs, via the `docs-search` script/the Knowledge MCP), compare the requirements PSP-by-method-by-capability, and **name the connector version** you checked.

Then walk the decision **ladder** — stop at the first rung that fits, because each later one is more to build and maintain:

1. **Public connector covers everything** → install + configure (Step 2). Don't build. Installing it (CLI auth, scopes, `deployment create`) is covered in [deploy-public-connector.md](./deploy-public-connector.md) — note it is **not** the `connectorstaged` flow.
2. **Supported PSP, gap looks like a capability** → prove it isn't **config** first. Most "missing" behaviors (partial refunds, manual capture, saved cards) are `connect.yaml` toggles → back to rung 1. See [config-from-requirements.md](./config-from-requirements.md).
3. **Supported PSP, genuine gap config can't close** → **fork/extend the public connector** (its repo is open source); add only the delta and deploy as an Organization connector. Don't rebuild — you'd throw away a working, maintained connector. Hand off to [commercetools-connect](../../../SKILL.md). For monitoring the connector you build: deployment logs, structured logging, and the poison-message runbook are in [`observability-operations.md`](../../observability-operations.md).
4. **No public connector for the PSP at all** → build from the [payment integration template](https://docs.commercetools.com/connect/templates/payment-integration.md). This can be done **inline** (within this skill session) when the user explicitly asks to build custom — see the [stripe.md](./stripe.md) "Building a custom Stripe connector" section for the key gotchas (raw body, API version, POST vs GET route). For staging, publishing, and deploying the built connector see [deploy-custom-connector.md](./deploy-custom-connector.md). Hand off to [commercetools-connect](../../../SKILL.md) when the full Connect publish/certification lifecycle is the goal. For monitoring: [`observability-operations.md`](../../observability-operations.md).

Rungs 3–4 switch to the build-side workflow in the parent [commercetools-connect](../../../SKILL.md) skill, then resume this integration flow once the connector is deployed — but rung 4 can be executed inline when the user wants to build in the current session. Full procedure and dimension-by-dimension table: [connector-selection.md](./connector-selection.md). Record the decision, the rung, and the version in the requirements block.

### Step 2 — Derive the provider config from the requirements

This is the core deliverable. Translate the Step 1 answers into the **concrete `connect.yaml` values** for the chosen connector, and give a one-line **why** for each so the user can sanity-check it. The mapping (which requirement → which key) and the provider-specific key names/defaults live in the provider reference — read [config-from-requirements.md](./config-from-requirements.md) for the provider-agnostic mapping table and the worked example, plus the matching provider reference ([stripe.md](./stripe.md)) for exact key names, defaults, and secured-vs-standard split.

`connect.yaml` has **no published JSON Schema** — its structure is defined only by the docs ([Configure connect.yaml](https://docs.commercetools.com/connect/development.md)), so use only the documented envelope keys (`deployAs`/`applicationType`/`configuration`/`inheritAs`, each config item being `{key, description, required, default?}`) and don't invent fields. And it must live at the **repository root**, never in a nested folder (`processor/`, `src/`) — a misplaced file silently fails to deploy. Both are covered in [config-from-requirements.md → The connect.yaml envelope](./config-from-requirements.md#the-connectyaml-envelope).

Produce, for the user:
- a filled **standardConfiguration** block (region URLs, capture method, saved-cards, multi-ops, billing collection, return URL, allowed origins, payment-interface name, …),
- the **securedConfiguration** keys they must supply (PSP secret key, webhook signing secret, CT client id/secret) — names only, never invent values,
- the **API-client scopes** the connector needs,
- a short rationale per non-obvious key tied back to their requirement.

Then flag the config that silently breaks the integration if wrong — `MERCHANT_RETURN_URL` must be an absolute URL with a scheme; `ALLOWED_ORIGINS` must include the storefront origin; scopes must cover managing payments + reading sessions. These appear again as runtime pitfalls in [connector-contract.md](./connector-contract.md#configuration-that-breaks-the-frontend).

If the connector is **not yet deployed**: a *public* connector you install directly (CLI auth + `deployment create --connector-key`, passing this config) — see [deploy-public-connector.md](./deploy-public-connector.md), which also lists the correct Connect scopes and warns against the wrong-scope / `connectorstaged` pitfalls. *Building or staging your own* connector is the broader Connect flow → [commercetools-connect](../../../SKILL.md). Either way, hand over the config block you derived here.

### Step 3 — Frontend touchpoint (reference)

The browser still has to create a session, load the enabler, and drive the drop-in to `submit()`. This contract is the same across PSPs and is fully covered — including the load/timing pitfalls (UMD vs ES, the `ready` event) — in [connector-contract.md](./connector-contract.md). For a quick proof-of-life before wiring the real storefront, scaffold the throwaway harness in [test-harness.md](./test-harness.md). Treat this as a supporting step: the substance of this skill is the config (Step 2) and the backend (Step 4).

### Step 4 — Build the backend (the main body of work), test-first

**This step is non-negotiable: tests come before implementation. Do not write any backend function body before the test for it exists and is confirmed red. Skipping this order is a process violation — not a shortcut.**

The processor takes the payment; **everything around it is your backend**, and on this path the connector deliberately won't do it for you. Build it **test-first** — the red-green-refactor loop is the *only* permitted order:

1. **Write a failing test** that names the behavior and asserts the outcome.
2. **Run it. Confirm it fails for the right reason** — not a missing import, not a wrong mock, but because the behavior is absent. A test that passes before you've written the code is testing nothing and must be fixed before proceeding.
3. **Write the least code that makes it pass.** No extra logic, no generalizing ahead of the next test.
4. **Refactor** with the test as a safety net. Then repeat for the next behavior.

The rules that make this integration correct (idempotency, gate-on-`Success`, processor-owns-the-Payment, the IDOR guard) are invisible at the call site and only surface under conditions that are tedious to reproduce by hand — a retried webhook, a stale cart version, an unsettled async PSP. Each is one cheap assertion. Writing the test first pins the behavior and leaves a tripwire so the next change can't quietly undo it.

**Mock the outbound boundary** (the PSP, the connector's processor, the Sessions/Orders APIs) and assert on what your code *decided* to do — which endpoint it called, with what body, and what it did with the response. Never mock your own orchestration logic. The suite must run with zero deployment and zero secrets. What to assert and what to mock per piece is in [backend-tdd.md](./backend-tdd.md) — read it before writing any code.

**Do not proceed to Step 5 until:**
- Every behavior listed in the backend-tdd.md checklist has a passing test.
- The test suite runs clean with `npm test` and no secrets in the environment.

Read [backend-integration.md](./backend-integration.md) and build, in order — **test first for each item**:

1. **Server-side session creation (BFF)** — mint token/cart/session on the server so secrets and `manage_sessions` never reach the browser; verify cart ownership (IDOR) and create the session as late as possible. The browser gets only `sessionId` + processor/enabler URLs.
2. **Order creation** — convert the cart to an Order *after* authorization completes (and, for async settlement, after the webhook confirms `Success`), with a unique pre-generated `orderNumber` for idempotency. Timing follows the capture mode chosen in Step 1.
3. **Post-purchase operations** — capture / refund / cancel on the authorized Payment via the **processor's own operation routes**, *not* the Checkout Payment Intents API (which only works for payments the Checkout product created). Whether partial captures/refunds are even available depends on the multi-ops config from Step 2.
4. **Webhook reconciliation** — treat the commercetools Payment (driven by the PSP webhook the processor verifies) as the authoritative state, not the browser's `onComplete`. A transaction stuck `Pending` almost always means the webhook.

### Step 5 — Verify the round trip, then lock it in with a full-flow integration test

Don't declare done until a real test-card payment has left a trace in commercetools: `onComplete`/return URL fired, and a commercetools **Payment** exists for the cart with a transaction (`Authorization` or `Charge`) in state `Success`, and — for production — the Order was created and a refund path works. See [verification.md](./verification.md) for the manual round-trip check.

Then turn that one-time check into a repeatable test: a single **full-flow integration test** that drives the *real deployed* connector with a PSP test card from session → pay → Order → capture/refund → webhook reconciliation, asserting the commercetools trace at each commit point so a failure localizes the broken seam. This is the capstone the unit tests can't provide (they mock the boundary; this proves the wiring), and it's what lets you re-verify after every deploy instead of re-clicking. See [integration-test.md](./integration-test.md).

## References

| Need | Reference |
|---|---|
| **Is a certified connector enough?**: fit-check a use case against public connectors vs. building custom, using live marketplace/docs data | [connector-selection.md](./connector-selection.md) |
| **Deploy a public connector**: CLI auth, the correct Connect scopes, and `deployment create --connector-key` (not `connectorstaged`) | [deploy-public-connector.md](./deploy-public-connector.md) |
| **Deploy a custom connector**: `connectorstaged create → publish → deployment create` for Organization connectors (rung 3/4), with CLI pitfalls (URL format, private repo, required flags) and the production-readiness scan that runs at publish (SAST/SCA, no dev logs/code) — for private connectors too | [deploy-custom-connector.md](./deploy-custom-connector.md) |
| **Requirements → config mapping**: which requirement drives which `connect.yaml` key, with a worked example producing a filled config + rationale | [config-from-requirements.md](./config-from-requirements.md) |
| **The backend**: server-side session/BFF, Order creation after payment, capture/refund/cancel via the processor, webhook reconciliation, who owns the Payment | [backend-integration.md](./backend-integration.md) |
| **Test-drive the backend**: the red-green loop, what to assert vs. mock per piece (BFF/Order/capture-refund/webhook), turning the skill's invariants into Vitest regression tests | [backend-tdd.md](./backend-tdd.md) |
| **Full-flow integration test**: one end-to-end test against a real deployed connector + test card, asserting the CT trace at each commit point (the capstone of Step 5) | [integration-test.md](./integration-test.md) |
| Stripe specifics: connector repo/version, exact `connect.yaml` keys (standard/secured) + defaults, enabler bundle name/global, test cards, webhook setup | [stripe.md](./stripe.md) |
| The provider-agnostic frontend contract: 8-step flow, Sessions API body, enabler load (UMD vs ES), processor routes + `X-Session-Id` auth, full pitfall catalog | [connector-contract.md](./connector-contract.md) |
| Verifying the round trip: querying the Payment, reading transactions, confirming state | [verification.md](./verification.md) |
| A standalone throwaway harness to prove a deployed connector before building the real storefront | [test-harness.md](./test-harness.md) |
| **Monitoring a forked/custom connector**: deployment logs (CLI + Merchant Center), structured logging, poison-message / dead-letter runbook | [`commercetools-connect` → observability-operations.md](../../observability-operations.md) |

Adding another provider later (Adyen, Mollie, PayPal) means adding a sibling reference like `stripe.md` and extending the mapping table — the requirements, the backend, and the flow do not change.

## Checklist

Requirements
- [ ] PSP/connector + version; processor URL and enabler URL (or routed to deploy)
- [ ] Region + project; capture mode; saved-cards? partial refunds/captures? methods; origins + return URL; sync/async settlement
- [ ] Asked the open-ended "anything special/non-standard?" question; captured each special requirement as its own line
- [ ] Requirements block written and confirmed with the user; special requirements flagged into the Step 1.5 fit-check

Connector fit (decide before wiring/building)
- [ ] Checked live marketplace + supported-PSPs docs (not memory); named the connector + version
- [ ] PSP, methods, integration type, capabilities, region compared to the requirements; apparent gaps re-checked as config
- [ ] Ladder rung chosen: configure (1) · config-closes-gap (2) · fork/extend public connector (3) · build from template (4)
- [ ] For a real gap on a PSP that has a public connector, chose fork/extend over rebuild

Config (the deliverable)
- [ ] Only documented `connect.yaml` envelope fields used (no invented keys); file placed at the repository root, not a nested folder
- [ ] standardConfiguration filled from the requirements, with a rationale per non-obvious key
- [ ] securedConfiguration keys listed (values supplied by the user, never invented)
- [ ] API-client scopes cover managing payments + reading sessions
- [ ] `MERCHANT_RETURN_URL` absolute w/ scheme; `ALLOWED_ORIGINS` includes the storefront origin
- [ ] Capture-method / saved-cards / multi-ops config match the chosen flow

Backend
- [ ] Token/cart/session creation server-side; browser gets only `sessionId` + processor/enabler URLs
- [ ] Order created from cart after authorization (and webhook `Success` for async), idempotent via `orderNumber`
- [ ] Capture/refund/cancel routed through the processor's operation routes (not the Payment Intents API)
- [ ] Webhook reconciliation in place; `Pending` transactions traced to webhook delivery

Testing (build the backend test-first — **gate: do not proceed to Step 5 until all boxes are checked**)
- [ ] **Vitest (or equivalent) installed** and `npm test` runs before any implementation code is written
- [ ] Each backend behavior written test-first: failing test confirmed red for the right reason → least code to pass → refactor
- [ ] **No implementation function was written before its test** — if you find yourself writing code without a red test, stop and write the test first
- [ ] Boundary mocked (PSP/processor/Sessions API behind a port); orchestration logic not mocked; unit suite runs with no deployment/secrets
- [ ] Happy path pinned per piece (session minted, Order created once marked `Ordered`, capture/refund recorded) — the one a broad refactor silently breaks
- [ ] Invariants pinned as tests: IDOR rejection, no-secret-leak, Order idempotent on `orderNumber`, gate-on-`Success` (both `Pending` and `Failure` blocked), capture/refund via processor (Payment Intents API untouched), webhook idempotent on redelivery
- [ ] `npm test` runs clean with zero secrets in the environment

Verification
- [ ] Test-card payment completed; commercetools Payment found with a `Success` transaction
- [ ] (Production) Order created; a refund through the processor succeeds
- [ ] Full-flow integration test drives the real deployed connector with a test card, asserts the CT trace at each commit point, polls (not sleeps) for async settlement, and skips loudly when unconfigured
