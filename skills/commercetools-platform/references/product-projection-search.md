# Product Projection Search — Legacy Endpoint Patterns

**Source:** commercetools Product Projection Search API documentation; Expert Services Americas engagements

---

## What Is Product Projection Search?

Product Projection Search (`GET` or `POST /{projectKey}/product-projections/search`) is the original CT search endpoint. It returns full `ProductProjection` objects directly (not an ID-first pattern) and uses a string-based filter and facet expression syntax.

**Use for new implementations only if:**
- The project uses embedded prices (not standalone prices)
- String-based filter compatibility is required
- An existing codebase already uses this endpoint and migration is not yet planned

**Prefer the new Product Search API** (`/product-search`) for all new work — especially when the project uses standalone prices, stores, or product selections.

---

## Activation

Product Projection Search is **disabled by default** and must be explicitly activated:

```json
POST /{projectKey}
{
  "version": 1,
  "actions": [
    {
      "action": "changeProductSearchIndexingEnabled",
      "enabled": true,
      "mode": "ProductProjectionsSearch"
    }
  ]
}
```

Or via Merchant Center: Settings > Project settings > Storefront Search.

**Automatic deactivation:** If no calls are made to this endpoint for 30 consecutive days, it deactivates automatically. Reactivation triggers a full reindex.

---

## Full-Text Search

The `text.{language}` query parameter performs full-text search:

```
GET /{projectKey}/product-projections/search?text.en=running+shoes&staged=false
```

**Searchable fields by default:**
- `name` (weighted higher than other fields)
- `description`
- `slug`
- `sku`
- `searchKeywords`

`metaKeywords` and `metaTitle` are **not** indexed for full-text search.

**Attribute searchability:** For variant attributes to be searchable, the `AttributeDefinition.isSearchable` must be set to `true`. Applicable to `text`, `ltext`, `money`, and the `label` of `enum`/`lenum` attributes.

Full-text search is limited to the first 256 characters of the query value; values beyond this are silently ignored.

---

## Filter Parameters — Three Distinct Purposes

Product Projection Search has three separate filter parameters, each controlling a different thing:

| Parameter | Effect |
|---|---|
| `filter.query` | Filters products **before** facet calculation — affects both query results and facets |
| `filter` | Filters products **after** facet calculation — affects query results but not facet counts |
| `filter.facets` | Modifies facet aggregation scope — affects facet counts but not query results |

This distinction enables **multi-select faceting**: a user can select "Blue" AND "Red" in a color filter, and the color facet still shows counts for all colors (not just the selected ones). Use `filter` for the product results and `filter.facets` to adjust other facets.

```
filter.query=variants.attributes.color:"blue"
filter.facets=variants.attributes.color:"blue"
```

---

## Filter Expression Syntax

Filters use a string expression syntax (unlike the new Product Search JSON query language).

**Attribute filters:**
```
variants.attributes.{name}:{value}
variants.attributes.{name}.key:"{enumKey}"
variants.attributes.{name}.label:"{enumLabel}"
variants.attributes.{name}.label.{lang}:"{lenum_label}"
```

**Price filters (embedded prices only):**
```
variants.price.centAmount:range(0 to 5000)
variants.price.currencyCode:"USD"
variants.price.country:"US"
variants.price.customerGroup.id:"{id}"
variants.price.channel.id:"{id}"
```

**Category filter:**
```
categories.id:subtree("{categoryId}")
```

---

## Facets — Three Types

### Term Facets
Count occurrences of each distinct value. Use `alias` to name the facet result.

```
GET ...?facet=variants.attributes.color&facet=variants.attributes.size:"m"
```

Facet expression patterns:
- `variants.attributes.{name}` — simple value attributes (text, number, boolean, date)
- `variants.attributes.{name}.{lang}` — `ltext` attributes
- `variants.attributes.{name}.key` — `enum` or `lenum` key
- `variants.attributes.{name}.label` — `enum` label
- `variants.attributes.{name}.centAmount` — money attribute cents
- `categories.id` — category counts

**For attributes to be facetable, `AttributeDefinition.isSearchable` must be `true`.**

### Range Facets
Count products within numeric ranges (useful for price sliders):

```
facet=variants.price.centAmount:range(0 to 5000),(5000 to 10000),(10000 to *)
```

### Filtered Facets
Count only products matching a specific filter within the facet:

```
facet=variants.attributes.size:"m" filter=variants.attributes.color:"blue"
```

---

## Pagination

- Default limit: 20 results
- Maximum limit: 500 per request
- Maximum offset: 10,000 (exceeding this returns a `SearchExecutionFailure` error)
- Set `limit=0` to retrieve facet counts without product results

For catalogs larger than 10,000 products requiring full traversal, use the search cursor pattern or Product Projections query endpoint instead.

---

## Sorting

Sort by relevance (default when `text.{lang}` is used), or by any indexed field:

```
sort=name.en asc
sort=variants.price.centAmount asc
sort=score desc
```

Multiple sort expressions are comma-separated. If no sort is specified and a text query is present, results sort by relevance score descending.

---

## Critical Limitations

- **Does not support standalone prices.** Filters, facets, and sorting only work with embedded prices. Products using `priceMode: Standalone` will yield inconsistent or missing results.
- **Does not support Product Tailoring.** Tailored product data (per-store name/description overrides) is not returned or searchable. Use `Get ProductProjection in Store` for tailored data.
- **Does not support product-level attributes** (only variant-level attributes, including `SameForAll` constraints).
- **Does not support stores or product selections** as native scoping dimensions — must be approximated via category or custom attribute filters.
- **Indexing is eventual.** A full reindex is triggered whenever project-level configuration changes that affect products (locales, currencies, customer groups, attribute additions). During reindex, subsequent changes are queued.

---

## Enabling `isSearchable` on Attributes

For an attribute to appear in full-text search results or facets, its `AttributeDefinition` must have `isSearchable: true`. This cannot be changed retroactively without a full reindex. Plan searchability upfront during product type design.

```json
{
  "name": "brand",
  "type": { "name": "text" },
  "isRequired": false,
  "isSearchable": true,
  "attributeConstraint": "None"
}
```
