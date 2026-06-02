---
name: cart
description: B2B cart CRUD using the as-associate chain with BU and store context, auto-creation on first item add, and distribution channel scoping.
when_to_use:
  - "Implementing cart operations for B2B users"
  - "Handling cart creation with BU/store context"
  - "Managing distribution channel references"
  - "Implementing cart operations via the as-associate API"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - cart
    - session
    - permissions
---

# Cart — B2B extensions

**Impact: CRITICAL — All B2B cart operations must go through the as-associate chain. Using the project-level `apiRoot.carts()` bypasses associate permission enforcement and breaks B2B semantics.**

Start from the shared cart [reference](../core/cart.md).
Implement Patterns 1, 2, and 3 (helper functions, route handlers, SWR hook) from that reference first,
then layer the B2B requirements below on top of each of them.

## Table of Contents
- [B2B Extension: The as-associate Chain](#b2b-extension-the-as-associate-chain)
- [B2B Extension: Cart Creation with BU + Store Context](#b2b-extension-cart-creation-with-bu--store-context)
- [B2B Extension: Auto-Creation on First Item Add](#b2b-extension-auto-creation-on-first-item-add)
- [B2B Extension: Distribution Channel on Line Items](#b2b-extension-distribution-channel-on-line-items)
- [Checklist](#checklist)

---

## B2B Extension: The as-associate Chain

Extends **Pattern 1** (helper functions) from the shared reference.

Every function in `lib/ct/cart.ts` that reaches for `apiRoot.carts()` must instead go through an
as-associate helper. The project-level `carts()` endpoint does not evaluate associate permissions.

```typescript
// lib/ct/cart.ts
function asAssociateInStore(associateId: string, businessUnitKey: string) {
  return apiRoot
    .asAssociate()
    .withAssociateIdValue({ associateId })
    .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey })
    .carts();
}
```

Every exported helper then accepts `associateId` and `businessUnitKey` as additional parameters and
routes through this builder. The `associateId` is always `session.customerId`; `businessUnitKey` is
always `session.businessUnitKey`. Both are mandatory — never make them optional.

---

## B2B Extension: Cart Creation with BU + Store Context

Extends **Pattern 1** (cart creation helper) and **Pattern 2** (POST route handler) from the shared reference.

The cart draft must carry both a `businessUnit` and a `store` reference. Without them commercetools will not
enforce associate permissions and the cart will not be visible within the correct BU scope.

```typescript
// lib/ct/cart.ts
export async function createCart(
  customerId: string,
  associateId: string,
  businessUnitKey: string,
  storeKey: string,
  currency = 'USD',
  country = 'US'
) {
  const { body } = await asAssociateInStore(associateId, businessUnitKey)
    .post({
      body: {
        currency,
        country,
        customerId,
        businessUnit: { key: businessUnitKey, typeId: 'business-unit' },
        store: { key: storeKey, typeId: 'store' },
      },
    })
    .execute();
  return mapCart(body);
}
```

In the POST route handler, validate that `businessUnitKey` and `storeKey` are present in the session
before calling `createCart` — return `400` if either is missing.

---

## B2B Extension: Auto-Creation on First Item Add

Extends **Pattern 2** (POST `/api/cart/items` route handler) from the shared reference.

The auto-creation logic from the shared reference still applies. In B2B the `createCart` call also
requires `associateId` and `businessUnitKey`, and the distribution channel must be resolved before
the `addLineItem` call (see next section). Write `cartId` to the session before calling `addLineItem`
so it is persisted even if the item add fails.

---

## B2B Extension: Distribution Channel on Line Items

Extends **Pattern 1** (`addLineItem` helper) from the shared reference.

Without a distribution channel reference, commercetools may select the wrong price or no price at all.
Resolve the channel once from the store with `getStoreChannelData(storeKey)` (shared cache) and
pass it to every `addLineItem` call.

```typescript
// lib/ct/cart.ts
export async function addLineItem(
  cartId: string, version: number,
  productId: string, variantId: number, quantity: number,
  associateId: string, businessUnitKey: string, storeKey: string,
  distributionChannelId?: string,
  locale?: string
) {
  const action: CartAddLineItemAction = {
    action: 'addLineItem',
    productId,
    variantId,
    quantity,
    ...(distributionChannelId
      ? { distributionChannel: { id: distributionChannelId, typeId: 'channel' } }
      : {}),
  };

  const { body } = await asAssociateInStore(associateId, businessUnitKey)
    .withId({ ID: cartId })
    .post({ body: { version, actions: [action] } })
    .execute();
  return mapCart(body, locale);
}
```

---

## Checklist

- [ ] All cart read/write operations use `asAssociateInStore(session.customerId, session.businessUnitKey)`
- [ ] Cart draft includes both `businessUnit: { key, typeId: 'business-unit' }` and `store: { key, typeId: 'store' }`
- [ ] POST route validates `businessUnitKey` and `storeKey` are present before creating a cart
- [ ] `distributionChannelId` from `getStoreChannelData(storeKey)` passed to every `addLineItem`
- [ ] `cartId` written to session before `addLineItem` call during auto-creation
- [ ] `session.cartId` cleared after successful order placement or quote request creation
