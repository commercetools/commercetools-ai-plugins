---
name: ct-client
description: Covers the commercetools SDK singleton, JWT session management, and BFF architecture patterns for calling commercetools APIs.
when_to_use:
  - "Setting up the commercetools client for the first time"
  - "Implementing JWT session handling with HTTP-only cookies"
  - "Understanding the BFF (Backend-for-Frontend) boundary pattern"
  - "Wiring Route Handlers to commercetools helpers"
metadata:
  contentType: REFERENCE
  area:
    - auth
    - session
    - deployment
---

# commercetools Client & Session

**Impact: CRITICAL — This is the foundation. Every other reference depends on `apiRoot`, `getSession`, and the BFF boundary being correctly wired.**

This reference covers the commercetools SDK singleton, environment setup, JWT session management, and the BFF (Backend-for-Frontend) architecture that prevents credential leaks.

## Table of Contents
- [Pattern 1: SDK Client Singleton](#pattern-1-sdk-client-singleton)
- [Pattern 2: Environment Variables](#pattern-2-environment-variables)
- [Pattern 3: JWT Session Management](#pattern-3-jwt-session-management)
- [Pattern 4: BFF Route Handler Shape](#pattern-4-bff-route-handler-shape)
- [Pattern 5: commercetools Helper Function Shape](#pattern-5-ct-helper-function-shape)
- [Pattern 6: Connection Health Check](#pattern-6-connection-health-check)
- [Checklist](#checklist)

---

## Pattern 1: SDK Client Singleton

**See [sdk-setup.md](../../../commercetools-platform/references/sdk-setup.md)** for the `ClientBuilder` singleton pattern, package installation, and the rule: one `apiRoot` module-level export in `lib/ct/client.ts` — never instantiate `ClientBuilder` inside a page, component, or Route Handler.

---

## Pattern 2: Environment Variables

**See [sdk-setup.md](../../../commercetools-platform/references/sdk-setup.md)** for the full `.env` template, auth URLs by region, and required API client scopes.

`SESSION_SECRET` (storefront-specific, not in sdk-setup.md) must be at least 32 characters in production.

---

## Pattern 3: JWT Session Management

**INCORRECT:** Storing `cartId` or `customerId` in localStorage — accessible to XSS attacks. Or using server-side session storage — requires infrastructure.

**CORRECT — HTTP-only cookie signed with HS256 JWT (server-only `jose` library):**

`lib/session.ts`:
```typescript
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COUNTRY_CONFIG, DEFAULT_LOCALE } from '@/lib/utils';

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-only-fallback-32-char-key!!'
);
const COOKIE_NAME = 'your-store-session';

export interface Session {
  customerId?: string;
  customerEmail?: string;
  customerFirstName?: string;
  customerLastName?: string;
  cartId?: string;
  country?: string;
  currency?: string;
  locale?: string;
}

export async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return {};
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const { iat, exp, ...session } = payload as Session & { iat?: number; exp?: number };
    return session;
  } catch {
    return {};
  }
}

export async function getLocale(): Promise<{ country: string; currency: string; locale: string }> {
  const session = await getSession();
  if (session.country && session.currency && session.locale) {
    return { country: session.country, currency: session.currency, locale: session.locale };
  }
  const cookieStore = await cookies();
  // Cookie stores the BCP-47 locale directly (e.g. 'en-US', 'de-DE') — same as COUNTRY_CONFIG key
  const locale = cookieStore.get('your-shop-country-locale')?.value || DEFAULT_LOCALE.locale;
  const config = COUNTRY_CONFIG[locale] || COUNTRY_CONFIG[DEFAULT_LOCALE.locale];
  return { country: config.country, currency: config.currency, locale: config.locale };
}

export async function createSessionToken(data: Session): Promise<string> {
  return new SignJWT(data as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET);
}

export function setSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', maxAge: 0, path: '/' });
  return response;
}
```

**Session fields:**

| Field | Set when | Cleared when |
|-------|----------|-------------|
| `customerId` | Login/register | Logout |
| `cartId` | Cart created or login | Order placed |
| `country/currency/locale` | Country selector | Never (persists) |

---

## Pattern 4: BFF Route Handler Shape

**INCORRECT:** Calling `lib/ct/*` directly from a Client Component or SWR fetcher.

**CORRECT — every commercetools call goes through a Route Handler:**

```
Browser component
  → SWR hook (hooks/*.ts)        — 'use client', calls fetch('/api/...')
  → Route Handler (app/api/...)  — server-only, calls lib/ct/*
  → lib/ct/<namespace>.ts        — server-only, calls apiRoot
  → commercetools API
```

Typical Route Handler:
```typescript
// app/api/<resource>/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { someCTFunction } from '@/lib/ct/<namespace>';

export async function GET(_req: NextRequest) {
  const session = await getSession();
  // Use session.customerId, session.cartId, etc.
  const data = await someCTFunction(/* args */);
  return NextResponse.json({ data });
}
```

---

## Pattern 5: commercetools Helper Function Shape

**INCORRECT:** Inlining `apiRoot.carts().withId()...execute()` directly in a Route Handler. Or calling the commercetools REST API with raw `fetch()` — the SDK handles OAuth token lifecycle, automatic token refresh, and type safety; bypassing it means managing all of that manually.

**CORRECT — one function per operation, all in the matching `lib/ct/` file:**

```typescript
// lib/ct/<namespace>.ts
import { apiRoot } from './client';

export async function getThings(id: string) {
  // Destructure body from the SDK response — every .execute() returns { body, statusCode, headers }
  const { body } = await apiRoot.things().withId({ ID: id }).get().execute();
  return body;
}
```

**commercetools namespace files:**

| File | Owns |
|------|------|
| `lib/ct/client.ts` | `apiRoot` singleton |
| `lib/ct/auth.ts` | `signInCustomer`, `signUpCustomer`, `getCustomerById`, `updateCustomer` |
| `lib/ct/cart.ts` | All cart operations (create, addLineItem, removeLineItem, discounts, shipping) |
| `lib/ct/orders.ts` | `getOrderById`, `getCustomerOrders` |
| `lib/ct/categories.ts` | `getCategoryBySlug`, `getCategoryTree` |
| `lib/ct/search.ts` | `searchProducts`, `getProductBySku` |

---

## Pattern 6: Connection Health Check

After wiring up the client, verify credentials with a one-off health route. **Delete it before deploying.**

```typescript
// app/api/health/route.ts  ← DELETE before deploying
import { NextResponse } from 'next/server';
import { apiRoot } from '@/lib/ct/client';

export async function GET() {
  try {
    const { body } = await apiRoot.get().execute();
    return NextResponse.json({ ok: true, projectKey: body.key });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
```

```bash
curl http://localhost:8888/api/health
# → {"ok":true,"projectKey":"your-project-key"}
```

---

## Checklist

- [ ] SDK singleton and env vars set up per [sdk-setup.md](../../../commercetools-platform/references/sdk-setup.md)
- [ ] All commercetools calls go through `apiRoot` — no raw `fetch()` to commercetools REST endpoints
- [ ] `SESSION_SECRET` is at least 32 characters in production
- [ ] `lib/session.ts` exports `getSession`, `createSessionToken`, `setSessionCookie`, `clearSessionCookie`
- [ ] Health check returns `{"ok":true}` with your project key

**Next:** [b2c/product-listing.md](../b2c/product-listing.md) or [b2b/product-listing.md](../b2b/product-listing.md)
