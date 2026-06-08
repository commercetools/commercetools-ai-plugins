---
name: product-listing
description: Session-scoped product search via ProductApi, price injection, store category filtering, availability via supplyChannelId, and facet retry patterns.
when_to_use:
  - "Building B2B product listing pages"
  - "Implementing session-scoped pricing in search results"
  - "Filtering categories by store channel"
  - "Displaying channel-specific availability on PLP"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - search
    - plp
---

# Product Listing & Session-Scoped Pricing

**Impact: CRITICAL — Omitting session fields from product search produces global (unscoped) prices or "Price on request" instead of the customer's negotiated prices.**

This reference covers `ProductApi` session injection, how `distributionChannelId`, `storeKey`, and `accountGroupIds` scope prices, and how `supplyChannelId` drives availability display.

## Table of Contents
- [Pattern 1: Session-Scoped Product Search](#pattern-1-session-scoped-product-search)
- [Pattern 2: Price Injection via buildProjectionParams](#pattern-2-price-injection-via-buildprojectionparams)
- [Pattern 3: Store-Scoped Category Filtering](#pattern-3-store-scoped-category-filtering)
- [Pattern 4: Availability via supplyChannelId](#pattern-4-availability-via-supplychannelid)
- [Pattern 5: Facet Retry on commercetools Error](#pattern-5-facet-retry-on-commercetools-error)
- [Checklist](#checklist)

---

## Pattern 1: Session-Scoped Product Search

**INCORRECT:** Calling `searchProducts` without the session — returns global prices:

```typescript
// WRONG — no channel context; commercetools returns unscoped prices or "Price on request"
const results = await searchProducts({ query: searchTerm, locale: 'en-US' });
```

**CORRECT — always pass `session` to `searchProducts()`:**

```typescript
// app/api/products/route.ts
export async function POST(request: NextRequest) {
  const session = await getSession();
  const body = await request.json();

  // searchProducts reads businessUnitKey, storeKey, distributionChannelId,
  // supplyChannelId, accountGroupIds from session internally
  const results = await searchProducts(body, session);
  return NextResponse.json(results);
}
```

```typescript
// lib/ct/products.ts — thin wrapper over ProductApi
export async function searchProducts(
  query: ProductQuery,
  session?: Partial<SessionData>
): Promise<ProductPaginatedResult> {
  const s = session ?? (await getSession());
  return new ProductApi(s).query(query);
}
```

> `ProductApi` reads all B2B fields from the session automatically. The caller passes the full session and `ProductApi` injects the appropriate commercetools parameters.

---

## Pattern 2: Price Injection via buildProjectionParams

**INCORRECT:** Building `productProjectionParameters` manually without channel/store scoping:

```typescript
// WRONG — prices not scoped to the customer's distribution channel
productProjectionParameters: {
  priceCurrency: currency,
  priceCountry: country,
}
```

**CORRECT — `ProductApi.buildProjectionParams()` injects all B2B scoping parameters:**

```typescript
// lib/ct/product-api.ts (key excerpt)
private buildProjectionParams(
  locale: Locale,
  distributionChannelId?: string,
  storeKey?: string,
  accountGroupIds?: string[]
): ProductSearchProjectionParams {
  return {
    priceCurrency: locale.currency,
    priceCountry: locale.country,
    expand: PRODUCT_PROJECTION_EXPANDS,
    // Channel-scoped pricing — customer's negotiated prices for this distribution channel
    ...(distributionChannelId ? { priceChannel: distributionChannelId } : {}),
    // Store projection — restricts to products in this store's product selection
    ...(storeKey ? { storeProjection: storeKey } : {}),
    // Customer group pricing — B2B contract prices for this customer group
    ...(accountGroupIds?.length ? { priceCustomerGroupAssignments: accountGroupIds } : {}),
  };
}
```

**What each parameter does:**

| Parameter | Session field | commercetools effect |
|---|---|---|
| `priceChannel` | `distributionChannelId` | Returns only prices assigned to this distribution channel |
| `storeProjection` | `storeKey` | Filters to products in the store's product selection |
| `priceCustomerGroupAssignments` | `accountGroupIds` | Applies B2B contract pricing for the customer's group |
| `priceCurrency` | `currency` | Returns prices in this currency |
| `priceCountry` | `country` | Applies country-specific price scoping |

> When the user is not logged in (no store context), all these fields are absent and commercetools returns global prices or "Price on request". This is intentional — B2B pricing requires authentication.

---

## Pattern 3: Store-Scoped Category Filtering

**INCORRECT:** Showing all categories regardless of store product selection:

```typescript
// WRONG — shows categories that have no products in the active store
const categories = await getCategories();
```

**CORRECT — `ProductApi.queryCategories` uses the store's product selection to filter:**

```typescript
// lib/ct/product-api.ts (key excerpt)
async queryCategories(categoryQuery: CategoryQuery) {
  const storeKey = categoryQuery.storeKey ?? this.session.storeKey;
  if (storeKey) {
    const { storeId } = await getStoreChannelData(storeKey);
    if (storeId) {
      // Get category IDs that have at least one product in this store
      const categoryIds = await this.getCategoryIdsForStore(storeId);
      if (categoryIds?.length) {
        where.push(`id in ("${categoryIds.join('","')}")`);
      }
    }
  }
  // ...
}

// getCategoryIdsForStore uses the categoriesSubTree facet —
// one Product Search API call returns all category IDs with products in the store
private async getCategoryIdsForStore(storeId: string): Promise<string[] | undefined> {
  const response = await apiRoot.products().search().post({
    body: {
      query: { exact: { field: 'stores', value: storeId } },
      facets: [{
        distinct: {
          name: 'categoriesSubTree',
          field: 'categoriesSubTree',
          level: 'products',
          limit: 200,
        },
      }],
    },
  }).execute();
  // Returns only category IDs that have > 0 products in this store
  return facet.buckets.filter((b) => b.count > 0).map((b) => b.key);
}
```

---

## Pattern 4: Availability via supplyChannelId

**INCORRECT:** Using a global in-stock flag without channel context:

```typescript
// WRONG — shows availability without considering the store's supply channel
const inStock = product.variants[0].availability?.isOnStock;
```

**CORRECT — pass `supplyChannelId` to the product mapper:**

```typescript
// lib/ct/product-api.ts (in query method)
const items = searchResults.map((r) =>
  mapProduct(
    r.productProjection!,
    matchingIds,
    locale, // Always use BCP-47
    this.session.supplyChannelId  // ← inventory display for this supply channel
  )
);

// lib/mappers/product.ts
export function mapProduct(
  projection: ProductProjection,
  matchingVariantIds: Set<number> | null,
  locale: string,
  supplyChannelId?: string
): Product {
  // For each variant, check inventory for this specific supply channel
  const availability = supplyChannelId
    ? variant.availability?.channels?.[supplyChannelId]
    : variant.availability;

  return {
    // ...
    variants: variants.map((v) => ({
      // ...
      availability: {
        isOnStock: availability?.isOnStock ?? false,
        availableQty: availability?.availableQuantity,
      },
    })),
  };
}
```

> `supplyChannelId` is NOT sent as a commercetools query parameter — it is only used by the mapper to pick the right channel's inventory data from the response. commercetools returns all channel inventory when no channel filter is applied.

---

## Pattern 5: Facet Retry on commercetools Error

**INCORRECT:** Letting a bad facet expression crash the entire product page:

```typescript
// WRONG — commercetools 400 on invalid facet expression leaves the user with an error page
const results = await searchProducts({ facetConfigurations });
```

**CORRECT — `POST /api/products` retries without facets on commercetools error:**

```typescript
// app/api/products/route.ts
export async function POST(request: NextRequest) {
  const session = await getSession();
  const body = await request.json();

  try {
    const results = await searchProducts(body, session);
    return NextResponse.json(results);
  } catch (error) {
    // Retry without facets — products always render even if facets fail
    console.warn('Product search failed with facets, retrying without:', error);
    try {
      const results = await searchProducts({ ...body, facetConfigurations: [] }, session);
      return NextResponse.json(results);
    } catch (fallbackError) {
      return NextResponse.json({ error: 'Product search failed' }, { status: 500 });
    }
  }
}
```

---

## Checklist

- [ ] `searchProducts(query, session)` called with full session — never with empty session
- [ ] `buildProjectionParams` includes `priceChannel`, `storeProjection`, `priceCustomerGroupAssignments`
- [ ] `supplyChannelId` passed to `mapProduct` (from `session.supplyChannelId`)
- [ ] Category listing calls `queryCategories` with store context to filter empty categories
- [ ] Product search API retries without facets on commercetools error (products always load)
- [ ] Unauthenticated users see "Price on request" — intentional, no fix needed
