---
name: add-api
description: Documents the three-layer BFF pattern (client component → server endpoint → commercetools helper) and client-state hook structure with cache keys and mutations.
when_to_use:
  - "Adding a new data source such as cart, orders, or products"
  - "Creating or updating client-state hooks with proper cache management"
  - "Implementing mutations that update the client state-manager/cache"
  - "Avoiding direct commercetools SDK calls from components"
metadata:
  contentType: REFERENCE
  area:
    - performance
    - session
---

# Adding a BFF API Endpoint

**Impact: HIGH — Calling commercetools directly from a client component or bypassing the hook layer exposes secrets and breaks the caching model.**

This reference covers adding a new server endpoint + commercetools helper + client-state hook — the three-layer BFF pattern every data source must follow.

## Table of Contents
- [Pattern 1: Data Flow Rule](#pattern-1-data-flow-rule)
- [Pattern 2: Cache Key](#pattern-2-cache-key)
- [Pattern 3: Server Endpoint](#pattern-3-server-endpoint)
- [Pattern 4: commercetools Helper Function](#pattern-4-commercetools-helper-function)
- [Pattern 5: Client State Hook with Mutations](#pattern-5-client-state-hook-with-mutations)
- [Checklist](#checklist)

---

## Pattern 1: Data Flow Rule

**INCORRECT:** Importing `<server>/ct/*` in a client component or calling `fetch('/<api>/*')` directly inside a component:

```typescript
// WRONG — leaks server code into the browser bundle
import { getCustomerOrders } from '<server>/ct/auth';
// WRONG — direct fetch in component, no cache key
const res = await fetch('/<api>/orders');
```

**CORRECT — strict one-way data flow:**

```
Client component
  → client data hook (<root-dir>/hooks/*.ts)  — calls fetch('/<api>/…') / the framework's loader
  → server endpoint                     — server-only, calls <server>/ct/*
  → <server>/ct/<namespace>.ts               — server-only, calls apiRoot
  → commercetools API
```

If a client file needs a type from a commercetools module, import it from `<server>/types` instead:

```typescript
// ✅ correct
import type { Product } from '<server>/types';

// ❌ wrong — even for types only
import type { ProductProjection } from '<server>/ct/search';
```

---

## Pattern 2: Cache Key

**INCORRECT:** Inlining key strings in the client-state hook — same resource gets different keys across components (e.g. one component keys reads on `'widgets'`, another on `` `widget-${id}` `` ad-hoc).

**CORRECT — all keys in `<server>/cache-keys`:**

```typescript
// <server>/cache-keys
export const KEY_WIDGETS = 'widgets';

export function keyWidget(id: string) {
  return `widget-${id}`;
}

// Tuple key for locale-parameterised data
export function keyShippingMethods(country: string, currency: string) {
  return ['shipping-methods', country, currency] as const;
}
```

---

## Pattern 3: Server Endpoint

**INCORRECT:** Writing raw commercetools SDK calls inside the server endpoint:

```typescript
// WRONG — commercetools logic leaks into the endpoint
export async function GET() {
  const { body } = await apiRoot.orders().get({ queryArgs: { where: `...` } }).execute();
  return json({ orders: body.results });
}
```

**CORRECT — the endpoint validates the session, delegates to `<server>/ct/<namespace>.ts`, and returns JSON.** It does exactly three things: validate session → call the namespace helper → return JSON (401 when unauthenticated, 500 with the error message on failure). It never contains a raw SDK call.

> Example: Next.js, the concrete server endpoint (with `NextResponse`) and the `{auth,account,cart,checkout,shipping-methods,channels}` endpoint directory conventions. Find the stack's `concept-mapping.md` for concrete server endpoints.

---

## Pattern 4: commercetools Helper Function

**INCORRECT:** Adding commercetools SDK calls anywhere outside `<server>/ct/<namespace>.ts`:

```typescript
// WRONG — commercetools call in the endpoint
const { body } = await apiRoot.orders().withId({ ID: id }).get().execute();
```

**CORRECT — one function per operation in the matching namespace file:**

```typescript
// <server>/ct/widgets
import { apiRoot } from './client';

export async function getWidgets(customerId: string) {
  const { body } = await apiRoot
    .widgets()
    .get({ queryArgs: { where: `customerId = "${customerId}"` } })
    .execute();
  return body.results;
}

export async function createWidget(data: Record<string, unknown>) {
  const { body } = await apiRoot.widgets().post({ body: data }).execute();
  return body;
}
```

**Example of commercetools namespace ownership:**

| File | Owns |
|------|------|
| `<server>/ct/auth` | `signInCustomer`, `signUpCustomer`, `getCustomerById`, `updateCustomer` |
| `<server>/ct/cart` | All cart + order operations |
| `<server>/ct/orders` | `getCustomerOrders`, `getOrderById` |
| `<server>/ct/search` | `searchProducts`, `getProductBySku` |
| `<server>/ct/categories` | `getCategoryTree`, `getCategoryBySlug` |
| `<server>/ct/wishlist` | Shopping list operations |

---

## Pattern 5: Client State Hook with Mutations

**INCORRECT:** Mutating without updating the client state-manager/cache — requires a full refetch to see the change. A `deleteWidget` that only does `fetch('/<api>/widgets/<id>', { method: 'DELETE' })` leaves the UI stale until the next revalidation.

**CORRECT — a read hook + a mutations module:**

- A **read hook** is keyed by `KEY_WIDGETS` and reads the widgets list from the widgets endpoint (`GET /<api>/widgets`). It does not revalidate on focus. The fetcher returns a safe default (`[]`) when the response is not ok — read hooks never throw.
- A **mutations module** wraps each write (`createWidget`, `deleteWidget`). Each write calls the endpoint, throws on a non-ok response (surfacing the server's error message), then updates `KEY_WIDGETS` directly from the response body **without a refetch**. A delete also clears the detail key `keyWidget(id)`. (Updating from the response body is preferred over a blind revalidation, which costs an extra round-trip.)

> **Mutations always throw** — the component wraps the call in `try/catch` and shows the error. Read hooks return safe defaults (`null`, `[]`) on failure — never throw.

**Locale-parameterised hook:** a read hook can use a **tuple key** — e.g. `[KEY_WIDGETS, country, currency]` — built from the framework's locale/currency context, and read only once both parts are present (otherwise the key is null and the read is skipped). This refetches automatically when the locale tuple changes.

> Find the stack's `concept-mapping.md` for concrete state and cache implementation.


---

## Checklist

- [ ] Cache key(s) added to `<server>/cache-keys`
- [ ] Server endpoint validates session before accessing user data
- [ ] commercetools calls in `<server>/ct/<namespace>.ts` — not inside the endpoint
- [ ] Read hook does not revalidate on focus (exception: the cart hook does — cart must stay fresh when the user returns from another tab)
- [ ] Mutations throw on error; read hooks return safe defaults
- [ ] Mutations update the client state-manager/cache from the response body — no refetch
- [ ] Types exported from the hook file — not from `<server>/ct/`
- [ ] No endpoint (`fetch('/<api>/*')`) calls directly in components
