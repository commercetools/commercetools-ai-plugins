---
name: commercetools-connect
description: Build, test, deploy, and install production-ready commercetools Connect applications (connectors) in TS, JS or Java. Use for connect apps, API extensions, subscription/event handlers, jobs, merchant center custom applications (views), syncing to external systems (ERP, WMS, tax, email, search, CRM), and deploying/installing/certifying a connector and integrating a deployed payment connector into a custom storefront.
when_to_use:
  - "Building a Connect application or connector (service, event, job, or merchant-center custom application)"
  - "Writing or debugging connect.yaml, standardConfiguration/securedConfiguration, or inheritAs scopes"
  - "Authoring post-deploy / pre-undeploy lifecycle scripts that register extensions, subscriptions, or custom types"
  - "Service app: registering an API extension to validate or modify carts/orders synchronously during checkout"
  - "Event app: handling commercetools Subscription messages to react to order/cart/customer changes asynchronously"
  - "Job app: scheduled or on-demand batch work (sync, cleanup, import)"
  - "Syncing commercetools to an external system (ERP, WMS, OMS, tax, email, search, CRM)"
  - "Deploying, installing, redeploying, or certifying a connector; choosing a region or deployment type"
  - "Integrating a deployed payment-connector, forking one, or spinning up a new one from the payment-integration template — not the hosted Checkout SDK"
  - "Deciding whether a certified/public PSP connector fits, needs forking, or must be built"
metadata:
  contentType: SKILL
  area:
    - platform
    - integration
    - connect
---

# commercetools Connect

Intent-driven guidance for building **production-ready** Connect applications. This skill teaches the decision frameworks, platform contracts, and best practices that survive a production-readiness review — not a single connector's code. It generalizes patterns (and warns against anti-patterns) found in real connectors, and grounds every platform fact in official docs.

