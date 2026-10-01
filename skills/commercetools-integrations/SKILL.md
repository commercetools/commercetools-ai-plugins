---
name: commercetools-integrations
description: "Integrate commercetools with an external system through Connect. Thirteen domain sub-areas each start at a native-capability gate, then pick a rung: use a public connector, close the gap with config, fork one, or build new. Build contracts live in commercetools-connect. Use when syncing commercetools to or from an external system, or debugging a deployed connector."
when_to_use:
  - "Payment (Stripe, Adyen, Mollie, PayPal) and gift card (Voucherify) connectors: payment session, capture/refund, redeem"
  - "Tax connectors (Avalara, Vertex, TaxJar): calculator API Extension, ExternalAmount, taxedPrice missing"
  - "ERP (SAP, Dynamics, NetSuite, Odoo) or OMS (Fluent, fulfillmenttools): OrderCreated export, SyncInfo, stock drift"
  - "PIM (Akeneo) or CRM (Salesforce, HubSpot, Dynamics, Zoho) sync: externalId linking, Import API vs HTTP API, sync loops"
  - "Search (Algolia, Constructor, Bloomreach) or analytics export (BigQuery, Snowflake, Segment): reindex, lastModifiedAt job"
  - "Shipping (carriers, rate engines, labels): setShippingRateInput vs setCustomShippingMethod"
  - "Promotion/loyalty (Talon.One, Voucherify, Eagle Eye): setDirectDiscounts, inert Discount Codes"
  - "Marketplace (Mirakl, Marketplacer, channel managers): sellers, offers, per-seller prices"
  - "Transactional email (SendGrid, Mailgun, AWS SES): at-most-once vs at-least-once, no emails sent"
  - "Implementing a spec/plan/tasks.md task annotated [SKILL: commercetools-integrations]"
metadata:
  contentType: SKILL
  area:
    - Integrations
  docsSearch:
    products:
      - Composable Commerce
      - Checkout
      - Connect
      - InStore
      - AI Hub
---

# commercetools integrations

Connecting commercetools to a specific external system: which integration already exists, whether you need one at all, and what the connector for it must actually do. Thirteen sub-areas, each owning one integration domain end to end — the decision ladder, the requirements → `connect.yaml` mapping, the runtime contract, and the verification steps.

**This skill is the canonical home of all thirteen sub-area trees.** They live here and nowhere else: [commercetools-connect](../commercetools-connect/SKILL.md) links into them rather than carrying a copy, so add or edit a sub-area here only.

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
| **ERP** (SAP S/4HANA or ECC, Microsoft Dynamics 365, Oracle NetSuite, Infor, Odoo, Sage, …) | [references/erp/overview.md](./references/erp/overview.md) |
| **Gift card** (Voucherify, in-house store credit, …) | [references/giftcard/overview.md](./references/giftcard/overview.md) |
| **Transactional email** (SendGrid, Mailgun, AWS SES, Postmark, …) | [references/email/overview.md](./references/email/overview.md) |
| **Marketplace** (Marketplacer, Mirakl, Convictional, channel managers) | [references/marketplace/overview.md](./references/marketplace/overview.md) |
| **Promotion / loyalty** (Talon.One, Voucherify, Dovetech, Eagle Eye, …) | [references/promotion/overview.md](./references/promotion/overview.md) |
| **Analytics** — warehouse / CDP / product analytics (BigQuery, Snowflake, Redshift, Databricks, Segment, mParticle) | [references/analytics/overview.md](./references/analytics/overview.md) |
| **Search / product discovery** (Algolia, Constructor, Bloomreach, Coveo, Elasticsearch, Typesense) | [references/search/overview.md](./references/search/overview.md) |
| **Shipping** (carriers, rate-shopping engines, label/shipping-execution platforms) | [references/shipping/overview.md](./references/shipping/overview.md) |

Not here: the hosted Checkout widget ([commercetools-checkout](../commercetools-checkout/SKILL.md)); surface-independent commerce domain logic such as pricing, discount stacking, tax modes, and native shipping modeling ([commercetools-commerce-patterns](../commercetools-commerce-patterns/SKILL.md)); SDK client setup, auth, and the core data model ([commercetools-platform](../commercetools-platform/SKILL.md)).

## The ladder every sub-area walks

