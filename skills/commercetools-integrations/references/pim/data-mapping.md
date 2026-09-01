---
name: pim-data-mapping
description: Map a PIM's product model onto the commercetools product model — Product Type strategy (never 1:1 with PIM families), attribute mapping (search-critical vs consolidated JSON), localization, category tree, media, price/inventory separation, and keys for idempotent upsert. The make-or-break work for any PIM connector, whether configured or built.
when_to_use:
  - "Deciding how PIM attributes, families, categories, locales, and media map onto commercetools Product Types, attributes, and categories"
  - "Choosing a Product Type strategy or an attribute-mapping strategy for a PIM sync"
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - pim
    - connect
---

# From PIM model to commercetools product model

This is where PIM integrations succeed or rot. The plumbing (webhook, job, Import API) is mechanical; the **mapping** decides whether the catalog stays correct and maintainable. It applies whether you configure a public connector (you set the mapping as config) or build one (you write it) — the decisions are identical. Ground every modeling choice in the [Product catalog overview](https://docs.commercetools.com/api/product-catalog-overview.md) and the [Integrate product data tutorial](https://docs.commercetools.com/tutorials/product-data-integrations.md#data-mapping); this reference is the decision layer on top.

The core tension ([docs](https://docs.commercetools.com/tutorials/product-data-integrations.md#data-mapping)): a PIM's model is optimized for **enrichment** (deep, exhaustive, editorial), commercetools' is optimized for **commerce utility** (search, display, pricing, fulfillment). They differ on purpose. Mapping is a *transform and a filter*, not a copy.

## Principle 1 — Map only commerce-relevant data

Not every PIM attribute belongs in commercetools. Transfer only what search, display, pricing, or fulfillment needs; leave the rest in the PIM (it stays the source of truth and can be fetched on demand if ever needed). Every attribute you sync is one more thing to keep consistent — a smaller, sharper catalog is cheaper to run and faster to query.

## Principle 2 — Do NOT map Product Types 1:1 with PIM families

The most common and most expensive mistake. Linking a commercetools [Product Type](https://docs.commercetools.com/api/projects/productTypes.md) directly to each PIM family/type/category means every structural change in the PIM forces a Product Type migration in commercetools — and Product Type changes are heavy (they constrain existing Products). Instead ([docs](https://docs.commercetools.com/tutorials/product-data-integrations.md#data-mapping)):

- Design a **small set of flexible Product Types** driven by how products are *sold and searched*, not by the PIM's taxonomy.
- Give each Product Type a stable set of attributes; absorb PIM structural variety through attribute *values*, not new Product Types.
- A PIM with hundreds of families usually maps to a handful of commercetools Product Types. If you find yourself minting a Product Type per family, stop — that coupling is the anti-pattern.

## Principle 3 — Prioritize search-critical attributes; consolidate the rest

Split PIM attributes into two buckets ([docs](https://docs.commercetools.com/tutorials/product-data-integrations.md#data-mapping)):

- **Search/filter/display-critical** (brand, color, size, material, key specs) → map each to its own typed Product Type attribute. Type it precisely — `enum`/`lenum` for controlled vocabularies (so faceting works), `number` + a unit for measures, `boolean` for flags, `ltext`/`text` for copy. Precise types are what make [query predicates](https://docs.commercetools.com/api/predicates/query.md) and search facets work.
- **Supplementary** (long-tail specs shown but never filtered) → consolidate into a single JSON/`text` attribute rather than exploding into dozens of rarely-used fields. This keeps the Product Type lean and the catalog queryable.

Match the attribute *type* to the PIM source: a PIM single/multi-select becomes `enum`/`set of enum` (`lenum` if the labels are localized); a PIM metric/measurement attribute becomes a `number` plus a unit (convert to one target unit at map time — don't ship mixed units). Key each enum option on the PIM's **stable option code, not its localized label** — labels change per translation and would silently break faceting.

## Principle 4 — Localization

commercetools models translatable text as [LocalizedString](https://docs.commercetools.com/api/types.md#localizedstring) (`{ "en-US": "...", "de-DE": "..." }`). Map each PIM locale to a commercetools locale explicitly — PIM locale codes don't always match (`en_US` vs `en-US`), and a mismatch silently drops translations. Decide which locales are in scope (Step 1) and only sync those. For attributes that vary by locale in the PIM but shouldn't in commercetools (e.g. a unit system), resolve to one value at map time.

## Principle 5 — Categories are a keyed tree, resolved by reference

Map the PIM category hierarchy to the commercetools [Category](https://docs.commercetools.com/api/projects/categories.md) tree. Each Category carries a **stable `key`**; a Product references its categories **by key**, and a child Category references its parent **by key**. When importing, you don't need categories to exist first — the [Import API resolves references asynchronously](https://docs.commercetools.com/api/import-export/overview.md#reference-resolution) (it holds an operation up to 48 h waiting for the referenced Category/Product Type to arrive, then retries). So you can submit products and categories in any order within that window — but the keys must match exactly. Derive category keys deterministically from a stable PIM identifier, never from a localized name (names change and aren't unique).

## Principle 6 — Media, price, and inventory each have their own path

- **Media / assets.** Map PIM image/asset URLs onto Product Variant images (or Assets for richer metadata). If the PIM only holds asset *references* into a DAM, sync the resolved public URLs. Large binary sets are better handled in the bulk/job path than on the hot webhook path.
- **Price and inventory — keep them SEPARATE from content** ([docs](https://docs.commercetools.com/tutorials/product-data-integrations.md#manage-price-and-inventory-separately)). They change far more often and are more time-critical than descriptions/images. Implement them as their own event-based integrations even when they originate in the same system, so a slow nightly catalog sync never blocks a price or stock update. Prices map to embedded Prices or [Standalone Prices](https://docs.commercetools.com/api/projects/standalone-prices.md); inventory to [InventoryEntry](https://docs.commercetools.com/api/projects/inventory.md) by SKU (variant `availability` updates asynchronously after the InventoryEntry lands).

## Principle 7 — Every resource gets a stable key (idempotency backbone)

This is what makes the whole sync safe to re-run ([docs](https://docs.commercetools.com/tutorials/product-data-integrations.md#import-product-data-from-the-pim)). Give **every** resource — Product, Product Variant (plus `sku`), Price, Category, Product Type — a unique `key` derived from a **stable PIM identifier** (the PIM's product id / variant id, not a name or a position). Then every write is an *upsert by key*: create if absent, update if present. This makes re-delivery of a webhook, an overlapping job, and a full re-import all no-ops rather than duplicate-creators. A resource without a stable key cannot be safely re-synced — fix the key before writing any sync code.

## Principle 8 — Source of truth and read-only enforcement

Decide, per attribute, which system owns it (Step 1). For attributes the PIM owns, prevent Merchant Center edits from silently diverging: group externally-owned attributes into a restricted [AttributeGroup](https://docs.commercetools.com/api/projects/attribute-groups.md) so they render read-only in the Merchant Center ([docs](https://docs.commercetools.com/tutorials/product-data-integrations.md#multiple-sources-of-product-data)). For multi-source setups (PIM for content, ERP for price/stock), one process creates the Product and each source updates only its own attributes — never a blind full overwrite that clobbers another system's fields.

## Principle 9 — Scopes/channels and reference/related data (the concepts that catch people)

Two recurring PIM concepts don't have a 1:1 commercetools counterpart and need an explicit decision — whichever PIM you're on (the names differ; the shape doesn't):

- **Scope / channel / context.** Many PIMs scope attribute values by a channel or context (e.g. Akeneo *channels*, inriver *segments/channels*), so one attribute holds different values per scope. Choose **which scope's values feed commercetools** — syncing the wrong one produces correct-looking but wrong storefront data, and ignoring scopes entirely mixes contexts. If different scopes must feed different storefronts, that's a [Product Selection / Product Tailoring](https://docs.commercetools.com/api/projects/product-selections.md) decision (which Products/values each Store sees), **not** just attribute mapping.
- **Reference / related entities.** PIMs model related objects as first-class links (e.g. Akeneo *reference entities*, related products, cross-sells). Map these to commercetools attributes or product references — but this is often the gap a public connector *doesn't* cover, so **confirm the chosen connector maps them**; if not, it's a common fork trigger (→ [build-connector.md](./build-connector.md)).

The PIM's own vocabulary (Akeneo "families", other PIMs "product classes"/"templates"/"entity types") maps to the Product Type strategy in Principle 2 — the label varies, the anti-pattern (1:1 with Product Types) does not. For the specific connector's config keys and exact concept names, read **its own current docs/repo** (looked up live), not a hardcoded per-vendor table here.

## Worked example (sketch)

A fashion PIM with families `tshirt`, `hoodie`, `jeans`, each with dozens of family-specific attributes, 3 locales (`en-US`, `de-DE`, `fr-FR`), category tree by department.

- **Product Types:** *one* `apparel` Product Type (not three) with attributes `brand` (enum), `color` (lenum, localized labels), `size` (enum), `material` (set of enum), `care-instructions` (ltext), and `spec-sheet` (text holding consolidated JSON for the long-tail). Family differences live in attribute values, not new types.
- **Variants:** one Product per style, one Variant per color/size combination; `key` = `pim-<productId>`, variant `key`/`sku` = `pim-<variantId>` / the real SKU.
- **Categories:** `key` = `dept-<pimCategoryId>`, parent by key; products reference categories by key and let the Import API resolve.
- **Localization:** PIM `en_US`/`de_DE`/`fr_FR` → LocalizedString `en-US`/`de-DE`/`fr-FR`; other locales dropped per scope.
- **Price/inventory:** separate event integrations keyed by SKU; not part of the content sync.

Hand the user the Product Type definitions, the attribute→attribute table (with types and which are search-critical vs consolidated), the locale map, and the key derivation rules — that mapping *is* the deliverable, and it's identical whether a public connector consumes it as config or a custom connector implements it.

## Checklist
- [ ] Only commerce-relevant attributes mapped; the rest left in the PIM
- [ ] A **small set of flexible Product Types** (not 1:1 with PIM families); structural variety absorbed as attribute values
- [ ] Search-critical attributes typed precisely (enum/lenum/number+unit/boolean); supplementary consolidated into one JSON/text attribute
- [ ] PIM locales explicitly mapped to commercetools locales; out-of-scope locales dropped
- [ ] Categories keyed from stable PIM ids (not names); products & parents reference by key; Import API resolves references
- [ ] Media mapped; **price and inventory kept as separate integrations**, keyed by SKU
- [ ] Every resource has a stable `key` from a PIM identifier → every write is an upsert (safe to re-run)
- [ ] Source of truth decided per attribute; externally-owned attributes made read-only via an AttributeGroup; multi-source writes scoped to owned attributes only
- [ ] PIM scope/channel chosen (multi-scope → multi-Store routed through Product Selections/Tailoring); reference/related-entity mapping confirmed against the connector or flagged as a fork trigger
