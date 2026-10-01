---
name: erp-integration-overview
description: "Build a commercetools Connect ERP connector (SAP, Dynamics, NetSuite, Infor, Odoo, a home-grown ERP) — decide per data domain whether to use a public connector directly, close the gap with config, fork one, or build a new one against an ERP or middleware endpoint the user defines, then design the replication flows: order export, master-data inbound, inventory, customer/B2B, invoices. The ERP sub-area of commercetools-integrations."
when_to_use:
  - "Integrating commercetools with an ERP system (SAP S/4HANA or ECC, Microsoft Dynamics 365, Oracle NetSuite, Infor, Odoo, Sage, Epicor, or a home-grown ERP) via Connect"
  - "Replicating ERP master data into commercetools — material/product, price conditions, stock levels, B2B accounts — and exporting Orders to the ERP as sales orders"
  - "Deciding between a public ERP connector, closing a gap with configuration, forking one, or building a new one for an ERP or middleware endpoint the user defines"
  - "Designing the ERP integration boundary when middleware (SAP Cloud Integration, Boomi, MuleSoft, a cloud API gateway) sits between commercetools and the ERP"
  - "Debugging an ERP integration: stock drift and overselling, duplicate sales orders, prices that never update, invoices missing from the buyer portal"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - erp
    - integration
---

# ERP connector — integrate an ERP system

This is the **ERP sub-area** of this skill: the ERP holds the business's master data — material, price conditions, stock, accounts, financial documents — and commercetools has to be fed from it and hand Orders back to it. The type-agnostic build contracts (service/event/job, idempotency, lifecycle, security) belong to the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill; this sub-area owns the ERP-specific decisions: **which domains flow which way**, **what the connector's counterparty actually is**, and **which API each flow writes through**.

