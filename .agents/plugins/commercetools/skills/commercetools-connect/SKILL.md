---
name: commercetools-connect
description: Build, test, deploy, install, and certify production-ready commercetools Connect applications — service/API-extension, event/subscription, job, and merchant-center custom apps — in TypeScript, JavaScript, or Java, and integrate a deployed connector into a custom storefront. Covers the connect.yaml contract, least-privilege scopes, lifecycle scripts, sync-vs-async idempotency/ack, testing, and deployment. Includes connector sub-areas for payment (Stripe, Adyen), tax (Avalara, Vertex), PIM (Akeneo), CRM (Salesforce, HubSpot), order-management/OMS, gift cards, transactional email (SendGrid), marketplace (Mirakl), promotion and loyalty (Talon.One, Voucherify), analytics export to a warehouse/CDP (BigQuery, Segment), search/product discovery (Algolia), and shipping (carriers, rate engines). Use when building, configuring, forking, or debugging a commercetools Connect connector, or syncing commercetools data to or from an external system. Not for the hosted Checkout widget (see commercetools-checkout).
when_to_use:
  - "Building a Connect application or connector — a service/API-extension, event/subscription, job, or merchant-center custom application — and fixing the sync-vs-async contract before coding"
  - "Writing or debugging connect.yaml, standardConfiguration/securedConfiguration, inheritAs scopes, or post-deploy/pre-undeploy lifecycle scripts that register extensions, subscriptions, or custom types"
  - "Deploying, installing, redeploying, or certifying a connector; choosing a region or deployment type"
  - "Syncing commercetools to or from an external system (ERP, WMS, OMS, tax, email, search, CRM, data warehouse/CDP)"
  - "Payment connectors for a custom storefront (Stripe, Adyen, Mollie, PayPal, ...): integrate a deployed one, fork, or build from the payment-integration template — session BFF, Order after authorization, capture/refund/cancel, webhook reconciliation; debugging the round trip (Session-is-not-active 401, transaction stuck Pending, refund on the wrong API, missing Order)"
  - "Tax connectors (Avalara, Vertex, TaxJar): configure/fork or build the calculator API Extension + order-syncer Subscription from the tax-integration template; debugging taxedPrice missing, a 202 response, or transactions absent from the tax dashboard"
  - "PIM/product-catalog sync (e.g. Akeneo): use/fork/build; mapping families/attributes/locales/categories onto Product Types; Import API vs HTTP API, event-webhook vs job"
  - "CRM connectors (Salesforce, HubSpot, Dynamics 365, Zoho): use/fork/build; direction + source of truth; linking by externalId; migration vs delta sync; debugging duplicate contacts or an infinite sync loop"
  - "Order-management/OMS connectors (fulfillmenttools, Fluent Commerce, kbrw, OneStock, NewStore, Pipe17): install/fork/build; order export on OrderCreated, status/shipment/fulfillment inbound webhook, inventory sync"
  - "Gift-card connectors (Voucherify, in-house store credit): use/fork or build from the gift-card-integration template; enabler UI + processor (balance/redeem, Payment Intents refund/reverse); debugging checkout stuck on a short balance or redeem double-charging"
  - "Transactional-email connectors (SendGrid, Mailgun, AWS SES, Postmark): configure/fork or build the one event app from the transactional email template; at-most-once vs at-least-once + dedupe; debugging no emails (Subscription not registered), duplicates, or silent drops"
  - "Marketplace connectors (Marketplacer, Mirakl, Convictional, channel managers): operator vs selling on an external marketplace, role + direction per domain; modeling sellers/offers (Channels/Stores, per-seller prices/inventory, one Product per shared SKU, syncInfo); debugging duplicate Products or channel-less prices"
  - "Promotion/loyalty connectors (Talon.One, Voucherify, Dovetech, Eagle Eye): rule out native discounts first, then use/fork/build the evaluator API Extension + redemption Subscription (setDirectDiscounts); debugging inert Discount Codes or double redemption"
  - "Analytics export to a data warehouse/CDP/product-analytics tool (BigQuery, Snowflake, Segment): no turnkey connector and no Export API, so build an event streamer on Subscriptions/Messages plus a batch job (lastModifiedAt windowing + cursor pagination) from the product-export template, deduped on the destination side; debugging duplicate rows or missing events; distinct from Platform Insights (APM) and Change History (governance)"
  - "Search/product-discovery connectors (Algolia, Constructor, Bloomreach, Elasticsearch, Typesense): rule out native Product Search first, then use/fork or build from the product-export template the two outbound apps (full-ingestion service/job + incremental-updater event on ProductPublished/ProductUnpublished), staged=false projection, atomic reindex; debugging ghost records, a half-empty rebuild, or wrong price/locale in results"
  - "Shipping connectors (carriers, rate-shopping engines, label/shipping-execution platforms): rule out native Shipping Methods, tiered rates and predicates first, then use/fork or build (no shipping template — scaffold from tax-integration for rating, fulfilment-integration for labels); the setShippingRateInput-vs-setCustomShippingMethod landing decision and why a custom shipping method never shows in matching-cart; carrier latency inside the API Extension budget, fail-open, and idempotent Delivery/Parcel/tracking write-back"
  - "Implementing a spec/plan/tasks.md task annotated [SKILL: commercetools-connect]"
  - "An implementation-plan step that builds a Connect app, API Extension, Subscription, or MC custom app"
