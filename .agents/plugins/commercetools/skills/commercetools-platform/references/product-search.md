---
name: product-search
description: Production patterns for Product Search API including full-text queries, variant filtering, faceted navigation, category subtree filtering, SKU lookups, price selection, and discount expansion.
when_to_use:
  - "Building product search, filtering, or faceted browse experiences"
  - "Migrating from deprecated productProjections() endpoint"
  - "Implementing category filters with subtree matching"
  - "Setting up price tiers by currency and country"
  - "Adding discount badges or expanded discount names to product results"
metadata:
  contentType: REFERENCE
  area:
    - search
    - catalog
    - products
    - sdk
---

# Product Search API

**Official docs:** https://docs.commercetools.com/api/projects/product-search

**Impact: HIGH — The legacy `productProjections` search endpoint is deprecated and lacks facets and proper variant matching. Always use the Product Search API.**

## Table of Contents
- [Pattern 1: Never Use Legacy Search](#pattern-1-never-use-legacy-search)
- [Pattern 2: Strong Typing — Never Use `any` or `unknown`](#pattern-2-strong-typing--never-use-any-or-unknown)
- [Pattern 3: Full Example — Text + Filter + Sort + Facets](#pattern-3-full-example--text--filter--sort--facets)
- [Pattern 4: Category Filter](#pattern-4-category-filter)
- [Pattern 5: SKU Lookup](#pattern-5-sku-lookup)
- [Pattern 6: Price Selection](#pattern-6-price-selection)
- [Pattern 7: Discount Expansion](#pattern-7-discount-expansion)
- [Checklist](#checklist)

---

## Pattern 1: Never Use Legacy Search

**INCORRECT:**
```typescript
// Deprecated — no facets, no proper variant matching
await apiRoot.productProjections().search().get({ queryArgs: { ... } }).execute();
```

**CORRECT:**
```typescript
// Product Search API — use this always
await apiRoot.products().search().post({ body: { ... } }).execute();
```

The Product Search API uses a `POST` body for the query, not URL query args.

---

## Pattern 2: Strong Typing — Never Use `any` or `unknown`

**INCORRECT:** casting to `any` or `unknown` to work around missing types.

```typescript
// BAD — loses all type safety
const name = (result as any).productProjection?.name?.['en-US'];
const discount = (ctPrice.discounted?.discount?.obj as any)?.name;
```

**CORRECT:** import and use the SDK types from `@commercetools/platform-sdk` directly.

```typescript
import type {
  ProductSearchResult,
  ProductProjection,
  ProductVariant,
  Price as CtPrice,
  ProductDiscount,
  LocalizedString,
} from '@commercetools/platform-sdk';

// Result typing
const result: ProductSearchResult = body.results[0];
const projection: ProductProjection | undefined = result.productProjection;

// Expanded discount reference — obj is typed as ProductDiscount | undefined
const discountObj = ctPrice.discounted?.discount?.obj as ProductDiscount | undefined;
const discountName = getLocalizedString(discountObj?.name as LocalizedString | undefined, locale);
```

The `@commercetools/platform-sdk` exports types for every resource, reference, and expanded object in the API. Search the package exports before reaching for `any`.

---

## Pattern 3: Full Example — Text + Filter + Sort + Facets

```typescript
import { apiRoot } from './client';
import type { ProductSearchRequest } from '@commercetools/platform-sdk';

const searchRequest: ProductSearchRequest = {
  query: {
    and: [
      {
        fullText: {
          field: 'name',
          language: 'en-US', // Always use BCP-47
          value: 'cotton shirt',
        },
      },
      {
        filter: [
          {
            exact: {
              field: 'variants.attributes.color',
              fieldType: 'ltext',
              language: 'en-US', // Always use BCP-47
              value: 'Blue',
            },
          },
        ],
      },
    ],
  },
  sort: [
    { field: 'name', language: 'en-US', order: 'asc' },
  ],
  facets: [
    {
      distinct: {
        name: 'categories',
        field: 'categories.id',
      },
    },
    {
      distinct: {
        name: 'sizes',
        field: 'variants.attributes.size',
        fieldType: 'enum',
      },
    },
    {
      ranges: {
        name: 'price-ranges',
        field: 'variants.prices.centAmount',
        ranges: [
          { from: 0,    to: 2000 },
          { from: 2000, to: 5000 },
          { from: 5000 },
        ],
      },
    },
  ],
  markMatchingVariants: true,
  limit: 20,
  offset: 0,
};

const { body } = await apiRoot.products().search().post({ body: searchRequest }).execute();
// body.results[].productProjection — mapped by lib/mappers/product.ts
// body.facets — array of ProductSearchFacetResult - ask commercetools-developer-tips about ProductSearchFacetResult
// body.total, body.offset, body.limit — for pagination
```

---

## Pattern 4: Category Filter

Filter to products in a category **and all its subcategories** using `categoriesSubTree`:

```typescript
const { body } = await apiRoot.products().search().post({
  body: {
    query: {
      exact: {
        field: 'categoriesSubTree',
        value: categoryId,   // commercetools category ID
      },
    },
    productProjectionParameters: {
      priceCurrency: 'USD',
      priceCountry:  'US',
    },
    limit: 24,
    offset: 0,
  },
}).execute();
```

Use `categoriesSubTree` instead of `categories` — `categories` matches only the exact category, not descendants.

---

## Pattern 5: SKU Lookup

Fetch a single product by exact SKU match:

```typescript
import type { ProductSearchRequest, ProductProjection } from '@commercetools/platform-sdk';

const { body } = await apiRoot.products().search().post({
  body: {
    query: {
      exact: {
        field: 'variants.sku',
        value: sku,
      },
    } as ProductSearchRequest['query'],
    productProjectionParameters: {
      priceCurrency: currency,
      priceCountry:  country,
      localeProjection: [locale],
    },
    limit: 1,
  },
}).execute();

const projection: ProductProjection | undefined = body.results[0]?.productProjection;
// projection is undefined when the SKU doesn't exist — call notFound() in the page
```

---

## Pattern 6: Price Selection

Pass `priceCurrency` + `priceCountry` in `productProjectionParameters`. commercetools selects the matching price tier automatically — each variant arrives with `.price` already resolved to the correct currency/country combination.

```typescript
productProjectionParameters: {
  priceCurrency: 'EUR',
  priceCountry:  'DE',
}
// variant.price is now the EUR price for Germany — no client-side filtering needed
```

---

## Pattern 7: Discount Expansion

**INCORRECT:** not expanding discount references — the discount name is `undefined`.

**CORRECT:** expand `masterVariant` and `variants` discount refs, and use SDK types in the mapper:

```typescript
// In the search call
productProjectionParameters: {
  priceCurrency: currency,
  priceCountry:  country,
  expand: [
    'masterVariant.price.discounted.discount',
    'variants[*].price.discounted.discount',
  ],
},
```

```typescript
// In the price mapper — use ProductDiscount, not any
import type { Price as CtPrice, ProductDiscount, LocalizedString } from '@commercetools/platform-sdk';

function mapPrice(ctPrice: CtPrice): Price {
  const discountObj = ctPrice.discounted?.discount?.obj as ProductDiscount | undefined;
  return {
    value: mapMoney(ctPrice.value),
    discounted: ctPrice.discounted
      ? {
          value:        mapMoney(ctPrice.discounted.value),
          discountName: getLocalizedString(discountObj?.name as LocalizedString | undefined, locale),
        }
      : undefined,
  };
}
```

Without expansion, `discount` is just `{ id: '...' }` — the `obj` field (the expanded resource) is absent.

---

## Checklist

- [ ] Using `apiRoot.products().search().post()` — never `productProjections().search().get()`
- [ ] No `any` or `unknown` casts — types imported from `@commercetools/platform-sdk`
- [ ] Category pages filter with `categoriesSubTree`, not `categories`
- [ ] `priceCurrency` + `priceCountry` set in `productProjectionParameters` for correct price selection
- [ ] SKU lookup uses `exact: { field: 'variants.sku', value: sku }`
- [ ] `markMatchingVariants: true` set when variant-level filtering is active
- [ ] Discount expansion added when rendering discount names or badges; mapper uses `ProductDiscount` type