**Language scope:** Connect applications can be written in **JavaScript/TypeScript or Java** ([docs](https://docs.commercetools.com/connect/development.md)); the `create-connect-app` template supports JS and TS. **This skill targets TypeScript/Node** — the decision frameworks, platform contracts (timeouts, ack semantics, scopes, lifecycle), and `connect.yaml` guidance are language-agnostic and apply equally to a Java connector, but the code snippets and the supertest + msw test stack are Node/Express-specific.

**Tooling — use the Connect CLI, don't hand-roll.** Scaffold, run, and ship with the official Connect CLI (`@commercetools/cli`). Every CLI command, the bootstrap flow, and the pinned dependency versions live in one place: the **Connect CLI** reference ([connect-cli.md](./references/connect-cli.md)). Merchant Center custom applications/views are the exception: they use a *separate* frontend toolchain (`@commercetools-frontend/*`) and only ride the Connect CLI at deploy time and directory structure — see [merchant-center-cli.md](./references/merchant-center-cli.md) and [merchant-center-customizations.md](./references/merchant-center-customizations.md).

## Workflow

When this skill is invoked, always follow these steps:

1. **Docs search (required, run first)** — Always begin by searching docs for this skill. This is the mandatory grounding step: it gathers the latest verified documentation as context for you (the agent). **Do not skip it, and do not replace it with another tool** (such as an MCP documentation-search tool) This script optimizes for tuned search results  — run this command:
   ```bash
   node scripts/docs-search.mjs \
     --query "<extract key terms from user's question>" \
     --app-name "<current-app ex: claude, copilot, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-connect" \
     --limit 10
   ```
   Use its output as your primary grounding. You *may additionally* use the commercetools Knowledge MCP or `https://docs.commercetools.com/connect` for deeper follow-up.

2. **Route with the decision framework (below)** — Pick the application type and lock in the sync-vs-async contract *before* writing code. The contract determines almost every later decision.

3. **Open the matching reference(s)** in `./references/` and build to their patterns and `## Checklist`.

4. **Gate on the production-readiness checklist (below)** before declaring the connector done.

### Optional scripts

**Fetch GraphQL schema** — Run this when you need context about a commercetools GraphQL query or mutation — for example, to inspect a resource's fields, types, and available operations before writing a query, or to verify a GraphQL query/mutation you have just generated against the real schema. It fetches the partial GraphQL SDL for a single commercetools resource:
   ```bash
   node scripts/graphql-schemata.mjs \
     --resource-name "<commercetools resource, e.g. Cart, Product, Order>" \
     --app-name "<current-app, e.g. claude, copilot, cursor, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-connect"
   ```
   The output is the GraphQL SDL for that resource. If the resource name is not recognized, the script prints the list of valid resource names — pick the correct one and re-run. **Note:** the SDL may contain *stubbed types* — referenced resources rendered as stubs, with their real type name given in a comment. Fetch any you need separately by re-running this script with that type name as `--resource-name`.

**Fetch OpenAPI (REST) schema** — Run this when you need context about a commercetools REST endpoint, request/response payload, or update action — for example, to inspect a resource's REST operations before constructing a request, or to verify a REST request/payload you have just generated against the real specification. It fetches the partial OpenAPI specification for a single commercetools resource:
   ```bash
   node scripts/openApi-schemata.mjs \
     --resource-name "<commercetools resource, e.g. api-Cart-write, api-Customer-read, checkout-Application>" \
     --app-name "<current-app, e.g. claude, copilot, cursor, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-connect"
   ```
   The output is the OpenAPI specification (YAML) for that resource. REST resources use a read/write-split naming form (e.g. `api-Cart-read`, `api-Cart-write`). If the resource name is not recognized, the script prints the list of valid resource names — pick the correct one and re-run. **Note:** the spec does not include reference-expansion schemas — fetch a referenced resource's schema separately by re-running this script with that resource as `--resource-name`.

---

## Step 1 — Decision framework: which application type?

A Connector is one repository declaring one or more **applications** in `connect.yaml`. Pick each application's type by *how your code is invoked* and *which way data flows*, not by what it does.

Two things to fix first:
- **Direction.** Is commercetools the source of the change (commercetools → external system), or is the external system the source (external system → commercetools)? Both are common; they route differently.
- **`service` is just an HTTP endpoint, not necessarily an API Extension.** A `service` app exposes an HTTP endpoint. That endpoint can be registered as an *API Extension* (commercetools calls it synchronously inside an operation) **or** be a plain *inbound webhook / REST API* that an external system calls to push data in. These are two modes with different contracts.

| Trigger / need | Type | How your code is invoked | Hard contract |
|---|---|---|---|
| Block or modify a commercetools operation *before it persists* (validate a cart, inject tax, reject an order) | **`service`** as **API Extension** | commercetools calls your endpoint synchronously during the API request (registered as an Extension) | Extension response limit: **2 s default, 10 s self-service max (per-project increases available via support request, subject to performance review)**. Your latency and downtime become the *platform's*. |
| An **external system pushes data into commercetools** as it changes (system A updates a product → upsert it into commercetools) | **`service`** as **inbound webhook / API** | the external system calls your endpoint | **5-min** service request timeout. You authenticate the caller and call the commercetools API yourself; no Extension is registered. |
| **React to a commercetools change** after it happened (sync a confirmed order to a WMS, send an email, index a product) | **`event`** (Subscription handler) | commercetools delivers a Subscription message to a queue → your handler | At-least-once, **no ordering**, redelivery on non-ack. Must be idempotent. |
| **Scheduled or on-demand batch** (nightly poll an external system and upsert, reconcile, cleanup, bulk import) | **`job`** | a cron scheduler (`properties.schedule`) | Request times out after **30 min**. No concurrency guard — you own locking. |
| Add UI inside the Merchant Center | **`merchant-center-custom-application`** (full-page) / **`merchant-center-custom-view`** (embedded panel) | Hosted React app built with the MC CLI, deployed via Connect | Separate frontend toolchain (`@commercetools-frontend/*`) + a config-file contract; ships as a `merchant-center-*` app in `connect.yaml`. → [merchant-center-cli.md](./references/merchant-center-cli.md), [merchant-center-customizations.md](./references/merchant-center-customizations.md) |
| Serve static files / a CDN bundle | **`assets`** | Static host | — |


A single connector commonly combines types (e.g. a `service` API Extension that calculates tax on the cart **plus** an `event` handler that commits the transaction when the order is placed; or a `service` inbound webhook for live pushes **plus** a `job` for nightly full reconciliation).

Detail and trade-offs: [architecture-decisions.md](./references/architecture-decisions.md).

## Connector-type integration sub-areas

The build-side guidance in this skill is **connector-type-agnostic** (any service/event/job). Some connector *types* also have a focused, end-to-end sub-area that owns the whole job for that type — from "is there a connector already?" through configuring, forking, or building one, to the application backend around it:

| Connector type | Covers | Go to |
|---|---|---|
| **Payment** (e.g Stripe, Adyen, Mollie, PayPal, ...etc) | The full payment lifecycle for a custom storefront: decide whether a certified/public connector fits → configure it, **or fork it, or spin up a new one from the payment-integration template** → build the backend (session BFF, Order after authorization, capture/refund/cancel via the processor, webhook reconciliation); plus debugging the round trip | [integrations/payment/overview.md](./references/integrations/payment/overview.md) |

Start at that `overview.md` for **any** payment-connector task — integrating a deployed one *or building/forking one*. Its decision ladder routes you: rung 1 configure, rung 2 config-closes-the-gap, rung 3 fork, rung 4 build-from-template (payment-specific gotchas live in [integrations/payment/stripe.md](./references/integrations/payment/stripe.md)). It hands back to the build-side workflow and references **above** only for the deep, type-agnostic publish/certify lifecycle and the production-readiness gate.

Each sub-area lives under [`references/integrations/<type>/`](./references/integrations/) with its own `overview.md`. Adding another connector type later (e.g. shipping, tax) means adding a sibling `references/integrations/<type>/` tree and one row here — the build-side guidance does not change.

## Step 2 — Price the contract before you build

The expensive mistakes come from not pricing the contract you just chose:

- **`service` as API Extension** couples your availability and latency to the commercetools operation. A slow or down extension makes carts and orders slow or impossible. So: a tight outbound timeout *under* the extension timeout, a deliberate **fail-open vs. fail-closed** decision, and minimizing work on the hot path (skip redundant external calls).
- **`service` as inbound webhook** is *not* coupled to a commercetools operation (the 5-min service timeout applies, not the 2 s extension limit), but you own everything: authenticate the caller, validate the payload, and make the write **idempotent** (the same product update may arrive twice) — upsert by key, don't blind-create. Decide what a failed write returns so the caller can retry safely.
- **Asynchronous (`event`)** trades immediacy for resilience but hands you at-least-once delivery, no ordering, and redelivery. So: idempotency keyed on a stable identifier, redelivery-safe acks (2xx for "don't send again"), re-fetch the resource by ID rather than trusting a possibly-stale or omitted payload, and self-change filtering to avoid loops.
- **`job`** owns its own scheduling headroom, overlap locking, and restart-safe checkpointing; each unit of work must be idempotent so a re-run or overlap can't double-write.

If you cannot articulate, in one sentence each, your latency budget (extension), your idempotency strategy (inbound webhook / event / job), and your fail/retry behavior, you are not ready to write the handler.

---

## Production-readiness checklist (the gate)

A connector is **not done** until every applicable item holds. Each maps to a reference with the implementation pattern.

### Reliability
- [ ] **Idempotency strategy stated and implemented — statelessly.** Reprocessing a message is a no-op via the target system's own idempotency, re-fetching the commercetools resource and re-checking its state, or upsert by a stable key — never a local dedup store. → [event-applications.md](./references/event-applications.md)
- [ ] **Redelivery-safe responses.** Event endpoints return a positive ack (`102/200/201/202/204`) for *handled* and *irrelevant-but-acked* messages; anything other than `102`, `200`, `201`, `202`, or `204` triggers a retry. → [event-applications.md](./references/event-applications.md)
- [ ] **Re-fetch by ID, don't trust the payload.** Handlers fetch the current resource by `resource.id`; required when `payloadNotIncluded` is set. → [event-applications.md](./references/event-applications.md)
- [ ] **Hot-path work minimized (sync).** Extensions skip the external call when relevant data is unchanged (e.g. a stored hash) and short-circuit early. → [service-applications.md](./references/service-applications.md)

### Security
- [ ] **Inbound endpoints authenticated.** Service extensions register a destination with `AuthorizationHeaderAuthentication` (or `AzureFunctions`) **and** validate that secret in-app. Webhooks from external systems validate a full JWT (signature, issuer, audience, subject, expiry, algorithm). → [security.md](./references/security.md)
- [ ] **Least-privilege CT scopes.** Use `inheritAs.apiClient.scopes` with only the scopes the apps need (e.g. `manage_orders`, `manage_subscriptions`, `manage_extensions`) — not an admin/`manage_project` client. → [security.md](./references/security.md)
- [ ] **Secrets in `securedConfiguration`.** API keys, client secrets, JWT secrets are never `standardConfiguration` and never hardcoded. → [security.md](./references/security.md)
- [ ] **No stack traces or secrets in responses.** Error middleware returns a generic message in production. → [security.md](./references/security.md)

### Correctness
- [ ] **Envelope validation.** Google Cloud Pub/Sub push envelope decoded (`message.data` is base64) and validated (→ JSON → resource ref → notificationType) before any processing; malformed envelopes rejected. → [event-applications.md](./references/event-applications.md)
- [ ] **Message-type filtering.** Subscribe to only the needed message types; ack-and-ignore anything else (including the platform's test/subscription messages). → [event-applications.md](./references/event-applications.md)
- [ ] **Self-change filtering.** Updates your own connector makes don't re-trigger it into a loop. → [event-applications.md](./references/event-applications.md)
- [ ] **Route path matches `connect.yaml` `endpoint`.** The Express router is mounted at the same base path as the app's `endpoint` (e.g. `endpoint: /service` ↔ `app.use('/service', router)`), or the platform's traffic 404s. → [project-structure.md](./references/project-structure.md)
- [ ] **Pinned SDK + client versions.** JS/TS: `@commercetools/platform-sdk@^8` + `@commercetools/ts-client@^4` (not the legacy `@commercetools/sdk-client-v2`). Java: `spring-boot-starter-parent` 3.5.15+ and commercetools Java SDK 19+. Typed end to end, no `any` escapes, mapped at the boundary. → [connect-cli.md (Step 3)](./references/connect-cli.md#step-3-pin-dependency-versions).

### Observability
- [ ] **Structured logs with correlation IDs.** JSON logs carry the message/resource correlation key (`X-Correlation-ID` for extensions, `resource.id` + `sequenceNumber` for events) on every log line for a request. → [observability-operations.md](./references/observability-operations.md)
- [ ] **Health endpoint.** A `/status`-style route returns 200 for liveness. → [observability-operations.md](./references/observability-operations.md)

### Operations
- [ ] **Idempotent lifecycle scripts.** `postDeploy` creates resources get-then-update (create only if absent), never blind delete-then-recreate. `preUndeploy` cleans them up. → [lifecycle-scripts.md](./references/lifecycle-scripts.md)
- [ ] **Deploy-time dependency validation.** `postDeploy` test-connects to external services and surfaces invalid credentials immediately. → [lifecycle-scripts.md](./references/lifecycle-scripts.md)
- [ ] **Fail-open vs fail-closed documented.** The README states, per use case, what happens when the external dependency is down, and outbound calls have a timeout budget. → [service-applications.md](./references/service-applications.md)
- [ ] **Poison-message / replay runbook.** How a repeatedly-failing message is handled (DLQ / dropped after retention) and how to replay. → [observability-operations.md](./references/observability-operations.md)

### Quality
- [ ] **Tests cover the real behavior, run via `commercetools connect application test`.** At minimum: the parameterized auth-rejection matrix (missing/expired/wrong-issuer/wrong-audience/`alg:none`), envelope/ack edge cases (event) or the pure business logic + response actions (service), an idempotency/duplicate-delivery test, and idempotent `postDeploy` registration. A couple of happy-path tests is not enough. → [testing.md](./references/testing.md)
- [ ] **No dead code, no `any` escapes.** No commented-out blocks; SDK types preserved end to end. → [project-structure.md](./references/project-structure.md)
- [ ] **Scaffolded and run with the Connect CLI.** Project created via `commercetools connect init`; `commercetools connect validate` passes. → [connect-cli.md (Step 2)](./references/connect-cli.md#step-2-scaffold-the-connector)

### Generated connector docs
- [ ] **The connector ships a README** stating its fail-open/fail-closed stance, required scopes, a configuration table (every `connect.yaml` key), and the poison-message/replay runbook. → [deployment-installation.md](./references/deployment-installation.md)

---

## Reference index

| Concern | Reference |
|---|---|
| Connect CLI mechanics: install/auth, `connect init` templates, pinned versions, build/test/validate, stage/preview/publish/deploy commands | [connect-cli.md](./references/connect-cli.md) |
| Merchant Center CLI: scaffold with create-mc-app; run/build/serve/login/config:sync with mc-scripts; pin `@commercetools-frontend/*` | [merchant-center-cli.md](./references/merchant-center-cli.md) |
| Custom application vs custom view; config-file contract; develop/test locally; deploy via Connect (`connect.yaml` merchant-center-* types, order of operations) | [merchant-center-customizations.md](./references/merchant-center-customizations.md) |
| Monorepo holding a connector + a storefront: root-sibling layout, why no npm workspaces, the two independent deploy lifecycles | [monorepo-with-storefront.md](./references/monorepo-with-storefront.md) |
| event vs service vs job; sync vs async contract cost | [architecture-decisions.md](./references/architecture-decisions.md) |
| CLI scaffold + local dev, monorepo layout, client setup (ts-client), connect.yaml anatomy, route↔endpoint matching, fail-fast env validation | [project-structure.md](./references/project-structure.md) |
| subscriptions: envelope, ack semantics, idempotency, redelivery, re-fetch, Pub/Sub destination | [event-applications.md](./references/event-applications.md) |
| API extensions: authenticated registration, triggers, timeout budget, fail-open/closed, hot-path | [service-applications.md](./references/service-applications.md) |
| scheduled/on-demand jobs: schedule, timeout, concurrency, checkpointing | [job-applications.md](./references/job-applications.md) |
| post-deploy/pre-undeploy: idempotent registration, schema-as-code, deploy-time validation | [lifecycle-scripts.md](./references/lifecycle-scripts.md) |
| endpoint auth, least-privilege scopes, securedConfiguration, error hygiene | [security.md](./references/security.md) |
| structured logs + correlation IDs, health, feature flags, runbook, DLQ | [observability-operations.md](./references/observability-operations.md) |
| auth/envelope test matrices, supertest + msw patterns, what to mock | [testing.md](./references/testing.md) |
| connect.yaml config, sandbox→preview→publish, install, redeploy, certification, regions, CLI | [deployment-installation.md](./references/deployment-installation.md) |

### Integrating a deployed payment connector (sub-area)

Start at the overview; it routes to the rest (integrate, configure, fork, **or build a new one**). See also the [Connector-type integration sub-areas](#connector-type-integration-sub-areas) section above.

| Concern | Reference |
|---|---|
| **Start here** — the backend-focused workflow: requirements → is-a-certified-connector-enough → config → BFF/Order/capture-refund/webhook | [integrations/payment/overview.md](./references/integrations/payment/overview.md) |
| Is a certified connector enough? fit-check a use case vs public connectors using live marketplace/docs data | [integrations/payment/connector-selection.md](./references/integrations/payment/connector-selection.md) |
| Requirements → `connect.yaml` config mapping, worked example | [integrations/payment/config-from-requirements.md](./references/integrations/payment/config-from-requirements.md) |
| The backend: session/BFF, Order after payment, capture/refund/cancel via the processor, webhook reconciliation, who owns the Payment | [integrations/payment/backend-integration.md](./references/integrations/payment/backend-integration.md) |
| Test-drive the backend test-first: assert-vs-mock per piece, invariants as regression tests | [integrations/payment/backend-tdd.md](./references/integrations/payment/backend-tdd.md) |
| Full-flow integration test against a real deployed connector + test card | [integrations/payment/integration-test.md](./references/integrations/payment/integration-test.md) |
| Provider-agnostic frontend contract: session body, enabler load, processor routes + auth, pitfall catalog | [integrations/payment/connector-contract.md](./references/integrations/payment/connector-contract.md) |
| Stripe specifics: exact `connect.yaml` keys + defaults, enabler bundle, test cards, webhook setup | [integrations/payment/stripe.md](./references/integrations/payment/stripe.md) |
| Deploy a public payment connector (CLI auth, scopes, `deployment create`, not `connectorstaged`) | [integrations/payment/deploy-public-connector.md](./references/integrations/payment/deploy-public-connector.md) |
| Deploy a forked/custom payment connector (`connectorstaged → publish → deployment create`) | [integrations/payment/deploy-custom-connector.md](./references/integrations/payment/deploy-custom-connector.md) |
| Verify the round trip; throwaway harness to prove a deployed connector | [integrations/payment/verification.md](./references/integrations/payment/verification.md), [integrations/payment/test-harness.md](./references/integrations/payment/test-harness.md) |

**Related skills:** SDK client setup, scopes, query predicates, and core data model live in [commercetools-platform](../commercetools-platform/SKILL.md) — link to it rather than restating client/auth basics here.

