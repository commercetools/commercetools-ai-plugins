---
name: commercetools-integrations
description: Ecosystem integration patterns — CMS (Contentstack, Contentful, Sanity, Storyblok), OMS (Manhattan, Fluent, OneStock), PIM (Akeneo, Salsify, inriver), ERP (SAP, NetSuite, Oracle), and search (Algolia, Elasticsearch — external sync architecture, document shape, price/inventory freshness). Use when the question is about wiring commercetools with a specific third-party system.
when_to_use:
  - "Wiring ct with a CMS: Contentful, Contentstack, Sanity, Storyblok"
  - "External search sync architecture: Algolia, Elasticsearch — subscription-based index updates"
  - "Standalone price subscription for search index freshness"
  - "OMS integration: order hand-off, fulfillment status callbacks"
  - "PIM integration: Akeneo, Salsify, inriver — product data import pipelines"
  - "ERP integration: SAP, NetSuite, Oracle — order ledger sync, inventory updates"
  - "Integration architecture patterns: middleware, direct, event bus"
  - "CT system-of-record boundaries — what lives in CT vs external systems"
metadata:
  contentType: SKILL
  area:
    - integration
    - search
---

# commercetools Integrations

Patterns for wiring commercetools with external systems. Covers the integration architecture decision framework, external search sync, and integration touchpoints for CMS, OMS, PIM, and ERP systems.

## Key Takeaways

**CT native search eliminates the external index sync problem.** The single largest hidden cost of external search (Algolia, Elasticsearch) is the sync pipeline — subscribing to product, price, and inventory events, transforming CT projections into index documents, handling partial failures, and maintaining schema alignment as the catalog evolves. CT native search removes this entirely. For B2B use cases and multi-store storefronts, CT native search now handles standalone prices, store scoping, and product selection filtering natively.

**The real competitive threat of external search is deal cost.** A CT customer paying €395K ACV can expect to pay an additional €80K–€200K for Algolia or Constructor on top. Native search closes this gap for most use cases.

**CT native search competitive gaps are autocomplete, merchandising UI, and analytics.** As of mid-2026, CT does not provide: (1) out-of-the-box predictive autocomplete with typo tolerance, (2) a visual merchandising UI for managing rankings and pinning products, or (3) a built-in search analytics dashboard. If these are day-one requirements, an external search provider is justified.

**For external search, subscribe to the right message types for price freshness.** Subscribe to `ProductPublished` for catalog changes. For standalone prices, subscribe separately to `StandalonePriceCreated`, `StandalonePriceChanged`, and `StandalonePriceDeleted` — these are not included in product messages.

**External search index documents must be denormalized.** Category names, brand labels, and other referenced resource names should be resolved and embedded in the index document at sync time. Looking them up at query time from CT adds latency and complexity.

**Never use the indexed price as the source of truth for cart creation.** Always resolve price in CT at cart time. The search index may be stale.

**Define CT system-of-record boundaries before designing integrations.** CT owns: order lifecycle, cart, customer profile, inventory, pricing (unless external). CT does not own: warehouse management (WMS), fulfillment execution, marketing automation, CMS content.

**For PIM integration, use the Import API with `productVariantPatch` for targeted attribute updates.** Full product reimport (`productDraftImport`) is destructive — it deletes any fields not included in the draft. Use `productDraftImport` only when you own the complete product data shape.

---

## Reference Index

| Topic | Reference | Source |
|-------|-----------|--------|
| Native vs. external search decision framework — when CT native wins, competitive gaps, TCO analysis | [references/native-search-vs-external.md](references/native-search-vs-external.md) | Product Search QBR Q1 2026 |
| External search integration — subscription-based sync architecture, document shape, price/inventory freshness, delta vs. full reindex | [references/external-search-integration.md](references/external-search-integration.md) | "Integrating with external search" (PS Americas) |
| AI/semantic search — embedding-based search, hybrid search, CT semantic search roadmap | [references/ai-search-and-semantic.md](references/ai-search-and-semantic.md) | "AI-Assisted Search Overview" (2025) |
| Integrations and data movement — integration architecture patterns, CT system-of-record boundaries, PIM/ERP/WMS/OMS/marketing integration points, rate limits, batch strategies, idempotency, schema mapping | [references/integrations-and-data-movement.md](references/integrations-and-data-movement.md) | ES: "Integrations and Data Movement" deck (PS Americas) |
| Data flows — subscriptions overview, API Extensions, Import API vs REST, environment build order of operations, PIM/OMS/ERP integration patterns | [references/data-flows.md](references/data-flows.md) | ES: "Data Flows" deck |

---

## Priority Tiers

### CRITICAL

- **For external search, never use `/product-projections/search` when the project uses standalone prices.** Product Projection Search silently returns inconsistent results for `priceMode: Standalone`. Use `/product-search` or sync from CT via subscriptions.
- **Subscribe to `StandalonePriceCreated/Changed/Deleted` for price freshness in external indexes.** `ProductPublished` does not include standalone price changes.
- **Never use the indexed price for cart creation.** Resolve price in CT at cart time — search indexes are eventually consistent.
- **Define CT system-of-record boundaries upfront.** Ambiguous ownership between CT and external systems (WMS, ERP, PIM) is the most common source of data drift and reconciliation bugs.

### HIGH

- **External search index documents must be denormalized.** Resolve category names, brand labels, and referenced resource names at sync time, not at query time.
- **Handle partial failures in sync pipelines.** Use a dead-letter queue or retry mechanism for failed index updates. A full reindex on failure is too expensive for large catalogs.
- **For PIM integration, use `productVariantPatch` for targeted attribute updates.** `productDraftImport` deletes all fields not in the draft.
- **Indexing is eventual — not real-time.** Do not test search immediately after updating a product in CI/CD pipelines without accounting for indexing lag.
- **For OMS integration, design for idempotent order hand-off.** CT Subscriptions are at-least-once — the OMS must handle duplicate order messages.

### MEDIUM

- **For CMS integration, CT is product + pricing data; the CMS owns editorial content.** Stitch them together in the BFF/storefront layer, not by duplicating data.
- **Product tailoring is not supported in either CT search endpoint.** For per-store product tailoring, use `Get ProductProjection in Store` for display — search results are not tailored.
- **CT semantic search is in Early Access as of mid-2026.** Do not plan for GA-level SLAs on CT semantic search until Q4 2026. For production semantic search before then, evaluate external providers.
- **For high-volume integrations, batch API calls and respect rate limits.** Monitor `X-RateLimit-Remaining` headers and alert when they drop below 20%. Request rate limit increases 2 weeks before peak events.
