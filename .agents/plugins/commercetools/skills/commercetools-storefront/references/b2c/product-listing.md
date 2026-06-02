---
name: product-listing
description: B2C product listing covering category fetching, product mapper, Product Search API, ProductCard/Grid components, and Server Component patterns.
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

This reference covers category data fetching, the commercetools Product Search API, the product mapper, ProductCard/Grid components, and the Server Component category page.

## Table of Contents
- [Pattern 1: Category Helper Functions](#pattern-1-category-helper-functions)
- [Pattern 2: Product Mapper](#pattern-2-product-mapper)
- [Pattern 3: Product Search API](#pattern-3-product-search-api)
- [Pattern 4: Product UI Components](#pattern-4-product-ui-components)
- [Pattern 5: Category Page (Server Component)](#pattern-5-category-page-server-component)
- [Checklist](#checklist)

---

## Pattern 1: Category Helper Functions

`lib/ct/categories.ts` key functions:

- `getCategoryBySlug(slug, locale)`: fetch a category by its localized slug
- `getCategoryById(id, locale)`: fetch a category by ID
- `getCategoryTree(locale)`: fetch all categories (limit: 500, sorted by `orderHint`) and return as a nested tree

> **commercetools slug query format:** `where: \`slug(${locale}="${slug}")\`` — locale is BCP-47 (e.g. `en-US`), matching both the URL segment and the COUNTRY_CONFIG key. commercetools stores slugs as `{ "en-US": "my-slug" }`.

---

## Pattern 2: Product Mapper

**INCORRECT:** Passing raw commercetools `ProductProjection` objects to components — this pushes too much data to frontend.

**CORRECT — map in `lib/mappers/product.ts`, components only receive `Product` from `@/lib/types`:**

Functions to implement:
- `mapProduct(p, locale)`: maps a `ProductProjection` to the app `Product` type
- `mapVariant(v)`: maps variant fields — id, sku, images, price, prices, attributes, availability
- `mapPrice(p)`: maps price — centAmount, currencyCode, discounted

---

## Pattern 3: Product Search API

**See [product-search.md](../../../commercetools-platform/references/product-search.md)** for the full reference — deprecation warning, query examples, facets, and all `productProjectionParameters` patterns.

`lib/ct/search.ts` key functions for this storefront:

- `searchProducts(params)`: queries using the v2 Product Search API. Supports text query, `categoryId` filter via `categoriesSubTree`, pagination (`limit`/`offset`), and sort
- `getProductBySku(sku, locale, currency, country)`: fetches a single product by exact SKU match

> **Price selection:** Pass `priceCurrency` + `priceCountry` in `productProjectionParameters` so variants arrive with `.price` already resolved to the correct tier.

---

## Pattern 4: Product UI Components

- `ProductCard`: links to the PDP, shows product image, name, and price. If discounted, shows discounted price with original crossed out. Uses `<Link>` from `@/i18n/routing`
- `ProductGrid`: renders a responsive grid of `ProductCard` components; shows an empty state when no products
- `Pagination`: renders a Pagination component which modifies the `offset/limit` 
- Other components to handle Client rendered components (sort, facets, etc)

---

## Pattern 5: Category Page (Server Component)

**INCORRECT:** `fetch('/api/products')` from a category page — unnecessary round-trip through the BFF for data that's only ever server-rendered.

**CORRECT — call `lib/ct/*` directly in an async Server Component, parallel-fetch independent data:**

```typescript
// app/[locale]/category/[slug]/page.tsx
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { country, currency, locale } = await getLocale();

  // Parallel fetch — category metadata and tree at the same time
  const [category, categoryTree] = await Promise.all([
    getCategoryBySlug(slug, locale),
    getCategoryTree(locale),
  ]);
  if (!category) notFound();

  // Build breadcrumb by walking the in-memory tree — no extra API calls

  const result = await searchProducts({ categoryId: category.id, locale, currency, country, ... });

  return (
    // DOM: breadcrumb, heading, ProductGrid, pagination
  );
}
```

---

## Checklist

- [ ] `lib/ct/categories.ts` exports `getCategoryBySlug`, `getCategoryById`, `getCategoryTree`
- [ ] `getCategoryTree` fetches with `limit: 500`
- [ ] `lib/mappers/product.ts` exports `mapProduct` — components never receive raw commercetools types
- [ ] `lib/ct/search.ts` uses `apiRoot.products().search()` (v2 API), not legacy `productProjections`
- [ ] Category page uses `Promise.all` to fetch category + category tree in parallel
- [ ] Breadcrumb walks the in-memory tree — no N+1 parent ID lookups
- [ ] Breadcrumb and pagination use `<Link>` from `@/i18n/routing` — no bare `<a>` tags
- [ ] Prices display with discounted amount + strikethrough original when applicable
- [ ] `notFound()` called when category slug doesn't resolve

**Next:** [product-detail.md](./product-detail.md)
