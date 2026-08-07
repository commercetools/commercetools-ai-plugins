---
name: search-integration-overview
description: Build or integrate a commercetools Connect connector that indexes the product catalog into an external search / product-discovery engine (Algolia, Constructor, Bloomreach, Coveo, Elasticsearch, Typesense, Meilisearch, …) — the outbound workflow (rule out native Product Search first → requirements → use / fork / build → data mapping → sync architecture → verify). The search sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - search
    - connect
---

# Search connector — outbound catalog indexing (build or integrate)

This is the **search integration sub-area** of [commercetools-connect](../../../SKILL.md): getting the product catalog *out* of commercetools and into an external search / product-discovery engine (Algolia, Constructor, Bloomreach Discovery, Coveo, Elasticsearch, Typesense, Meilisearch, or a bespoke engine) so a storefront can query it. The build-side platform contracts (service/event/job semantics, `connect.yaml`, lifecycle scripts, testing, deploy) are the parent connect skill; this sub-area owns the **search-specific job end to end** — from "do you even need an external engine?" through configuring, forking, or building the connector, to the data mapping and sync architecture that keep the index correct.

**Direction.** A search connector is **commercetools → external engine** (commercetools is the source of truth for the catalog; the engine holds a denormalized copy optimized for query). This is the *outbound* direction — the same as the [product-export template](https://docs.commercetools.com/connect/templates/product-export.md), and the opposite of the inbound [PIM](../pim/overview.md) / [CRM](../crm/overview.md) sub-areas. commercetools does not read back from the engine.

**Two things a search connector is *not*.** It does **not** touch the Cart/Order hot path — there is **no API Extension** and no synchronous call at checkout — and there is no browser/enabler contract; it is pure backend data movement (a `service`/`job` full load plus an `event`/`job` that keeps it fresh), so this whole sub-area is server-side. The engine's **relevance configuration** (searchable fields, ranking, synonyms, merchandising rules, A/B tests) is owned *in the engine*, not here — the connector only feeds it correct, current data.

## Workflow

Follow these steps in order. The heart is **Step 1.4 (native gate) → Step 2 (data mapping) → Step 3 (the two apps)** — ruling out native search can end the project on day one, and the mapping is where an external index stays correct or silently rots.

### Step 0 — Gather context (required, run first)

The mandatory grounding step: pull the latest verified documentation as context for you (the agent). Use the parent connect skill's docs-search script with search-focused query terms. **Do not skip it, and do not replace it with another tool:**

```bash
node scripts/docs-search.mjs \
  --query "<search terms from the request, e.g. 'integrate external search product export product projections staged product search subscriptions'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-connect" \
  --limit 10
```

(Run it from the `commercetools-connect` skill root, where `scripts/docs-search.mjs` lives.) The load-bearing docs for this sub-area are the two tutorials — [Integrate external search](https://docs.commercetools.com/tutorials/search-integration.md) (whole-catalog) and [Populate a Store-specific external search](https://docs.commercetools.com/tutorials/store-specific-external-search.md) (Store/Product-Selection-scoped) — the [Product export template](https://docs.commercetools.com/connect/templates/product-export.md) (the official scaffold), and, for the native gate, the [Storefront search overview](https://docs.commercetools.com/api/storefront-search-overview.md). Read them. You *may additionally* use the commercetools Knowledge MCP for deeper follow-up.

### Step 1 — Extract requirements (before any config or code)

The architecture is downstream of a handful of answers. Ask the user — don't assume:

1. **Which engine, and why this one over native?** Algolia, Constructor, Bloomreach, Coveo, Elasticsearch/OpenSearch, Typesense, Meilisearch, or undecided. Do they already have an account + API keys? If undecided, Step 1.4 may end at rung 0 (native).
2. **What can native Product Search *not* do?** Name the specific need — merchandising/curation, synonyms and query rules, recommendations, search analytics, A/B testing, learned ranking, or a headless engine the front end already talks to. "Typo-tolerant full-text with facets" is **native** ([storefront-search-overview](https://docs.commercetools.com/api/storefront-search-overview.md)) — say so (Step 1.4).
3. **Whole-catalog or Store-specific?** One global index, or a Store-scoped index driven by [Product Selections](https://docs.commercetools.com/api/projects/product-selections.md) / [Product Tailoring](https://docs.commercetools.com/api/projects/product-tailoring.md)? This picks the tutorial and the projection endpoint (Step 3).
4. **Which locales?** Drives index-per-locale vs per-locale fields (`localeProjection`).
5. **Which price context(s)?** Currency, country, Customer Group, Channel — a record can't hold every combination; you must pick (Step 2).
6. **Does availability/inventory belong in the index?** High-churn and eventually consistent — usually a deliberate *no* or a coarse flag, never the live stock system of record.
7. **Record granularity — product-level or variant-level?** A UX decision (one hit per product vs one per variant) that shapes the whole document.
8. **Catalog volume and cadence.** Size drives batch/pagination; real-time correctness → event-driven, large periodic rebuilds → scheduled `job`.
9. **Anything special? (always ask — open-ended)** B2B/scoped assortments, multi-currency budgets, category-tree depth, staged-vs-published rules, GDPR in product data. Capture each as its own requirement line; don't force it into a slot above.

Write these as a short requirements block and **confirm with the user** before choosing an approach.

### Step 1.4 — Rung 0: is native search enough? (STRONG — rule it out first)

commercetools ships its **own** search: [Product Search](https://docs.commercetools.com/api/projects/product-search.md) and [Product Projection Search](https://docs.commercetools.com/api/projects/product-projection-search.md) cover full-text, fuzzy/prefix/wildcard matching, faceting, and price/Store/Product-Selection scoping ([storefront-search-overview](https://docs.commercetools.com/api/storefront-search-overview.md); Product Search reached general availability in June 2024, with facets GA in October 2025 — [Use Product Search](https://docs.commercetools.com/learning-implement-product-discovery-and-presentation/build-product-listing-pages/use-product-search.md)). An external engine is a **standing indexing pipeline to own, secure, and pay for**, plus an eventual-consistency lag and an operational dependency on the cart-adjacent PLP.

**Stop at rung 0** when the requirement is basic PLP/search — full-text, typo tolerance, facets, sort, price/Store scoping. Say so plainly and stop; do not build a connector for what the platform already does. **Go past rung 0** only when a stated need genuinely exceeds native: visual/AI merchandising and curation, synonym/redirect rule sets, recommendations, search analytics dashboards, A/B testing, learned/personalized ranking, or a discovery engine the front end is already committed to. The full gate and the native-capability table are in [connector-selection.md](./connector-selection.md).

### Step 1.5 — Native, use, fork, or build?

Once native is ruled out, decide the path — use a public connector, fork one, or scaffold from the Product export template — from **live** marketplace data, and watch the hosted-integration trap (an engine's own dashboard-configured integration is not a deployable Connect connector). Full procedure and fit table: [connector-selection.md](./connector-selection.md).

### Step 2 — Data mapping (the heart)

Whether you configure a connector or build one, the make-or-break work is mapping a commercetools [Product Projection](https://docs.commercetools.com/api/projects/productProjections.md) onto a flat, denormalized search document: id/`objectID` keying, record granularity, the price-context explosion, localization, category denormalization, Store assortment, and where (if anywhere) availability belongs. This is [data-mapping.md](./data-mapping.md). Get it wrong and the index drifts no matter how good the plumbing is.

### Step 3 — Sync architecture (the two apps)

A search integration is **two jobs**, mirrored by two apps: a **full ingestion** (`service` on-demand trigger or scheduled `job`) that reindexes the whole catalog atomically, and an **incremental updater** (`event` on product/store/selection Subscriptions, or a polling `job`) that keeps it fresh. The contract for each, and the pitfall catalog, is [search-contract.md](./search-contract.md); the `connect.yaml` config derived from Step 1 is [config-from-requirements.md](./config-from-requirements.md). The official scaffold is the [Product export template](https://docs.commercetools.com/connect/templates/product-export.md).

### Step 4 — Deploy

Deploying a public or custom connector (CLI auth, scopes, `deployment create`, regions, certification) is the parent skill's [deployment-installation.md](../../deployment-installation.md).

### Step 5 — Verify the sync

Don't declare done until a real product change has flowed end to end: publish → the record appears in the index; unpublish/delete → it's gone; a full ingestion → counts match the published catalog; a re-run leaves the index unchanged. The checks and the traps that look like bugs but aren't (eventual-consistency lag, availability drift, a non-atomic rebuild) are in [verification.md](./verification.md).

## References

| Need | Reference |
|---|---|
| **Native, use, fork, or build?**: the rung-0 native-search gate, the live-marketplace check, the hosted-integration trap, scaffolding from the Product export template | [connector-selection.md](./connector-selection.md) |
| **Requirements → config**: the search document shape, index/engine keys, `connect.yaml` envelope, scopes, secured config; worked example | [config-from-requirements.md](./config-from-requirements.md) |
| **Data mapping (the substance)**: projection → flat document, `objectID` keying, record granularity, price-context explosion, localization, category denormalization, Store assortment, availability boundary | [data-mapping.md](./data-mapping.md) |
| **The two-app contract**: full ingestion (cursor pagination, atomic/blue-green reindex, count check) + incremental updater (idempotent upsert, deletion propagation, staleness guard); full pitfall catalog | [search-contract.md](./search-contract.md) |
| **Verify the sync**: publish/unpublish/delete/full-load/idempotency/per-store checks; the eventual-consistency, availability-drift, and non-atomic-rebuild traps | [verification.md](./verification.md) |
| Deploy/install a public or custom connector; regions; certification | [`commercetools-connect` → deployment-installation.md](../../deployment-installation.md) |
| Least-privilege scopes, secured config, engine-key handling | [`commercetools-connect` → security.md](../../security.md) |
| Scheduled/on-demand job: schedule, 30-min timeout, overlap locking, checkpointing | [`commercetools-connect` → job-applications.md](../../job-applications.md) |

This sub-area is **vendor-neutral by design** — the requirements, the native gate, the data-mapping method, and the two-app architecture are the same for any engine (Algolia, Constructor, Bloomreach, Elasticsearch, …). Don't add per-engine reference files: they duplicate [data-mapping.md](./data-mapping.md) and go stale on engine specifics. Instead, look the specific engine and any connector up **live** (marketplace + the engine's own SDK/docs, per [connector-selection.md](./connector-selection.md)) and apply the vendor-neutral mapping method to whatever index vocabulary you find.

## Checklist

Requirements
- [ ] Engine chosen (or deliberately deferred) + account/API keys; whole-catalog vs Store-specific decided
- [ ] The specific need native Product Search **cannot** meet is named — not just restated as "search"
- [ ] Locales, price context(s), and record granularity (product vs variant) decided
- [ ] Availability-in-index decision made deliberately (usually no / coarse flag)
- [ ] Volume + cadence captured; asked the open-ended "anything special?" question, each special its own line
- [ ] Requirements block written and confirmed with the user

Path (decide before wiring/building)
- [ ] **Rung 0 ruled out explicitly** — native Product Search / Product Projection Search can't do it, and you said why
- [ ] Checked **live** marketplace + docs (not memory); a hosted engine integration surfaced with the not-a-Connect-connector warning
- [ ] Path chosen: use (1) · config-closes-gap (2) · fork (3) · build-from-template (4)

Mapping + sync (the deliverables)
- [ ] Projection → flat document mapped; `objectID` keyed for idempotent upsert; price context and localization resolved → [data-mapping.md](./data-mapping.md)
- [ ] Full ingestion reindexes **atomically** and verifies counts; incremental updater is idempotent and **propagates deletions** → [search-contract.md](./search-contract.md)
- [ ] A real change flowed end to end; a re-run left the index unchanged → [verification.md](./verification.md)
