---
name: add-api
description: Documents the three-layer BFF pattern (client component → Route Handler → commercetools helper) and SWR hook structure with cache keys and mutations.
when_to_use:
  - "Adding a new data source such as cart, orders, or products"
  - "Creating or updating SWR hooks with proper cache management"
  - "Implementing mutations that update the SWR cache"
  - "Avoiding direct commercetools SDK calls from components"
metadata:
  contentType: REFERENCE
  area:
    - performance
    - session
---

# Adding a BFF API Endpoint

**Impact: HIGH — Calling commercetools directly from a client component or bypassing the hook layer exposes secrets and breaks the caching model.**

This reference covers adding a new Route Handler + commercetools helper + SWR hook — the three-layer BFF pattern every data source must follow.

## Table of Contents
- [Pattern 1: Data Flow Rule](#pattern-1-data-flow-rule)
- [Pattern 2: Cache Key](#pattern-2-cache-key)
- [Pattern 3: Route Handler](#pattern-3-route-handler)
- [Pattern 4: commercetools Helper Function](#pattern-4-commercetools-helper-function)
- [Pattern 5: SWR Hook with Mutations](#pattern-5-swr-hook-with-mutations)
- [Checklist](#checklist)

---

## Pattern 1: Data Flow Rule

**INCORRECT:** Importing `lib/ct/*` in a Client Component or calling `fetch('/api/*')` directly inside a component:

```typescript
// WRONG — leaks server code into the browser bundle
import { getCustomerOrders } from '@/lib/ct/auth';
// WRONG — direct fetch in component, no cache key
const res = await fetch('/api/orders');
```

**CORRECT — strict one-way data flow:**

```
Client Component
  → hook (site/hooks/*.ts)         'use client' — calls fetch('/api/…')
  → Route Handler (app/api/*)      server-only — calls lib/ct/*
  → lib/ct/<namespace>.ts          server-only — calls apiRoot
  → commercetools API
```

If a client file needs a type from a commercetools module, import it from `@/lib/types` instead:

```typescript
// ✅ correct
import type { Product } from '@/lib/types';

// ❌ wrong — even for types only
import type { ProductProjection } from '@/lib/ct/search';
```

---

## Pattern 2: Cache Key

**INCORRECT:** Inlining key strings in the hook — same resource gets different keys across components:

```typescript
// WRONG
return useSWR('widgets', fetcher);
return useSWR(`widget-${id}`, fetcher);
```

**CORRECT — all keys in `lib/cache-keys.ts`:**

```typescript
// lib/cache-keys.ts
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

## Pattern 3: Route Handler

**INCORRECT:** Writing raw commercetools SDK calls inside the Route Handler:

```typescript
// WRONG — commercetools logic leaks into the Route Handler
export async function GET() {
  const { body } = await apiRoot.orders().get({ queryArgs: { where: `...` } }).execute();
  return NextResponse.json({ orders: body.results });
}
```

**CORRECT — Route Handler delegates to `lib/ct/<namespace>.ts`, validates session first:**

```typescript
// app/api/widgets/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getWidgets } from '@/lib/ct/widgets';

export async function GET() {
  const session = await getSession();
  if (!session.customerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const widgets = await getWidgets(session.customerId);
    return NextResponse.json({ widgets });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch widgets';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

**Directory conventions:**
```
app/api/
  auth/             login, register, logout, me
  account/          orders, addresses, payments, wishlist
  cart/             cart CRUD, line-items, discount
  checkout/         order creation
  shipping-methods/ shipping options by locale
  channels/         store channels (BOPIS)
```

---

## Pattern 4: commercetools Helper Function

**INCORRECT:** Adding commercetools SDK calls anywhere outside `lib/ct/<namespace>.ts`:

```typescript
// WRONG — commercetools call in a Route Handler
const { body } = await apiRoot.orders().withId({ ID: id }).get().execute();
```

**CORRECT — one function per operation in the matching namespace file:**

```typescript
// lib/ct/widgets.ts
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

**commercetools namespace ownership:**

| File | Owns |
|------|------|
| `lib/ct/auth.ts` | `signInCustomer`, `signUpCustomer`, `getCustomerById`, `updateCustomer` |
| `lib/ct/cart.ts` | All cart + order operations |
| `lib/ct/orders.ts` | `getCustomerOrders`, `getOrderById` |
| `lib/ct/search.ts` | `searchProducts`, `getProductBySku` |
| `lib/ct/categories.ts` | `getCategoryTree`, `getCategoryBySlug` |
| `lib/ct/wishlist.ts` | Shopping list operations |

---

## Pattern 5: SWR Hook with Mutations

**INCORRECT:** Mutating without updating the SWR cache — requires a full refetch to see the change:

```typescript
// WRONG — cache not updated, UI stale until next revalidation
async function deleteWidget(id: string) {
  await fetch(`/api/widgets/${id}`, { method: 'DELETE' });
}
```

**CORRECT — mutations update SWR cache from the response body, throw on error:**

```typescript
// hooks/useWidgets.ts
'use client';

import useSWR, { useSWRConfig } from 'swr';
import { KEY_WIDGETS, keyWidget } from '@/lib/cache-keys';

export interface Widget { id: string; name: string }

async function widgetsFetcher(): Promise<Widget[]> {
  const res = await fetch('/api/widgets');
  if (!res.ok) return [];
  const data = await res.json();
  return data.widgets ?? [];
}

export function useWidgets() {
  return useSWR<Widget[]>(KEY_WIDGETS, widgetsFetcher, { revalidateOnFocus: false });
}

export function useWidgetMutations() {
  const { mutate } = useSWRConfig();

  async function createWidget(data: Partial<Widget>) {
    const res = await fetch('/api/widgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Failed to create');
    }
    // Option A: set cache directly from response — no extra round-trip
    const newData = await res.json();
    mutate(KEY_WIDGETS, newData.widgets, { revalidate: false });
    // Option B: revalidate (simpler but adds one request)
    // mutate(KEY_WIDGETS);
  }

  async function deleteWidget(id: string) {
    const res = await fetch(`/api/widgets/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    const newData = await res.json();
    mutate(KEY_WIDGETS, newData.widgets, { revalidate: false });
    mutate(keyWidget(id), null, { revalidate: false }); // clear detail cache
  }

  return { createWidget, deleteWidget };
}
```

> **Mutations always throw** — the component wraps the call in `try/catch` and shows the error. Read hooks return safe defaults (`null`, `[]`) on failure — never throw.

**Locale-parameterised hook (tuple key):**

```typescript
export function useWidgetsByLocale() {
  const { country, currency } = useLocale();
  const key = country && currency ? [KEY_WIDGETS, country, currency] : null;
  return useSWR<Widget[]>(key, ([, c, cur]) => fetchWidgets(c, cur), {
    revalidateOnFocus: false,
  });
}
```

---

## Checklist

- [ ] Cache key(s) added to `lib/cache-keys.ts`
- [ ] Route Handler in `app/api/` validates session before accessing user data
- [ ] commercetools calls in `lib/ct/<namespace>.ts` — not inside the Route Handler
- [ ] Hook uses `revalidateOnFocus: false` (exception: `useCartSWR` uses `true` — cart must stay fresh when the user returns from another tab)
- [ ] Mutations throw on error; read hooks return safe defaults
- [ ] Mutations update SWR cache from response body (`revalidate: false`)
- [ ] Types exported from the hook file — not from `lib/ct/`
- [ ] No `fetch('/api/*')` calls directly in components
