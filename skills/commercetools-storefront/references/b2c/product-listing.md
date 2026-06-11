---
name: product-listing
description: B2C product listing covering category fetching, product mapper, Product Search API, ProductCard/Grid components, and server-rendered patterns.
when_to_use:
  - "Building category pages"
  - "Implementing product listings with ProductCard and Grid"
  - "Designing pagination and filters"
  - "Using the Product Search API"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - plp
    - search
---

# Product Listing

**Impact: HIGH — N+1 queries in category pages multiply commercetools API calls linearly with page size and crater TTFB.**

This reference covers category data fetching, the commercetools Product Search API, the product mapper, ProductCard/Grid components, and the server-rendered category page.

## Table of Contents
- [Pattern 1: Category Helper Functions](#pattern-1-category-helper-functions)
- [Pattern 2: Product Mapper](#pattern-2-product-mapper)
- [Pattern 3: Product Search API](#pattern-3-product-search-api)
- [Pattern 4: Product UI Components](#pattern-4-product-ui-components)
- [Pattern 5: Category Page (server-rendered)](#pattern-5-category-page-server-rendered)
- [Checklist](#checklist)

---

## Pattern 1: Category Helper Functions

`<server>/ct/categories` key functions:

- `getCategoryBySlug(slug, locale)`: fetch a category by its localized slug
- `getCategoryById(id, locale)`: fetch a category by ID
- `getCategoryTree(locale)`: fetch all categories (limit: 500, sorted by `orderHint`) and return as a nested tree

> **commercetools slug query format:** `where: \`slug(${locale}="${slug}")\`` — locale is BCP-47 (e.g. `en-US`), matching both the URL segment and the COUNTRY_CONFIG key. commercetools stores slugs as `{ "en-US": "my-slug" }`.

---

## Pattern 2: Product Mapper

**INCORRECT:** Passing raw commercetools `ProductProjection` objects to components — this pushes too much data to frontend.

**CORRECT — map in `<server>/mappers/product`, components only receive `Product` from `<server>/types`:**

Functions to implement:
- `mapProduct(p, locale)`: maps a `ProductProjection` to the app `Product` type
- `mapVariant(v)`: maps variant fields — id, sku, images, price, prices, attributes, availability
- `mapPrice(p)`: maps price — centAmount, currencyCode, discounted

---

## Pattern 3: Product Search API

**See [product-search.md](../../../commercetools-platform/references/product-search.md)** for the full reference — deprecation warning, query examples, facets, and all `productProjectionParameters` patterns.

`<server>/ct/search` key functions for this storefront:

- `searchProducts(params)`: queries using the v2 Product Search API. Supports text query, `categoryId` filter via `categoriesSubTree`, pagination (`limit`/`offset`), and sort
- `getProductBySku(sku, locale, currency, country)`: fetches a single product by exact SKU match

> **Price selection:** Pass `priceCurrency` + `priceCountry` in `productProjectionParameters` so variants arrive with `.price` already resolved to the correct tier.

---

## Pattern 4: Product UI Components

- `ProductCard`: links to the PDP, shows product image, name, and price. If discounted, shows discounted price with original crossed out. Uses the framework's locale-aware link
- `ProductGrid`: renders a responsive grid of `ProductCard` components; shows an empty state when no products
- `Pagination`: renders a Pagination component which modifies the `offset/limit` 
- Other components to handle Client rendered components (sort, facets, etc)

---

## Pattern 5: Category Page (server-rendered)

**INCORRECT:** fetching products from a client-facing server endpoint (BFF round-trip) inside a category page — unnecessary hop for data that's only ever server-rendered.

**CORRECT — call `<server>/ct/*` directly in a server-rendered load, parallel-fetch independent data:**

In the server-rendered category page/load:

1. Read the route `slug` and resolve `country`, `currency`, `locale` from the session.
2. Parallel-fetch the independent data with `Promise.all`: `getCategoryBySlug(slug, locale)` and `getCategoryTree(locale)` at the same time.
3. If the category does not resolve, return the framework's not-found response.
4. Build the breadcrumb by walking the in-memory category tree — no extra API calls.
5. Call `searchProducts({ categoryId: category.id, locale, currency, country, ... })`.
6. Render breadcrumb, heading, `ProductGrid`, and pagination.

> Find Stack's `data-loading.md` for more details of aconcrete server-rendered category page implementation.

---

## Checklist

- [ ] `<server>/ct/categories` exports `getCategoryBySlug`, `getCategoryById`, `getCategoryTree`
- [ ] `getCategoryTree` fetches with `limit: 500`
- [ ] `<server>/mappers/product` exports `mapProduct` — components never receive raw commercetools types
- [ ] `<server>/ct/search` uses `apiRoot.products().search()` (v2 API), not legacy `productProjections`
- [ ] Category page uses `Promise.all` to fetch category + category tree in parallel
- [ ] Breadcrumb walks the in-memory tree — no N+1 parent ID lookups
- [ ] Breadcrumb and pagination use the framework's locale-aware link — no bare `<a>` tags
- [ ] Prices display with discounted amount + strikethrough original when applicable
- [ ] The framework's not-found response returned when category slug doesn't resolve

**Next:** [product-detail.md](./product-detail.md)
