# Concept → Nuxt Primitive Mapping

This is the spine of the adapter. The [`commercetools-storefront`](../../../SKILL.md) skill states every rule in framework-neutral language; this table resolves each concept to its Nuxt 4 primitive. When a generic reference says "see your framework adapter", it means this file.

## Path & state conventions

The generic skill writes paths and client-side data access as stack-neutral placeholders. This stack pins them. Nuxt 4 splits code across three roots: **`app/`** (the Vue app, `srcDir`, runs server + client), **`server/`** (Nitro, server-only), and **`shared/`** (isomorphic, auto-imported in both):

| Generic placeholder | Nuxt (this stack) |
|---|---|
| `<root-dir>/` — application root directory | `storefront/` (project root; `nuxt.config.ts` lives here, Vue source under `storefront/app/`) |
| `<server>/` — server-side code root | `server/` (Nitro — never imported by the app) |
| `<api>/` — client-facing API surface the browser calls | `server/api/` (Nitro routes — `server/api/<resource>.ts`) |
| `<server>/ct/*` — commercetools helpers | `server/utils/ct/*` (auto-imported in server code) |
| `<server>/ct/client` — `apiRoot` singleton | `server/utils/ct/client.ts` |
| `<server>/types` — app type-mapping root (boundary types) | `shared/types/` (auto-imported in **both** app and server) |
| `<server>/mappers/` — commercetools→app mappers | `server/utils/mappers/` |
| `<server>/cache-keys` — client-state keys | Pinia store ids + `useAsyncData` keys (a `shared/keys.ts` is optional) |
| `<server>/session` — session read/write module | `nuxt-auth-utils` (sealed cookie); thin helpers in `server/utils/session.ts` |
| `<server>/utils` — shared utils (`COUNTRY_CONFIG`, money/locale) | `shared/utils/` (auto-imported both sides — these are isomorphic) |
| **Client state** — mutable per-user data layer | **Pinia** (`app/stores/*.ts`); `useState` for simple shared values; see [Client state stores](#client-state-stores-pinia) |
| **Client state hook** | a Pinia store (`app/stores/*.ts`) or a composable (`app/composables/*.ts`) |
| **Client state provider** | none needed — Pinia is globally available; SSR state hydrates via the Nuxt payload |
| **Server-managed session** | a sealed (encrypted) cookie via `nuxt-auth-utils` (stateless BFF); see [data-loading.md](./data-loading.md) |

> **Why `shared/` for types and `COUNTRY_CONFIG`:** the generic skill files these under `<server>/`, but in Nuxt they must be importable from Vue components too (a card formats money; a page imports the `Product` boundary type). `shared/utils/**` and `shared/types/**` auto-import in both runtimes and may not import Vue or Nitro APIs — keeping them isomorphic. Secret-bearing code (`apiRoot`) stays in `server/utils/`, never `shared/`.

## Lookup table

| Generic concept | Nuxt 4 primitive |
|---|---|
| Server-rendered data load (catalog/immutable) | `useAsyncData(key, () => $fetch('/api/...'))` or `useFetch('/api/...')` in `app/pages/.../[slug].vue`; runs during SSR, result serialized to the payload |
| Resolve route params (page) | `const route = useRoute(); route.params.slug` — reactive, available on server and client |
| Resolve route params (Nitro) | `getRouterParam(event, 'slug')`; query via `getQuery(event)` |
| Server endpoint (BFF) | Nitro route `server/api/<resource>.ts` exporting `defineEventHandler`; method suffixes `.get.ts` / `.post.ts` / `.patch.ts` / `.delete.ts` |
| Server endpoint directory layout | `server/api/{auth,account,cart,checkout,shipping-methods,channels}/...` |
| Client component / browser-interactive UI | a Vue SFC under `app/components/`; wrap browser-only UI in `<ClientOnly>` — see [best-practices/rendering.md](./best-practices/rendering.md) |
| Read/write the (server-managed) session | `nuxt-auth-utils` in `server/`: `getUserSession` / `setUserSession` / `requireUserSession` / `clearUserSession`; sealed-cookie (stateless BFF) — see [data-loading.md](./data-loading.md) |
| Not-found response | `throw createError({ statusCode: 404, fatal: true })` → renders `app/error.vue` |
| Redirect | `return navigateTo('/path', { redirectCode: 301 })` (app/middleware); `sendRedirect(event, '/path', 302)` (Nitro) — in middleware the call **must be returned** |
| Route-segment error boundary | root `app/error.vue`; component-scoped `<NuxtErrorBoundary>` |
| Auth-gated responses | `requireUserSession(event)` (throws 401 in Nitro); `throw createError({ statusCode: 403 })` for forbidden |
| Client-side navigation | `navigateTo(localePath('/checkout/payment'), { replace: true })` |
| Locale-aware link primitive | `<NuxtLink :to="localePath('/path')">` via `useLocalePath()` — never a bare path string |
| Locale routing config | `@nuxtjs/i18n` v10 in `nuxt.config.ts` (`i18n: { locales, defaultLocale, strategy: 'prefix' }`) + `i18n/i18n.config.ts`; messages in `i18n/locales/` — see [project-layout.md](./project-layout.md) |
| Locale URL prefix | `strategy: 'prefix'` — the module owns prefixing, detection, and redirect |
| Server-side cache-with-TTL for stable CT data | `defineCachedFunction(fn, { maxAge, name, getKey, swr })` or `routeRules` cache — never per-user/session — see [data-loading.md](./data-loading.md) |
| Per-request fetch dedup | `useAsyncData`/`useFetch` dedupe by key automatically; a Nitro `defineCachedFunction` dedupes within its TTL |
| Hydrate client state-manager/cache from server (no spinner flash) | the Nuxt payload — `useAsyncData`/`useFetch` and Pinia state serialize on the server and hydrate without refetch — see [data-loading.md](./data-loading.md) |
| Root layout / providers | `app/app.vue` + `app/layouts/default.vue`; Pinia and i18n register via modules (no manual provider) |
| Page-level SEO metadata | `useSeoMeta({ ... })` (reactive getters for dynamic data) + `useHead` for the title template — see [best-practices/metadata.md](./best-practices/metadata.md) |
| OG/social card image | `nuxt-og-image` v6: `defineOgImage('Name.takumi', props)` + a component in `app/components/OgImage/` |
| Product image rendering | `<NuxtImg>` with `image: { provider: 'none' }` — see [best-practices/image.md](./best-practices/image.md) |
| Health check (verify CT credentials) | `server/api/health.get.ts` → `apiRoot.get().execute()` (delete before deploy) |
| App framework config | `nuxt.config.ts` (`modules`, `runtimeConfig`, `i18n`, `image`, `nitro`, `vite`) |
| Styling | Tailwind v4 — `@tailwindcss/vite` plugin + `@import "tailwindcss"` in a registered CSS file |
| Deploy target | Nitro presets — `nitro: { preset: 'vercel' }` / `'netlify'` (auto-detected in CI) |

> **Portable, not remapped:** the commercetools SDK calls (`apiRoot.*`, the as-associate chain), the mappers, and `getLocalizedString`/`formatMoney` are identical to the generic skill — only their *location* (`<server>/` → `server/utils/` and `shared/`) and the render/state primitives around them differ. `nuxt-auth-utils`, Pinia, and `@nuxtjs/i18n` are this stack's realizations of the generic **server-managed session**, **client state**, and **locale routing** concepts.

## Page shape (server-rendered data load)

The generic "server-rendered data load" for catalog/immutable data. The page calls a Nitro route; `useAsyncData` runs it during SSR (in-process, no network hop) and ships the result in the payload:

```vue
<!-- app/pages/category/[slug].vue -->
<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

// Parallel independent fetches — both run server-side, both land in the payload
const { data, error } = await useAsyncData(`category:${slug}`, () =>
  Promise.all([
    $fetch(`/api/category/${slug}`),
    $fetch('/api/category-tree'),
  ]).then(([category, tree]) => ({ category, tree }))
)

if (!data.value?.category) {
  throw createError({ statusCode: 404, statusMessage: 'Category not found', fatal: true })
}
// build breadcrumb by walking data.value.tree in memory (no extra request)
</script>
```

- Pages render on the server first, then hydrate. Anything that touches `window`/`document` belongs in `onMounted` or `<ClientOnly>` — see [best-practices/rendering.md](./best-practices/rendering.md).
- `createError({ ..., fatal: true })` renders the full error page on the client too; on the server it always does. Call it after the data resolves, not inside a `try` that swallows it.

## Client navigation & step routing

The generic "client-side navigation" (e.g. checkout step guards):

```vue
<!-- app/pages/checkout/index.vue -->
<script setup lang="ts">
const localePath = useLocalePath()
const cart = useCartStore()

watchEffect(() => {
  if (cart.cart === null) return                 // still loading
  const hasAddr = !!(cart.cart.shippingAddress?.streetName && cart.cart.billingAddress?.streetName)
  const hasMethod = !!cart.cart.shippingInfo
  if (hasAddr && hasMethod) navigateTo(localePath('/checkout/payment'), { replace: true })
  else if (hasAddr) navigateTo(localePath('/checkout/shipping'), { replace: true })
  else navigateTo(localePath('/checkout/addresses'), { replace: true })
})
</script>
```

Each step component repeats the guard, redirecting back when prerequisites are unmet. The *decision logic* (which step the cart state allows) is documented framework-neutrally in `core/checkout-page.md`; only the `navigateTo` + `localePath` mechanism is Nuxt-specific.

## Confirmation page (server-rendered, fetch by id)

```vue
<!-- app/pages/checkout/confirmation/[orderId].vue -->
<script setup lang="ts">
const route = useRoute()
const { data: order } = await useAsyncData(
  `order:${route.params.orderId}`,
  () => $fetch(`/api/checkout/order/${route.params.orderId}`).catch(() => null)
)
// render success indicator, order number, line-item summary from order.value
</script>
```

The generic rule (fetch the order server-side by id; do not trust a freshly-revalidated client state-manager/cache) lives in `core/checkout-page.md`; the `useAsyncData` + route-param shape is the Nuxt mapping.

## Client state stores (Pinia)

The generic **client state hook with mutations** maps to a Pinia store (setup syntax). Reads expose safe defaults; actions call `$fetch`, update state from the response body, and throw on error. Stores in `app/stores/` are auto-imported, and their state hydrates from the SSR payload with no refetch.

```ts
// app/stores/widgets.ts
export const useWidgetsStore = defineStore('widgets', () => {
  const widgets = ref<Widget[]>([])          // safe default
  const count = computed(() => widgets.value.length)

  async function load() {
    widgets.value = (await $fetch('/api/widgets')).widgets ?? []
  }

  async function create(data: NewWidget) {
    // action throws on failure; component decides how to surface it
    const res = await $fetch('/api/widgets', { method: 'POST', body: data })
    widgets.value = res.widgets               // update from response — no extra round-trip
  }

  return { widgets, count, load, create }
})
```

- **Store ids** are the cache identity (generic: `<server>/cache-keys`); BU-scoped state keys its server route by `businessUnitKey` (`/api/widgets?bu=...`), not a separate store per BU.
- **Actions throw**; state getters expose safe defaults (`null` / `[]`).
- **Update from the response body** — assign the returned object; no follow-up fetch.
- **Seed from the server** by populating the store during SSR (a plugin or `callOnce`) so first paint has data — see [data-loading.md](./data-loading.md). For a single value (e.g. selected locale/country) prefer `useState` over a full store.
