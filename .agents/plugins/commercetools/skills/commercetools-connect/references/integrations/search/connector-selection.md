---
name: search-connector-selection
description: Decide whether native commercetools Product Search suffices, or whether to use a public search connector as-is, fork one, or scaffold from the Product export template for an engine you define — with the rung-0 native gate, the live-marketplace check, and the hosted-integration-is-not-a-Connect-connector trap. The search sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - search
    - connect
---

# Native, use, fork, or build?

This answers Step 1.4 / 1.5 of [overview.md](./overview.md). Search differs from PIM and marketplace in one decisive way: **commercetools ships a capable search engine of its own**, so the first question is not "which connector?" but "does this need an external engine at all?"

## Rung 0 first — is this native?

Before any marketplace lookup, test the requirement against the native surface ([storefront-search-overview](https://docs.commercetools.com/api/storefront-search-overview.md)):

| Native capability | Covers |
|---|---|
| [Product Search](https://docs.commercetools.com/api/projects/product-search.md) | Full-text, fuzzy/prefix/wildcard matching, faceting (distinct/range/count/stats/filtered), sorting, price/Store/Product-Selection scoping. GA June 2024; facets GA October 2025 ([Use Product Search](https://docs.commercetools.com/learning-implement-product-discovery-and-presentation/build-product-listing-pages/use-product-search.md)) |
| [Product Projection Search](https://docs.commercetools.com/api/projects/product-projection-search.md) | The older search endpoint — full-text, filters, facets, `localeProjection`/`storeProjection`; returns full projections rather than ids |
| Scoping | Price selection (currency/country/Customer-Group/Channel), `storeProjection`, and B2B assortment scope resolve a buyer's prices and catalog in the same query ([Product Search for B2B](https://docs.commercetools.com/learning-model-b2b-commerce/discover-and-order-products-in-b2b/product-search-for-b2b-catalogs.md)) |

**Stop at rung 0** when the requirement is basic product discovery: full-text search, typo tolerance, prefix/type-ahead, facets, sort, and price/Store scoping for a PLP or search results page. An external engine here adds a standing indexing pipeline, an eventual-consistency lag, a per-record/query cost, and an availability dependency — for behavior the platform already has. Say so plainly and stop.

**Go past rung 0** when the requirement needs capabilities that are genuinely a **discovery platform**: visual or AI-driven merchandising and manual curation, synonym / redirect / query-rule sets managed by a merchandiser, recommendations ("customers also bought"), search analytics dashboards, A/B testing of ranking, learned or personalized ranking, or a discovery engine the front end is already committed to. Note the platform docs' own framing: native search plus API Extensions covers a wider band than people assume — some needs are a small extension over native, not a whole engine.

Also check the **converse**: if the customer already owns an engine licence and their merchandising team works in it daily, "use native instead" is usually not a real option even when the query needs are simple — the requirement is *merchandising in the engine*, which is rung 1+.

## Check live data — don't answer from memory

Listings and engine capabilities change. Before deciding among rungs 1/3/4:

1. Search the **Connect marketplace** ([`marketplace.commercetools.com/connectors`](https://marketplace.commercetools.com/connectors)) and the search/discovery listings, plus the docs via the `docs-search` script or the Knowledge MCP.
2. **Distinguish an installable Connect connector from a vendor-hosted integration** — apply the parent skill's [Marketplace listings are not all Connect connectors](../../../SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending) rule; don't re-derive it here. It bites hard in search specifically (below).
3. Compare the requirement engine-by-capability (indexing, merchandising, synonyms, recommendations, analytics, per-Store scope, locales).
4. **Name the connector/engine and version** you checked, and record it in the requirements block.

### The hosted-integration trap (search's sharpest case)

Several engines ship their **own** commercetools integration configured entirely in the engine's dashboard — Algolia's "Algolia for commercetools" is the textbook example. These are **vendor-hosted integrations, not deployable Connect connectors**: there is no `connect.yaml`, nothing for Connect to deploy, and this skill cannot build or operate them. If one is a good functional match, surface it **with a warning that it is not a Connect solution** — the customer configures it in the engine, and there is no connector to build — then, if they need a Connect-deployed pipeline (own the mapping, run it in Connect's infrastructure, no dashboard dependency), offer the fork/build path below.

## The search landscape (verify live — this is only the shape)

As checked 2026-08:

| Artifact | What it is | Default rung |
|---|---|---|
| **Product export template** ([`commercetools/connect-product-export-template`](https://github.com/commercetools/connect-product-export-template)) | The official Connect scaffold for outbound catalog export, explicitly positioned "for external services such as search". Store-specific: `full-export` (`service`, `/fullSync`) + `incremental-updater` (`event`, `/deltaSync`) | **4 (build)** — start here for any engine |
| **`commercetools/launchpad-algolia-sync`** | An open-source worked Algolia example built on that same two-app shape (`full-ingestion` + `incremental-updater`) | **3 (fork)** for Algolia — read the repo live before forking |
| **Engine dashboard integrations** (e.g. "Algolia for commercetools") | Vendor-hosted, dashboard-configured — **not** a Connect connector | outside this skill — surface with the not-a-Connect-solution warning |
| Bespoke / unsupported engine | Nothing to install | **4 (build)** — scaffold from the Product export template |

Unlike promotion/marketplace/CRM, search is a **templated** sub-area: the [Product export template](https://docs.commercetools.com/connect/templates/product-export.md) hands you both app stubs (it is one of the four current [Connect templates](https://docs.commercetools.com/connect/templates/templates-overview.md) — `payment-integration`, `product-export`, `tax-integration`, `transactional-emails`). So even a from-scratch engine is rung 4 *from a scaffold*, not from nothing. Budget accordingly — the plumbing exists; what you write is the engine's SDK calls and the mapping.

## The ladder (stop at the first rung that fits)

0. **Native Product Search is enough** → build **no connector** (above). Say why and stop.
1. **A public connector for the engine covers everything, and it's a real Connect connector** → install + configure it. Installation (CLI auth, scopes, `deployment create`) is the parent skill's [deployment-installation.md](../../deployment-installation.md). Hand it the config from [config-from-requirements.md](./config-from-requirements.md).
2. **Right engine, gap looks like a capability** → prove it isn't **config** first (index name, which fields are indexed, locale/price context, which Store). Most "missing" behavior is a `connect.yaml` value or engine-side setting → back to rung 1.
3. **Right engine, genuine gap config can't close, and source exists** → **fork** it (for Algolia, `launchpad-algolia-sync`), add only the delta, deploy as an Organization connector. Assess the candidate from its **current repo** (root `connect.yaml`, the `full`/`incremental` handlers, the mapping, `inheritAs.apiClient.scopes` vs hand-supplied credentials) — not from memory.
4. **No usable connector for the engine (a bespoke or unsupported engine)** → **build** by scaffolding from the [Product export template](https://docs.commercetools.com/connect/templates/product-export.md) and implementing the engine's client + the mapping. What you build is [search-contract.md](./search-contract.md); config is [config-from-requirements.md](./config-from-requirements.md).

**Ask the user to choose between rungs 1, 3, and 4 explicitly** once you have the live landscape — "use it as-is", "fork it", or "build for our engine" are materially different amounts of work and the choice is theirs. Present rung 0 first if it applies at all. Only rungs 3–4 leave this sub-area (hand off to the parent [commercetools-connect](../../../SKILL.md) skill for the build/stage/publish lifecycle); the flow resumes here once the connector is deployed.

## Recording the decision

In the requirements block, note: **engine · rung · connector/template + version checked · why**. Examples:

> *Search: none · rung 0 · checked requirements 2026-08 — "typo-tolerant search with brand/size facets and price sort" is native Product Search; no engine, no connector.*

> *Search: Algolia · rung 3 (fork) · checked marketplace 2026-08 — the dashboard "Algolia for commercetools" is vendor-hosted (not Connect); forking the open-source `launchpad-algolia-sync` to add per-locale indices and migrate its hand-supplied CTP credentials to `inheritAs.apiClient.scopes`.*

> *Search: in-house "DiscoverSvc" · rung 4 (build) · checked marketplace 2026-08 — no listing → scaffolding from the Product export template (`full-export` service + `incremental-updater` event) and writing the engine client + mapping.*