commercetools publishes an architecture guide for exactly this problem. Read it as the primary source and treat this sub-area as the Connect-side workflow on top of it: [Integrate ERP](https://docs.commercetools.com/tutorials/erp-integration.md).

## Three facts to state before anything else

Each one changes the plan, and each is routinely got wrong.

1. **"ERP integration" is never one integration.** It is a set of per-domain flows — products, prices, inventory, customers, orders, invoices — and the docs' own best practice is to **handle each as a separate integration** so each can be tuned for its own latency, volume, and frequency ([Integration best practices](https://docs.commercetools.com/tutorials/erp-integration.md#integration-best-practices)). So the deliverable is one connector with **several applications**, each with its own trigger, cadence, and idempotency key — never one mega-sync job. Scope the domains explicitly in Step 1; a project that says "sync the ERP" has not decided anything yet.
2. **The connector's counterparty is usually middleware, not the ERP.** ERP integrations typically put a middleware layer in between for connectivity, mapping, and transformation — ERP-vendor middleware (e.g. SAP Cloud Integration), best-of-breed iPaaS (e.g. Boomi, MuleSoft), or cloud services behind an API gateway ([Choose an integration solution](https://docs.commercetools.com/tutorials/erp-integration.md#choose-an-integration-solution)). Connect applications make **outbound HTTPS calls** and expose HTTPS endpoints; an ERP that only answers inside the corporate network is not addressable, so something internet-reachable has to front it. Establish what the connector talks to — ERP API, middleware, gateway, or a file drop — **before** designing anything, and ask who owns mapping: if the middleware transforms, your connector stays thin; if not, the mapping is yours.
3. **There is no ERP connector contract and no ERP application template.** `erp` **is** a valid Connect `IntegrationType`, so it classifies and finds connectors in the registry ([connector-selection.md](./connector-selection.md)) — but nothing prescribes an ERP connector's shape, and the documented application templates are payment, product-export, tax, and transactional email ([Application templates](https://docs.commercetools.com/connect/templates/templates-overview.md)). You compose plain `service` / `event` / `job` applications and scaffold from the closest twin.

## Scope boundary — route it, don't absorb it

ERP overlaps every neighbour, and half of what gets called "the ERP integration" is owned elsewhere. Split the request per domain:

| The user needs | Owner |
|---|---|
| ERP-mastered product/price/stock/account replication, Order → sales order, invoice write-back | **this sub-area** |
| Rich product content, families/attributes/locales modeled from a PIM (even when the ERP also feeds products) | [pim/overview.md](../pim/overview.md) — its [data-mapping.md](../pim/data-mapping.md) owns product attribute modeling |
| Order orchestration after capture: allocation, fulfilment status, shipment/tracking, returns | [order-management/overview.md](../order-management/overview.md) |
| Customer master in a CRM or CDP rather than the ERP | [crm/overview.md](../crm/overview.md) |
| Tax calculation at checkout (even when the ERP is the tax system of record) | [tax/overview.md](../tax/overview.md) |
| Pushing commercetools data to a warehouse for reporting | [analytics/overview.md](../analytics/overview.md) |
| Pricing, discount, and B2B **modeling** decisions once the data has landed | [commercetools-commerce-patterns](../../../commercetools-commerce-patterns/SKILL.md) |

**The most common mis-scope: orders.** If an OMS or ERP-side fulfilment module owns allocation and shipping, the status/shipment write-back belongs to the OMS connector, not here — this sub-area exports the Order and takes back what the *financial* side of the ERP produces (order confirmation, sales-order number, invoice, credit). Two writers on the same Order fields is a data-integrity bug, not redundancy.

## Rung 0 — does this data need to be replicated at all?

Before designing a flow per domain, rule out the cheaper answers. State the reason.

- **Is the ERP even the source of truth here?** The docs' default per domain: products/prices/stock flow **ERP → commercetools**; Orders and B2C customers flow **commercetools → ERP**; B2B customer data flows **both ways** — accounts inbound as Business Units and Associates, Associates outbound as ERP accounts ([Typical ERP data flows](https://docs.commercetools.com/tutorials/erp-integration.md#typical-erp-data-flows)). For organizations with no ERP or OMS downstream, commercetools **is** the Order source of truth ([Plan integrations → Order](https://docs.commercetools.com/tutorials/implementation-guide/plan-integrations.md)) — then there is no export to build.
- **Replicate, or read live?** Data that changes per request and isn't needed for search, faceting, or Merchant Center work may not belong in commercetools at all: external prices resolved by your BFF at cart time are a documented option when pricing is highly dynamic or exceeds the Standalone Price ceiling ([External Prices](https://docs.commercetools.com/api/pricing-and-discounts-overview.md#external-prices)). The trade-off is real: external prices are **not** available for filtering, faceting, or sorting in Product Search.
- **Never a bidirectional sync of the same field.** Bidirectional syncs are explicitly discouraged; assign each *attribute* a single owner and make the other side read-only ([Integration patterns → Bi-directional syncs](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md#bi-directional-syncs)). For ERP-owned product attributes, enforce it in the UI too: put them in a restricted [AttributeGroup](https://docs.commercetools.com/tutorials/product-data-integrations.md#multiple-sources-of-product-data) so Merchant Center users can't edit them.
- **Real-time replication is not a thing.** Continuous data-level replication between the two systems is not supported; real-time interaction is via the HTTP API ([Integration patterns → Real-time data transfer](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md#real-time-data-transfer)). "Live ERP stock on the PDP" is a design smell — use replicated Inventory plus a threshold-triggered check ([erp-contract.md](./erp-contract.md)).
- **Is this a one-time migration?** Initial load and ongoing delta sync are separate problems with separate tooling; the docs say to keep them separate ([Integration patterns → Separate initial migration from ongoing integrations](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md#separate-initial-migration-from-ongoing-integrations)). A migration is a `job` (or a plain script) that runs once — don't let it dictate the steady-state design.

## Workflow

The heart is **Step 1 → Step 1.5 → Step 2 → Step 3** (requirements → use/config/fork/build → config → the flows).

<!-- ct:docs-search:begin -->
### Step 0 — Gather context (run first)

Gather the latest verified documentation as your primary grounding for this sub-area. You must run this before designing anything here; the commercetools Knowledge MCP covers everything the script does not:

```bash
node "<this skill's directory>/scripts/docs-search.mjs" \
  --query "<ERP terms from the user's request, e.g. 'ERP integration order replication middleware import API inventory stock levels business units invoices'>" \
  --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
  --model "<current-model>" \
  --commercetools-project-key "<if known>" \
  --commercetools-region "<if known>" \
  --limit 10
```

Pass the commercetools project key and region (as in `api.{region}.commercetools.com`) only if already in your context; otherwise omit both. Never search files or ask the user for them.
<!-- ct:docs-search:end -->

(Run it from the `commercetools-integrations` skill root.) Use its output as primary grounding. Use this script rather than the commercetools Knowledge MCP tools while working in this skill; [Integrate ERP](https://docs.commercetools.com/tutorials/erp-integration.md) and [Integrate product data](https://docs.commercetools.com/tutorials/product-data-integrations.md) are good further reading.

**This sub-area is deliberately vendor-neutral, and stays that way.** It owns the commercetools side: which flows exist, which API each writes through, the update actions, the config surface, the linking keys. Everything on the *ERP or middleware* side — auth, endpoint and message shapes, field and code names, IDOC/BAPI/OData specifics, batch windows, rate limits, sandbox behavior — belongs to that system's own documentation, changes without notice, and must be read from **their** current docs (and, for a public connector, its repo's `connect.yaml` and README) rather than recalled. The SAP mapping table in the commercetools docs ([SAP ERP integration example](https://docs.commercetools.com/tutorials/erp-integration.md#sap-erp-integration-example)) is a worked illustration, not a spec to code against.

### Step 1 — Extract requirements (before any config or code)

Ask, don't assume. Every answer below changes the application list.

1. **Which ERP, which version/edition, and what is exposed?** SAP S/4HANA vs ECC, Dynamics 365 F&O vs Business Central, NetSuite, Infor, Odoo, Sage, Epicor, home-grown. Cloud or on-premise. What integration surface exists — REST/OData, SOAP/BAPI, IDOC, events, or nightly files?
2. **What sits in between, and who owns mapping?** Direct ERP API, ERP-vendor middleware, iPaaS, cloud gateway, or SFTP. Is the endpoint reachable from the public internet, and how does it authenticate (OAuth client credentials, mTLS, API key, IP allowlisting)? If the answer is "IP allowlist", raise it now — see the connectivity trap in [erp-contract.md](./erp-contract.md).
3. **Which domains are in scope, and which direction each?** Products, product classification, prices, inventory, B2C customers, B2B accounts/business units, orders, invoices, credit/payment terms, returns. Take the documented defaults as the starting proposal and confirm each one; every in-scope domain is at least one application.
4. **Source of truth per attribute, not per resource.** Which fields does the ERP own (and must be read-only in commercetools), which does commercetools own, which does a PIM own? This is the single most valuable answer in the whole requirements block.
5. **Cadence and volume per domain.** Event-driven, hourly delta, nightly batch, or initial-load-only. Counts: SKUs, price records, stock rows, accounts, orders/day, peak. This decides `job` vs `event` vs `service` and Import API vs HTTP API.
6. **Order export trigger and payload.** On `OrderCreated`, or only after payment/approval/quote acceptance? What must the ERP receive (line items, freight, taxes, discounts, PO number, payment terms, ship-to hierarchy)? What comes back — sales-order number, order confirmation, credit block, invoice?
7. **Stock semantics.** Which locations map to which supply Channels? Absolute quantity or delta? Is a safety buffer applied, and by whom? What is the acceptable staleness window, and what happens on oversell?
8. **Pricing semantics.** Which price conditions/lists are in scope; per currency, country, customer group, channel, or contract; Embedded vs Standalone Prices; tiered/scale prices; validity windows; net vs gross; tax handling.
9. **B2B specifics (ask whenever B2B is in play).** Account hierarchy (sold-to / ship-to / payer / bill-to) → Business Units and Associates; contract pricing; credit limit and payment terms; PO number; approval flows; invoice access in the buyer portal.
10. **Region and project** (e.g. `europe-west1.gcp`, project key) — the API/Auth hosts and the deploy region are region-specific.
11. **Anything special or non-standard? (always ask — open-ended)** Units of measure and conversion, multi-company/multi-plant, intercompany, serialized or lot-tracked stock, made-to-order/configurable products, ETO lead times, bundles/kits and BOM explosion, min-order quantities and pack sizes, customs/HS codes, data residency, an existing middleware contract or tenant, a cutover/dual-run window. Capture each as its own line; **don't force it into a slot above.**

Write these as a short requirements block with a **domain × direction × trigger × API** table and **confirm it with the user** before deriving config. Each special requirement feeds the Step 1.5 fit-check.

### Step 1.5 — Use a public connector, close the gap with config, fork, or build? (decide before building)

Don't answer "does one exist?" from memory. Check the registry and marketplace **live**, name the connector and version you checked, and apply the listings rule — ERP listings are very often the vendor's or a partner's *hosted* integration rather than a deployable Connect connector. Full method: [connector-selection.md](./connector-selection.md). Then walk the ladder, stopping at the first rung that fits — **and note the ladder is per domain**: using a public connector for order export while building an inventory job is a normal outcome.

0. **No replication needed** — the rung-0 gate above. Stop here if it fits.
1. **Use a public connector directly** — a Connect-deployable connector for this ERP exists and covers the in-scope domains → install and configure.
2. **The gap is config, not code** — endpoint, credentials, field mappings, which domains and messages are enabled, batch size and schedule are typically `connect.yaml` values → back to rung 1.
3. **Customise/fork** — a real gap config can't close, and an open-source connector exists → fork, add only the delta, publish as an Organization connector.
4. **Build a new one for the ERP or middleware endpoint the user defines** — **the common case here**, because ERP landscapes are per-customer → compose `event` / `service` / `job` applications, scaffolding from the closest template ([connector-selection.md](./connector-selection.md)).

**Present the ladder and ask the user to choose.** These are materially different amounts of work. Give your recommendation and its reasoning, then let them decide, and record the rung, the domains it covers, and the version checked in the requirements block. Rungs 3–4 use the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill for the build/stage/publish lifecycle and its production-readiness gate, then return here.

### Step 2 — Derive the config from the requirements

Translate the Step 1 table into `connect.yaml`: one entry per in-scope flow, ERP/middleware credentials in `securedConfiguration`, endpoints, batch sizes, schedules, channel and mapping keys in `standardConfiguration`, and least-privilege scopes per domain. Mapping table, scopes, and a worked example: [config-from-requirements.md](./config-from-requirements.md).

### Step 3 — Build the flows, test-first

Read [erp-contract.md](./erp-contract.md) before writing code — it owns the per-flow runtime contract (which trigger, which API, which idempotency key, what to do when the ERP is down) and the pitfall catalog. Field-level mapping decisions — money, units of measure, SKU/material, account hierarchy, order lines, invoices — are in [data-mapping.md](./data-mapping.md). Build each flow red-test-first, mocking the ERP/middleware boundary and asserting on what your code *decided*: which update action it emitted, which resource it upserted, what it did on a duplicate delivery ([testing.md](../../../commercetools-connect/references/testing.md)).

### Step 4 — Deploy

Deploy is type-agnostic: [deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md). A public connector installs directly; a forked or built Organization connector goes `connectorstaged create → publish → deployment create`. Secrets go in `securedConfiguration`, never in code.

### Step 5 — Verify the round trip

Not done until a real Order reaches the ERP as a sales order and real ERP master data lands in commercetools. [verification.md](./verification.md) owns the per-flow checks and the traps that look like bugs: silent stock drift, duplicate sales orders, an import container stuck on unresolved references, prices that never move.

## References

| Need | Reference |
|---|---|
| **Use, config, fork, or build?** the live registry check on `integrationTypes=erp`, the vendor/partner-hosted-integration trap, which template to scaffold from, how to assess a fork candidate | [connector-selection.md](./connector-selection.md) |
| **The contract (read before coding)**: per-flow trigger + API + idempotency key for order export, master-data inbound, inventory, customer/B2B, invoice write-back; connectivity, batch-window, and loop pitfalls | [erp-contract.md](./erp-contract.md) |
| **Field mapping**: money and units of measure, material ↔ SKU, price conditions ↔ Prices, account hierarchy ↔ Business Units, order lines, invoice storage | [data-mapping.md](./data-mapping.md) |
| **Requirements → `connect.yaml`**: one entry per flow, ERP/middleware credentials, endpoints, schedules, channel + mapping keys, least-privilege scopes; worked example | [config-from-requirements.md](./config-from-requirements.md) |
| **Verify the round trip**: per-flow checks, failure paths, the trap table | [verification.md](./verification.md) |
| Product content modeling from a PIM (and the ERP-vs-PIM split) | [pim/overview.md](../pim/overview.md), [pim/data-mapping.md](../pim/data-mapping.md) |
| Fulfilment, shipment, and order-status write-back owned by an OMS | [order-management/overview.md](../order-management/overview.md) |
| Pricing, B2B, and money modeling once the data has landed | [commercetools-commerce-patterns](../../../commercetools-commerce-patterns/SKILL.md) |
| Build/publish/certify lifecycle, deploy, scopes, production-readiness gate (type-agnostic) | [commercetools-connect](../../../commercetools-connect/SKILL.md) |

Adding another domain later means another application and another mapping — the flow contracts and the linking keys do not change.

## Checklist

Scope and rung 0
- [ ] Domains scoped **individually** (products, prices, inventory, customers/B2B, orders, invoices), each with direction, trigger, cadence, and API
- [ ] Neighbour boundaries settled: PIM vs ERP for product content, OMS vs ERP for fulfilment, CRM vs ERP for customer master, tax engine vs ERP
- [ ] Replication ruled in per domain (not "sync everything"); external-price / live-read alternative considered and decided
- [ ] No bidirectional sync of the same attribute; ERP-owned product attributes placed in a restricted AttributeGroup
- [ ] Initial migration kept separate from steady-state delta sync

Requirements
- [ ] ERP named with version/edition and exposed integration surface
- [ ] Counterparty established (direct API / middleware / gateway / file drop), reachability and auth confirmed, mapping ownership agreed
- [ ] Source of truth fixed **per attribute**, and the read-only side enforced
- [ ] Cadence + volume per domain; stock and pricing semantics captured
- [ ] Order export trigger and payload agreed; what the ERP returns agreed
- [ ] B2B specifics captured when in play (hierarchy, contract pricing, credit, PO, invoices)
- [ ] Open-ended "anything special?" asked; each special requirement its own line
- [ ] Requirements block written **and confirmed** with the domain table

Path
- [ ] Registry + marketplace checked **live** (not memory); connector key + version named, or "none exists" recorded
- [ ] Any candidate verified as actually Connect-deployable, not a vendor- or partner-hosted integration
- [ ] Ladder rung **presented to the user and chosen by them**, per domain: no replication (0) · use public (1) · config closes the gap (2) · fork (3) · build (4)

Build and ship
- [ ] One application per flow; no mega-sync
- [ ] Idempotency key stated per flow; ERP-down behavior stated per flow
- [ ] Subscriptions, Custom Types, and Channels registered idempotently in `postDeploy`, cleaned up in `preUndeploy`
- [ ] ERP/middleware boundary mocked; suite runs with no deployment and no secrets
- [ ] commercetools-connect production-readiness gate satisfied ([commercetools-connect](../../../commercetools-connect/SKILL.md))

Verification
- [ ] Order → sales order proven end to end, exactly once; sales-order number linked back onto the Order
- [ ] Master-data inbound proven per domain, re-runnable without duplicates
- [ ] ERP-down and duplicate-delivery paths exercised deliberately
