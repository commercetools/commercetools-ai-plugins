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

This reference covers the session JWT structure, what each B2B field means, how BU/store selection works, and the `BusinessUnitContext` that drives the UI.

## Table of Contents
- [Pattern 1: Session Fields](#pattern-1-session-fields)
- [Pattern 2: Store Channel Resolution](#pattern-2-store-channel-resolution)
- [Pattern 3: BU Selection — Writing the Session](#pattern-3-bu-selection--writing-the-session)
- [Pattern 4: BusinessUnitContext](#pattern-4-businessunitcontext)
- [Pattern 5: Reading Session Fields in API Routes](#pattern-5-reading-session-fields-in-api-routes)
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
// lib/types.ts — the full SessionData interface
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
  locale?: string;      // BCP-47, e.g. 'de-DE' — used for both Next.js routing and all commercetools API calls
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
| `locale` | `"de-DE"` | Next.js routing and all commercetools API calls: cart locale, order locale, product language |
| `currency` | `"CHF"` | Cart currency, price display |
| `country` | `"CH"` | `priceCountry` in product search; cart country |

---

## Pattern 2: Store Channel Resolution

**INCORRECT:** Calling `apiRoot.stores()` in every Route Handler — redundant network calls:

```typescript
// WRONG — called on every cart add, every product search
const store = await apiRoot.stores().withKey({ key: storeKey }).get().execute();
const distributionChannelId = store.body.distributionChannels?.[0]?.id;
```

**CORRECT — `getStoreChannelData(storeKey)` with module-level Map cache:**

```typescript
// lib/ct/stores.ts
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

```typescript
// app/api/business-units/[id]/select/route.ts
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.customerId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { businessUnitKey, storeKey } = await request.json();
  if (!businessUnitKey || !storeKey) {
    return NextResponse.json({ error: 'businessUnitKey and storeKey are required' }, { status: 400 });
  }

  // Resolve distributionChannelId, supplyChannelId, productSelectionId
  const { supplyChannelId, distributionChannelId, productSelectionId } =
    await getStoreChannelData(storeKey);

  const response = NextResponse.json({ success: true });
  await setSession(response, {
    ...session,
    businessUnitKey,
    storeKey,
    supplyChannelId,
    distributionChannelId,
    productSelectionId,
    // cartId intentionally kept — existing cart is still valid for the new BU+store
  });
  return response;
}
```

> The session update is atomic — all five B2B fields (`businessUnitKey`, `storeKey`, `supplyChannelId`, `distributionChannelId`, `productSelectionId`) are written in one `setSession` call, so there is never a partially-updated state.

---

## Pattern 4: BusinessUnitContext

**INCORRECT:** Letting each component call `fetch('/api/business-units')` independently:

```typescript
// WRONG — N fetches, no shared state, no auto-invalidation
useEffect(() => {
  fetch('/api/business-units').then(...);
}, []);
```

**CORRECT — `BusinessUnitProvider` owns all BU state, SWR-backed, auto-invalidates on logout:**

```typescript
// context/BusinessUnitContext.tsx (key excerpts)
'use client';

export function BusinessUnitProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [currentBusinessUnit, setCurrentBusinessUnit] = useState<BusinessUnit | null>(null);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);

  // Fetch BU list via SWR — null key when not logged in (skips fetch)
  const { data: buData } = useSWR<BusinessUnitsData>(
    isLoggedIn && !authLoading ? KEY_BUSINESS_UNITS : null,
    businessUnitsFetcher
  );

  // Auto-select on first load (persisted key from server, or first BU)
  useEffect(() => {
    if (businessUnits.length > 0 && !autoSelectedRef.current) {
      autoSelectedRef.current = true;
      const bu = persisted ?? businessUnits[0];
      const store = bu.stores?.[0];
      if (store) {
        selectBusinessUnitRequest(bu.id, bu.key, store.key)
          .then((ok) => {
            if (ok) { setCurrentBusinessUnit(bu); setCurrentStore(store); }
          });
      }
    }
  }, [businessUnits]);

  // Clear on logout — reset autoSelectedRef so next login re-picks
  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      setCurrentBusinessUnit(null);
      setCurrentStore(null);
      autoSelectedRef.current = false;
      globalMutate(KEY_BUSINESS_UNITS, { businessUnits: [] }, false);
    }
  }, [isLoggedIn, authLoading]);

  const selectBusinessUnit = useCallback(async (id: string) => {
    const bu = businessUnits.find((b) => b.id === id);
    const store = bu?.stores?.[0];
    if (!bu || !store) return;
    const ok = await selectBusinessUnitRequest(bu.id, bu.key, store.key);
    if (ok) { setCurrentBusinessUnit(bu); setCurrentStore(store); }
  }, [businessUnits]);

  const selectStore = useCallback(async (storeKey: string) => {
    if (!currentBusinessUnit) return;
    const store = currentBusinessUnit.stores?.find((s) => s.key === storeKey);
    if (!store) return;
    const ok = await selectBusinessUnitRequest(currentBusinessUnit.id, currentBusinessUnit.key, storeKey);
    if (ok) setCurrentStore(store);
  }, [currentBusinessUnit]);

  // ... rest of context value
}

export function useBusinessUnit(): BusinessUnitContextValue {
  const context = useContext(BusinessUnitContext);
  if (!context) throw new Error('useBusinessUnit must be used within BusinessUnitProvider');
  return context;
}
```

---

## Pattern 5: Reading Session Fields in API Routes

**INCORRECT:** Calling commercetools functions without passing the required B2B context:

```typescript
// WRONG — cart created without BU or store; product search returns global prices
const cart = await createCart(session.customerId, 'USD', 'US');
const products = await searchProducts({ query: '...' });
```

**CORRECT — extract all B2B fields, validate they exist, pass to commercetools helpers:**

```typescript
// In any B2B Route Handler that needs BU context
export async function POST(req: NextRequest) {
  const session = await getSession();
  const { customerId, businessUnitKey, storeKey } = session;

  if (!customerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!businessUnitKey || !storeKey) {
    return NextResponse.json({ error: 'No active business unit' }, { status: 400 });
  }

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
}
```

---

## Checklist

- [ ] `getStoreChannelData(storeKey)` called when resolving store → channel mapping
- [ ] All five B2B session fields written together in one `setSession()` call
- [ ] `businessUnitKey` and `storeKey` validated before any B2B Route Handler proceeds
- [ ] `session` passed to `searchProducts()` — never call with empty/partial session
- [ ] `BusinessUnitProvider` wraps the locale layout and is inside `AuthProvider`
- [ ] SWR keys for BU-scoped data use `[KEY, businessUnitKey]` tuple
- [ ] SWR cache cleared on logout (`globalMutate(KEY_BUSINESS_UNITS, { businessUnits: [] }, false)`)
