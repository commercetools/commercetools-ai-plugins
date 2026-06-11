---
name: cart
description: Cart creation, server endpoints, client-state hooks, cart provider, mini-cart drawer, and handling commercetools concurrency conflicts (409 errors).
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

This reference covers commercetools cart creation, all server endpoints, the cart client-state hook, the cart provider, the mini-cart drawer, and the full cart page.

## Table of Contents
- [Pattern 1: commercetools Cart Helper Functions](#pattern-1-commercetools-cart-helper-functions)
- [Pattern 2: Cart Server Endpoints](#pattern-2-cart-server-endpoints)
- [Pattern 3: Cart Client State Hook](#pattern-3-cart-client-state-hook)
- [Pattern 4: Cart Provider](#pattern-4-cart-provider)
- [Pattern 5: Mini-Cart Drawer](#pattern-5-mini-cart-drawer)
- [Checklist](#checklist)

---

## Pattern 1: commercetools Cart Helper Functions

`<server>/ct/cart` (key functions):

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

## Pattern 2: Cart Server Endpoints

The cart helpers are called from client hooks, so the storefront exposes cart endpoints that mirror them. The **cart GET endpoint** is where the important session hygiene lives:

- If the session has no `cartId`, return `{ cart: null }`.
- Otherwise load the cart via `getCart(session.cartId)` and:
  - If the cart is **not `Active`** (e.g. `Ordered`, `Merged`), clear `cartId` from the session and return `{ cart: null }` — the client should see an empty cart.
  - If `getCart` **throws** (cart not found in commercetools), clear the stale `cartId` from the session and return `{ cart: null }`.
  - Otherwise return `{ cart }`.

The **cart POST endpoint** creates a cart on demand. Mutation endpoints (add/remove line item, change quantity, discount) each wrap the matching `<server>/ct/cart` helper. Each endpoint that touches the session also writes the updated session back on the way out.

> Example **Next.js shape:** these cart server endpoints (using `NextResponse` + `setSessionCookie`) follow the standard BFF endpoint shell — find adapter's `data-loading.md`.

---

## Pattern 3: Cart Client State Hook

**INCORRECT:** Calling `fetch('/<api>/cart')` directly in a component.

**CORRECT — a cart read hook + a cart mutations module:**

- A **cart read hook** is keyed by `KEY_CART` and reads the cart from the cart endpoint (`GET /<api>/cart`). The fetcher returns `null` when the response is not ok — it never throws. Unlike other reads, this hook **does** revalidate on focus, so the cart stays fresh when the user returns from another tab. It accepts an optional server-fetched cart to seed the cache (eliminating the first-render loading state).
- A **cart mutations module** exposes all cart writes (add/remove line item, change quantity, discount). Each write calls the matching endpoint and then updates `KEY_CART` directly from the API response body **without a refetch** — always prefer this over a blind revalidation, which costs a second round-trip.

The app `Cart` type is declared in the shared types module and imported by the hook — never imported from `@commercetools/platform-sdk`.

> Find the stack's `concept-mapping.md` for concrete state and cache implementation.


---

## Pattern 4: Cart Provider

A **cart provider** is a client component that wraps the app and exposes a single cart context to the tree. It:

- reads the cart via the cart client-state hook (seeded with a server-fetched `initialCart`) and re-exposes `cart` + `isLoading`;
- owns the mini-cart open/close flag (`showMiniCart`, `openMiniCart`, `closeMiniCart`) in local client state;
- exposes an `addToCart(productId, variantId, quantity?)` convenience that calls the mutations module's `addItem` and then opens the mini-cart;
- re-exposes the full cart mutations module as `mutateCart`;
- provides a `useCartContext()` accessor that throws if used outside the provider.

Wrap the app with the cart provider at the root (locale) layout. Fetch `initialCart` server-side when `session.cartId` exists (`getCart(session.cartId).catch(() => null)`) and pass it to the provider to eliminate the client-side loading state.


> Find the stack's `data-loading.md` for concrete layout-level hydration pattern implementation.

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

- [ ] `<server>/ct/cart` creates carts with `shippingMode: 'Single'`
- [ ] The cart GET endpoint discards non-Active carts and clears `cartId` from session
- [ ] The add-item endpoint creates a cart on demand if `cartId` is absent
- [ ] The cart mutations module updates the client state-manager/cache from the response body — no extra refetch
- [ ] The cart provider wraps the app at the root layout with `initialCart` from the server
- [ ] `KEY_CART` from `<server>/cache-keys` is the single client state-manager/cache key for cart data

**Next:** [checkout-page.md](./checkout-page.md)
