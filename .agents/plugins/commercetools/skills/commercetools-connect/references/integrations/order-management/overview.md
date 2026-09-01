---
name: order-management-integration-overview
description: Build a commercetools Connect order-management (OMS) connector — decide whether to install a public OMS connector, fork/customize one, or build a new one that syncs orders to an order-management service you define, then design and ship the sync. The order-management sub-area of commercetools-connect.
when_to_use:
  - "Integrating commercetools with an order-management system (OMS) or distributed order management via Connect"
  - "Exporting placed Orders to an OMS/ERP and syncing status, shipment, fulfillment, and inventory back"
  - "Deciding between a public OMS connector (e.g. Fluent Commerce), forking/customizing one, or building a new one for a bespoke OMS"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - order-management
    - oms
    - integration
---

# Order-management connector — build & integration

This is the **order-management sub-area** of [commercetools-connect](../../../SKILL.md): you need to connect commercetools to an order-management system (OMS) — export placed Orders downstream and keep status, shipment, fulfillment, and inventory in sync. The build-side platform contracts (event/service/job, idempotency, lifecycle, security) are the parent skill's; this sub-area owns the OMS-specific decision (**use a public connector, customize one, or build a new one**) and the **sync design** that sits on top of those contracts.

Unlike payment, order management has **no fixed connector contract** (no processor/enabler, no session BFF). It is fundamentally a **directional data-sync** problem between two systems that each hold part of the order lifecycle. So the deliverable is: the right connector choice, then a sync architecture built on the parent skill's `event` / `service` / `job` applications. For building from scratch, the Connect CLI ships a `fulfilment-integration` template whose apps (order-export, order-updates, inventory-import) map onto these flows — see [build-oms-connector.md](./build-oms-connector.md).

## Direction & source of truth (settle this first — it decides everything)

Per commercetools' integration guidance, the **Order master record usually lives downstream** in the OMS/ERP; commercetools *captures* Orders and hands them off ([Plan integrations → Order](https://docs.commercetools.com/tutorials/implementation-guide/plan-integrations.md), [Integration patterns](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md)). That yields two one-way flows, not one bidirectional one:

- **Export (commercetools → OMS):** a placed Order is pushed to the OMS for routing/fulfillment. Triggered by the `OrderCreated` Message.
- **Inbound (OMS → commercetools):** the OMS pushes status, shipment/tracking, fulfillment, and inventory back so the storefront and Merchant Center stay current.

