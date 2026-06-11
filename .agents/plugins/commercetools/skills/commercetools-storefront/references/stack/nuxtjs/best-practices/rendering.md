# Rendering Boundary (SSR / Client)

Nuxt pages and components render **twice**: once on the server (Nitro) to produce HTML, then on the client during hydration. Code in `setup` runs in both passes. Two boundaries matter for a commercetools storefront: the **secret boundary** (`app/` must never reach `server/`) and the **hydration boundary** (server and client must render the same markup, and browser-only APIs must not run during SSR).

## The secret boundary: never import `server/` into the app

commercetools credentials live in `server/utils/ct/`. The Vue app bundle ships to the browser — importing `server/` code into a page or component would leak those secrets and break the build.

```ts
// WRONG — pulls server-only code (and secrets) into the client bundle
import { getProduct } from '~~/server/utils/ct/products'
const product = await getProduct(slug)

// CORRECT — go through the BFF; useAsyncData runs it in-process during SSR
const { data: product } = await useAsyncData(`product:${slug}`, () => $fetch(`/api/products/${slug}`))
```

Anything secret-bearing or commercetools-touching is reached only through a Nitro route under `server/api/`. See [concept-mapping.md](../concept-mapping.md) and [data-loading.md](../data-loading.md).

---

## Don't call bare `$fetch` in `setup`

A bare `$fetch('/api/...')` in `setup` runs on the server **and** again on the client during hydration — two requests, and the result isn't in the payload. Use `useFetch`/`useAsyncData` for initial data (deduped, SSR-payload-hydrated); reserve `$fetch` for event handlers and Pinia store actions.

```ts
// Bad — double fetch, no payload hydration
const cart = await $fetch('/api/cart')

// Good — single SSR fetch, hydrated on the client
const { data: cart } = await useFetch('/api/cart')

// Good — $fetch is correct inside an event handler / store action
async function addToCart(sku: string) {
  await $fetch('/api/cart/line-items', { method: 'POST', body: { sku } })
}
```

---

## Browser-only code: `onMounted`, `import.meta.client`, `<ClientOnly>`

`window`, `document`, `localStorage`, and `IntersectionObserver` don't exist during SSR. Touching them in `setup` crashes the server render.

```ts
// Bad — runs during SSR, ReferenceError: window is not defined
const width = window.innerWidth

// Good — client-only lifecycle
const width = ref(0)
onMounted(() => { width.value = window.innerWidth })

// Good — guard a one-off
if (import.meta.client) { /* browser-only */ }
```

For components that simply cannot render on the server (a third-party widget that reads `window` at module load, a payment iframe), wrap them in `<ClientOnly>` and provide a `#fallback` to reserve layout space:

```vue
<template>
  <ClientOnly>
    <PaymentWidget :cart="cart" />
    <template #fallback>
      <div class="h-40 animate-pulse rounded bg-gray-100" />
    </template>
  </ClientOnly>
</template>
```

---

## Hydration safety: server and client must match

If the server HTML and the first client render differ, Vue logs a hydration mismatch and may discard the server markup. Avoid render output that depends on `Date.now()`, `Math.random()`, timezone, or `window` during the initial render — compute those in `onMounted`, or render them inside `<ClientOnly>`.

```vue
<!-- Bad: server time ≠ client time → mismatch -->
<p>{{ new Date().toLocaleTimeString() }}</p>

<!-- Good -->
<ClientOnly><p>{{ now }}</p></ClientOnly>
```

---

## Shared state: `useState` and Pinia, never a module-level `ref`

On the server a module is shared across **all** concurrent requests, so a module-level `ref` leaks one user's state into another's response. Use `useState(key, init)` (request-isolated, hydrates via payload) for simple shared values, or a Pinia store for richer state.

```ts
// Bad — shared across requests on the server, cross-request state leak
const selectedCountry = ref('US')

// Good — request-isolated, SSR-hydrated
export const useSelectedCountry = () => useState('selectedCountry', () => 'US')
```

State set during SSR — `useState`, `useAsyncData`/`useFetch` results, and Pinia stores — is serialized into the Nuxt payload and reused on hydration without refetching. See [data-loading.md](../data-loading.md#hydration-from-the-server--the-nuxt-payload).

---

## Quick reference

| Concern | Rule |
|---|---|
| commercetools / secrets | Only in `server/`; reach via a Nitro route, never import `server/` into the app |
| Initial data | `useFetch` / `useAsyncData` — not bare `$fetch` in `setup` |
| Mutations / events | `$fetch` inside handlers and store actions |
| `window` / `document` / `localStorage` | `onMounted` or `import.meta.client`; whole component → `<ClientOnly>` |
| Non-deterministic render (time, random) | compute in `onMounted` or wrap in `<ClientOnly>` |
| Shared state | `useState(key, init)` or Pinia — never a module-level `ref` |
