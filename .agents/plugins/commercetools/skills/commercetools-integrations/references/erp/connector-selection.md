---
name: erp-connector-selection
description: "Decide whether an ERP use case is covered by a public commercetools Connect ERP connector, closable with configuration, worth forking, or needs a new connector built against the ERP or its middleware — checked live against the Connect registry, with the partner-hosted-integration trap and the scaffolding choice per flow."
when_to_use:
  - "Checking whether an ERP (SAP, Dynamics, NetSuite, Infor, Odoo, …) already has a Connect connector before building one"
  - "Deciding between using a public ERP connector, closing a gap with config, forking one, and building a new one"
  - "Choosing which application template to scaffold an ERP connector from"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - erp
    - integration
---

# Use, configure, fork, or build — for an ERP

Two mistakes are expensive in opposite directions: building a replication pipeline that a maintained connector already ships, and promising a one-click install for a listing that turns out to be a partner-run integration project. Settle both with live data, per domain.

## Check the registry live — never from memory

Published connectors are discoverable through the Connect API's `Search Connectors` endpoint, filtered by integration type:

```
GET {connect-host}/connectors/search?integrationTypes=erp
# also worth querying for an ERP programme, because ERP work is split across types:
#   &integrationTypes=oms       (order/fulfilment side)
#   &integrationTypes=pim       (product master side)
#   &text=<ERP or middleware name>
```