metadata:
  contentType: SKILL
  area:
    - Foundations
    - Integrations
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
| **Tax** (e.g Avalara, Vertex, TaxJar, ...etc) | The full tax integration: decide whether a certified connector fits (Avalara/Vertex have them; TaxJar does not) → configure it, **fork it, or build from the tax-integration template** → the two apps (a cart API Extension that calculates tax in `ExternalAmount` mode + an OrderCreated Subscription that records/commits the transaction); plus the sandbox-doesn't-persist and no-nexus-means-zero traps | [integrations/tax/overview.md](./references/integrations/tax/overview.md) |
| **CRM** (e.g Salesforce, HubSpot, Dynamics 365, Zoho, ...etc) | The full customer-relationship integration: decide whether a public connector fits (classic CRMs usually have none → build) → configure it, **fork it, or build for a CRM you define** → pick **direction + source of truth** first, then the customer-sync apps it implies (event syncers out, an inbound webhook/poll in, a one-time migration job), all linked by `externalId`; plus the duplicate-contact, sync-loop, and PII/deletion traps | [integrations/crm/overview.md](./references/integrations/crm/overview.md) |
| **PIM** (e.g Akeneo, inriver, Bluestone, Pimcore, …) | The full product-data sync job: decide whether a public PIM connector fits → configure it, **or fork it, or build one** → map the PIM model onto Product Types/attributes/categories/media, keep price & inventory separate, and pick the sync architecture (Import API vs HTTP API, event webhook vs job) | [integrations/pim/overview.md](./references/integrations/pim/overview.md) |
| **Order management** (OMS, e.g Fluent Commerce, kbrw, OneStock, NewStore, Pipe17) | Connect commercetools to an OMS: decide whether to install a public connector → configure it, **or fork/customize one, or build a new one for a bespoke order-management service** (scaffold from the `fulfilment-integration` template) → design the sync (order export on `OrderCreated`, status/shipment/fulfillment inbound webhook, inventory sync, reconcile job). No fixed connector contract; composes the type-agnostic event/service/job build-side | [integrations/order-management/overview.md](./references/integrations/order-management/overview.md) |
| **Gift card** (e.g Voucherify, in-house store credit, ...etc) | The full gift card integration: decide whether to **use a public connector directly** (Voucherify), **customize/fork one**, or **build a new one from the gift-card template** for a gift card system you define → the two apps (an enabler UI + a processor that checks balance, redeems value, and owns the Payment via session-authenticated balance/redeem and Payment Intents refund/reverse); plus the must-pair-with-a-fallback and sample-only-simulates traps | [integrations/giftcard/overview.md](./references/integrations/giftcard/overview.md) |
| **Email** (e.g SendGrid, Mailgun, AWS SES, Postmark, ...etc) | The full transactional email integration: decide whether a ready-made connector fits (email is **template-first** — most ESPs have none) → configure it, fork/customize it, **or build the one `event` app from the transactional email template** → the app (a Subscription on Customer/Order Messages → send via the ESP); the central at-most-once vs at-least-once decision for a non-idempotent send; plus the token-email, order-state-filtering, and localization traps | [integrations/email/overview.md](./references/integrations/email/overview.md) |
| **Marketplace** — multi-vendor, or selling on an external marketplace (e.g Marketplacer, Mirakl, Convictional, channel managers, ...etc) | The full marketplace integration: fix the **role** (operator vs selling on someone else's marketplace) and direction per domain → **ask the user** whether to use a public connector directly, customise/fork one, or build for a service they define (most marketplace listings are partner integrations, and there is no marketplace template) → model sellers and offers (Channel/Store/CustomObject per seller, per-seller prices + inventory, one Product for a shared SKU) → build the sync apps (seller + offer sync, order import or per-seller routing with `syncInfo`, fulfilment status, reconciliation); plus the channel-less-price, aggregated-availability, and un-deletable-Channel traps | [integrations/marketplace/overview.md](./references/integrations/marketplace/overview.md) |
| **Promotion / loyalty** (e.g Talon.One, Voucherify, Dovetech, Eagle Eye, NULogic, ...etc) | The full promotion integration: **first rule out native Cart Discounts/Discount Codes/Discount Groups (rung 0)** → then **ask the user** whether to use a public connector as-is, customise/fork one, or build one for a promotion service they define (there is *no* promotion template) → the two apps (a cart API Extension that applies the engine's discounts via `setDirectDiscounts` + an OrderCreated Subscription that redeems and awards points); plus the Direct-Discounts-make-Discount-Codes-inert rule and the double-redemption and abandoned-cart traps | [integrations/promotion/overview.md](./references/integrations/promotion/overview.md) |
| **Analytics** — export to a data warehouse / CDP / product-analytics tool (e.g BigQuery, Snowflake, Redshift, Databricks, Segment, mParticle, ...etc) | The full analytics egress: there is **no turnkey analytics connector and no Export API**, so (after the live registry check) **build from the product-export template** → a directional egress pipeline of two primitives, an `event` streamer on Subscriptions/Messages (near-real-time) and/or a `job` querying the API with `lastModifiedAt` windowing + cursor pagination (batch/backfill) → the event→row transform and **destination-side dedup** on `resource.id`+`sequenceNumber`; plus the disambiguation from Platform Insights (APM) and Change History (governance), the client-side-tracking boundary, and the duplicate-row/missing-event/`payloadNotIncluded` traps | [integrations/analytics/overview.md](./references/integrations/analytics/overview.md) |
| **Search / product discovery** (e.g Algolia, Constructor, Bloomreach, Coveo, Elasticsearch, Typesense, ...etc) | The full search integration (**outbound**, backend-only — no API Extension): **first rule out native Product Search / Product Projection Search (rung 0)** → then use a public connector, fork one, or **scaffold from the `product-export` template** → map a Product Projection onto a flat search document (price-context, locales, category denormalization, Store assortment) → the two apps (a full-ingestion `service`/`job` that atomically reindexes the catalog + an incremental-updater `event` on `ProductPublished`/`ProductUnpublished`/store-selection Subscriptions); plus the ghost-record, half-empty-rebuild, and eventual-consistency traps, and the vendor-hosted-integration-is-not-a-connector rule | [integrations/search/overview.md](./references/integrations/search/overview.md) |
| **Shipping** (carriers, rate-shopping engines, label/shipping-execution platforms, e.g DHL, UPS, FedEx, ShipperHQ, Sendcloud, nShift, ...etc) | The full shipping integration: **first rule out native Shipping Methods (rung 0)** — zones, tiered rates over cart score, predicates, and the freeze + `setCustomShippingMethod` pattern cover most "dynamic shipping" asks → then **ask the user** whether to use a public connector (search `integrationTypes=shipping`), customise/fork one, or build for a shipping service they define (there is **no Checkout shipping connector contract and no shipping template**, and most vendors ship a *vendor-hosted* integration) → then the landing decision everything hangs off: `setShippingRateInput` over native tiers **vs** `setCustomShippingMethod`/`addCustomShippingMethod`, which never appears in `matching-cart` | [integrations/shipping/overview.md](./references/integrations/shipping/overview.md) |

Start at the matching `overview.md` for **any** payment-, tax-, CRM-, PIM-, order-management-, gift-card-, email-, marketplace-, promotion-, analytics-, search-, or shipping-connector task — integrating a deployed one *or building/forking one*. Each decision ladder routes you: rung 1 configure, rung 2 config-closes-the-gap, rung 3 fork, rung 4 build-from-template (provider gotchas live in the provider file — [payment/stripe.md](./references/integrations/payment/stripe.md), [tax/avalara.md](./references/integrations/tax/avalara.md), [email/providers.md](./references/integrations/email/providers.md); the CRM and PIM sub-areas are vendor-neutral — look the connector up live; the OMS sub-area has no fixed connector contract and composes the build-side directly; the gift-card sub-area has one public connector (Voucherify) plus a build-from-template path for an in-house system; the marketplace sub-area is vendor-neutral and has no template — assess any fork candidate from its current repo; the promotion sub-area has two public MIT integrations and no template — [promotion/public-connectors.md](./references/integrations/promotion/public-connectors.md) names which artifact is actually the production one; the analytics sub-area has no turnkey connector and no Export API — it still forces a live registry check, then builds a directional egress pipeline from the product-export template — [analytics/destinations.md](./references/integrations/analytics/destinations.md) routes the warehouse/CDP/product-analytics/BI decision; the search sub-area is vendor-neutral, gates on native Product Search first, and scaffolds the outbound build from the `product-export` template; the shipping sub-area is vendor-neutral, gates on native Shipping Methods first, and has no Checkout connector contract and no template — `shipping` *is* a valid `IntegrationType` to search the registry on, but nothing prescribes the connector's shape, so it scaffolds from `tax-integration` and/or `fulfilment-integration`). It hands back to the build-side workflow and references **above** only for the deep, type-agnostic publish/certify lifecycle and the production-readiness gate.

**The promotion, search, and shipping sub-areas each have a rung 0.** commercetools ships its own discount engine (Cart Discounts, Discount Codes, Discount Groups), its own search (Product Search / Product Projection Search), *and* its own shipping model (Zones, Shipping Methods, tiered rates over `shippingRateInput`, predicates), so "should this be a connector at all?" is a real question in those three in a way it isn't for payment, tax, or the rest — rule the native capability out explicitly before recommending a connector.

Each sub-area lives under [`references/integrations/<type>/`](./references/integrations/) with its own `overview.md`. Adding another connector type later means adding a sibling `references/integrations/<type>/` tree and one row here — the build-side guidance does not change.

### Marketplace listings are not all Connect connectors — verify before recommending

Whenever a sub-area has you check the [commercetools marketplace](https://marketplace.commercetools.com) for an existing connector, apply this rule regardless of connector type or vendor:

- **The marketplace is fine as a discovery source, but it lists integrations that are _not_ necessarily commercetools Connect connectors** — partner-operated services, SaaS products, and iPaaS middleware appear alongside deployable Connect applications. It can also be **out of sync** with the actual Connect connector registry (a listing may exist for something not deployable via Connect, or the version may differ), and any specific vendor (Akeneo, Stripe, …) **may or may not be listed at any given time** — never assume a named connector exists.
- **Double-check that a candidate is actually a commercetools Connect connector** before recommending it as install/configure/fork: look for a Connect affordance (a public connector repo / `connect.yaml` / a Connect deploy action), and treat the **Connect CLI / connector registry as authoritative** over the marketing listing.
- **Then ask the user what to do** — don't silently pick. Present the fit and whether it's Connect-deployable.
- **If the user wants to use a non–Connect integration, warn that this skill does not cover using non–Connect connectors** — its build/configure/deploy patterns (`connect.yaml`, the Connect CLI, lifecycle scripts, the Connect deployment model) don't apply. Point them to the vendor/partner's own onboarding, and offer the in-skill alternative: build or fork a Connect connector instead.

### Open every sub-area with the paths — don't wait to be asked

When a request routes into any sub-area above, the user has told you **what** they want to integrate. They have not told you **how**, and it is not yours to assume. So before requirements gathering, before config, before code — **lay out the paths and let the user pick one**:

0. **Native first, where a rung 0 exists** (promotion, search). If commercetools already ships the capability, say so plainly and stop. Don't design around something the platform does.
1. **Deploy an existing public connector as-is** — grounded in a **live** registry/marketplace check, never memory, and verified Connect-deployable per the rule above.
2. **Fork and modify an existing connector** — when there's a real gap that configuration can't close.
3. **Build a new one** — from the sub-area's template, or from the type-agnostic `service`/`event`/`job` patterns when no template exists.

State which rung you'd recommend and why, then **ask the user to choose**. These are materially different amounts of work and the decision is theirs, not yours.

Do this **unprompted, in your first substantive response in the sub-area** — including (especially) when the user's phrasing already sounds like it presumes an answer. "Build me an X integration", "sync Y into commercetools", or naming a service they're already running are *not* instructions to skip the ladder: a user who says "build" usually means "make this work" and will happily take an install if one exists. Ask a clarifying question or two first if you genuinely can't fit-check without it, but don't let requirements gathering delay the landscape — present what exists early, then let the requirements decide the rung.

Each sub-area's `overview.md` carries the full ordered gate (its Step 1.4/1.5) with the fit criteria and the template to build from. This is the rule that governs all of them.

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
- [ ] **Inbound endpoints authenticated.** Service extensions register a destination whose `authentication.type` is the discriminator value `AuthorizationHeader` — **not** the schema's type name `AuthorizationHeaderAuthentication`, which fails with `InvalidJsonInput` — (or `AzureFunctions`) **and** validate that secret in-app. Webhooks from external systems validate a full JWT (signature, issuer, audience, subject, expiry, algorithm). A `postDeploy` that hits this typo may not surface as a failed deployment, so confirm the Extension actually registered via `GET /{projectKey}/extensions`. → [security.md](./references/security.md), [service-applications.md](./references/service-applications.md) Pattern 1
- [ ] **Least-privilege CT scopes.** Use `inheritAs.apiClient.scopes` with only the scopes the apps need (e.g. `manage_orders`, `manage_subscriptions`, `manage_extensions`) — not an admin/`manage_project` client. → [security.md](./references/security.md)
- [ ] **Secrets in `securedConfiguration`.** API keys, client secrets, JWT secrets are never `standardConfiguration` and never hardcoded. → [security.md](./references/security.md)
- [ ] **No stack traces or secrets in responses.** Error middleware returns a generic message in production. → [security.md](./references/security.md)

### Correctness
- [ ] **Envelope validation.** Envelope decoded per the injected destination type — branch on `CONNECT_SUBSCRIPTION_DESTINATION` (Pub/Sub: `message.data` is base64; SNS has its own envelope) — then validated (→ JSON → resource ref → notificationType) before any processing; malformed envelopes rejected. → [event-applications.md](./references/event-applications.md)
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
| subscriptions: envelope, ack semantics, idempotency, redelivery, re-fetch, injected subscription destination (Pub/Sub or SNS) | [event-applications.md](./references/event-applications.md) |
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

### Integrating or building a tax connector (sub-area)

Start at the overview; it routes to the rest (configure a certified connector, fork one, **or build both apps from the template**). See also the [Connector-type integration sub-areas](#connector-type-integration-sub-areas) section above.

| Concern | Reference |
|---|---|
| **Start here** — the two-app workflow: requirements → is-a-certified-connector-enough → config → calculate + record | [integrations/tax/overview.md](./references/integrations/tax/overview.md) |
| Is a certified connector enough? per engine (Avalara/Vertex certified; TaxJar build-from-template), via live marketplace data | [integrations/tax/connector-selection.md](./references/integrations/tax/connector-selection.md) |
| Requirements → `connect.yaml`: tax mode (`ExternalAmount` vs `External`), nexus, tax-code source, exemptions, scopes; worked example | [integrations/tax/config-from-requirements.md](./references/integrations/tax/config-from-requirements.md) |
| The two-app contract: the calculator API Extension (all four tax actions, 200-not-202, fail modes, call reduction) + the order-syncer Subscription (commit/void/refund, idempotency); full pitfall catalog | [integrations/tax/tax-contract.md](./references/integrations/tax/tax-contract.md) |
| Avalara ground truth (from the certified open-source connector): exact keys, AvaTax createTransaction quote-vs-commit, tax-code/entity-use mapping, MC config app — plus TaxJar as the build-from-template contrast | [integrations/tax/avalara.md](./references/integrations/tax/avalara.md) |
| Verify the round trip: `taxedPrice` on the cart, transaction recorded; the sandbox-doesn't-persist and no-nexus-means-zero traps | [integrations/tax/verification.md](./references/integrations/tax/verification.md) |

### Integrating or building a CRM connector (sub-area)

Start at the overview; it routes to the rest (configure a public connector, fork one, **or build for a CRM you define**). See also the [Connector-type integration sub-areas](#connector-type-integration-sub-areas) section above.

| Concern | Reference |
|---|---|
| **Start here** — the sync workflow: requirements → **direction + source of truth** → is-a-public-connector-enough → config → build the sync apps | [integrations/crm/overview.md](./references/integrations/crm/overview.md) |
| Is a public connector enough? why classic CRMs (Salesforce/HubSpot/Dynamics/Zoho) are usually build-from-scratch; live-marketplace check; the ladder | [integrations/crm/connector-selection.md](./references/integrations/crm/connector-selection.md) |
| Requirements → `connect.yaml`: direction → app composition, source of truth, `externalId`/Custom-Field linking, least-privilege scopes, secured config; worked example | [integrations/crm/config-from-requirements.md](./references/integrations/crm/config-from-requirements.md) |
| The sync contract: outbound event syncer, inbound webhook/poll, migration job; idempotent upsert by `externalId`, re-fetch by id, ack semantics, self-change/loop filtering, deletion/PII; full pitfall catalog | [integrations/crm/crm-contract.md](./references/integrations/crm/crm-contract.md) |
| Verify the round trip: record linked by `externalId`, delta propagates once, deletion propagates; the loop / rate-limit / sandbox traps | [integrations/crm/verification.md](./references/integrations/crm/verification.md) |

### Syncing a PIM into commercetools (sub-area)

Start at the overview; it routes to the rest (use a public connector, configure, fork, **or build one**). See also the [Connector-type integration sub-areas](#connector-type-integration-sub-areas) section above.

| Concern | Reference |
|---|---|
| **Start here** — the sync-focused workflow: requirements → is a public connector enough? → configure/fork/build → data mapping → verify | [integrations/pim/overview.md](./references/integrations/pim/overview.md) |
| Is a public PIM connector enough? live marketplace check, named connectors, fit dimensions, the configure/fork/build ladder | [integrations/pim/connector-selection.md](./references/integrations/pim/connector-selection.md) |
| **Data mapping (the substance)**: Product Type strategy (never 1:1 with PIM families), attribute mapping, localization, categories, media, price/inventory separation, keys & idempotency | [integrations/pim/data-mapping.md](./references/integrations/pim/data-mapping.md) |
| Build or fork a connector: Import API vs HTTP API, `service` webhook vs `job`, full vs incremental, idempotent upsert, dependency resolution, delete handling | [integrations/pim/build-connector.md](./references/integrations/pim/build-connector.md) |
| Testing & safely running a sync: mapping unit tests, then a bounded sandbox-only live run with a pre-flight item count, large-catalog gate, and idempotency re-run (never production credentials) | [integrations/pim/testing.md](./references/integrations/pim/testing.md) |

### Order-management (OMS) connector (sub-area)

Start at the overview; it routes to the rest (use a public connector, customize/fork one, or build a new one for a bespoke OMS) and applies the sync design to all paths. See also the [Connector-type integration sub-areas](#connector-type-integration-sub-areas) section above.

| Concern | Reference |
|---|---|
| **Start here** — direction & source of truth, the requirements → use/configure/fork/build ladder, and the export/inbound/reconcile workflow | [integrations/order-management/overview.md](./references/integrations/order-management/overview.md) |
| Is a public OMS connector enough? live fit-check vs marketplace connectors; installable-Connect-connector vs vendor-hosted-integration distinction | [integrations/order-management/connector-selection.md](./references/integrations/order-management/connector-selection.md) |
| Sync design: export (`event` on `OrderCreated`), inbound (`service` webhook), reconcile (`job`); which Messages to subscribe to; OMS-status → CT-state mapping; idempotency per flow | [integrations/order-management/sync-architecture.md](./references/integrations/order-management/sync-architecture.md) |
| Build a new connector for a user-defined OMS (rung 4): scaffold, which applications to declare, connecting to the OMS API, what to reuse from templates | [integrations/order-management/build-oms-connector.md](./references/integrations/order-management/build-oms-connector.md) |

OMS connectors have **no fixed runtime contract**, so the build side composes the type-agnostic `event`/`service`/`job` references above (scaffolding from the `fulfilment-integration` CLI template); deploy uses [deployment-installation.md](./references/deployment-installation.md), not a sub-area-specific flow.

### Integrating or building a gift card connector (sub-area)

Start at the overview; it routes to the rest (use a public connector directly, customize/fork one, **or build a new one from the gift-card template**). See also the [Connector-type integration sub-areas](#connector-type-integration-sub-areas) section above.

| Concern | Reference |
|---|---|
| **Start here** — the two-app workflow: requirements → use/customize/build → config → balance + redeem + refund | [integrations/giftcard/overview.md](./references/integrations/giftcard/overview.md) |
| Use / customize / build? the ladder (Voucherify public; in-house build-from-template), the sample connector for PoC, via live marketplace data | [integrations/giftcard/connector-selection.md](./references/integrations/giftcard/connector-selection.md) |
| Requirements → `connect.yaml`: CT connection block + JWKS/issuer, currency, gift-card-system credentials, least-privilege scopes; worked example | [integrations/giftcard/config-from-requirements.md](./references/integrations/giftcard/config-from-requirements.md) |
| The two-app contract: enabler (session-driven UI) + processor (balance/redeem session-auth, Payment Intents `modifyPayment` refund/reverse), partial/multiple cards, idempotency, always-pair-with-a-fallback; full pitfall catalog | [integrations/giftcard/giftcard-contract.md](./references/integrations/giftcard/giftcard-contract.md) |
| Verify the round trip: balance → redeem → Payment transaction → fallback remainder → refund/reverse; the sample-only-simulates and no-fallback traps | [integrations/giftcard/verification.md](./references/integrations/giftcard/verification.md) |

### Integrating or building an email connector (sub-area)

Start at the overview; it routes to the rest (configure a ready-made connector, fork/customize one, **or build the one event app from the transactional email template**). See also the [Connector-type integration sub-areas](#connector-type-integration-sub-areas) section above. This is a pure `event` app, so it builds on [event-applications.md](./references/event-applications.md).

| Concern | Reference |
|---|---|
| **Start here** — the one-app workflow: requirements → is-a-ready-made-connector-enough → config → send + verify | [integrations/email/overview.md](./references/integrations/email/overview.md) |
| Is a ready-made connector enough? configure vs fork/customize vs build-from-template; why email is template-first; live-marketplace check | [integrations/email/connector-selection.md](./references/integrations/email/connector-selection.md) |
| Requirements → `connect.yaml`: which Messages, ESP key + per-email template IDs, sender, least-privilege scopes scoped to the emails in use; worked example | [integrations/email/config-from-requirements.md](./references/integrations/email/config-from-requirements.md) |
| The one-app contract: Subscription registration + message→email routing, the at-most-once vs at-least-once decision for a non-idempotent send, the token-email (≤60 min) gotcha, order-state filtering, localization, PII; full pitfall catalog | [integrations/email/email-contract.md](./references/integrations/email/email-contract.md) |
| ESP specifics: SendGrid / Mailgun / AWS SES / Postmark send-call shape, ESP-hosted templates, idempotency keys; provider comparison | [integrations/email/providers.md](./references/integrations/email/providers.md) |
| Verify the round trip: per-event checks; the no-subscription and sandbox-doesn't-deliver traps; duplicate/silent-drop symptoms | [integrations/email/verification.md](./references/integrations/email/verification.md) |

### Integrating or building a marketplace connector (sub-area)

Start at the overview; it routes to the rest (use a public connector directly, customise/fork one, **or build for a marketplace service the user defines**). See also the [Connector-type integration sub-areas](#connector-type-integration-sub-areas) section above. Marketplace listings especially often aren't Connect connectors — apply [Marketplace listings are not all Connect connectors](#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending) before recommending one.

| Concern | Reference |
|---|---|
| **Start here** — the workflow: disambiguate "marketplace" → **role + direction per domain** → which path → seller/offer modeling → build the sync apps | [integrations/marketplace/overview.md](./references/integrations/marketplace/overview.md) |
| Which path — **ask the user**: use a public connector as-is, customise/fork, or build for their service; live listing check, and how to assess a fork candidate from its current repo (`connect.yaml`, handlers, mapping) against the production gate | [integrations/marketplace/connector-selection.md](./references/integrations/marketplace/connector-selection.md) |
| Seller + offer modeling and `connect.yaml`: Channel/Store/CustomObject per seller, offer keying, per-seller price/stock scoping, Order Import + `syncInfo`, the Project limits that constrain the design, scopes; worked example | [integrations/marketplace/config-from-requirements.md](./references/integrations/marketplace/config-from-requirements.md) |
| The sync contract: seller sync, offer/inventory/price sync, order import vs per-seller routing, fulfilment status, reconciliation job; idempotent upsert by marketplace id, split multi-seller orders; full pitfall catalog | [integrations/marketplace/marketplace-contract.md](./references/integrations/marketplace/marketplace-contract.md) |
| Verify the round trip: seller usable, offer sellable per seller, order imported/routed exactly once, multi-seller split; the channel-less-price, aggregated-availability, throttling, and un-deletable-Channel traps | [integrations/marketplace/verification.md](./references/integrations/marketplace/verification.md) |

### Integrating or building a promotion / loyalty connector (sub-area)

Start at the overview; it routes to the rest (**rule out native discounts first**, then use a public connector, customise/fork one, or build one for your own engine). See also the [Connector-type integration sub-areas](#connector-type-integration-sub-areas) section above.

| Concern | Reference |
|---|---|
| **Start here** — the workflow: requirements → native-or-connector → use/customise/build → config → evaluate + redeem | [integrations/promotion/overview.md](./references/integrations/promotion/overview.md) |
| Native, use, customise, or build? the rung-0 native check (Cart Discounts/Discount Codes/Discount Groups), the live-marketplace procedure, the per-engine landscape, and why there is no promotion template | [integrations/promotion/connector-selection.md](./references/integrations/promotion/connector-selection.md) |
| Requirements → `connect.yaml`: how discounts land on the cart (`setDirectDiscounts` vs negative custom line items vs engine-managed codes), coupon-code custom field, scopes; worked example | [integrations/promotion/config-from-requirements.md](./references/integrations/promotion/config-from-requirements.md) |
| The two-app contract: the evaluator (effect→action mapping, permyriad, coupon rejection without failing the cart, 200-not-202, fail-open, call reduction, extension chaining with tax) + the redemption-syncer (redeem/rollback, idempotency, session identity); full pitfall catalog | [integrations/promotion/promotion-contract.md](./references/integrations/promotion/promotion-contract.md) |
| Which public integration to actually use — Talon.One's Connect connector is a third party's while the vendor's own repo is a PoC accelerator; Voucherify's is a port, not an install — plus the commercetools-side fixes to apply when forking | [integrations/promotion/public-connectors.md](./references/integrations/promotion/public-connectors.md) |
| Verify the round trip: `directDiscounts` on the cart, redemption in the engine; the inert-discount-codes, zero-discount, fail-open-self-heal and cart-merge traps | [integrations/promotion/verification.md](./references/integrations/promotion/verification.md) |

### Integrating or building an analytics connector (sub-area)

Start at the overview; it routes to the rest (run the live registry check, then **build a directional egress pipeline from the product-export template**). See also the [Connector-type integration sub-areas](#connector-type-integration-sub-areas) section above. There is no turnkey analytics connector and no Export API, so this composes the type-agnostic `event`/`job` build-side ([event-applications.md](./references/event-applications.md), [job-applications.md](./references/job-applications.md)).

| Concern | Reference |
|---|---|
| **Start here** — the egress workflow: requirements → is-a-connector-enough (live check anyway) → pipeline design → build test-first; disambiguates commerce analytics from Platform Insights + Change History; draws the client-side boundary | [integrations/analytics/overview.md](./references/integrations/analytics/overview.md) |
| Is a connector enough? the forced live registry/marketplace check even though build is expected; how a CDP/ELT loader changes the answer; the configure/fork/build-from-product-export-template ladder | [integrations/analytics/connector-selection.md](./references/integrations/analytics/connector-selection.md) |
| Requirements → `connect.yaml`: which Messages / job schedule, least-privilege **read** scopes, destination creds in `securedConfiguration`; worked example | [integrations/analytics/config-from-requirements.md](./references/integrations/analytics/config-from-requirements.md) |
| The pipeline (the substance): event streamer (subscribe→decode→re-fetch→transform→deliver) + batch/backfill job (`lastModifiedAt` window + cursor pagination + checkpoint); event→row transform, **destination-side dedup** (`resource.id`+`sequenceNumber`/`version`), `payloadNotIncluded` re-fetch, PII/GDPR, the limits; full pitfall catalog | [integrations/analytics/pipeline-architecture.md](./references/integrations/analytics/pipeline-architecture.md) |
| Destinations: warehouse vs CDP vs product-analytics vs BI — stream-vs-batch, what data flows, PII implication; the Subscription brokers; the client-side-first honesty caveat for GA4/Mixpanel | [integrations/analytics/destinations.md](./references/integrations/analytics/destinations.md) |
| Verify the round trip: one change → one row (no duplicate), batch window loads idempotently; the no-subscription / duplicate-row / `payloadNotIncluded` / query-off-by-default traps | [integrations/analytics/verification.md](./references/integrations/analytics/verification.md) |

### Integrating or building a search connector (sub-area)

Start at the overview; it routes to the rest (**rule out native Product Search first**, then use a public connector, fork one, or scaffold from the `product-export` template for your engine). It is **outbound and backend-only** — no API Extension. See also the [Connector-type integration sub-areas](#connector-type-integration-sub-areas) section above. An engine's own dashboard-configured integration (e.g. "Algolia for commercetools") often isn't a Connect connector — apply [Marketplace listings are not all Connect connectors](#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending) before recommending one.

| Concern | Reference |
|---|---|
| **Start here** — the workflow: rung-0 native gate → requirements → use/fork/build → data mapping → the two apps → verify | [integrations/search/overview.md](./references/integrations/search/overview.md) |
| Native, use, fork, or build? the rung-0 native-search gate (Product Search / Product Projection Search), the live-marketplace check, the vendor-hosted-integration trap, and scaffolding from the `product-export` template | [integrations/search/connector-selection.md](./references/integrations/search/connector-selection.md) |
| Requirements → the search document + `connect.yaml`: the two apps (full ingestion + incremental updater), index/engine keys, read-only least-privilege scopes, secured config; worked example | [integrations/search/config-from-requirements.md](./references/integrations/search/config-from-requirements.md) |
| Data mapping (the heart): Product Projection → flat document, `objectID` keying, record granularity, the price-context explosion, localization, category denormalization, Store assortment, the availability boundary | [integrations/search/data-mapping.md](./references/integrations/search/data-mapping.md) |
| The two-app contract: full ingestion (cursor pagination, atomic/blue-green reindex, count check) + incremental updater (idempotent upsert, deletion propagation, staleness guard); full pitfall catalog | [integrations/search/search-contract.md](./references/integrations/search/search-contract.md) |
| Verify the sync: publish appears, unpublish/delete disappears, full load counts match, re-run idempotent, per-Store scope; the eventual-consistency, availability-drift, and non-atomic-rebuild traps | [integrations/search/verification.md](./references/integrations/search/verification.md) |

### Integrating or building a shipping connector (sub-area)

Start at the overview; it routes to the rest (**rule out native Shipping Methods first**, then use a public connector, customise/fork one, or build for a carrier or rate service the user defines). There is **no Checkout shipping connector contract and no shipping template** (though `shipping` is a valid Connect `IntegrationType` to search the registry on), and shipping vendors especially often ship a vendor-hosted integration — apply [Marketplace listings are not all Connect connectors](#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending) before recommending one. Scope boundary: an OMS/WMS that already books carriers owns shipment and tracking — that is [order-management](./references/integrations/order-management/overview.md), not this.

| Concern | Reference |
|---|---|
| **Start here** — the workflow: rung-0 native gate → requirements → native/use/customise/build → config → the apps → verify; the three facts to state up front and the scope boundary against commerce-patterns, OMS, and tax | [integrations/shipping/overview.md](./references/integrations/shipping/overview.md) |
| Native, use, customise, or build? the rung-0 table (zones/tiers/predicates/freeze-and-quote vs a real connector), the `shippingRateInputType` and 100-Shipping-Method constraints, the live check, the vendor-hosted trap, and which template to scaffold from | [integrations/shipping/connector-selection.md](./references/integrations/shipping/connector-selection.md) |
| **The contract (read before coding)**: the landing decision (`setShippingRateInput` over tiers vs `setCustomShippingMethod`/`addCustomShippingMethod`) and its `matching-cart` consequence; the rate extension's timeout budget (2 s default, 10 s max), cache, and fail-open; the option-list endpoint; label + tracking write-back (`addDelivery`/`addParcelToDelivery`/`setParcelTrackingData`, idempotent on `deliveryKey`); `Single` vs `Multiple` mode; full pitfall catalog | [integrations/shipping/shipping-contract.md](./references/integrations/shipping/shipping-contract.md) |
| Requirements → `connect.yaml`: which applications, carrier credentials, enabled carriers/service levels/origin/markup, timeout + fallback keys, least-privilege scopes, the real `postDeploy` work (fallback Shipping Method, Types, Extension, credential validation); worked example | [integrations/shipping/config-from-requirements.md](./references/integrations/shipping/config-from-requirements.md) |
| Verify the round trip: quote → visible option → Cart price → Order price → label → tracking; the blocked-cart, invisible-option, sandbox-list-rates, and duplicate-Delivery traps | [integrations/shipping/verification.md](./references/integrations/shipping/verification.md) |

**Related skills:** SDK client setup, scopes, query predicates, and core data model live in [commercetools-platform](../commercetools-platform/SKILL.md) — link to it rather than restating client/auth basics here. Tax **modes** (Platform/External/ExternalAmount/Disabled), discount stacking order, `sortOrder` semantics, and Direct-Discounts-blocking-Discount-Codes as domain concepts are in [commercetools-commerce-patterns](../commercetools-commerce-patterns/SKILL.md); these sub-areas cover the *connectors* that drive them.
