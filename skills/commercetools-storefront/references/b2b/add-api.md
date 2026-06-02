---
name: add-api
description: B2B additions to BFF endpoints covering SWR cache key scoping to BU/store, as-associate API chain, and session field validation.
when_to_use:
  - "Adding a new API endpoint for B2B operations"
  - "Implementing BU-scoped data fetching"
  - "Using the as-associate API chain"
  - "Validating both customerId and businessUnitKey in session"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - session
    - permissions
---

# Adding a BFF API Endpoint (B2B)

**Extends:** [add-api.md](../core/add-api.md) — read that reference first for the 3-layer BFF pattern, cache key conventions, Route Handler shape, commercetools helper structure, and SWR mutation rules.

This reference covers B2B-specific additions only: scoping SWR cache keys to BU and store, using the as-associate API chain in commercetools helpers, and validating both session fields in Route Handlers.

---

## B2B Addition 1: SWR cache keys must include BU and store context

**INCORRECT:** Flat cache key for B2B data — all BUs and stores share the same cached result:

```typescript
// WRONG — one BU's orders appear for every other BU
return useSWR(KEY_ORDERS, fetcher);
```

**CORRECT — scope to `businessUnitKey`; add `storeKey` when data varies by store:**

```typescript
// lib/cache-keys.ts
export const KEY_ORDERS = 'orders';
export function keyOrder(id: string) { return `order-${id}`; }

// BU-scoped: orders, quotes, approval flows, purchase lists
export function keyOrdersByBU(buKey: string) {
  return [KEY_ORDERS, buKey] as const;
}

// Store-scoped: prices, inventory, product selections differ per store
export function keyProductsByStore(buKey: string, storeKey: string) {
  return [KEY_PRODUCTS, buKey, storeKey] as const;
}
```

```typescript
// hooks/useOrders.ts
export function useOrders() {
  const { currentBusinessUnit } = useBusinessUnit();
  const buKey = currentBusinessUnit?.key ?? null;

  return useSWR<Order[]>(
    buKey ? [KEY_ORDERS, buKey] : null,   // null = skip fetch when no BU selected
    ([, bk]) => ordersFetcher(bk),
    { revalidateOnFocus: false }
  );
}

export function useOrderMutations() {
  const { mutate } = useSWRConfig();
  const { currentBusinessUnit } = useBusinessUnit();

  async function cancelOrder(orderId: string) {
    const updated = await cancelOrderRequest(orderId); // throws on error
    const buKey = currentBusinessUnit?.key;
    if (buKey) mutate([KEY_ORDERS, buKey]);                          // invalidate list
    mutate(keyOrder(orderId), updated.order, { revalidate: false }); // update detail
  }

  return { cancelOrder };
}
```

> **Rule:** any data that differs per BU includes `buKey` in the SWR key. Any data that also differs per store (prices, inventory, product selections) includes both `buKey` and `storeKey`.

---

## B2B Addition 2: commercetools helpers must use the as-associate chain

**INCORRECT:** Project-level `apiRoot` for user-facing B2B operations — commercetools does not enforce associate permissions:

```typescript
// WRONG — bypasses B2B permission model; commercetools will not check associate roles
const { body } = await apiRoot.orders().get(...).execute();
```

**CORRECT — all B2B reads and writes go through `asAssociate()`:**

```typescript
// lib/ct/orders.ts
export async function getOrders(
  associateId: string,
  businessUnitKey: string
): Promise<Order[]> {
  const { body } = await apiRoot
    .asAssociate()
    .withAssociateIdValue({ associateId })
    .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey })
    .orders()
    .get({ queryArgs: { sort: 'createdAt desc', limit: 20 } })
    .execute();
  return body.results.map(mapOrder); // always map before returning
}
```

> `associateId` is always `session.customerId`. `businessUnitKey` is always `session.businessUnitKey`. commercetools enforces associate permissions automatically — no app-level permission checks needed in the helper or Route Handler.

---

## B2B Addition 3: Route Handlers validate both customerId AND businessUnitKey

**INCORRECT:** Only checking `customerId` — a logged-in user without a BU context can proceed and all as-associate calls will fail:

```typescript
// WRONG
if (!session.customerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

**CORRECT — validate both before any B2B operation:**

```typescript
// app/api/orders/route.ts
export async function GET() {
  const session = await getSession();
  if (!session.customerId || !session.businessUnitKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const orders = await getOrders(session.customerId, session.businessUnitKey);
    return NextResponse.json({ orders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch orders';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

---

## Checklist (B2B additions to the shared checklist)

- [ ] SWR keys for BU-scoped data use `[KEY, businessUnitKey]` tuple — `null` when `buKey` absent
- [ ] SWR keys for store-scoped data (prices, inventory) use `[KEY, businessUnitKey, storeKey]` tuple
- [ ] commercetools helper uses `asAssociate().withAssociateIdValue(...).inBusinessUnitKeyWithBusinessUnitKeyValue(...)`
- [ ] Route Handler validates both `customerId` AND `businessUnitKey`
- [ ] After mutation: `mutate([KEY, buKey])` to invalidate BU-scoped list
