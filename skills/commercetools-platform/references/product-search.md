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

**Impact: HIGH — The Product Projection Search endpoint (`productProjections().search()`) is deprecated and lacks facets and proper variant matching. Always use the Product Search API, and fetch price and locale data through the GraphQL `productsSearch` query, not the deprecated `productProjectionParameters` option.**

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
const id = (result as any).id;
const discount = (ctPrice.discounted?.discount?.obj as any)?.name;
```

**CORRECT:** import and use the SDK types from `@commercetools/platform-sdk` directly.

```typescript
import type {
  ProductSearchResult,
  ProductVariant,
  Price as CtPrice,
  ProductDiscount,
  LocalizedString,
} from '@commercetools/platform-sdk';

// Result typing — Product Search returns IDs; fetch the Product data separately (Patterns 4–7)
const result: ProductSearchResult = body.results[0];
const productId: string = result.id;

// Expanded discount reference (Product Projections API with `expand`) — obj is typed as ProductDiscount | undefined
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
// body.results[].id — Product IDs; fetch the Product data with the GraphQL productsSearch query (Patterns 4–7)
// body.facets — array of ProductSearchFacetResult - ask commercetools-developer-tips about ProductSearchFacetResult
// body.total, body.offset, body.limit — for pagination
```

---

## Pattern 4: Category Filter

Filter to products in a category **and all its subcategories** using `categoriesSubTree`. Use the GraphQL `productsSearch` query so the matching Products come back in the same request, with price selection and locale projection applied:

```graphql
query CategoryProducts($categoryId: String!, $currency: Currency!, $country: Country!, $locale: Locale!) {
  productsSearch(
    query: { exact: { field: "categoriesSubTree", value: $categoryId } }
    limit: 24
    offset: 0
  ) {
    total
    results {
      id
      product(localesProjection: [$locale]) {
        masterData {
          current {
            name(locale: $locale)
            masterVariant {
              sku
              price(currency: $currency, country: $country) {
                value { currencyCode centAmount fractionDigits }
              }
            }
          }
        }
      }
    }
  }
}
```

```typescript
const { body } = await apiRoot.graphql().post({
  body: { query: CATEGORY_PRODUCTS, variables: { categoryId, currency: 'USD', country: 'US', locale: 'en-US' } },
}).execute();
```

Use `categoriesSubTree` instead of `categories` — `categories` matches only the exact category, not descendants.

---

## Pattern 5: SKU Lookup

Fetch a single product by exact SKU match:

```graphql
query ProductBySku($sku: String!, $currency: Currency!, $country: Country!, $locale: Locale!) {
  productsSearch(
    query: { exact: { field: "variants.sku", value: $sku } }
    limit: 1
  ) {
    results {
      id
      product(localesProjection: [$locale]) {
        masterData {
          current {
            name(locale: $locale)
            masterVariant {
              sku
              price(currency: $currency, country: $country) {
                value { currencyCode centAmount fractionDigits }
              }
            }
          }
        }
      }
    }
  }
}
```

`results` is empty when the SKU doesn't exist — call `notFound()` in the page.

---

## Pattern 6: Price Selection

**INCORRECT:** passing `productProjectionParameters` in the search request body. It is [deprecated](https://docs.commercetools.com/api/deprecations-and-removals.md#productsearchprojectionparams) (announced 11 December 2025) and will be removed.

**CORRECT:** pass `currency` and `country` to the `price` field of the Product Data you fetch through `productsSearch`. commercetools applies [price selection](https://docs.commercetools.com/api/pricing-and-discounts-overview.md#price-selection) and returns the price for that currency/country combination.

```graphql
price(currency: "EUR", country: "DE") {
  value { currencyCode centAmount fractionDigits }
}
# price is now the EUR price for Germany — no client-side filtering needed
```

To project Prices by Store, pass `storeProjection` to the `product` field. See [Locale and Store projection](https://docs.commercetools.com/api/graphql.md#locale-and-store-projection).

If you cannot use GraphQL, use the Product Search result IDs to query the [Product Projections API](https://docs.commercetools.com/api/projects/productProjections.md) with `priceCurrency` and `priceCountry`.

---

## Pattern 7: Discount Expansion

GraphQL resolves references, so there is nothing to expand. Select the discount name through `discounted.discount`:

```graphql
price(currency: $currency, country: $country) {
  value { currencyCode centAmount fractionDigits }
  discounted {
    value { currencyCode centAmount fractionDigits }
    discount { name(locale: $locale) }
  }
}
```

Map the result to your own price type from the generated GraphQL types, not `any`:

```typescript
function mapPrice(price: PriceFragment): Price {
  return {
    value: mapMoney(price.value),
    discounted: price.discounted
      ? {
          value:        mapMoney(price.discounted.value),
          discountName: price.discounted.discount.name ?? undefined,
        }
      : undefined,
  };
}
```

If you use the Product Projections API instead, add `expand=masterVariant.price.discounted.discount` and `expand=variants[*].price.discounted.discount` to the query, otherwise `discount` is just `{ id: '...' }` and the `obj` field is absent.

---

## Checklist

- [ ] Using `apiRoot.products().search().post()` — never `productProjections().search().get()`
- [ ] No `any` or `unknown` casts — types imported from `@commercetools/platform-sdk`
- [ ] Category pages filter with `categoriesSubTree`, not `categories`
- [ ] No `productProjectionParameters` (deprecated) — `currency` + `country` passed to the `price` field of `productsSearch` for correct price selection
- [ ] SKU lookup uses `exact: { field: 'variants.sku', value: sku }`
- [ ] `markMatchingVariants: true` set when variant-level filtering is active
- [ ] `discounted { discount { name } }` selected when rendering discount names or badges
