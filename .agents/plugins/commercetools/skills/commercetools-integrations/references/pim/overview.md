---
name: pim-integration-overview
description: Build or integrate a commercetools Connect connector that syncs product data from a Product Information Management (PIM) system (e.g. Akeneo) into commercetools — the sync-focused workflow (requirements → is a public connector enough? → configure, fork, or build → data mapping → sync architecture → verify). The PIM sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - pim
    - connect
---

# PIM connector — product data sync (build or integrate)

This is the **PIM integration sub-area** of this skill: getting product data out of a Product Information Management system (Akeneo, inriver, Bluestone, Pimcore, Contentserv, Syndigo, or a bespoke PIM) and into commercetools as Products, Product Types, Categories, Prices, and media. The build-side platform contracts (service/event/job semantics, `connect.yaml`, lifecycle scripts, testing, deploy) are the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill; this sub-area owns the **PIM-specific job end to end** — from "is there a connector already?" through configuring one, forking it, or building one, to the data model mapping and sync architecture that decide whether the catalog stays correct.

**Direction.** A PIM connector is almost always **external system → commercetools** (the PIM is the source of truth for product content; commercetools stores the sellable catalog). This is the *inbound* direction — the opposite of the [product-export template](https://docs.commercetools.com/connect/templates/product-export.md), which pushes commercetools → external. A minority of setups are **bi-directional** (some attributes edited in the Merchant Center flow back); decide this in Step 1, because it changes ownership and conflict rules. Don't assume bi-directional — it is the expensive case.

**Two things a PIM connector is *not*.** It does not own the Cart/Order/Payment flow (that's the [payment sub-area](../payment/overview.md)), and there is no browser/enabler touchpoint — a PIM connector is pure backend data movement (a `service` inbound webhook and/or a `job`), so this whole sub-area is server-side.

## Workflow

Follow these steps in order. The heart is **Step 1 → Step 1.5 → Step 3 (data mapping)** — mapping is where PIM integrations succeed or rot, whether you configure a public connector or build your own.

### Step 0 — Gather context (required, run first)

The mandatory grounding step: pull the latest verified documentation as context for you (the agent). Use this skill's docs-search script with PIM-focused query terms. **Do not skip it, and do not replace it with another tool:**

```bash
node scripts/docs-search.mjs \
  --query "<PIM terms from the request, e.g. 'product data integration import API product type attribute mapping categories'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-integrations" \
  --limit 10
```

(Run it from the `commercetools-integrations` skill root, where `scripts/docs-search.mjs` lives.) The two most load-bearing docs for this sub-area are the [Integrate product data tutorial](https://docs.commercetools.com/tutorials/product-data-integrations.md) and the [Import API overview](https://docs.commercetools.com/api/import-export/overview.md) — read them. You *may additionally* use the commercetools Knowledge MCP for deeper follow-up.

### Step 1 — Extract requirements (before any config or code)

The architecture is downstream of a handful of answers ([docs: Plan your product data integration](https://docs.commercetools.com/tutorials/product-data-integrations.md#plan-your-product-data-integration)). Ask the user — don't assume:

1. **Which PIM system, and is a connector deployed?** Name and version. If a public connector is in play, get its marketplace listing and version.
2. **Source of truth per attribute.** Which system owns which field? A PIM typically owns enriched content (names, descriptions, images, specs); an ERP may own SKU/price/inventory. Multiple sources add sequencing and conflict rules.
3. **Direction — one-way or bi-directional?** One-way (PIM → commercetools) is the simple, recommended default. Bi-directional means defining which attributes sync back and how conflicts resolve — flag it as expensive.
4. **Is product data editable in the Merchant Center?** If product managers edit in commercetools, decide which attributes are read-only from the PIM (enforce with an [AttributeGroup](https://docs.commercetools.com/api/projects/attribute-groups.md) so externally-owned fields can't be hand-edited).
5. **Cadence — full vs incremental, event-driven vs bulk?** Initial load and periodic refresh are *full/bulk*; time-critical fixes are *incremental*. Real-time correctness → *event-driven*; large nightly volumes → *bulk/scheduled*. → drives `job` vs `service`-webhook (Step 4).
6. **Volume and locales.** Catalog size (drives Import API vs HTTP API) and which locales/currencies/channels are in scope (drives localization mapping).
7. **What to sync, and what NOT to.** Product Types, products/variants, categories, media, prices, inventory — and explicitly what to leave behind. Not every PIM attribute belongs in commercetools; map only commerce-relevant data.
8. **Price and inventory ownership.** Even if they come from the same system, treat them as *separate* integrations (they update far more often than content) — confirm where they originate.
9. **Anything special? (always ask — open-ended)** Reference entities / related products, measurement-unit conversion, variant/family modeling quirks, publish/staging rules, channel- or store-specific catalogs (Product Selections / Product Tailoring), approval workflows, GDPR/PII in product data. Capture each as its own requirement line; don't force it into a slot above.

Write these as a short requirements block and **confirm with the user** before choosing an approach.

### Step 1.5 — List the available connectors, then offer install or modify (before building)

Lead with what already exists. Don't answer from memory — the [Connect marketplace](https://marketplace.commercetools.com/integrations/product-information-management) changes. **Check live and show the user the public PIM connectors that fit their PIM first** (name, vendor, direction, what it syncs); there are several (Akeneo, Bluestone, Contentserv, inriver, Pimcore, Syndigo, …), so don't assume Akeneo. **Verify each candidate is an actually deployable Connect connector, not just a marketplace listing** — the category also contains partner/SaaS integrations that are *not* commercetools Connect applications. A listing can be a great functional match yet be impossible to deploy through Connect; if so, surface it **with a warning that it is not a Connect solution and this skill likely cannot implement/deploy it**, and offer the build/fork path instead ([connector-selection.md](./connector-selection.md)). When a listed connector *is* Connect-deployable and matches the PIM, present the two low-effort paths and let the user choose — **install it as-is (configure)** or **modify it (fork)** — and only fall to build when no listed connector matches. Name the connector + version you checked. Then walk the ladder — stop at the first rung that fits:

1. **Public connector covers it** (and is Connect-deployable) → install + configure. Don't build. (Deploying a public connector: [`deployment-installation.md`](../../../commercetools-connect/references/deployment-installation.md) in the commercetools-connect skill.)
2. **Right PIM, gap looks like a capability** → prove it isn't **config / attribute mapping** first. Most "missing" behavior on a supported PIM (which attributes map where, locale/channel selection, category mapping) is configuration, not missing code → back to rung 1.
3. **Right PIM, genuine gap config can't close** → **fork/extend the public connector** and deploy it as an Organization connector — you keep the working sync engine and change only the delta. → [build-connector.md](./build-connector.md), hand off to [commercetools-connect](../../../commercetools-connect/SKILL.md).
4. **No public connector for the PIM at all** → **build one** using the connect skill's `service` (inbound webhook) and/or `job` patterns, ingesting via the Import API or HTTP API. → [build-connector.md](./build-connector.md).

Full procedure and the dimension-by-dimension fit table: [connector-selection.md](./connector-selection.md). Record the decision, the rung, and the version in the requirements block.

### Step 2 — If configuring a public connector: derive its config

Translate the Step 1 answers into the connector's `connect.yaml` configuration and its attribute-mapping setup (most PIM connectors externalize the field mapping as config, not code). The `connect.yaml` envelope rules — documented keys only (no invented fields), file at the repo root — are the same as any connector; see the payment sub-area's [config-from-requirements pattern](../payment/config-from-requirements.md#the-connectyaml-envelope) for the envelope and [deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md). For the **provider-specific config keys and concept names**, read the chosen connector's **own current docs/repo** (looked up live) — don't rely on a hardcoded per-vendor table, which goes stale; the vendor-neutral mapping method is [data-mapping.md](./data-mapping.md).

### Step 3 — Data mapping (the heart — applies to configure *and* build)

Whether you configure a public connector or build one, the make-or-break work is mapping the PIM's model onto commercetools' product model: Product Type strategy (never 1:1 with PIM families), attribute mapping (search-critical vs consolidated JSON), localization, category tree, media, and keeping price/inventory separate — all keyed for idempotent upsert. This is [data-mapping.md](./data-mapping.md). Get it wrong and the catalog drifts no matter how good the plumbing is.

### Step 4 — If building/forking: sync architecture

Pick the Connect application shape from the cadence in Step 1 (event-driven webhook `service`, scheduled `job`, or both) and the ingestion API from volume (Import API for bulk/async, HTTP API for real-time), then make every write idempotent. This is [build-connector.md](./build-connector.md); it hands the type-agnostic build contracts (service/job semantics, security, testing, deploy) back to the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill.

### Step 5 — Verify the sync

Don't declare done until a real product change has flowed end to end: change it in the PIM (or trigger the job) → confirm the Product exists in commercetools with the mapped attributes, category assignment, and localized content, and that a *re-run leaves it unchanged* (idempotency). For bulk imports, poll the [Import Container](https://docs.commercetools.com/api/import-export/import-container.md) summary until operations reach a terminal state and inspect any `rejected`/`validationFailed` operations — reference resolution succeeding is **not** the same as the data being valid.

Do this safely: test the mapping with pure unit tests first, then run a **bounded sync against a sandbox project only** (never production), gated by a pre-flight item count that warns on large catalogs. The two-layer approach, the sandbox-credential and catalog-size guards, and the idempotency re-run are in [testing.md](./testing.md).

## References

| Need | Reference |
|---|---|
| **Is a public connector enough?**: live marketplace check, named PIM connectors, fit dimensions, the configure/fork/build ladder | [connector-selection.md](./connector-selection.md) |
| **Data mapping (the substance)**: Product Type strategy, attribute mapping, localization, categories, media, price/inventory separation, keys & idempotency, source-of-truth | [data-mapping.md](./data-mapping.md) |
| **Build or fork a connector**: Import API vs HTTP API, `service` webhook vs `job` (vs both), full vs incremental, idempotent upsert, dependency resolution, delete handling | [build-connector.md](./build-connector.md) |
| **Testing & safely running a sync**: pure mapping unit tests, then a bounded sandbox-only live run with pre-flight item count, catalog-size gate, and idempotency re-run | [testing.md](./testing.md) |
| Deploy/install a public or custom connector; regions; certification | [`commercetools-connect` → deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md) |
| Inbound webhook auth, least-privilege scopes, secured config | [`commercetools-connect` → security.md](../../../commercetools-connect/references/security.md) |
| Scheduled/on-demand job: schedule, 30-min timeout, overlap locking, checkpointing | [`commercetools-connect` → job-applications.md](../../../commercetools-connect/references/job-applications.md) |
| Structured logs, health, poison-message/replay runbook | [`commercetools-connect` → observability-operations.md](../../../commercetools-connect/references/observability-operations.md) |

This sub-area is **vendor-neutral by design** — the requirements, the data-mapping method, and the sync architecture are the same for any PIM (Akeneo, inriver, Bluestone, …). Don't add per-vendor reference files: they duplicate [data-mapping.md](./data-mapping.md) and go stale on connector specifics. Instead, look up the specific connector and its config **live** (marketplace + the connector's own docs/repo, per [connector-selection.md](./connector-selection.md)) and apply the vendor-neutral mapping method to whatever PIM vocabulary you find.

## Checklist

Requirements
- [ ] PIM system + version; whether a public connector is deployed (and its version)
- [ ] Source of truth per attribute; direction (one-way default, bi-directional flagged as expensive)
- [ ] Editable-in-MC decision; externally-owned attributes marked read-only (AttributeGroup)
- [ ] Cadence (full/incremental, event/bulk); volume; locales/currencies/channels in scope
- [ ] What to sync and what to leave behind; price & inventory treated as separate integrations
- [ ] Asked the open-ended "anything special?" question; each special requirement captured as its own line
- [ ] Requirements block written and confirmed with the user

Connector fit (decide before wiring/building)
- [ ] Checked the **live** marketplace (not memory); named the connector + version
- [ ] Verified the candidate is a **deployable Connect connector**, not a partner/SaaS integration listing; a good-match non-connector surfaced with the not-a-Connect-solution warning
- [ ] PIM, direction, and sync scope compared to the requirements; apparent gaps re-checked as config/attribute-mapping
- [ ] Ladder rung **presented to the user and chosen by them**: configure (1) · config/mapping-closes-gap (2) · fork/extend (3) · build (4)

Data mapping (the deliverable that decides correctness)
- [ ] Product Type strategy chosen (flexible attributes, **not** 1:1 with PIM families); search-critical attributes mapped, supplementary consolidated
- [ ] Localization, categories, and media mapped; price/inventory kept separate
- [ ] Every resource keyed for idempotent upsert

Sync / verify
- [ ] Application shape matches the cadence; ingestion API matches the volume; writes idempotent
- [ ] Mapping unit-tested; live sync run **against a sandbox only** (never production), pre-flight item count run and large catalogs gated → [testing.md](./testing.md)
- [ ] A real change flowed end to end; a re-run left the catalog unchanged; bulk imports polled to terminal state with rejects inspected
