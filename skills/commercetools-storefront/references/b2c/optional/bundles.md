---
name: bundles
description: Product bundles via parent/child line items linked by parentKey custom field, cascade cart operations, the bundleItems() grouping function, and bundle UI rendering.
when_to_use:
  - "Creating and managing bundled products"
  - "Running the custom type setup script for bundles"
  - "Cascading mutations such as quantity changes and removals to children"
  - "Displaying bundled children as sub-rows in the cart"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - bundles
    - cart
---

# B2C Product Bundles

Bundles are a parent line item with child line items linked by a commercetools custom field `parentKey`. All cart mutations cascade from parent to all matching children. `bundleItems()` groups them before any component sees the data.

## Key Takeaways

**Run the commercetools setup script first.** `node tools/create-bundles-custom-type.mjs` creates the custom type `line-item-additional-info` with a `parentKey` String field. This must exist in commercetools before any bundle add-to-cart calls.

**`parentKey` is the cascade link.** Parent line items get a UUID `key`. Children get `custom.fields.parentKey` set to that UUID. Without this, removing the parent leaves orphaned children in the cart.

**Cascade all mutations in one `applyCartAction` call.** `changeLineItemQuantity` and `removeLineItem` must batch parent + all child actions together — not sequential calls that can race on the cart version.

**`bundleItems()` runs in the SWR fetcher, not in components.** Apply grouping once in `cartFetcherWithBundles` inside `useCartSWR` so every component receives pre-grouped data. No grouping logic in components.

**`cartItemCount()` excludes children from the badge.** Filter `!i.parentKey` before summing quantities — children are display-only sub-rows.

## Anti-Patterns

| Anti-pattern | Correct approach |
|---|---|
| Adding children without a `parentKey` link | Parent gets UUID `key`; children get `custom.fields.parentKey` referencing it |
| Removing parent without cascade | Find children by `parentKey === parent.key`, batch all removals in one action call |
| Grouping in a component | Apply `bundleItems()` in `cartFetcher` — components receive pre-grouped data |
| Counting children in cart badge | `cartItemCount()` filters `!i.parentKey` before summing |
| Sequential action calls for cascades | Batch all actions in a single `applyCartAction` to avoid 409 version conflicts |

## Reference

| Task | Reference |
|---|---|
| commercetools setup script, CartLineItem extension, cascade cart operations, cart-mapper, items route, bundle-utils, useCartSWR fetcher override, CartItem UI, BundleAddToCart component | [bundles.md](./bundles.md) |



# Bundles

**Impact: MEDIUM — Bundle children must be linked to their parent via a commercetools custom field (`parentKey`). Without it, removing the parent leaves orphaned child line items in the cart.**

Bundles are implemented as a parent line item with child line items linked by a `parentKey` custom field. All cart operations cascade from parent to children.

