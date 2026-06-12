---
name: session-and-bu
description: B2B session fields, store channel resolution, business unit selection, and the BusinessUnitContext provider for managing BU/store state.
when_to_use:
  - "Building B2B storefront login flows"
  - "Resolving distribution and supply channels from a store key"
  - "Handling BU and store switching in the UI"
  - "Ensuring cart and product search are correctly scoped to a BU"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - session
    - auth
---

# Session & Business Unit Context

**Impact: CRITICAL — All B2B pricing, permissions, and API scoping derive from these session fields. Missing or stale fields produce unscoped prices, 403 errors, or wrong-BU data.**

This reference covers the server-managed session structure, what each B2B field means, how BU/store selection works, and the `BusinessUnitContext` that drives the UI.

## Table of Contents
- [Pattern 1: Session Fields](#pattern-1-session-fields)
- [Pattern 2: Store Channel Resolution](#pattern-2-store-channel-resolution)
- [Pattern 3: BU Selection — Writing the Session](#pattern-3-bu-selection--writing-the-session)
- [Pattern 4: BusinessUnitContext](#pattern-4-businessunitcontext)
- [Pattern 5: Reading Session Fields in Server Endpoints](#pattern-5-reading-session-fields-in-server-endpoints)
- [Checklist](#checklist)

---

## Pattern 1: Session Fields

**INCORRECT:** Treating the session as just auth + cart:

```typescript
// WRONG — missing B2B fields; product prices and cart scoping will be wrong
await setSession(response, {
  customerId: customer.id,
  cartId: undefined,
  locale: 'en-US', // BCP-47 locale must come with currency and country
});
```

**CORRECT — all B2B fields written together in one `setSession` call:**

```typescript
// <server>/types — the full SessionData interface
export interface SessionData {
  // Auth
  customerId?: string;
  customerEmail?: string;
  customerFirstName?: string;
  customerLastName?: string;

  // Active cart
  cartId?: string;

  // B2B context — resolved from the active store at login / BU-select
  businessUnitKey?: string;         // commercetools Business Unit key — used as associateId context
  storeKey?: string;                // commercetools Store key — scopes product visibility
  supplyChannelId?: string;         // commercetools Channel ID — used for inventory display
  distributionChannelId?: string;   // commercetools Channel ID — used for price scoping
  productSelectionId?: string;      // commercetools ProductSelection ID — restricts visible products

  /** Customer group IDs for priceCustomerGroupAssignments in product search */
  accountGroupIds?: string[];

  // Locale (always write all three together)
  locale?: string;      // BCP-47, e.g. 'de-DE' — used for both framework locale routing and all commercetools API calls
  currency?: string;    // ISO 4217, e.g. 'EUR'
  country?: string;     // ISO 3166-1 alpha-2, e.g. 'DE'
}
```

**Session field cheat-sheet:**

| Field | Example | Used in |
|---|---|---|
| `customerId` | `"abc123"` | `associateId` in every as-associate chain call |
| `businessUnitKey` | `"acme-eu"` | `businessUnitKey` in every as-associate chain call |
| `storeKey` | `"acme-eu-de"` | `storeProjection` in product search; cart `store` reference |
| `distributionChannelId` | `"ch-abc"` | `priceChannel` in product search; line item `distributionChannel` |
| `supplyChannelId` | `"sc-abc"` | Passed to `mapProduct` for availability display |
| `productSelectionId` | `"ps-abc"` | Stored for reference; commercetools auto-enforces via `storeKey` |
| `accountGroupIds` | `["cg-abc"]` | `priceCustomerGroupAssignments` in product search |
| `locale` | `"de-DE"` | framework locale routing and all commercetools API calls: cart locale, order locale, product language |
| `currency` | `"CHF"` | Cart currency, price display |
| `country` | `"CH"` | `priceCountry` in product search; cart country |

---

## Pattern 2: Store Channel Resolution

**INCORRECT:** Calling `apiRoot.stores()` in every server endpoint — redundant network calls:

```typescript
// WRONG — called on every cart add, every product search
const store = await apiRoot.stores().withKey({ key: storeKey }).get().execute();
const distributionChannelId = store.body.distributionChannels?.[0]?.id;
```

**CORRECT — `getStoreChannelData(storeKey)` with module-level Map cache:**

```typescript
// <server>/ct/stores
export interface StoreChannelData {
  storeId: string | undefined;
  supplyChannelId: string | undefined;
  distributionChannelId: string | undefined;
  productSelectionId: string | undefined;
}

const storeDataCache = new Map<string, StoreChannelData>();

export async function getStoreChannelData(storeKey: string): Promise<StoreChannelData> {
  if (storeDataCache.has(storeKey)) return storeDataCache.get(storeKey)!;
  try {
    const { body } = await apiRoot.stores().withKey({ key: storeKey }).get().execute();
    const data: StoreChannelData = {
      storeId: body.id,
      supplyChannelId: body.supplyChannels?.[0]?.id,
      distributionChannelId: body.distributionChannels?.[0]?.id,
      productSelectionId: body.productSelections?.[0]?.productSelection?.id,
    };
    storeDataCache.set(storeKey, data);
    return data;
  } catch {
    return { storeId: undefined, supplyChannelId: undefined, distributionChannelId: undefined, productSelectionId: undefined };
  }
}
```

> `storeDataCache` is a module-level `Map` — it persists for the server instance lifetime with no TTL. It is the **single source of truth** for all store → channel mappings. All call sites import `getStoreChannelData` from this file.

---

## Pattern 3: BU Selection — Writing the Session

**INCORRECT:** Writing only `businessUnitKey` and `storeKey` without channel data:

```typescript
// WRONG — products will return unscoped prices; cart creation will fail
await setSession(response, { ...session, businessUnitKey, storeKey });
```

**CORRECT — resolve all channel data from the store, then write the full session:**

The BU-select server endpoint (e.g. `POST .../business-units/[id]/select`):

1. Reads the session; returns Not authenticated (401) unless `session.customerId` is present.
2. Reads `{ businessUnitKey, storeKey }` from the request body; returns a validation error (400) if either is missing.
3. Resolves the channel IDs from the store, then writes the full session and returns success:

```typescript
// Resolve distributionChannelId, supplyChannelId, productSelectionId
const { supplyChannelId, distributionChannelId, productSelectionId } =
  await getStoreChannelData(storeKey);

await setSession({
  ...session,
  businessUnitKey,
  storeKey,
  supplyChannelId,
  distributionChannelId,
  productSelectionId,
  // cartId intentionally kept — existing cart is still valid for the new BU+store
});
```

> Find the stack's `data-loading.md` for concrete server endpoint patterns.


> The session update is atomic — all five B2B fields (`businessUnitKey`, `storeKey`, `supplyChannelId`, `distributionChannelId`, `productSelectionId`) are written in one `setSession` call, so there is never a partially-updated state. Where the session is stored (a signed token or a server-side store) is a stack choice.

---

## Pattern 4: BusinessUnitContext

**INCORRECT:** Letting each component fetch `GET /<api>/business-units` independently — N fetches, no shared state, no auto-invalidation.

**CORRECT — a single `BusinessUnitProvider` owns all BU state, backed by client state, and auto-invalidates on logout.** It exposes `currentBusinessUnit`, `currentStore`, `businessUnits`, plus `selectBusinessUnit`/`selectStore` actions via the `useBusinessUnit()` hook. Behaviour the provider implements:

- **BU list:** loaded from client state keyed by `KEY_BUSINESS_UNITS`, with an empty/null key while logged out (skips the fetch). Endpoint: `GET /<api>/business-units`.
- **Auto-select on first load:** when the BU list resolves and nothing is selected yet, pick the persisted BU (from the session) or the first BU, take its first store, and call the BU-select endpoint; on success set `currentBusinessUnit` and `currentStore`.
- **`selectBusinessUnit(id)`:** find the BU, take its first store, call the BU-select endpoint, and update current BU + store on success.
- **`selectStore(storeKey)`:** within the current BU, find the store, call the BU-select endpoint, and update the current store on success.
- **Clear on logout:** reset current BU/store and the auto-select guard, and clear the `KEY_BUSINESS_UNITS` client state-manager/cache entry so the next login re-picks.

> Find the stack's `concept-mapping.md` for concrete client-state and cache implementation.


---

## Pattern 5: Reading Session Fields in Server Endpoints

**INCORRECT:** Calling commercetools functions without passing the required B2B context — a cart created without BU or store, and product search that returns global prices:

```typescript
// WRONG — missing BU/store context
const cart = await createCart(session.customerId, 'USD', 'US');
const products = await searchProducts({ query: '...' });
```

**CORRECT — extract all B2B fields, validate they exist, pass to commercetools helpers.** In any B2B server endpoint that needs BU context: read the session, return Unauthorized (401) when `customerId` is absent and a No-active-business-unit error (400) when `businessUnitKey`/`storeKey` are absent, then call the commercetools helpers:

```typescript
// Pass session to product search — ProductApi reads all B2B fields internally
const results = await searchProducts(query, session);

// Pass all required args to cart helper
const cart = await createCart(
  customerId,
  customerId,          // associateId = customerId in B2B
  businessUnitKey,
  storeKey,
  session.currency ?? 'USD',
  session.country ?? 'US',
);
```

---

## Checklist

- [ ] `getStoreChannelData(storeKey)` called when resolving store → channel mapping
- [ ] All five B2B session fields written together in one `setSession()` call
- [ ] `businessUnitKey` and `storeKey` validated before any B2B server endpoint proceeds
- [ ] `session` passed to `searchProducts()` — never call with empty/partial session
- [ ] `BusinessUnitProvider` wraps the locale layout and is inside `AuthProvider`
- [ ] client state-manager/cache keys for BU-scoped data use `[KEY, businessUnitKey]` tuple
- [ ] `KEY_BUSINESS_UNITS` client state-manager/cache entry cleared on logout