The rungs are the same across all thirteen; only the rung-0 native capability differs. Stop at the first rung that fits, and **present the choice to the user** — the rungs are materially different amounts of work.

0. **Native commercetools capability** — does this need an integration at all? Real for promotion (Product Discounts / Cart Discounts / Discount Codes / Discount Groups), search (Product Search), and shipping (Zones, Shipping Methods, tiered rates, predicates). ERP has a variant of the same gate — does this data need replicating into commercetools at all, or read live? Rule it out explicitly, with the reason stated.
1. **Use a public connector** — one exists and covers the requirements → install and configure. Check **live**, never from memory; name the connector and version you checked.
2. **The gap is config, not code** — enabled features, credentials, markup, field mappings and fallback behavior are typically `connect.yaml` values → back to rung 1.
3. **Customise / fork** — a real gap config can't close, and an open-source connector exists → fork, add only the delta, publish as an Organization connector.
4. **Build a new one** — nothing exists for this vendor → build from the closest application template.

**Verify a candidate is actually Connect-deployable before calling it installable.** A vendor listing is frequently the vendor's own hosted service plus glue you write — not something Connect deploys. The full rule, with the checks that settle it: [Marketplace listings are not all Connect connectors](../commercetools-connect/SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending).

<!-- ct:docs-search:begin -->
### Step 0 — Gather context (run first)

Gather the latest verified documentation as your primary grounding for this sub-area. You must run this before designing anything here; the commercetools Knowledge MCP covers everything the script does not:

```bash
node "<this skill's directory>/scripts/docs-search.mjs" \
  --query "<terms from the user's request>" \
  --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
  --model "<current-model>" \
  --commercetools-project-key "<if known>" \
  --commercetools-region "<if known>" \
  --limit 10
```

Pass the commercetools project key and region (as in `api.{region}.commercetools.com`) only if already in your context; otherwise omit both. Never search files or ask the user for them.
<!-- ct:docs-search:end -->

Both scripts query the same index as the commercetools Knowledge MCP, with the product filters this skill needs — use them rather than the MCP tools while working in this skill. Run them from this skill's root. `scripts/openApi-schemata.mjs` and `scripts/graphql-schemata.mjs` are here too, for confirming request/response shapes from the OAS or GraphQL schema instead of from memory.

## What a sub-area contains

Only `overview.md` and `connector-selection.md` exist everywhere. The rest is the common shape, not a guarantee — **list the sub-area's directory rather than assuming a file exists**:

| File | Owns |
|---|---|
| `overview.md` | **Start here.** Present in all thirteen. Orientation, the rung-0 gate, requirements extraction, the workflow, and routing to the rest |
| `connector-selection.md` | Present in all thirteen. The decision ladder for this domain: what exists, how to check live, which template to scaffold from |
| `config-from-requirements.md` | Requirements → `connect.yaml`: applications, credentials, config keys, least-privilege scopes, worked example |
| `*-contract.md` | The runtime contract: what each application must do, and the pitfall catalog |
| `verification.md` | Proving the round trip works end to end, plus the traps that look like bugs |

Sub-areas name their files after what the domain actually needs, so several diverge: `pim/` uses `build-connector.md` + `data-mapping.md` + `testing.md`, `order-management/` uses `build-oms-connector.md` + `sync-architecture.md`, and `analytics/` uses `pipeline-architecture.md` — those three carry the runtime contract in place of a `*-contract.md`. `erp/` and `search/` carry a `*-contract.md` **and** a `data-mapping.md`, because in those two the field mapping is a decision set in its own right. Others add provider specifics, test harnesses, or public-connector assessments.

## Rules that hold across all thirteen

- **Ask, don't assume.** Requirements come before config, and config before code. Direction, source of truth, and what happens when the external system is down are business decisions — get them from the user and record them.
- **Check the registry live.** Connector availability changes. One you remember may not exist; one you don't may.
- **Vendor facts come from the vendor.** Their auth, payloads, field names, limits, and sandbox behavior are theirs to document and change — read their current API docs, and for a public connector its repo's `connect.yaml` and README. Do not write vendor field names from memory.
- **Present the ladder; let the user choose the rung.** Give a recommendation and its reasoning, then record the decision.
- **Hand back for the build.** Once the rung is chosen and the applications are designed, the lifecycle, testing, and production-readiness gate are [commercetools-connect](../commercetools-connect/SKILL.md).
