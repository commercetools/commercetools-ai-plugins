# Product Search API — Query Language, Facets, and Sorting

**Source:** commercetools Product Search API documentation (GA June 2024, facets GA October 2025); "More powerful product search overview (2026)"; Product Search QBR Q1 2026

---

## What Is the Product Search API?

The Product Search API (`POST /{projectKey}/product-search`) is the **current recommended endpoint** for storefront discovery. It replaced the older Product Projection Search for new implementations.

- Endpoint: `POST /{projectKey}/product-search`
- GA since June 2024; facets GA October 2025
- Returns product IDs by default (ID-first approach); full projection data available via expansion
- Supports standalone prices, stores, and product selections natively
- Uses a structured JSON query language (not the string-based filter syntax of Product Projection Search)

---

## Query Language — Simple Expressions

All queries are expressed in the `query` field of the request body. Simple expressions test a single condition:

| Expression | Use |
|---|---|
| `exact` | Exact match on a field (case-sensitive or insensitive) |
| `fullText` | Full-text search across localized or text fields |
| `prefix` | Starts-with match (good for autocomplete scenarios) |
| `range` | Numeric or date range check (prices, dates) |
| `fuzzy` | Approximate match, allows minor typos |
| `wildcard` | Pattern match using `*` or `?` |
| `exists` | Tests that a field has any value (not null) |

```json
{
  "query": {
    "fullText": {
      "field": "name",
      "language": "en",
      "value": "running shoes",
      "caseInsensitive": true
    }
  }
}
```

---

## Query Language — Compound Expressions

Compound expressions combine multiple simple or compound expressions:

| Compound | Behavior |
|---|---|
| `and` | All nested expressions must match |
| `or` | At least one nested expression must match |
| `not` | Excludes products matching nested expressions |
| `filter` | Like `and`, but does not affect relevance scoring |

```json
{
  "query": {
    "and": [
      {
        "fullText": {
          "field": "name",
          "language": "en",
          "value": "T-Shirt"
        }
      },
      {
        "filter": [
          {
            "exact": {
              "field": "categories",
              "value": "7b23115a-3574-4098-9c32-33beb93aadf8"
            }
          }
        ]
      }
    ]
  },
  "limit": 20
}
```

**`filter` inside a compound expression does not affect relevance scoring** — use it for hard constraints like category membership or store scoping.

---

## Store and Product Selection Scoping

A key advantage of Product Search over Product Projection Search: native support for stores and product selections.

```json
{
  "query": {
    "and": [
      {
        "exact": {
          "field": "stores",
          "value": "store-key-here"
        }
      },
      {
        "fullText": {
          "field": "name",
          "language": "en",
          "value": "butter"
        }
      }
    ]
  }
}
```

**Soft limits:**
- Stores: up to 15,000 per product
- Product Selections: up to 15,000 per product
- Standalone Prices: up to 10,000 per product (API applies a sorting algorithm during indexing when this is exceeded)

Exceeding the store/product selection limits causes non-deterministic results (no error).

---

## Facets

Facets provide aggregated counts for building faceted navigation (size filters, price ranges, brand selectors, category counts). Facets reached GA in October 2025.

**Three facet types:**

### 1. Distinct Facets — count occurrences of each unique value

```json
{
  "facets": [
    {
      "distinct": {
        "name": "sizes",
        "field": "variants.attributes.size",
        "fieldType": "number",
        "limit": 50
      }
    }
  ]
}
```

Response:
```json
{
  "facets": [
    {
      "name": "sizes",
      "buckets": [
        { "key": "43", "count": 112 },
        { "key": "44", "count": 63 }
      ]
    }
  ]
}
```

### 2. Ranges Facets — bucket products into numeric ranges

```json
{
  "facets": [
    {
      "ranges": {
        "name": "priceFacet",
        "field": "variants.prices.centAmount",
        "ranges": [
          { "key": "0-50", "to": 5000 },
          { "key": "50-100", "from": 5000, "to": 10000 },
          { "key": "100-plus", "from": 10000 }
        ]
      }
    }
  ]
}
```

