---
name: add-api
description: B2B additions to BFF endpoints covering client state-manager/cache key scoping to BU/store, as-associate API chain, and session field validation.
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

**Extends:** [add-api.md](../core/add-api.md) — read that reference first for the 3-layer BFF pattern, cache key conventions, server endpoint shape, commercetools helper structure, and client state-manager/cache mutation rules.

This reference covers B2B-specific additions only: scoping client state-manager/cache keys to BU and store, using the as-associate API chain in commercetools helpers, and validating both session fields in server endpoints.

---

## B2B Addition 1: client state-manager/cache keys must include BU and store context

**INCORRECT:** Flat cache key for B2B data — all BUs and stores share the same cached result:

```
WRONG — a flat client state-manager/cache key like `KEY_ORDERS` makes one BU's orders appear for every other BU.
```

**CORRECT — scope to `businessUnitKey`; add `storeKey` when data varies by store:**

```typescript
// <server>/cache-keys
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

A BU-scoped client-state hook (e.g. `useOrders`) reads `currentBusinessUnit.key` from the BU context and uses it as the cache key:

- **Cache key:** `[KEY_ORDERS, businessUnitKey]` tuple, or a null/empty key to skip the fetch when no BU is selected. The cache automatically re-fetches when the BU changes (key changes).
- **Endpoint:** the fetcher calls the BU-scoped order endpoint (e.g. `GET /<api>/orders`).
- **Mutations:** after a write (e.g. `cancelOrder`), invalidate the BU-scoped list state-manager/cache entry `[KEY_ORDERS, businessUnitKey]` and update the detail entry `keyOrder(orderId)` from the mutation response without a refetch.


> Find the stack's `concept-mapping.md` for concrete client-state and cache implementation.

> **Rule:** any data that differs per BU includes `buKey` in the client state-manager/cache key. Any data that also differs per store (prices, inventory, product selections) includes both `buKey` and `storeKey`.

---

## B2B Addition 2: commercetools helpers must use the as-associate chain

**INCORRECT:** Project-level `apiRoot` for user-facing B2B operations — commercetools does not enforce associate permissions:

```typescript
// WRONG — bypasses B2B permission model; commercetools will not check associate roles
const { body } = await apiRoot.orders().get(...).execute();
```

**CORRECT — all B2B reads and writes go through `asAssociate()`:**

```typescript
// <server>/ct/orders
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

> `associateId` is always `session.customerId`. `businessUnitKey` is always `session.businessUnitKey`. commercetools enforces associate permissions automatically — no app-level permission checks needed in the helper or server endpoint.

---

## B2B Addition 3: server endpoints validate both customerId AND businessUnitKey

**INCORRECT:** Only checking `customerId` — a logged-in user without a BU context can proceed and all as-associate calls will fail:

```
WRONG — guarding only on `session.customerId` (a 401 when it is absent) lets a logged-in user
without a BU context through, and every as-associate call then fails.
```

**CORRECT — validate both before any B2B operation:**

A B2B server endpoint (e.g. `GET /<api>/orders`) reads the session, then:

1. Return an Unauthorized (401) response unless **both** `session.customerId` and `session.businessUnitKey` are present.
2. Call the commercetools helper with both fields: `getOrders(session.customerId, session.businessUnitKey)`.
3. Return the mapped result, or an error response (500) with the error message on failure.


> Find the stack's `data-loading.md` for concrete server endpoint implementation pattern.

---

## Checklist (B2B additions to the shared checklist)

- [ ] client state-manager/cache keys for BU-scoped data use `[KEY, businessUnitKey]` tuple — empty/null key when `buKey` absent
- [ ] client state-manager/cache keys for store-scoped data (prices, inventory) use `[KEY, businessUnitKey, storeKey]` tuple
- [ ] commercetools helper uses `asAssociate().withAssociateIdValue(...).inBusinessUnitKeyWithBusinessUnitKeyValue(...)`
- [ ] server endpoint validates both `customerId` AND `businessUnitKey`
- [ ] After mutation: invalidate the BU-scoped list state-manager/cache entry `[KEY, buKey]`