**Avoid a bidirectional sync of the same field** — the docs call this out explicitly as a source of conflicts and loops ([Integration patterns → Key takeaways](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md)). Assign each data domain (order status, shipment, inventory, customer) a single source of truth and make the other side read-only for that domain. Mark externally-mastered fields read-only in commercetools and store the reference to the external record on the right field per resource: `Customer` has an `externalId`; the `Order` does not — use its `SyncInfo` (the `updateSyncInfo` action) or a Custom Field (see [sync-architecture.md](./sync-architecture.md)). For architecture patterns on order replication, see the [ERP integration tutorial](https://docs.commercetools.com/tutorials/erp-integration.md).

## Workflow

Follow these steps in order. The heart is **Step 1 → Step 1.5 → Step 2 → Step 3** (requirements → is a connector enough? → sync design → build).

### Step 0 — Gather context (required, run first)

The mandatory grounding step: pull the latest verified documentation as context. Use the parent connect skill's docs-search script with OMS-focused query terms. **Do not skip it, and do not replace it with another tool**:

```bash
node scripts/docs-search.mjs \
  --query "<OMS terms from the user's request, e.g. 'order export subscription OrderCreated shipment fulfillment inventory sync external system'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-connect" \
  --limit 10
```

(Run it from the `commercetools-connect` skill root, where `scripts/docs-search.mjs` lives.) Use its output as primary grounding. You *may additionally* use the commercetools Knowledge MCP or `https://docs.commercetools.com` for deeper follow-up.

### Step 1 — Extract requirements (do this before any config or code)

The connector choice and the sync design are both downstream of these. Ask the user (don't assume):

1. **Which OMS, and is there an existing connector?** Name the OMS (Fluent Commerce, kbrw, OneStock, NewStore, Pipe17, a home-grown service, …). Is a public/partner connector already deployed, or is this greenfield?
2. **Region and project?** e.g. `europe-west1.gcp`, project `my-project` — drives the `CTP_*_URL` config and the deploy region.
3. **Source of truth per domain?** Which system masters order status, shipment/tracking, inventory, and customer data? (Usually the OMS masters status/shipment/inventory once the Order is placed.)
4. **What must be exported, and when?** All Orders on `OrderCreated`, or only after payment/approval? Do split shipments / partial fulfillment / store pickup (BOPIS) apply?
5. **What comes back inbound?** Order/line-item status transitions, shipment + tracking, delivery/parcel data, cancellations, returns, inventory levels — and how does the OMS deliver them (webhook, polling, batch file)?
6. **Latency & volume?** Real-time (event + webhook) vs near-real-time vs nightly batch (job). Order and inventory volume shape the design.
7. **Data mapping?** How OMS statuses map to commercetools Order/line-item/shipment states; how SKUs/locations/channels map; where the OMS id is stored on the Order (`SyncInfo` via `updateSyncInfo`, or a Custom Field — Order has no `externalId`).
8. **Anything special or non-standard? (always ask — open-ended)** The list above covers the common shape but not everything. Prompt to jog memory: B2B (PO numbers, approvals, business units), marketplaces/split fulfillment across many vendors, returns/RMA flows, multi-currency or per-market, subscriptions/recurring orders, existing OMS contract or a specific account/tenant, custom order workflows/states, compliance or data-residency constraints. Capture each as its own requirement line; **don't force it into a slot above.**

Write these as a short requirements block and **confirm with the user** before choosing a connector or designing the sync. Flag every special requirement — each feeds the Step 1.5 fit-check and may push the decision from "use public" toward "customize" or "build".

### Step 1.5 — Is a public connector enough? (decide before wiring or building)

With the requirements in hand, answer the prior question: **does a connector that already does this exist?** Don't answer from memory — discover published connectors **programmatically** via the Connect API: `GET /connectors/search?integrationTypes=oms` (add `&integrationTypes=shipping` — there's no separate `fulfillment` type). Filter results to public/certified (`certified: true`, `private: false`), compare requirement-by-requirement, and **name the connector key + version**. Full method (query params, `IntegrationType` values, reading the result, install-vs-vendor-hosted): [connector-selection.md](./connector-selection.md).

Then walk the decision **ladder** — stop at the first rung that fits, because each later one is more to build and maintain:

1. **A connector covers everything** → install + configure. Don't build. Note the important distinction (covered in [connector-selection.md](./connector-selection.md)): some OMS marketplace listings are **installable Connect connectors** (deploy via the Connect CLI / UI), others are **vendor-hosted integrations** the OMS provider operates. Confirm which before promising a Connect deploy.
2. **A connector exists but a gap looks like a capability** → prove it isn't **config** first (mappings, which messages, which flows are often configurable). If config closes the gap, back to rung 1.
3. **A connector exists but has a genuine gap config can't close** → **fork/customize** it (if its source is available) — add only the delta and deploy as an Organization connector. Don't rebuild a working, maintained connector. → [connector-selection.md](./connector-selection.md), then the parent [commercetools-connect](../../../SKILL.md) build-side.
4. **No connector fits, or the OMS is bespoke/home-grown** → **build a new connector**, scaffolding from the `fulfilment-integration` CLI template (order-export `event` + order-updates/inventory-import `service`), adding a reconcile `job` if needed. → [build-oms-connector.md](./build-oms-connector.md).

Rungs 3–4 use the build-side workflow in the parent skill; the sync design (Step 2) applies to all four rungs. **Ask the user to choose the rung explicitly** once you have the live landscape — "install the public connector as-is", "fork/customize it", and "build a new one for our OMS" are materially different amounts of work, so give your recommendation and its reasoning, then let them decide. Record the decision, the rung, and the version in the requirements block. Full procedure and dimension table: [connector-selection.md](./connector-selection.md).

### Step 2 — Design the sync architecture (the core deliverable)

Whether you configure, fork, or build, you must pin the **sync design**: which flows exist, which commercetools Messages the export subscribes to, how inbound updates authenticate and apply, and how OMS statuses map to commercetools Order/line-item/shipment/delivery state. This is where the OMS-specific value lives and where the expensive mistakes hide (loops, lost updates, non-idempotent replays). Read [sync-architecture.md](./sync-architecture.md) and produce, for the user: the flow diagram (export / inbound / reconcile), the message-subscription list, the state-mapping table, and the idempotency strategy per flow.

### Step 3 — Build (rungs 3–4), test-first

Order management maps directly onto the parent skill's application types — **there is no OMS-specific runtime contract to learn**, so build on those references and their checklists:

- **Export** = an `event` application subscribing to `OrderCreated` (and status Messages) → [event-applications.md](../../event-applications.md). At-least-once, no ordering: idempotent on `orderNumber`/OMS id, re-fetch the Order by id, filter self-changes.
- **Inbound** = a `service` application as an **inbound webhook** the OMS calls → [service-applications.md](../../service-applications.md). Authenticate the caller, validate the payload, apply updates idempotently (upsert by key / re-check state), never blind-create.
- **Reconcile** = a `job` for nightly full sync / drift repair → [job-applications.md](../../job-applications.md). Owns its own locking and checkpointing.
- **Registration** of the Subscription and any custom types/statuses = idempotent `postDeploy` / `preUndeploy` → [lifecycle-scripts.md](../../lifecycle-scripts.md).

Build **test-first** (parent skill's Quality gate): write the failing test that names the behavior, confirm it's red for the right reason, write the least code to pass, refactor. Mock the outbound boundary (the OMS API, the commercetools API) and assert on what your code decided to do. → [testing.md](../../testing.md).

### Step 4 — Deploy

Deploy is **type-agnostic** — use the parent skill's [deployment-installation.md](../../deployment-installation.md). A **public** connector installs directly (Connect CLI `deployment create --connector-key`, or the Connect UI); a **forked/built** Organization connector goes through `connectorstaged create → publish → deployment create`. Pass the config you derived; secrets go in `securedConfiguration`, never in code.

### Step 5 — Verify the round trip

Don't declare done until a real Order has traced end to end: place an Order → confirm it appears in the OMS (export) → drive an OMS status/shipment change → confirm it reflected on the commercetools Order (inbound). Then lock it in with an integration test that drives the deployed connector and asserts the commercetools trace at each commit point, so a failure localizes the broken seam. Observability, poison-message/replay runbook, and deployment logs are in [observability-operations.md](../../observability-operations.md).

## References

| Need | Reference |
|---|---|
| **Is a connector enough?** live fit-check against marketplace OMS connectors; installable-vs-vendor-hosted distinction; the use/configure/fork/build ladder | [connector-selection.md](./connector-selection.md) |
| **Sync design**: direction & source of truth, export/inbound/reconcile flows, which Messages to subscribe to, OMS-status → CT-state mapping, idempotency per flow | [sync-architecture.md](./sync-architecture.md) |
| **Build a new connector** for a user-defined OMS (rung 4): scaffold from the `fulfilment-integration` template, which applications to declare, connecting to the OMS API | [build-oms-connector.md](./build-oms-connector.md) |
| Event app (export): envelope, ack, idempotency, re-fetch, injected destination | [event-applications.md](../../event-applications.md) |
| Service app (inbound webhook): authenticated inbound, idempotent upsert, timeout | [service-applications.md](../../service-applications.md) |
| Job app (reconcile): schedule, timeout, concurrency, checkpointing | [job-applications.md](../../job-applications.md) |
| Idempotent Subscription/custom-type registration in postDeploy/preUndeploy | [lifecycle-scripts.md](../../lifecycle-scripts.md) |
| Deploy/install (public vs forked/built), regions, redeploy | [deployment-installation.md](../../deployment-installation.md) |
| Testing (auth matrix, idempotency, ack edge cases), test-first loop | [testing.md](../../testing.md) |
| Logs + correlation IDs, health, poison-message/replay runbook | [observability-operations.md](../../observability-operations.md) |

## Checklist

Requirements
- [ ] OMS named; existing connector checked (and its type: installable Connect connector vs vendor-hosted integration)
- [ ] Region + project; source of truth fixed per domain (status, shipment, inventory, customer)
- [ ] Export scope + trigger; inbound scope + delivery mechanism; latency/volume; data mapping; OMS-id storage
- [ ] Open-ended "anything special?" asked; each special requirement captured as its own line
- [ ] Requirements block written and confirmed; special requirements flagged into Step 1.5

Connector fit (decide before wiring/building)
- [ ] Checked live marketplace + docs (not memory); named connector + version
- [ ] Confirmed installable-vs-vendor-hosted before promising a Connect deploy
- [ ] Apparent gaps re-checked as config before considering fork/build
- [ ] Ladder rung **presented to the user and chosen by them**: use (1) · configure (2) · fork/customize (3) · build new (4); decision recorded

Sync design (the deliverable)
- [ ] Direction fixed; no bidirectional sync of the same field
- [ ] Flows enumerated: export (event), inbound (service webhook), reconcile (job) as needed
- [ ] Export subscribes to the right Messages (`OrderCreated`, status transitions); inbound applies idempotently
- [ ] OMS-status → CT Order/line-item/shipment/delivery state mapping table produced
- [ ] Idempotency strategy stated per flow (orderNumber/OMS id; upsert by key; re-fetch by id)

Build & ship (rungs 3–4)
- [ ] Built test-first on the parent event/service/job references and their checklists
- [ ] Subscription + custom types registered idempotently in postDeploy; cleaned up in preUndeploy
- [ ] Deployed via the type-agnostic deploy flow; secrets in securedConfiguration
- [ ] Round trip verified (Order → OMS → status back to CT); integration test asserts the CT trace
