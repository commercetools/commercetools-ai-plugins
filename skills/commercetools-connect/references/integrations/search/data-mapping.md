---
name: search-data-mapping
description: Map a commercetools Product Projection onto a flat search document — objectID keying, record granularity (product vs variant), the price-context explosion, localization, category denormalization, Store assortment, and the availability boundary. The make-or-break work for any search connector, whether configured or built. The search sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - search
    - connect
---

# From commercetools projection to search document

This is where search integrations succeed or rot. The plumbing (full load, subscription, upsert) is mechanical; the **mapping** decides whether the index stays correct, queryable, and affordable. It applies whether you configure a public connector (you set the mapping as config) or build one (you write it) — the decisions are identical. Ground every choice in the [Product catalog overview](https://docs.commercetools.com/api/product-catalog-overview.md) and the [Integrate external search tutorial](https://docs.commercetools.com/tutorials/search-integration.md); this reference is the decision layer on top.

The core tension: commercetools' model is **normalized and reference-based** (Products reference Categories, Prices, Channels by id/key); a search engine wants a **flat, denormalized, self-contained record** optimized for one query. Mapping is a *transform and a filter*, not a copy — index only what the storefront searches, filters, sorts, or displays.

## Principle 1 — Project the current, published data — never the raw Product

Read from a [Product Projection](https://docs.commercetools.com/api/projects/productProjections.md) with `staged=false` (the `current` projection), not the Product resource. Only published Products have a `current` projection; a storefront index must never contain staged edits or unpublished products ([current/staged](https://docs.commercetools.com/api/product-catalog-overview.md#current-staged)). This one choice prevents the most common data leak — draft content showing up in search. On the incremental path, `ProductPublished` carries the `productProjection` in its payload, so you can index it without a re-fetch; for other triggers, re-fetch the projection by id (Principle 9).

## Principle 2 — Every record gets a stable `objectID` (the idempotency backbone)

Give each record a deterministic id derived from a **stable commercetools identifier** — the Product `id` for product-level records, or `<productId>-<variantId>` (or the SKU) for variant-level. This is what makes every write an **upsert** and every delete targetable: re-indexing the same product, redelivering a message, and re-running a full load must all converge, not duplicate. A record whose id you can't reconstruct from a later message is a record you can't update or delete — fix the key before writing any sync code. (Algolia calls this `objectID`; other engines call it the primary key — same role.)

## Principle 3 — Record granularity: product-level vs variant-level (a UX decision)

Decide up front whether a search hit is a **product** or a **variant** — it shapes the whole document and the storefront result grid:

- **Product-level** (one record per Product): variant-specific facets (size, color) become *sets* aggregated across variants; a hit links to the PDP. Fewer records, simpler; the default for most catalogs.
- **Variant-level** (one record per Variant): each color/size is its own hit with its own image and price; needed when the grid shows "red shirt" and "blue shirt" separately. More records; watch the engine's record-count/price tiers.

Match it to how the storefront wants to display results, and keep it consistent — don't mix granularities in one index.

## Principle 4 — The price-context explosion (the decision that bites hardest)

A commercetools price is contextual — it varies by **currency, country, Customer Group, and Channel** (embedded Prices or [Standalone Prices](https://docs.commercetools.com/api/projects/standalone-prices.md), resolved by [price selection](https://docs.commercetools.com/api/projects/productProjections.md)). A flat record cannot hold every combination. Pick one strategy deliberately:

- **Index one context** (e.g. `EUR`/`DE`) — simplest; correct only for a single-market storefront. Select it with the projection's price-selection parameters at map time.
- **Index facetable price fields per context** (`price_EUR_DE`, `price_USD_US`) — one record, several price fields; the storefront picks the field for the shopper's context. Scales to a handful of contexts.
- **Emit one record per context** (a `context` attribute + a filter) — when contexts are many or B2B Customer-Group pricing must be searchable; multiplies record count.

State the choice; a mismatch here is the classic "wrong price in search" bug. B2B/Customer-Group pricing that must be *queryable* is where native [Product Search](https://docs.commercetools.com/api/projects/product-search.md) (which resolves the buyer's context in-query) often wins over an external index — re-check rung 0.

## Principle 5 — Localization: index-per-locale vs per-locale fields

commercetools models translatable text as [LocalizedString](https://docs.commercetools.com/api/types.md#localizedstring) (`{ "en-US": "…", "de-DE": "…" }`). A search engine wants one language per searchable field (so stemming/synonyms are per-language). Two shapes:

- **One index per locale** (`products_en`, `products_de`) — the cleanest for language-specific relevance config; the Store-specific and multi-market default.
- **Per-locale fields in one index** (`name_en`, `name_de`) — fewer indices; the storefront queries the shopper's language fields. Fine for a few locales.

Reduce translations at the source with the projection's `localeProjection` so you only carry in-scope locales, and map locale codes explicitly (commercetools uses `en-US`, not `en_US`).

## Principle 6 — Denormalize categories, and know the fan-out cost

A Product references [Categories](https://docs.commercetools.com/api/projects/categories.md) by id; search wants the category **names and breadcrumb path** embedded in the record (for facets and category listing pages). Denormalize them at map time — but understand the consequence: **a category rename or move fans out to reindex every product in it.** That's why category messages ([Category Slug Changed](https://docs.commercetools.com/api/projects/messages/product-catalog-messages.md), and your own reconciliation sweep) matter on the incremental path, and why the nightly full rebuild is the backstop. Key facets on the stable category `id`/`key`, and carry the localized name as a display field.

## Principle 7 — Store assortment: whole-catalog vs Store-specific

If different Stores expose different assortments via [Product Selections](https://docs.commercetools.com/api/projects/product-selections.md) or [Product Tailoring](https://docs.commercetools.com/api/projects/product-tailoring.md), decide how the index reflects it:

- **A `stores` / `productSelections` filter field** on each record — one index, the storefront filters by the current Store. Simple; fine when tailored content per Store is minimal.
- **One index per Store** — driven by the Store's Product Selection; use the [Populate a Store-specific external search tutorial](https://docs.commercetools.com/tutorials/store-specific-external-search.md) and read `/in-store/key={storeKey}/product-projections` (with `storeProjection`, which also resolves Store locales and prices). This is what the [Product export template](https://docs.commercetools.com/connect/templates/product-export.md) implements — **one Deployment per Store**.

The per-Store-Deployment model doesn't scale to many Stores; for a large fleet, build one app that resolves the Store from the message and writes the matching index instead of one Deployment each. Store/Selection changes (`StoreProductSelectionsChanged`, `ProductSelectionProductAdded/Removed`, `ProductSelectionVariantSelectionChanged`) drive add/remove on the incremental path.

## Principle 8 — Availability is high-churn and eventually consistent — decide deliberately

Inventory changes constantly and lags real time; a search index is a poor stock ledger. `ProductVariant.availability` is [eventually consistent](https://docs.commercetools.com/api/inventory-overview.md#inventory-checks-and-consistency) and never authoritative. Decide explicitly:

- **Usual answer:** index a coarse `inStock` boolean (or a bucketed level) for filtering "in stock only", refreshed on a cadence — and let the storefront read live quantity from the [Inventory API](https://docs.commercetools.com/api/projects/inventory.md) / native search at render time.
- **Never** make the search index the source of truth for live stock, and **never** wire per-unit inventory events into the index — the write volume will overwhelm it for no UX gain.

## Principle 9 — Trust the id, not the payload; and keep the mapping pure

Subscription messages are at-least-once with **no ordering guarantee**, so a payload can be stale by the time you process it. Except for `ProductPublished` (whose `productProjection` payload *is* the just-published state), **re-fetch the projection by `resource.id`** so the index converges on current state instead of replaying old deltas. Keep the projection→document transform a **pure function** — no network calls — so it is unit-testable without a deployment or engine key. Everything the engine needs to rank and display should be *in the record*; the connector's only job is to keep that record equal to the current projection.

## The relevance-config boundary (what does NOT live here)

Searchable-field weighting, ranking/tie-breaking, synonyms, redirects, query rules, merchandising, and A/B tests live **in the search engine**, configured by merchandisers — not in commercetools and not in the connector. The connector feeds correct, current data; the engine decides relevance. Don't try to encode ranking in the mapping.

## Worked example (sketch)

An apparel catalog, product-level records, two locales (`en-US`, `de-DE`), one price context (`EUR`/`DE`), one global index.

- **`objectID`** = Product `id`. Source = `/product-projections?staged=false` (full load) and `ProductPublished.productProjection` (delta).
- **Fields:** `name_en`/`name_de`, `description_en`/`description_de` (per-locale, `localeProjection` limited to the two); `brand`, `color` (set across variants), `sizes` (set), `categories` (denormalized breadcrumb names per locale) + `categoryIds` (facet on stable id); `price` (selected `EUR`/`DE`) + `price` as a numeric sort/facet field; `inStock` boolean (coarse, refreshed nightly); `imageUrl`, `slug_en`/`slug_de`.
- **Left out:** staged data, out-of-scope locales, per-unit inventory, internal-only attributes, every non-`EUR` price.
- **Delta triggers:** `ProductPublished` → upsert; `ProductUnpublished`/`ProductDeleted` → remove `objectID`; category rename → reindex affected products (or wait for the nightly rebuild).

Hand the user the record schema (field → source, type, searchable/facetable/display), the price-context and locale decisions, and the `objectID` rule — that mapping *is* the deliverable, and it's identical whether a public connector consumes it as config or a custom connector implements it.

## Checklist
- [ ] Records built from the **`current` projection** (`staged=false`) — never staged or unpublished data
- [ ] Every record keyed on a stable `objectID` (product id, or product-id+variant) → every write is an upsert, every delete targetable
- [ ] Record granularity (product vs variant) chosen for the result UX and kept consistent
- [ ] Price context resolved to one strategy (single context · per-context fields · per-context records); no "wrong price in search"
- [ ] Locales handled (index-per-locale or per-locale fields); `localeProjection` limits to in-scope locales; codes mapped (`en-US`)
- [ ] Categories denormalized (names/breadcrumb) with the rename→reindex fan-out understood; facets keyed on stable id
- [ ] Store assortment reflected (filter field or index-per-store); Store-specific reads in-store projections; per-Store-Deployment scale limit noted
- [ ] Availability handled deliberately (coarse flag at most); index is **not** the live-stock source of truth
- [ ] Delta path re-fetches by id (except `ProductPublished`); the mapping is a pure, unit-testable function
- [ ] Relevance config (ranking/synonyms/merchandising) left to the engine, not encoded in the mapping
