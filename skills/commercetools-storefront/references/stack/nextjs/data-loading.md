# Data Loading — Next.js Implementation

The [`commercetools-storefront`](../../../SKILL.md) skill decides *what* loads where:

- **Catalog / immutable data** (category pages, PDPs, search results) → server-rendered load, calling `lib/ct/*` directly.
- **Mutable per-user state** (cart, account, orders, quotes) → client-fetched via SWR → server endpoint → `lib/ct/*`.

This file pins those decisions to Next.js App Router primitives. The decision rule itself is generic — see `core/data-loading.md` in the generic skill.

## Session module — `lib/session.ts` (signed-JWT realization)

This is the Next.js **stateless-BFF** realization of the generic *server-managed session*: a signed JWT in a single HTTP-only cookie (`jose`, HS256, 30-day expiry, `SESSION_SECRET ≥ 32 chars`), read/written only server-side, exposing `getSession` / `getLocale` / `createSessionToken` / `setSessionCookie` / `clearSessionCookie`. (A stateful BFF would instead persist session state in a server-side store keyed by an opaque cookie — same surface, different storage.) The cookie read/write binding uses `cookies()` from `next/headers` and `NextResponse.cookies`:

```typescript
// lib/session.ts
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
  // B2B adds: businessUnitKey, storeKey, storeId, distributionChannelId, supplyChannelId, productSelectionId
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

## BFF Route Handler shape

The generic skill's "server endpoint" with exactly three responsibilities (validate session → call `lib/ct/<namespace>.ts` → return JSON) maps to a Next.js Route Handler:

```typescript
// app/api/<resource>/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getWidgets } from '@/lib/ct/widgets';

export async function GET(_req: NextRequest) {
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

Never put a raw commercetools SDK call in the Route Handler — it delegates to `lib/ct/<namespace>.ts` (generic rule). The data flow is: `'use client'` hook → `fetch('/api/...')` → Route Handler → `lib/ct/*` → `apiRoot`.

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

Examples of the domain endpoints (cart GET clearing non-Active carts, auth login writing the session, shipping-methods filtering by currency) follow this same shape — their *logic* is documented per-feature in the generic skill; the Next wrapper is always this Route Handler shell.

## Server-side caching — `unstable_cache`

The generic "cache stable public data with a TTL; never per-user/session" maps to `unstable_cache` from `next/cache`:

```typescript
// lib/ct/locale-validation.ts
import { unstable_cache } from 'next/cache';
import { apiRoot } from './client';
import { COUNTRY_CONFIG } from '@/lib/utils';

async function fetchValidCountryConfig() {
  const res = await apiRoot.get().execute();
  const { countries = [], currencies = [], languages = [] } = res.body;
  return Object.fromEntries(
    Object.entries(COUNTRY_CONFIG).filter(([country, config]) =>
      countries.includes(country) &&
      currencies.includes(config.currency) &&
      languages.some((l: string) => l.toLowerCase() === config.locale.toLowerCase())
    )
  );
}

export const getValidCountryConfig = unstable_cache(
  fetchValidCountryConfig,
  ['locale-validation'],
  { revalidate: 300 }
);
```

| Data | Cache TTL | Reason |
|------|-----------|--------|
| commercetools project config (countries, currencies) | 300 s | Changes only on project reconfiguration |
| Category tree | 60 s | Rarely edited; high reuse across pages |
| Shipping methods | 60 s | Rarely edited; no per-user variation |
| Product prices | **Do not cache** | Change on promotion rules; per-currency |
| Cart / account data | **Do not cache** | Per-session, changes frequently |

> Prefer `unstable_cache` over module-level variables — module-level caches reset on cold starts and aren't shared across serverless instances. Its cache is shared across all requests, so **never cache per-user or per-session data** with it; use SWR (client) or a direct per-request `lib/ct/*` call (server) for user-specific data.

## SWR hydration from the server — `SWRConfig fallback`

The generic "hydrate the client state-manager/cache from server-fetched data to avoid a spinner flash" maps to `SWRConfig`'s `fallback` in the root layout:

```typescript
// app/layout.tsx (Server Component)
export default async function RootLayout({ children }) {
  const [session, messages, { locale }] = await Promise.all([
    getSession(),
    getMessages(),
    getLocale(),
  ]);

  // Pre-fetch cart if present; build user object from session fields (no extra ct call)
  let initialCart = null;
  if (session.cartId) {
    try { initialCart = await getCart(session.cartId); } catch { /* SWR clears stale cartId */ }
  }
  const initialUser = session.customerId
    ? { id: session.customerId, email: session.customerEmail, firstName: session.customerFirstName, lastName: session.customerLastName }
    : null;

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {/* KEY_CART / KEY_ACCOUNT pre-filled — useCartSWR and useAccount render immediately */}
          <SWRConfig value={{ fallback: { [KEY_CART]: initialCart, [KEY_ACCOUNT]: initialUser } }}>
            {children}
          </SWRConfig>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

The session JWT already carries `customerId`/`customerEmail`/`customerFirstName`/`customerLastName`, so `initialUser` needs no commercetools fetch — a full `getCustomerById` is only needed on the account profile page.

## Async `params` and request dedup

- `params` (and `searchParams`) are `Promise`s in Next 15+ — always `await` them in pages, `generateMetadata`, and `opengraph-image.tsx`.
- When `generateMetadata` and the page component fetch the same resource, wrap the `lib/ct/*` fetch in React `cache()` so it runs once per request. See [best-practices/metadata.md](./best-practices/metadata.md).

## Connection health check

Verify credentials once after wiring the client, then **delete before deploying**:

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
