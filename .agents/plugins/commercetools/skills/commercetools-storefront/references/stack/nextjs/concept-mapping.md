# Concept → Next.js Primitive Mapping

This is the spine of the adapter. The [`commercetools-storefront`](../../../SKILL.md) skill states every rule in framework-neutral language; this table resolves each concept to its Next.js (App Router) primitive. When a generic reference says "see your framework adapter", it means this file.

## Path & state conventions

The generic skill writes paths and client-side data access as stack-neutral placeholders. This stack pins them:

| Generic placeholder | Next.js (this stack) |
|---|---|
| `<root-dir>/` — application root directory | `site/` |
| `<server>/` — server-side code root | `lib/` |
| `<api>/` — client-facing API surface the browser calls | `app/api/` (Route Handlers — `app/api/<resource>/route.ts`) |
| `<server>/ct/*` — commercetools helpers | `lib/ct/*` |
| `<server>/ct/client` — `apiRoot` singleton | `lib/ct/client.ts` |
| `<server>/types` — app type-mapping root (boundary types) | `lib/types.ts` |
| `<server>/mappers/` — commercetools→app mappers | `lib/mappers/` |
| `<server>/cache-keys` — client-state keys | `lib/cache-keys.ts` |
| `<server>/session` — session read/write module | `lib/session.ts` |
| `<server>/utils` — shared utils (`COUNTRY_CONFIG`, money/locale) | `lib/utils.ts` |
| **Client state** — mutable per-user data layer | **SWR** (`useSWR` + `mutate` / `SWRConfig`); see [Client state hooks](#client-state-hooks-swr) |
| **Client state hook** | a SWR hook in `hooks/*.ts` (`'use client'`) |
| **Client state provider** | a React context in `context/*.tsx` |
| **Server-managed session** | a signed JWT in an HTTP-only cookie (`jose`, stateless BFF); see [data-loading.md](./data-loading.md) |

## Lookup table

| Generic concept | Next.js primitive (App Router) |
|---|---|
| Server-rendered data load | `async` Server Component (`app/[locale]/.../page.tsx`) calling `lib/ct/*` directly |
| Resolve route params | `const { slug, locale } = await params` — `params` is a `Promise` in Next 15+ |
| Server endpoint (BFF) | Route Handler `app/api/<resource>/route.ts` exporting `GET`/`POST`/`PATCH`/`DELETE` |
| Server endpoint directory layout | `app/api/{auth,account,cart,checkout,shipping-methods,channels}/...` |
| Client component / browser bundle | `'use client'` file |
| Read/write the (server-managed) session | `lib/session.ts` using `cookies()` from `next/headers` + `NextResponse.cookies.set(...)`; signed-JWT-in-cookie (stateless BFF) — see [data-loading.md](./data-loading.md) |
| Not-found response | `notFound()` from `next/navigation` → renders `not-found.tsx` |
| Redirect | `redirect()` / `permanentRedirect()` from `next/navigation` (server); `useRouter().push()` (client) — never wrap `redirect()` in `try/catch` |
| Route-segment error boundary | `error.tsx` / `global-error.tsx` |
| Auth-gated responses | `unauthorized()` → `unauthorized.tsx` (401); `forbidden()` → `forbidden.tsx` (403) |
| Client-side navigation | `useRouter()` from `@/i18n/routing` (`router.push`/`router.replace`) |
| Locale-aware link primitive | `import { Link } from '@/i18n/routing'` — never bare `next/link` |
| Locale routing config | `i18n/routing.ts` (`defineRouting` + `createNavigation`) + `i18n/request.ts` (`getRequestConfig`); next-intl@^4 — see [project-layout.md](./project-layout.md) |
| Locale URL prefix + redirect | `proxy.ts` middleware + `localePrefix: 'always'`; routes under `app/[locale]/` |
| Server-side cache-with-TTL for stable CT data | `unstable_cache(fn, [key], { revalidate })` from `next/cache` — never per-user/session — see [data-loading.md](./data-loading.md) |
| Per-request fetch dedup (metadata + page) | `cache()` from `react` wrapping the `lib/ct/*` fetch — see [best-practices/metadata.md](./best-practices/metadata.md) |
| Hydrate client state-manager/cache from server (no spinner flash) | `SWRConfig` `fallback={{ [KEY_CART]: initialCart, [KEY_ACCOUNT]: initialUser }}` in `app/layout.tsx` — see [data-loading.md](./data-loading.md) |
| Root layout / locale layout | `app/layout.tsx` (root) + `app/[locale]/layout.tsx` (providers: `NextIntlClientProvider`, `CartProvider`) |
| Page-level SEO metadata | `export const metadata` (static) / `export async function generateMetadata` (dynamic) — Server Components only — see [best-practices/metadata.md](./best-practices/metadata.md) |
| OG/social card image | `opengraph-image.tsx` via `next/og` `ImageResponse` |
| Product image rendering | `next/image` with `unoptimized: true` — see [best-practices/image.md](./best-practices/image.md) |
| Health check (verify CT credentials) | `app/api/health/route.ts` → `apiRoot.get().execute()` (delete before deploy) |
| App framework config | `next.config.ts` wrapped with `createNextIntlPlugin('./i18n/request.ts')` |
| Styling | Tailwind v4 — no config file, `@tailwindcss/postcss`, `@import 'tailwindcss'` in `globals.css` |
| Deploy target | `vercel.json` / `netlify.toml` (repo root); `/nextjs-deploy-vercel`, `/nextjs-deploy-netlify` |
| Scaffold a new project | `/nextjs-setup-project` |
| Add a locale | `/nextjs-add-locale` |

> **Portable, not remapped:** the commercetools SDK calls (`apiRoot.*`, the as-associate chain), the mappers, and `getLocalizedString`/`formatMoney` are identical in both skills — only their *location* (`<server>/` → `lib/`) and the render/state primitives around them differ. SWR and `jose` are this stack's realizations of the generic **client state** and **server-managed session** concepts.

## Server Component page shape

The generic "server-rendered data load" for catalog/immutable data:

```typescript
// app/[locale]/category/[slug]/page.tsx — async Server Component
export default async function CategoryPage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;          // params is a Promise in Next 15+
  const [category, categoryTree] = await Promise.all([   // generic rule: parallel independent fetches
    getCategoryBySlug(slug, locale),
    getCategoryTree(locale),
  ]);
  if (!category) notFound();                        // generic "not-found response"
  // ... build breadcrumb by walking categoryTree in memory (no extra ct calls)
}
```

- All page components are `async` by default — add `'use client'` only when the page needs browser APIs.
- `notFound()`, `redirect()` etc. come from `next/navigation` and must be called *outside* any `try/catch` — see [best-practices/error-handling.md](./best-practices/error-handling.md).

## Client navigation & step routing

The generic "client-side navigation" (e.g. checkout step guards):

```typescript
// app/[locale]/checkout/page.tsx — 'use client'
'use client';
import { useRouter } from '@/i18n/routing';   // locale-aware, NOT next/navigation directly

export default function CheckoutIndexPage() {
  const router = useRouter();
  const { data: cart } = useCartSWR();
  useEffect(() => {
    if (cart === undefined) return;             // still loading
    const hasAddr = !!(cart?.shippingAddress?.streetName && cart?.billingAddress?.streetName);
    const hasMethod = !!cart?.shippingInfo;
    if (hasAddr && hasMethod) router.replace('/checkout/payment');
    else if (hasAddr) router.replace('/checkout/shipping');
    else router.replace('/checkout/addresses');
  }, [cart]);
  return null;
}
```

Each step component repeats the guard, redirecting back when prerequisites are unmet. The *decision logic* (which step the cart state allows) is documented framework-neutrally in the generic `core/checkout-page.md`; only the `useRouter`/`router.replace` mechanism is Next-specific.

## Confirmation page (server-rendered, fetch by id)

```typescript
// app/[locale]/checkout/confirmation/[orderId]/page.tsx — Server Component
export default async function ConfirmationPage({ params }: { params: Promise<{ locale: string; orderId: string }> }) {
  const { orderId } = await params;
  let order = null;
  try { order = await getOrderById(orderId); } catch { /* show minimal confirmation */ }
  return (/* success indicator, order number, line-item summary */);
}
```

The generic rule (fetch the order server-side by id; do not trust a freshly-revalidated client state-manager/cache) lives in `core/checkout-page.md`; the Server Component + async `params` shape is the Next mapping.

## Client state hooks (SWR)

The generic **client state hook with mutations** maps to a SWR hook. Reads return safe defaults; mutations update the cache from the response body and throw on error.

```typescript
// hooks/useWidgets.ts — 'use client'
'use client';
import useSWR, { useSWRConfig } from 'swr';
import { KEY_WIDGETS } from '@/lib/cache-keys';

export function useWidgets() {
  return useSWR(KEY_WIDGETS, async () => {
    const res = await fetch('/api/widgets');
    return res.ok ? (await res.json()).widgets ?? [] : [];
  }, { revalidateOnFocus: false }); // exception: the cart hook uses revalidateOnFocus: true
}

export function useWidgetMutations() {
  const { mutate } = useSWRConfig();
  async function createWidget(data) {
    const res = await fetch('/api/widgets', { method: 'POST', body: JSON.stringify(data) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
    mutate(KEY_WIDGETS, (await res.json()).widgets, { revalidate: false }); // update from response, no refetch
  }
  return { createWidget };
}
```

- **Cache keys** live in `lib/cache-keys.ts` (generic: `<server>/cache-keys`); BU-scoped state uses a `[KEY, businessUnitKey]` tuple.
- **Mutations throw**; read hooks return safe defaults (`null` / `[]`).
- **Update from the response body** (`mutate(KEY, data, { revalidate: false })`) — no extra round-trip.
- Seed from the server with `SWRConfig fallback` (see [data-loading.md](./data-loading.md)) to avoid a first-paint spinner.