### 3. Stats Facets — min, max, mean, sum, count for a numeric field

```json
{
  "facets": [
    {
      "stats": {
        "name": "priceStats",
        "field": "variants.prices.centAmount",
        "scope": "query"
      }
    }
  ]
}
```

---

## Facet Scope — Global vs. Query-Scoped

By default, facets run in the scope of the query (only counting products that match the search). You can override this:

- **`scope: "query"`** (default) — facet counts only products matching the query
- **`scope: "all"`** (global) — facet counts all products, regardless of the query

```json
{
  "query": {
    "fullText": { "field": "description", "value": "butter", "language": "en" }
  },
  "facets": [
    {
      "distinct": {
        "scope": "all",
        "name": "allNames",
        "field": "name",
        "language": "en",
        "limit": 50
      }
    }
  ]
}
```

Use `scope: "all"` when you want to show facet counts that represent the whole catalog independent of the current search term — useful for category navigation sidebars.

---

## Sorting

Sort by any indexed field. For price-based sorting, use `filter` inside the sort expression to scope which variant prices are considered:

```json
{
  "sort": [
    {
      "field": "variants.prices.centAmount",
      "filter": {
        "and": [
          {
            "exact": {
              "field": "variants.prices.channel",
              "value": "fb16244b-3963-4b9e-9cb0-69a1f563a854"
            }
          },
          {
            "exact": {
              "field": "variants.prices.currencyCode",
              "value": "EUR"
            }
          }
        ]
      },
      "order": "asc"
    }
  ]
}
```

Sort filters cannot be used on context-level fields.

---

## ID-First Response Pattern

Product Search returns product IDs by default. To get full product data, either:

1. **Use the `productProjection` expansion** (beta) in the Product Search request itself
2. **Follow up with a Product Projections query** filtering by the returned IDs:

```typescript
// Step 1: Get IDs from Product Search
const searchResult = await apiRoot.productSearch().post({ body: { query: { ... } } }).execute();
const productIds = searchResult.body.results.map(r => r.id);

// Step 2: Get full projections
const projections = await apiRoot.productProjections().get({
  queryArgs: {
    where: `id in ("${productIds.join('","')}")`,
    staged: false,
    localeProjection: 'en',
  }
}).execute();
```

The ID-first approach keeps search fast (small payloads) and gives you explicit control over which projection fields are fetched.

---

## Key Fields for Querying

Standard keyword fields for exact/prefix/wildcard expressions:

| Field | Queries for |
|---|---|
| `id` | Product by ID |
| `key` | Product by key |
| `productType` | Products of a specific product type (by ID) |
| `categories` | Products in a category (and subcategories via `categoriesSubTree`) |
| `variants.sku` | Variant by SKU |
| `variants.attributes.{name}` | Variant attribute value |
| `variants.prices.currencyCode` | Variants with prices in a currency |
| `variants.prices.customerGroup` | Variants with prices for a customer group |
| `variants.prices.channel` | Variants with prices for a channel |
| `variants.availability.isOnStockForChannel` | In-stock variants for a channel |
| `variants.stores` | Variants available in a store |
| `stores` | Products available in a store |
| `productSelections` | Products assigned to a product selection |

For attribute fields, always specify `fieldType` (e.g., `"text"`, `"number"`, `"boolean"`, `"enum"`, `"ltext"`).

---

## Product Search vs. Product Projection Search — Quick Reference

| Feature | Product Search API (`/product-search`) | Product Projection Search (`/product-projections/search`) |
|---|---|---|
| Standalone prices | Supported | NOT supported (use embedded prices only) |
| Stores / product selections | Native support | Not supported |
| Query language | Structured JSON (`exact`, `fullText`, `and`, `or`, etc.) | String-based filter expressions |
| Facets | GA October 2025 | GA (term, range, filtered) |
| Product tailoring | Not supported | Not supported |
| Response format | IDs by default (projection optional) | Full projection |
| Activation required | No | Yes (disabled by default; auto-deactivates after 30 days of inactivity) |
| Recommendation | Preferred for new implementations | Legacy; use when you need string-based filter compatibility |
