---
name: commercetools-integrations
description: Integrate commercetools with an external system through Connect — payment (Stripe, Adyen, Mollie, PayPal), tax (Avalara, Vertex, TaxJar), PIM (Akeneo), CRM (Salesforce, HubSpot), order management/OMS (Fluent Commerce, fulfillmenttools, NewStore), gift cards (Voucherify), transactional email (SendGrid, Mailgun), marketplace (Mirakl, Marketplacer), promotion and loyalty (Talon.One, Voucherify), analytics export to a warehouse/CDP (BigQuery, Snowflake, Segment), search and product discovery (Algolia, Constructor, Bloomreach), and shipping (carriers, rate engines, label platforms). Each sub-area rules out the native capability first, then picks a rung — use a public connector, close the gap with config, fork, or build. Use when syncing commercetools to or from an external system, or configuring, forking, or debugging a connector. Type-agnostic build contracts live in commercetools-connect.
when_to_use:
  - "Syncing commercetools to or from an external system (ERP, WMS, OMS, tax, email, search, CRM, PIM, data warehouse/CDP)"
  - "Choosing between using a public connector, closing the gap with configuration, forking one, or building a new one for a vendor the user names"
  - "Payment connectors for a custom storefront (Stripe, Adyen, Mollie, PayPal, ...): integrate a deployed one, fork, or build from the payment-integration template — session BFF, Order after authorization, webhooks"
  - "Tax connectors (Avalara, Vertex, TaxJar): configure/fork or build the calculator API Extension + order-syncer Subscription from the tax-integration template; debugging taxedPrice missing or a wrong tax mode"
  - "PIM/product-catalog sync (e.g. Akeneo): use/fork/build; mapping families/attributes/locales/categories onto Product Types; Import API vs HTTP API, event-webhook vs job"
  - "CRM connectors (Salesforce, HubSpot, Dynamics 365, Zoho): use/fork/build; direction + source of truth; linking by externalId; migration vs delta sync; debugging duplicate contacts or an infinite sync loop"
  - "Order-management/OMS connectors (fulfillmenttools, Fluent Commerce, kbrw, OneStock, NewStore, Pipe17): install/fork/build; order export on OrderCreated, status/shipment/fulfillment inbound webhooks"
  - "Gift-card connectors (Voucherify, in-house store credit): use/fork or build from the gift-card-integration template; enabler UI + processor (balance/redeem, Payment Intents refund/reverse)"
  - "Transactional-email connectors (SendGrid, Mailgun, AWS SES, Postmark): configure/fork or build the one event app from the transactional email template; at-most-once vs at-least-once + dedupe"
  - "Marketplace connectors (Marketplacer, Mirakl, Convictional, channel managers): operator vs selling on an external marketplace, role + direction per domain; modeling sellers/offers"
  - "Promotion/loyalty connectors (Talon.One, Voucherify, Dovetech, Eagle Eye): rule out native discounts first, then use/fork/build the evaluator API Extension + redemption Subscription (setDirectDiscounts)"
  - "Analytics export to a data warehouse/CDP/product-analytics tool (BigQuery, Snowflake, Segment): no turnkey connector and no Export API, so build an event streamer on Subscriptions/Messages plus a batch job"
  - "Search/product-discovery connectors (Algolia, Constructor, Bloomreach, Elasticsearch, Typesense): rule out native Product Search first, then use/fork or build the full-ingestion + incremental-updater apps"
  - "Shipping connectors (carriers, rate-shopping engines, label/shipping-execution platforms): rule out native Shipping Methods, tiered rates and predicates first, then use/fork or build; the rate-landing decision"
  - "Implementing a spec/plan/tasks.md task annotated [SKILL: commercetools-integrations]"
  - "An implementation-plan step that connects commercetools to a named third-party system"
metadata:
  contentType: SKILL
  area:
    - Integrations
---

# commercetools integrations

Connecting commercetools to a specific external system: which integration already exists, whether you need one at all, and what the connector for it must actually do. Twelve sub-areas, each owning one integration domain end to end — the decision ladder, the requirements → `connect.yaml` mapping, the runtime contract, and the verification steps.

**This skill is domain-specific. The build side is not here.** How a `service` / `event` / `job` application is written, the `connect.yaml` contract, least-privilege scopes, lifecycle scripts, sync-vs-async idempotency and ack semantics, testing, deployment, and the production-readiness gate are type-agnostic and live in [commercetools-connect](../commercetools-connect/SKILL.md). Start here to decide *what* to build for a given vendor; go there for *how* to build and ship it.

## Route to the sub-area first

Do not answer an integration question from this file. Open the matching `overview.md` — it owns the workflow, the decision ladder, and the traps for that domain.

