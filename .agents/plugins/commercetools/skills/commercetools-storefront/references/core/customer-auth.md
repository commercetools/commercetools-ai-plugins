---
name: customer-auth
description: Shared auth foundation covering commercetools login endpoint, Route Handler structure, SWR hooks, and logout cache-clearing patterns.
when_to_use:
  - "Implementing authentication in the storefront"
  - "Setting up login and logout flows"
  - "Configuring session management"
  - "Clearing SWR cache after auth state changes"
metadata:
  contentType: REFERENCE
  area:
    - auth
    - session
---

# Customer Authentication — Shared Foundation

**Impact: HIGH — The wrong login endpoint or incomplete logout cache-clearing causes silent failures on every auth operation.**

This reference covers the shared patterns: the correct commercetools login endpoint, Route Handler structure, SWR hook for account data, and logout cache-clearing. Domain-specific auth patterns (B2C anonymous cart merge; B2B BU auto-selection and channel resolution) are documented in the respective skill's `customer-auth.md`.

## Table of Contents
- [Pattern 1: commercetools Login Endpoint](#pattern-1-ct-login-endpoint)
- [Pattern 2: Route Handler Structure](#pattern-2-route-handler-structure)
- [Pattern 3: useAccount SWR Hook](#pattern-3-useaccount-swr-hook)
- [Pattern 4: Logout — Session and SWR Cache Clearing](#pattern-4-logout--session-and-swr-cache-clearing)
- [Checklist](#checklist)

---

## Pattern 1: commercetools Login Endpoint

**INCORRECT:** Using `apiRoot.customers().login()` — this endpoint does not exist in commercetools SDK v2:

```typescript
// WRONG — SDK v2 does not have this endpoint
const { body } = await apiRoot.customers().login().post({ body: { email, password } }).execute();
```

**CORRECT — `apiRoot.login().post()`:**

```typescript
// lib/ct/auth.ts
export async function loginCustomer(email: string, password: string) {
  const { body } = await apiRoot.login().post({ body: { email, password } }).execute();
  return body.customer;
}
```

This is the only valid login endpoint across all commercetools SDK v2 storefronts.

---

## Pattern 2: Route Handler Structure

Login, register, and logout are BFF Route Handlers — never called client-side from components directly.

```
Browser component
  → hooks/*Api.ts or useAccount hook   — 'use client', calls fetch('/api/auth/...')
  → app/api/auth/*/route.ts            — server-only, reads/writes session, calls lib/ct/auth.ts
  → lib/ct/auth.ts                     — calls apiRoot
```

Minimal login Route Handler shape:

```typescript
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { loginCustomer } from '@/lib/ct/auth';
import { getSession, createSessionToken, setSessionCookie } from '@/lib/session';

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const customer = await loginCustomer(email, password);
  const response = NextResponse.json({ customer });

  // Write session — domain-specific handlers add their own fields here
  const token = await createSessionToken({
    customerId: customer.id,
    customerEmail: customer.email,
    customerFirstName: customer.firstName,
    customerLastName: customer.lastName,
  });
  setSessionCookie(response, token);
  return response;
}
```

> B2C login handlers also merge the anonymous cart. B2B login handlers also resolve BU/store/channel fields. Each domain's `customer-auth.md` shows the full handler with these additions.

---

## Pattern 3: useAccount SWR Hook

**INCORRECT:** Reading `customerId` from localStorage or a cookie on the client — not reactive, not server-safe.

**CORRECT — SWR hook backed by a `/api/auth/me` (or `/api/account/profile`) Route Handler:**

```typescript
// hooks/useAccount.ts
'use client';

import useSWR from 'swr';
import { KEY_ACCOUNT } from '@/lib/cache-keys';

async function accountFetcher() {
  const res = await fetch('/api/account/profile');
  if (!res.ok) return null;
  const data = await res.json();
  return data.customer ?? null;
}

export function useAccount() {
  const { data, mutate } = useSWR(KEY_ACCOUNT, accountFetcher, {
    revalidateOnFocus: false,
  });
  return { user: data, mutate };
}
```

The Route Handler reads the session cookie and returns the customer object (or `null` if unauthenticated):

```typescript
// app/api/account/profile/route.ts
export async function GET() {
  const session = await getSession();
  if (!session.customerId) return NextResponse.json({ customer: null });
  try {
    const customer = await getCustomerById(session.customerId);
    return NextResponse.json({ customer });
  } catch {
    return NextResponse.json({ customer: null });
  }
}
```

> B2B storefronts use `GET /api/auth/me` and an `AuthContext` wrapper in addition to the hook — see B2B `customer-auth.md` for the full pattern.

---

## Pattern 4: Logout — Session and SWR Cache Clearing

**INCORRECT:** Clearing only the auth cache after logout — cart and other user data remain visible until next page load:

```typescript
// WRONG — stale cart/order data still in SWR cache
await fetch('/api/auth/logout', { method: 'POST' });
mutate(KEY_ACCOUNT, null, { revalidate: false });
```

**CORRECT — clear all user-scoped SWR caches and clear the session cookie:**

```typescript
// In the component or hook handling logout:
import { mutate } from 'swr';
import { KEY_ACCOUNT, KEY_CART } from '@/lib/cache-keys';

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  mutate(KEY_ACCOUNT, null, { revalidate: false });
  mutate(KEY_CART, null, { revalidate: false });
  // B2B: also mutate KEY_BUSINESS_UNITS
  router.push('/login');
}
```

```typescript
// app/api/auth/logout/route.ts
import { getSession, createSessionToken, setSessionCookie } from '@/lib/session';

export async function POST() {
  const session = await getSession();
  const response = NextResponse.json({ success: true });
  // Preserve locale/currency/country — clear all user fields
  const token = await createSessionToken({
    locale: session.locale,
    currency: session.currency,
    country: session.country,
    // customerId, cartId, and domain-specific fields are intentionally omitted
  });
  setSessionCookie(response, token);
  return response;
}
```

---

## Checklist

- [ ] `lib/ct/auth.ts` uses `apiRoot.login().post()` — NOT `apiRoot.customers().login()`
- [ ] Login Route Handler writes session cookie with at minimum `customerId` and customer name fields
- [ ] `useAccount` hook uses `KEY_ACCOUNT` as SWR key with `revalidateOnFocus: false`
- [ ] Logout Route Handler preserves `locale`, `currency`, `country` and clears user fields
- [ ] Logout clears both `KEY_ACCOUNT` and `KEY_CART` from SWR cache

**Domain extensions:**
- B2C: see [b2c/customer-auth.md](../b2c/customer-auth.md) for anonymous cart merge and protected layout
- B2B: see [b2b/customer-auth.md](../b2b/customer-auth.md) for BU auto-selection, channel resolution, and `AuthContext`
