---
name: superuser
description: B2B superuser/CSR operations including detecting superuser role at login, listing all store carts, creating merchant-originated carts, and cart reassignment.
when_to_use:
  - "Implementing CSR agent features for B2B stores"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - csr
    - superuser
---

# Superuser / CSR

Superusers are associates whose commercetools associate role has the key `superuser`. They can view all active carts in their store, switch the active cart to any of them, create merchant-originated carts, and reassign carts to other associates.

## Session Flag

`isSuperuser: boolean` is stored in the server-managed session. It is detected at login and re-evaluated on BU selection.

### Detect at login

In the login server endpoint, after fetching `businessUnits`, derive the flag and write it into the session alongside the other fields:

```typescript
const SUPERUSER_ROLE_KEY = 'superuser';
const isSuperuser = businessUnits.some(bu =>
  bu.associates?.some(associate =>
    associate.customer.id === customer.id &&
    associate.associateRoleAssignments.some(a => a.associateRole.key === SUPERUSER_ROLE_KEY)
  )
);

await setSession({
  customerId: customer.id,
  isSuperuser,
  // ... other session fields
});
```

## commercetools Cart Functions (`<server>/ct/cart`)

### Fetch all active carts in a store

```typescript
export async function getAllSuperuserCarts(businessUnitKey: string, storeKey: string): Promise<Cart[]> {
  const response = await apiRoot
    .carts()
    .get({
      queryArgs: {
        where: [`cartState="Active"`, `store(key="${storeKey}")`, `businessUnit(key="${businessUnitKey}")`],
        limit: 20,
        sort: 'createdAt desc',
        expand: ['createdBy.customer'],  // avoids N+1 — creator info in one request
      },
    })
    .execute();

  return response.body.results.map(ct => ({
    id: ct.id,
    version: ct.version,
    origin: ct.origin,
    createdByEmail: (ct.createdBy as any)?.customer?.email,
    createdByName: [(ct.createdBy as any)?.customer?.firstName, (ct.createdBy as any)?.customer?.lastName]
      .filter(Boolean).join(' '),
    // ... rest of cart fields
  }));
}
```

**Use project-level `apiRoot.carts()`** (not as-associate) — superusers read carts they don't own.

### Create merchant-originated cart

```typescript
export async function createSuperuserCart(associateId, businessUnitKey, storeKey, currency = 'USD', country = 'US') {
  const response = await apiRoot
    .asAssociate()
    .withAssociateIdValue({ associateId })
    .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey })
    .carts()
    .post({
      body: {
        currency, country,
        origin: 'Merchant',  // commercetools-native way to mark merchant-created carts
        businessUnit: { key: businessUnitKey, typeId: 'business-unit' },
        store: { key: storeKey, typeId: 'store' },
      },
    })
    .execute();
  return response.body;
}
```

`origin: 'Merchant'` marks the cart as merchant-created. Do not set `customerId` — merchant carts are owner-less until reassigned.

### Reassign cart to another customer

```typescript
export async function reassignCart(cartId, version, associateId, businessUnitKey, targetCustomerId) {
  const response = await apiRoot
    .asAssociate()
    .withAssociateIdValue({ associateId })
    .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey })
    .carts()
    .withId({ ID: cartId })
    .post({ body: { version, actions: [{ action: 'setCustomerId', customerId: targetCustomerId }] } })
    .execute();
  return response.body;
}
```

## API Routes

| Route | Description |
|---|---|
| `GET /<api>/superuser/status` | Returns `{ isSuperuser, carts: [] }` — never 403 for non-superusers |
| `POST /<api>/superuser/carts` | Create merchant cart; writes new cartId to session |
| `POST /<api>/superuser/carts/switch` | Switch active cart; writes cartId to session |
| `POST /<api>/superuser/carts/[id]/reassign` | Reassign cart to `targetCustomerId` |

**`GET /<api>/superuser/status`** returns `{ isSuperuser: false, carts: [] }` for non-superusers — no 403, no information leakage.

## SuperuserContext

A `SuperuserProvider` owns superuser state, backed by client state, and exposes it via a `useSuperuser()` hook:

- **Status:** loaded from client state keyed by `KEY_SUPERUSER_STATUS` (endpoint `GET /<api>/superuser/status`), defaulting to `{ isSuperuser: false, carts: [] }`.
- **`switchCart(cartId)`:** POSTs to `/<api>/superuser/carts/switch`; on success invalidates the `KEY_CART` client state-manager/cache entry (forces the cart context to refetch) and does a full page reload so every component sees the new active cart.
- **`createMerchantCart()`:** POSTs to `/<api>/superuser/carts`, then refreshes the superuser cart list and invalidates the cart context.

> Find the stack's `concept-mapping.md` for concrete client-state and cache implementation.


## Layout Integration

In the root locale layout, nest the providers so `SuperuserProvider` sits inside `AuthProvider` and outside `CartProvider`:

```
AuthProvider
  └─ SuperuserProvider
       └─ BusinessUnitProvider
            └─ CartProvider
                 ├─ Header
                 ├─ SuperuserBanner   (amber banner shown only to superusers)
                 └─ main / page content
```
> Find the stack's `concept-mapping.md` for concrete provider nesting in the layout.

## UI Components

| Component | File | Purpose |
|---|---|---|
| `SuperuserBanner` | `components/superuser/SuperuserBanner.tsx` | Amber banner — "You are in superuser mode" |
| `CartBrowser` | `components/superuser/CartBrowser.tsx` | Dropdown listing all store carts — switch or create |
| `ReassignCartButton` | `components/superuser/ReassignCartButton.tsx` | Select from BU associates to reassign active cart |

`CartBrowser` appears as a dropdown from a caret next to the cart icon in the Header. `ReassignCartButton` appears on the cart page.

## commercetools Prerequisite

Create an associate role with key `superuser` in commercetools Merchant Center:
- Assign at minimum: `ViewOthersCarts`, `UpdateOthersCarts`, `CreateOthersCarts`
- Assign this role to the test user in their business unit

## Key Patterns

| Pattern | Why |
|---|---|
| Project-level `apiRoot.carts()` for listing | Superusers read carts they don't own |
| As-associate chain for create/reassign | commercetools enforces BU membership |
| `origin: 'Merchant'` in cart draft | commercetools-native merchant-cart marker |
| `expand: ['createdBy.customer']` | One query, no N+1 |
| `window.location.replace()` after switch | Full reload ensures all components see the new cart |
| Return `{ isSuperuser: false }` not 403 | No info leakage to non-superusers |

## Checklist

- [ ] `isSuperuser` stored in session at login — not re-checked on every request
- [ ] `GET /<api>/superuser/status` returns empty carts for non-superusers (never 403)
- [ ] `SuperuserProvider` inside `AuthProvider`, outside `CartProvider`
- [ ] `SuperuserBanner` rendered in layout (after Header, before main)
- [ ] commercetools associate role `superuser` created with correct permissions