| Domain | Sub-area |
|---|---|
| **Payment** (Stripe, Adyen, Mollie, PayPal, …) | [references/payment/overview.md](./references/payment/overview.md) |
| **Tax** (Avalara, Vertex, TaxJar, …) | [references/tax/overview.md](./references/tax/overview.md) |
| **CRM** (Salesforce, HubSpot, Dynamics 365, Zoho, …) | [references/crm/overview.md](./references/crm/overview.md) |
| **PIM** (Akeneo, inriver, Bluestone, Pimcore, …) | [references/pim/overview.md](./references/pim/overview.md) |
| **Order management / OMS** (Fluent Commerce, fulfillmenttools, kbrw, OneStock, NewStore, Pipe17) | [references/order-management/overview.md](./references/order-management/overview.md) |
| **Gift card** (Voucherify, in-house store credit, …) | [references/giftcard/overview.md](./references/giftcard/overview.md) |
| **Transactional email** (SendGrid, Mailgun, AWS SES, Postmark, …) | [references/email/overview.md](./references/email/overview.md) |
| **Marketplace** (Marketplacer, Mirakl, Convictional, channel managers) | [references/marketplace/overview.md](./references/marketplace/overview.md) |
| **Promotion / loyalty** (Talon.One, Voucherify, Dovetech, Eagle Eye, …) | [references/promotion/overview.md](./references/promotion/overview.md) |
| **Analytics** — warehouse / CDP / product analytics (BigQuery, Snowflake, Redshift, Databricks, Segment, mParticle) | [references/analytics/overview.md](./references/analytics/overview.md) |
| **Search / product discovery** (Algolia, Constructor, Bloomreach, Coveo, Elasticsearch, Typesense) | [references/search/overview.md](./references/search/overview.md) |
| **Shipping** (carriers, rate-shopping engines, label/shipping-execution platforms) | [references/shipping/overview.md](./references/shipping/overview.md) |

Not here: the hosted Checkout widget ([commercetools-checkout](../commercetools-checkout/SKILL.md)); surface-independent commerce domain logic such as pricing, discount stacking, tax modes, and native shipping modeling ([commercetools-commerce-patterns](../commercetools-commerce-patterns/SKILL.md)); SDK client setup, auth, and the core data model ([commercetools-platform](../commercetools-platform/SKILL.md)).

## The ladder every sub-area walks

The rungs are the same across all twelve; only the rung-0 native capability differs. Stop at the first rung that fits, and **present the choice to the user** — the rungs are materially different amounts of work.

0. **Native commercetools capability** — does this need an integration at all? Real for promotion (Product Discounts / Cart Discounts / Discount Codes / Discount Groups), search (Product Search), and shipping (Zones, Shipping Methods, tiered rates, predicates). Rule it out explicitly, with the reason stated.
1. **Use a public connector** — one exists and covers the requirements → install and configure. Check **live**, never from memory; name the connector and version you checked.
2. **The gap is config, not code** — enabled features, credentials, markup, field mappings and fallback behavior are typically `connect.yaml` values → back to rung 1.
3. **Customise / fork** — a real gap config can't close, and an open-source connector exists → fork, add only the delta, publish as an Organization connector.
4. **Build a new one** — nothing exists for this vendor → build from the closest application template.

**Verify a candidate is actually Connect-deployable before calling it installable.** A vendor listing is frequently the vendor's own hosted service plus glue you write — not something Connect deploys. The full rule, with the checks that settle it: [Marketplace listings are not all Connect connectors](../commercetools-connect/SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending).

## Step 0 — Gather context (required, run first)

Every sub-area opens with the same mandatory grounding step: pull the latest verified documentation as context for you (the agent) before designing anything. **Do not skip it, and do not replace it with another tool.**

```bash
node scripts/docs-search.mjs \
  --query "<terms from the user's request>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-integrations" \
  --limit 10
```

Run it from this skill's root. `scripts/openApi-schemata.mjs` and `scripts/graphql-schemata.mjs` are here too, for confirming request/response shapes from the OAS or GraphQL schema instead of from memory.

## What a sub-area contains

Only `overview.md` and `connector-selection.md` exist everywhere. The rest is the common shape, not a guarantee — **list the sub-area's directory rather than assuming a file exists**:

| File | Owns |
|---|---|
| `overview.md` | **Start here.** Present in all twelve. Orientation, the rung-0 gate, requirements extraction, the workflow, and routing to the rest |
| `connector-selection.md` | Present in all twelve. The decision ladder for this domain: what exists, how to check live, which template to scaffold from |
| `config-from-requirements.md` | Requirements → `connect.yaml`: applications, credentials, config keys, least-privilege scopes, worked example |
| `*-contract.md` | The runtime contract: what each application must do, and the pitfall catalog |
| `verification.md` | Proving the round trip works end to end, plus the traps that look like bugs |

Sub-areas name their files after what the domain actually needs, so several diverge: `pim/` uses `build-connector.md` + `data-mapping.md` + `testing.md`, `order-management/` uses `build-oms-connector.md` + `sync-architecture.md`, and `analytics/` uses `pipeline-architecture.md` — those last two carry the runtime contract in place of a `*-contract.md`. Others add provider specifics, test harnesses, or public-connector assessments.

## Rules that hold across all twelve

- **Ask, don't assume.** Requirements come before config, and config before code. Direction, source of truth, and what happens when the external system is down are business decisions — get them from the user and record them.
- **Check the registry live.** Connector availability changes. One you remember may not exist; one you don't may.
- **Vendor facts come from the vendor.** Their auth, payloads, field names, limits, and sandbox behavior are theirs to document and change — read their current API docs, and for a public connector its repo's `connect.yaml` and README. Do not write vendor field names from memory.
- **Present the ladder; let the user choose the rung.** Give a recommendation and its reasoning, then record the decision.
- **Hand back for the build.** Once the rung is chosen and the applications are designed, the lifecycle, testing, and production-readiness gate are [commercetools-connect](../commercetools-connect/SKILL.md).