## Table of Contents
- [Pattern 1: commercetools Setup](#pattern-1-commercetools-setup)
- [Pattern 2: CartLineItem Extension](#pattern-2-cartlineitem-extension)
- [Pattern 3: Cart Operations](#pattern-3-cart-operations)
- [Pattern 4: cart-mapper.ts](#pattern-4-cart-mapperts)
- [Pattern 5: items/route.ts](#pattern-5-itemsroutets)
- [Pattern 6: bundle-utils.ts](#pattern-6-bundle-utilsts)
- [Pattern 7: useCartSWR](#pattern-7-usecartswr)
- [Pattern 8: UI](#pattern-8-ui)


## Pattern 1: commercetools Setup

Create the custom type for line items with a `parentKey` field:

```bash
node tools/create-bundles-custom-type.mjs
```

This creates a commercetools custom type `line-item-additional-info` with a `parentKey` String field.

In commercetools Merchant Center, add a bundle attribute to the product type:
- Type: `Set` of `Reference` to `Product`
- Name: `bundledProducts` (or similar)
- Searchable: no


## Pattern 2: CartLineItem Extension

```typescript
// site/types/index.ts
export interface CartLineItem {
  id:              string;
  sku:             string;
  name:            string;
  quantity:        number;
  price:           Money;
  totalPrice:      Money;
  imageUrl?:       string;
  // Bundle fields
  key?:            string;              // UUID — set on parent line items
  parentKey?:      string;             // references parent's key — set on children
  bundledItems?:   CartLineItem[];     // populated by bundleItems() — not from commercetools
}
```


## Pattern 3: Cart Operations

**INCORRECT:** adding children without a key link — orphaned on parent removal.

```typescript
// BAD — no parentKey, no way to cascade removal
await addLineItem(cartId, version, childSku, 1);
```

**CORRECT — parent gets UUID key, children reference it via `custom.fields.parentKey`:**

```typescript
// site/lib/ct/cart.ts
import { v4 as uuidv4 } from 'uuid';

export async function addLineItem(
  cartId: string, cartVersion: number, productId: string, variantId: number, quantity: number, key?: string
) {
  const { body } = await apiRoot.carts().withId({ ID: cartId }).post({
    body: {
      version: cartVersion,
      actions: [{ action: 'addLineItem', productId, variantId, quantity, ...(key && { key }) }],
    },
  }).execute();
  return body;
}

export async function addBundledLineItems(
  cartId: string, cartVersion: number, parentKey: string, childSkus: string[]
) {
  const actions: CartUpdateAction[] = childSkus.map((sku) => ({
    action: 'addLineItem',
    sku,
    quantity: 1,
    custom: {
      type: { key: 'line-item-additional-info' },
      fields: { parentKey },             // ← links child to parent
    },
  }));
  const { body } = await apiRoot.carts().withId({ ID: cartId }).post({
    body: { version: cartVersion, actions },
  }).execute();
  return body;
}

// Cascade quantity change to all children
export async function changeLineItemQuantity(
  cart: Cart, lineItemId: string, quantity: number
) {
  const item = cart.lineItems.find((i) => i.id === lineItemId);
  if (!item) throw new Error('Line item not found');

  const actions: CartUpdateAction[] = [
    { action: 'changeLineItemQuantity', lineItemId, quantity },
  ];

  if (item.key) {
    const children = cart.lineItems.filter(
      (i) => i.custom?.fields?.parentKey === item.key
    );
    for (const child of children) {
      actions.push({ action: 'changeLineItemQuantity', lineItemId: child.id, quantity });
    }
  }
  const { body } = await apiRoot.carts().withId({ ID: cart.id }).post({
    body: { version: cart.version, actions },
  }).execute();
  return body;
}

// Cascade removal to all children
export async function removeLineItem(cart: Cart, lineItemId: string) {
  const item = cart.lineItems.find((i) => i.id === lineItemId);
  if (!item) throw new Error('Line item not found');

  const actions: CartUpdateAction[] = [
    { action: 'removeLineItem', lineItemId },
  ];

  if (item.key) {
    const children = cart.lineItems.filter(
      (i) => i.custom?.fields?.parentKey === item.key
    );
    for (const child of children) {
      actions.push({ action: 'removeLineItem', lineItemId: child.id });
    }
  }
  const { body } = await apiRoot.carts().withId({ ID: cart.id }).post({
    body: { version: cart.version, actions },
  }).execute();
  return body;
}
```


## Pattern 4: cart-mapper.ts

Surface `key` and `parentKey` from the commercetools line item:

```typescript
// site/lib/mappers/cart-mapper.ts
function mapLineItem(ctItem: CtLineItem): CartLineItem {
  return {
    id:         ctItem.id,
    sku:        ctItem.variant?.sku ?? '',
    name:       getLocalizedString(ctItem.name, locale),
    quantity:   ctItem.quantity,
    price:      mapMoney(ctItem.price.value),
    totalPrice: mapMoney(ctItem.totalPrice),
    imageUrl:   ctItem.variant?.images?.[0]?.url,
    key:        ctItem.key,
    parentKey:  ctItem.custom?.fields?.parentKey,
  };
}
```


## Pattern 5: items/route.ts

```typescript
// site/app/api/cart/items/route.ts
export async function POST(request: Request) {
  const session = await getSession();
  const { productId, variantId, quantity = 1, bundledSKUList } = await request.json();

  let cart = await getCart(session.cartId!);
  const parentKey = bundledSKUList?.length ? uuidv4() : undefined;

  cart = await addLineItem(cart.id, cart.version, productId, variantId, quantity, parentKey);

  if (parentKey && bundledSKUList?.length) {
    cart = await addBundledLineItems(cart.id, cart.version, parentKey, bundledSKUList);
  }

  return NextResponse.json({ cart });
}
```


## Pattern 6: bundle-utils.ts

```typescript
// site/lib/bundle-utils.ts

/**
 * Groups children under their parent line item.
 * Children (items with parentKey) are moved into parent.bundledItems[].
 */
export function bundleItems(items: CartLineItem[]): CartLineItem[] {
  const parents = items.filter((i) => !i.parentKey);
  const children = items.filter((i) => i.parentKey);

  return parents.map((parent) => ({
    ...parent,
    bundledItems: children.filter((c) => c.parentKey === parent.key),
  }));
}

/**
 * Count only parent/standalone items (exclude children from badge count).
 */
export function cartItemCount(items: CartLineItem[]): number {
  return items.filter((i) => !i.parentKey).reduce((sum, i) => sum + i.quantity, 0);
}
```


## Pattern 7: useCartSWR

Apply `bundleItems` in the cart fetcher so all components receive pre-grouped data:

```typescript
// site/hooks/useCartSWR.ts  (extends the base hook)
import { bundleItems } from '@/lib/bundle-utils';
import { KEY_CART } from '@/lib/cache-keys';

async function cartFetcherWithBundles(): Promise<Cart | null> {
  const res = await fetch('/api/cart');
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.cart) return null;
  return { ...data.cart, lineItems: bundleItems(data.cart.lineItems ?? []) };
}

export function useCartSWR(fallback?: Cart | null) {
  return useSWR<Cart | null>(KEY_CART, cartFetcherWithBundles, {
    fallbackData: fallback ?? undefined,
    revalidateOnFocus: true,
  });
}
```


## Pattern 8: UI

**CartItem — render bundled children as sub-rows:**

```typescript
// site/components/cart/CartItem.tsx
import Image from 'next/image';

export default function CartItem({ item }: { item: CartLineItem }) {
  return (
    <div>
      {/* Main item row */}
      <div className="flex items-center gap-4">
        {item.imageUrl && (
          <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded">
            <Image src={item.imageUrl} alt={item.name} fill className="object-cover" sizes="64px" />
          </div>
        )}
        <div>
          <p className="font-medium">{item.name}</p>
          <p className="text-sm text-gray-500">{formatMoney(item.price)}</p>
        </div>
      </div>

      {/* Bundled children */}
      {item.bundledItems?.map((child) => (
        <div key={child.id} className="ml-8 mt-1 flex items-center gap-2 text-sm text-gray-600">
          <span>+ {child.name}</span>
        </div>
      ))}
    </div>
  );
}
```

**BundleAddToCart** — passes `bundledSKUList` to the API:

```typescript
// site/components/pdp/BundleAddToCart.tsx
'use client';
import { useState } from 'react';
import { useCartContext } from '@/context/CartContext';
import Button from '@/components/ui/Button';

export default function BundleAddToCart({
  productId, variantId, bundledSKUs,
}: { productId: string; variantId: number; bundledSKUs: string[] }) {
  const [loading, setLoading] = useState(false);
  const { addToCart } = useCartContext();

  const handleAdd = async () => {
    setLoading(true);
    try {
      // addToCart handles POST /api/cart/items and opens mini-cart
      // bundledSKUList is passed as extra data picked up by the extended route handler
      await addToCart(productId, variantId, 1, { bundledSKUList: bundledSKUs });
    } finally {
      setLoading(false);
    }
  };

  return <Button variant="primary" isLoading={loading} onClick={handleAdd}>Add Bundle to Cart</Button>;
}
```


## Checklist
- [ ] `node tools/create-bundles-custom-type.mjs` run — custom type `line-item-additional-info` with `parentKey` field exists in commercetools
- [ ] `CartLineItem` extended with `key`, `parentKey`, `bundledItems`
- [ ] `addLineItem` accepts optional `key` parameter
- [ ] `addBundledLineItems` creates children with `custom.fields.parentKey`
- [ ] `changeLineItemQuantity` and `removeLineItem` cascade to children by matching `parentKey`
- [ ] `cart-mapper.ts` maps `ctItem.key` and `ctItem.custom.fields.parentKey`
- [ ] `items/route.ts` generates UUID parent key and calls `addBundledLineItems`
- [ ] `bundleItems()` and `cartItemCount()` in `lib/bundle-utils.ts`
- [ ] `bundleItems` applied in `cartFetcherWithBundles` inside `useCartSWR` override
- [ ] `CartItem` renders `item.bundledItems` as sub-rows (uses `next/image`, not `<img>`)
- [ ] `BundleAddToCart` uses `useCartContext().addToCart()` — no direct `fetch` in component