- **`erp` is a valid `IntegrationType`.** The full enum is `tax`, `marketplace`, `oms`, `psp`, `pim`, `promotion`, `search`, `erp`, `crm`, `email`, `analytics`, `shipping`, `giftcard`, `other` ([IntegrationType](https://docs.commercetools.com/connect/common-types.md)) — query `other` too, since a bespoke ERP or middleware connector is a likely candidate for the catch-all. Confirm the current enum from the schema rather than this list: `openApi-schemata.mjs --resource-name connect-Connector`. Host and auth: [Connect hosts and authorization](https://docs.commercetools.com/connect/hosts-and-authorization.md).
- **Read the result properly.** Each `Connector` carries `key`, `name`, `integrationTypes`, `creator`, `repository`, `configurations`, `supportedRegions`, `certified`, `private`, and `documentationUrl`. `certified: true` / `private: false` identifies a public certified connector; `configurations` is the config surface you would fill at install; `repository` decides whether rung 3 (fork) is even possible ([deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md)).
- **Also browse the human view**: the [Connect marketplace](https://marketplace.commercetools.com/connectors). Don't cite a category URL such as `/integrations/erp` as an ERP index — those now redirect to the generic partner listing. The same search is available in the **Merchant Center**; the **Connect CLI does not expose it** — `connectorstaged list` queries only your *own* staged Connectors ([Connect CLI](https://docs.commercetools.com/connect/cli.md)).
- **Name the connector key + version you found, or record "none exists".** Availability changes; a connector you remember may be gone, and one you don't may exist.

## The trap that bites hardest in ERP: the listing is usually not a connector

More than in any other sub-area, an "ERP integration" in a marketplace or vendor catalogue is one of these:

| Shape | What it actually is | What you can promise |
|---|---|---|
| **Connect connector** | Applications Connect deploys into the project; has a public repo with a root `connect.yaml` | Install + configure (rung 1) |
| **Middleware content** | Prebuilt iPaaS flows/recipes for SAP CI, Boomi, MuleSoft, Celigo, or similar, running on that platform | Useful, but it runs on **their** platform. Connect concepts (`connect.yaml`, the CLI, lifecycle scripts) do not apply |
| **Vendor- or SI-hosted integration** | The ERP vendor, partner, or system integrator operates the integration; you configure it in their console | Follow their onboarding; no Connect deploy |
| **Accelerator / reference implementation** | A template codebase for a services engagement, sometimes archived | Read it for patterns; treat it as a fork candidate at best |

Confirm a Connect affordance — a public repo with a root `connect.yaml`, a Connect deploy action, a Merchant Center install — before calling anything installable. Full rule: [Marketplace listings are not all Connect connectors](../../../commercetools-connect/SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending).

**If the fit is middleware content or a vendor-hosted integration, say so plainly** and offer the in-skill alternative: a Connect connector that talks to that middleware's HTTPS endpoints (rung 4), which is usually a thin client plus the commercetools-side write logic. That split is often the *better* architecture anyway — the middleware owns ERP connectivity and transformation, the Connect applications own the commercetools contract.

## The fit check — run it per domain, not per connector

A connector that exports orders beautifully may do nothing for stock. Compare the Step 1 requirements table from [overview.md](./overview.md) domain by domain:

| Dimension | Question | If not covered → rung |
|---|---|---|
| **ERP + version coverage** | Is *this* ERP, at *this* version/edition, actually supported? S/4HANA ≠ ECC; Dynamics 365 F&O ≠ Business Central | Unsupported version → 3 or 4 |
| **Domains** | Which of products, prices, inventory, customers/B2B, orders, invoices does it cover? | Missing domain → config (2), else 3/4 for that domain only |
| **Direction and attribute ownership** | Does its direction model match yours, and does it respect commercetools-owned attributes? | Mismatch → 3 or 4 |
| **Counterparty** | Does it talk to the ERP directly, or to the middleware you actually have? | Wrong counterparty → 3 or 4 |
| **Write API** | Import API vs HTTP API for bulk domains, and can batch size/schedule be tuned? | Wrong API at your volume → 2 then 3 |
| **Mapping surface** | Are field mappings, code/UoM conversions, channel and store mappings configurable? | Hardcoded mapping → 2 then 3 |
| **Identity/linking** | Does it write the ERP identifiers back (`externalId`, `SyncInfo`, Custom Fields) the way your reconciliation needs? | No linkage → 3 |
| **B2B** | Business Units, Associates, contract pricing, credit, PO number, invoices | Missing → 3 or 4 |
| **Region + volume** | Supported region; sustainable at your SKU/price/stock/order volumes | Not available → different connector or 4 |
| **Maintenance** | Recent commits, published version, certification status, who answers issues | Abandoned → prefer 4 over forking |
| **Special requirements** | Each open-ended line from Step 1 (UoM, multi-plant, kits/BOM, serialized stock, cutover) | Config (2); bespoke logic (3); nothing exists (4) |

Most gaps on an existing connector are **config** — endpoints, credentials, enabled domains, mappings, schedules, batch sizes. Prove the gap is not configurable before proposing a fork or a build.

## Assessing a fork candidate

Only rung 3 if the source is available. Read the repo before promising anything:

- `connect.yaml` at the **repository root**, with the applications and configuration keys it claims.
- Which domains are actually implemented versus described in the README.
- Idempotency: are upserts keyed (`key`, `sku`, `externalId`), or does it blind-create?
- Whether Subscriptions, Custom Types, and Channels are registered idempotently in `postDeploy` and removed in `preUndeploy`.
- Test coverage of the ERP boundary, and whether the suite runs without secrets.
- Licence, activity, and open issues — a fork you own is a fork you maintain.

Score it against the [commercetools-connect production-readiness gate](../../../commercetools-connect/SKILL.md#production-readiness-checklist-the-gate). Gaps there are yours to close after forking.

## Building: what to scaffold from

There is **no ERP application template**. Scaffold from the closest architectural twin, then delete its domain logic. `commercetools connect init --template <name>` accepts only `tax-integration`, `product-ingestion`, `email-integration`, `payment-integration`, and `fulfilment-integration` ([Connect CLI](https://docs.commercetools.com/connect/cli.md), [connect-cli.md](../../../commercetools-connect/references/connect-cli.md)); anything else starts from the plain starter template ([Use a template](https://docs.commercetools.com/connect/development.md)):

| The flow you're building | Scaffold from | Why |
|---|---|---|
| Order export on `OrderCreated` (+ inbound status/document write-back) | `connect init --template fulfilment-integration` | Ships the order-export `event` and the inbound `service` wiring you need |
| A synchronous check inside a commercetools request (credit, ATP) | `connect init --template tax-integration` | The only template with API Extension wiring — take the plumbing, delete the tax logic |
| Master-data inbound as a **scheduled pull** | the **starter** template — `npm install --global @commercetools-connect/create-connect-app`, then `create-connect-app <app-name> --template typescript` — keeping only the `job` app | **No application template ships a `job` app at all**, so there is nothing closer to fork. Do not reach for `product-ingestion`: it is the Product *export* template — a `service` full-export endpoint plus an `event` incremental updater that read commercetools and write **outward**. Take it only if you also push catalog data *to* the ERP |
| An **inbound webhook** the middleware calls | `connect init --template fulfilment-integration`, keeping `inventory-import` / `order-updates` | The only template that ships inbound `service` apps. `inventory-import` (`/inventory`) is already a keyed upsert of `InventoryEntry`, so it is the right skeleton for stock and order-status pushes; for product/price inbound the domain logic differs enough that the starter template is cleaner |

A template is a starting point, not a warranty: the docs state templates need further customization before production use. Keep the generated directory layout and lifecycle-script wiring; treat the generated logic as a sketch.

## The ladder

Stop at the first rung that fits, **per domain**, and present the choice to the user with a recommendation.

0. **No replication needed** — the rung-0 gate in [overview.md](./overview.md).
1. **Use a public connector directly** — covers the in-scope domains → install and configure.
2. **The gap is config** — endpoint, credentials, enabled domains, mappings, schedule, batch size → back to rung 1.
3. **Fork** — real gap, source available → add only the delta, publish as an Organization connector.
4. **Build for the ERP or middleware endpoint the user defines** — the common case → scaffold per the table above.

Record the decision, the rung per domain, and the connector version checked in the requirements block.

## Checklist
- [ ] Ran `GET /connectors/search?integrationTypes=erp` (plus `oms`/`pim` and a `text` search) — not memory; cited key + version + `certified`/`private`
- [ ] Confirmed the shape of every candidate: Connect connector vs middleware content vs vendor/SI-hosted vs accelerator
- [ ] Fit check run **per domain**, including ERP version/edition, counterparty, write API, mapping surface, linking keys, and each special requirement
- [ ] Apparent gaps re-checked as **config** before proposing a fork or build
- [ ] Fork candidate assessed from its current repo (root `connect.yaml`, idempotency, lifecycle scripts, tests, activity) and scored against the production-readiness gate
- [ ] Build scaffolded from the closest template per flow, not hand-rolled
- [ ] Ladder presented to the user, chosen by them, and recorded per domain
