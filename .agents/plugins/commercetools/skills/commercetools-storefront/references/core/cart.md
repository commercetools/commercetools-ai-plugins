---
name: cart
description: Cart creation, Route Handlers, SWR hooks, CartContext, mini-cart drawer, and handling commercetools concurrency conflicts (409 errors).
when_to_use:
  - "Implementing cart CRUD operations"
  - "Handling version conflicts and concurrent modifications"
  - "Building cart UI components such as mini-cart or full cart"
  - "Managing cart state across the application"
metadata:
  contentType: REFERENCE
  area:
    - cart
    - session
    - performance
---

# Cart

**Impact: CRITICAL — Cart version conflicts (409) and stale `cartId` are the most common production bugs. Every write path must re-fetch version and retry.**

This reference covers commercetools cart creation, all Route Handlers, `useCartSWR`, `CartContext`, the mini-cart drawer, and the full cart page.

## Table of Contents
- [Pattern 1: commercetools Cart Helper Functions](#pattern-1-commercetools-cart-helper-functions)
- [Pattern 2: Cart Route Handlers](#pattern-2-cart-route-handlers)
- [Pattern 3: Cart SWR Hook](#pattern-3-cart-swr-hook)
- [Pattern 4: CartContext](#pattern-4-cartcontext)
- [Pattern 5: Mini-Cart Drawer](#pattern-5-mini-cart-drawer)
- [Checklist](#checklist)

---

## Pattern 1: commercetools Cart Helper Functions

`lib/ct/cart.ts` (key functions):

- getCart: get current user's active cart by ID or Key.
- create a new cart: this function should create a new cart for anonymous or logged in customer for current country/currency.
- add lineitem: add a lineitem by its' SKU or (product ID, variant ID) 
- remove lineitem: remove a lineitem by its' ID
- change lineitem quantity
- redeem a discount code: should return the error back to frontend for display
- remove applied discount code 

```typescript
import { apiRoot } from './client';
import type { BaseAddress, ShippingMethodResourceIdentifier } from '@commercetools/platform-sdk';

export async function exampleFunction(cartId: string) {
  const returnValue = await apiRoot.carts()...
  return returnValue;
}

```

---

## Pattern 2: Cart Route Handlers

Based on the usage, the Helper functions might be used from hooks. So we need api routes to reflect them

### Example: Main cart route (GET/POST/PATCH)

```typescript
// app/api/cart/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getLocale, createSessionToken, setSessionCookie } from '@/lib/session';
import { getCart, ... } from '@/lib/ct/cart';

export async function GET() {
  const session = await getSession();
  if (!session.cartId) return NextResponse.json({ cart: null });
  try {
    const cart = await getCart(session.cartId);
    // Discard non-Active carts (Ordered, Merged) — client should see empty cart
    if (cart.cartState && cart.cartState !== 'Active') {
      const token = await createSessionToken({ ...session, cartId: undefined });
      const resp = NextResponse.json({ cart: null });
      return setSessionCookie(resp, token);
    }
    return NextResponse.json({ cart });
  } catch {
    // Cart not found in commercetools — clear stale cartId from session
    const token = await createSessionToken({ ...session, cartId: undefined });
    const resp = NextResponse.json({ cart: null });
    return setSessionCookie(resp, token);
  }
}

export async function POST() {
  // create cart
}

```

---

## Pattern 3: Cart SWR Hook

**INCORRECT:** Calling `fetch('/api/cart')` directly in a component.

**CORRECT — `useCartSWR` + `useCartMutations` in `hooks/useCartSWR.ts`:**

```typescript
// types.ts

export interface Cart {
...
}
// hooks/useCartSWR.ts
'use client';

import useSWR, { useSWRConfig } from 'swr';
import { KEY_CART } from '@/lib/cache-keys';
import { Cart } from '@/types'


async function cartFetcher(): Promise<Cart | null> {
  const res = await fetch('/api/cart');
  if (!res.ok) return null;
  const data = await res.json();
  return data.cart ?? null;
}

export function useCartSWR(fallback?: Cart | null) {
  return useSWR<Cart | null>(KEY_CART, cartFetcher, {
    fallbackData: fallback ?? undefined,
    revalidateOnFocus: true,
  });
}

export function useCartMutations() {
  const { mutate } = useSWRConfig();

  // all methods to modify a cart

  return { ... };
}
```

> **`mutate(KEY_CART, data.cart, { revalidate: false })`** — updates the SWR cache directly from the API response body without triggering a second fetch. Always prefer this over `mutate(KEY_CART)` (which refetches).

---

## Pattern 4: CartContext

```typescript
// context/CartContext.tsx
'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useCartSWR, useCartMutations, type Cart } from '@/hooks/useCartSWR';

interface CartContextValue {
  cart: Cart | null | undefined;
  isLoading: boolean;
  showMiniCart: boolean;
  openMiniCart: () => void;
  closeMiniCart: () => void;
  addToCart: (productId: string, variantId: number, quantity?: number) => Promise<void>;
  mutateCart: ReturnType<typeof useCartMutations>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children, initialCart }: { children: ReactNode; initialCart?: Cart | null }) {
  const [showMiniCart, setShowMiniCart] = useState(false);
  const { data: cart, isLoading } = useCartSWR(initialCart);
  const mutations = useCartMutations();

  const addToCart = useCallback(async (productId: string, variantId: number, quantity = 1) => {
    await mutations.addItem(productId, variantId, quantity);
    setShowMiniCart(true);
  }, [mutations]);

  return (
    <CartContext.Provider value={{ cart, isLoading, showMiniCart, openMiniCart: () => setShowMiniCart(true), closeMiniCart: () => setShowMiniCart(false), addToCart, mutateCart: mutations }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCartContext() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCartContext must be inside CartProvider');
  return ctx;
}
```

Add `CartProvider` to `app/[locale]/layout.tsx`. Pass `initialCart` fetched server-side to eliminate the client-side loading state:

```typescript
// app/[locale]/layout.tsx (Server Component)
import { getSession } from '@/lib/session';
import { getCart } from '@/lib/ct/cart';
import { CartProvider } from '@/context/CartContext';

export default async function LocaleLayout({ children }: Props) {
  const session = await getSession();
  const initialCart = session.cartId
    ? await getCart(session.cartId).catch(() => null)
    : null;

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <CartProvider initialCart={initialCart}>
            <Header />
            {children}
            <MiniCart />
          </CartProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

---

## Pattern 5: Mini-Cart Drawer

See full implementation in the `cart` greenfield skill. Key points:
- Renders only when `showMiniCart === true`
- Backdrop click calls `closeMiniCart()`
- Items use `mutateCart.removeLineItem()` for optimistic removal
- "Proceed to Checkout" link closes the mini-cart

---

## commercetools Concurrency Notes

**Why 409 errors happen:** commercetools uses optimistic locking. Every cart update requires the current `version` integer. If two requests arrive simultaneously (e.g. address + shipping method fired at the same time from the checkout page), one will be rejected with `409 ConcurrentModification`.

---

## Checklist

- [ ] `lib/ct/cart.ts` creates carts with `shippingMode: 'Single'`
- [ ] `GET /api/cart` discards non-Active carts and clears `cartId` from session
- [ ] `POST /api/cart/items` creates cart on demand if `cartId` is absent
- [ ] `useCartMutations` updates SWR cache from response body — no extra refetch
- [ ] `CartProvider` wraps the locale layout with `initialCart` from server
- [ ] `KEY_CART` from `lib/cache-keys.ts` is the single SWR key for cart data

**Next:** [checkout-page.md](./checkout-page.md)
