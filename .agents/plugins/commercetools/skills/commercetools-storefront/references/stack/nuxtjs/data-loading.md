# Data Loading — Nuxt Implementation

The [`commercetools-storefront`](../../../SKILL.md) skill decides *what* loads where:

- **Catalog / immutable data** (category pages, PDPs, search results) → server-rendered load via `useAsyncData`/`useFetch` against a Nitro route, cached with a Nitro TTL.
- **Mutable per-user state** (cart, account, orders, quotes) → a Pinia store whose actions call `$fetch('/api/...')`.

Both paths cross the same boundary: the app never touches commercetools directly — a Nitro route under `server/api/` does, delegating to `server/utils/ct/*`. This file pins those decisions to Nuxt 4 primitives. The decision rule itself is generic — see `core/data-loading.md`.

## commercetools client — `server/utils/ct/client.ts`

The `apiRoot` singleton is server-only. Credentials come from `runtimeConfig` (no `public` key), so they never enter the client bundle:

```ts
// server/utils/ct/client.ts
import { ClientBuilder } from '@commercetools/ts-client'
import { createApiBuilderFromCtpClient } from '@commercetools/platform-sdk'

let _apiRoot: ReturnType<typeof createApiBuilderFromCtpClient> | null = null

export function getApiRoot() {
  if (_apiRoot) return _apiRoot
  const c = useRuntimeConfig()                 // server-only secrets
  const client = new ClientBuilder()
    .withClientCredentialsFlow({
      host: c.ctAuthUrl,
      projectKey: c.ctProjectKey,
      credentials: { clientId: c.ctClientId, clientSecret: c.ctClientSecret },
    })
    .withHttpMiddleware({ host: c.ctApiUrl })
    .build()
  _apiRoot = createApiBuilderFromCtpClient(client).withProjectKey({ projectKey: c.ctProjectKey })
  return _apiRoot
}
```

```ts
// nuxt.config.ts — runtimeConfig keys (server-only unless under public)
export default defineNuxtConfig({
  runtimeConfig: {
    ctProjectKey: '',     // NUXT_CT_PROJECT_KEY
    ctClientId: '',       // NUXT_CT_CLIENT_ID
    ctClientSecret: '',   // NUXT_CT_CLIENT_SECRET — secret, server-only
    ctAuthUrl: '',        // NUXT_CT_AUTH_URL
    ctApiUrl: '',         // NUXT_CT_API_URL
    // public: {}          // nothing about commercetools belongs here
  },
})
```

Functions defined in `server/utils/` are auto-imported across server code, so `getApiRoot()` and the `server/utils/ct/*` helpers need no import statement inside Nitro routes.

## Session — `nuxt-auth-utils` sealed cookie (stateless BFF)

The Nuxt realization of the generic *server-managed session* is a **sealed (encrypted) cookie** via `nuxt-auth-utils`: session data is encrypted and stored in the cookie itself (no server store), read and written only in `server/`. Requires `NUXT_SESSION_PASSWORD` ≥ 32 chars.

The session shape mirrors the generic `Session` interface. Non-secret fields go at the top level (exposed to the client through `useUserSession()`); commercetools tokens go under `secure`, which is **stripped from the client payload**:

```ts
// shared/types/session.ts — augment the module's session type
declare module '#auth-utils' {
  interface User { id: string; email: string; firstName?: string; lastName?: string }
  interface UserSession {
    cartId?: string
    country?: string
    currency?: string
    locale?: string
    // B2B adds: businessUnitKey, storeKey, storeId, distributionChannelId, supplyChannelId, productSelectionId
  }
  interface SecureSessionData {
    // server-only — never sent to the browser
    ctAccessToken?: string
    ctRefreshToken?: string
  }
}
export {}
```

```ts
// server/api/auth/login.post.ts — write the session
export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)
  const customer = await loginCustomer(email, password)   // server/utils/ct/auth.ts
  await setUserSession(event, {
    user: { id: customer.id, email, firstName: customer.firstName, lastName: customer.lastName },
    cartId: customer.cart?.id,
    secure: { ctAccessToken: customer.accessToken },
  })
  return { user: { id: customer.id, email } }
})
```

```ts
// server/api/auth/me.get.ts — read / require the session
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)   // throws 401 if no user
  return { user }
})
```

```ts
// server/api/auth/logout.post.ts
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { ok: true }
})
```

> **Stateless vs stateful.** The default is fully stateless — everything lives encrypted in the cookie (4 KB limit), so it scales horizontally with no shared store. If session data outgrows the cookie or you need server-side revocation, `nuxt-auth-utils` supports an optional `unstorage`-backed server store keyed by a session id — same API surface, different storage. This is the generic skill's stateful-BFF option.

> **Locale** is owned by `@nuxtjs/i18n` (its cookie + `useI18n().locale`), not the session. When a customer's `country`/`currency`/`locale` must drive pricing, persist them into the session at login/selection and read them in Nitro routes via `getUserSession(event)`.

## BFF Nitro route shape

The generic "server endpoint" has exactly three responsibilities (validate session → call `server/utils/ct/<namespace>.ts` → return JSON). In Nuxt that is a Nitro route:

```ts
// server/api/widgets/index.get.ts
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)        // 401 if not logged in
  try {
    return { widgets: await getWidgets(user.id) }          // getWidgets from server/utils/ct/widgets.ts
  } catch (e: unknown) {
    throw createError({
      statusCode: 500,
      statusMessage: e instanceof Error ? e.message : 'Failed to fetch widgets',
    })
  }
})
```

Never put a raw commercetools SDK call in the route — it delegates to `server/utils/ct/<namespace>.ts` (generic rule). The data flow is: page/store → `useFetch`/`$fetch('/api/...')` → Nitro route → `server/utils/ct/*` → `getApiRoot()`.

**Directory conventions** (method suffix picks the verb; `[id]` is a dynamic param):
```
server/api/
  auth/             login.post.ts  register.post.ts  logout.post.ts  me.get.ts
  account/          orders.get.ts  addresses.*.ts  payments.*.ts  wishlist.*.ts
  cart/             index.get.ts  index.post.ts  line-items.post.ts  discount.post.ts
  checkout/         order.post.ts  order/[orderId].get.ts
  shipping-methods/ index.get.ts   # options by locale/currency
  channels/         index.get.ts   # store channels (BOPIS)
```

The domain endpoints (cart GET clearing non-Active carts, login writing the session, shipping-methods filtering by currency) follow this same shape — their *logic* is documented per-feature in the generic skill; the Nuxt wrapper is always this `defineEventHandler` shell.

## Server-side caching — `defineCachedFunction`

The generic "cache stable public data with a TTL; never per-user/session" maps to Nitro's `defineCachedFunction` (wrap a function) or `defineCachedEventHandler` (wrap a whole route). `maxAge` is in **seconds**; `swr: true` serves a stale entry while revalidating in the background:

```ts
// server/utils/ct/locale-validation.ts
export const getValidCountryConfig = defineCachedFunction(
  async () => {
    const { body } = await getApiRoot().get().execute()
    const { countries = [], currencies = [], languages = [] } = body
    return Object.fromEntries(
      Object.entries(COUNTRY_CONFIG).filter(([country, config]) =>
        countries.includes(country) &&
        currencies.includes(config.currency) &&
        languages.some((l: string) => l.toLowerCase() === config.locale.toLowerCase())
      )
    )
  },
  { name: 'locale-validation', maxAge: 300, getKey: () => 'all', swr: true }
)
```

A declarative alternative for whole routes — `routeRules` in `nuxt.config.ts`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  routeRules: {
    '/api/category-tree':    { cache: { maxAge: 60, swr: true } },
    '/api/shipping-methods': { cache: { maxAge: 60, swr: true } },
  },
})
```

| Data | Cache TTL | Reason |
|------|-----------|--------|
| commercetools project config (countries, currencies) | 300 s | Changes only on project reconfiguration |
| Category tree | 60 s | Rarely edited; high reuse across pages |
| Shipping methods | 60 s | Rarely edited; no per-user variation |
| Product prices | **Do not cache** | Change on promotion rules; per-currency |
| Cart / account data | **Do not cache** | Per-session, changes frequently |

> Prefer `defineCachedFunction` over module-level variables — a module cache resets on cold starts and isn't shared across instances. The Nitro cache is shared across all requests, so **never cache per-user or per-session data** with it; use a Pinia store (client) or a direct per-request `server/utils/ct/*` call for user-specific data. Cached entries persist in the Nitro `cache` storage (memory in dev; the platform KV/driver in production).

## Hydration from the server — the Nuxt payload

The generic "hydrate the client state-manager/cache from server-fetched data to avoid a spinner flash" is automatic in Nuxt: anything resolved during SSR by `useAsyncData`/`useFetch` and any Pinia store state is serialized into the payload and **reused on hydration without refetching**.

**Catalog data** — `useAsyncData`/`useFetch` already hydrate. No extra wiring; the page renders with data on first paint.

**Mutable user state (cart/account)** — populate the Pinia store during SSR so it ships in the payload. `callOnce` guarantees the init runs once on the server and isn't repeated on the client:

```ts
// app/plugins/init-session.ts  (or call inside app.vue setup)
export default defineNuxtPlugin(async () => {
  const cart = useCartStore()
  const account = useAccountStore()
  await callOnce('init-session', async () => {
    const { user } = await $fetch('/api/auth/me').catch(() => ({ user: null }))
    if (user) account.setUser(user)
    await cart.load()                  // store action; result hydrates via payload
  })
})
```

Because the session cookie already carries `user` fields (id, email, first/last name), `account.setUser` needs no commercetools fetch — a full customer fetch is only required on the account profile page.

## Route params

- In a **page**, read params from `useRoute()`: `const slug = useRoute().params.slug as string`. It's reactive and identical on server and client.
- In a **Nitro route**, use `getRouterParam(event, 'slug')` and `getQuery(event)`; never reach for `useRoute()` server-side.
- Give `useAsyncData` an explicit key that includes the param (`useAsyncData(\`product:${slug}\`, ...)`) so navigations between slugs don't collide in the payload cache.

## Connection health check

Verify credentials once after wiring the client, then **delete before deploying**:

```ts
// server/api/health.get.ts  ← DELETE before deploying
export default defineEventHandler(async () => {
  try {
    const { body } = await getApiRoot().get().execute()
    return { ok: true, projectKey: body.key }
  } catch (e) {
    throw createError({ statusCode: 500, statusMessage: String(e) })
  }
})
```

```bash
curl http://localhost:3000/api/health
# → {"ok":true,"projectKey":"your-project-key"}
```
