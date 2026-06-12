# Error Handling

## Critical: `createError`, `navigateTo`, and `abortNavigation` Are Control Flow

`createError({ ..., fatal: true })` throws to interrupt rendering; `navigateTo` and `abortNavigation` change navigation. In **route middleware they must be `return`ed** — a bare call without `return` does nothing useful and can let navigation continue.

```ts
// app/middleware/auth.ts
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  // Bad: not returned — navigation continues anyway
  // if (!loggedIn.value) navigateTo('/login')

  // Good: return the result
  if (!loggedIn.value) return navigateTo('/login')
})
```

`abortNavigation(err?)` stops navigation and (optionally) raises an error; it is middleware-only and must be returned:

```ts
export default defineNuxtRouteMiddleware((to) => {
  const { user } = useUserSession()
  if (!user.value?.isAdmin) return abortNavigation(createError({ statusCode: 403 }))
})
```

Apply named middleware with `definePageMeta({ middleware: ['auth'] })`; a `*.global.ts` file runs on every route.

---

## Triggering Errors — `createError`

Throw `createError` when a resource doesn't exist or a request fails. On the server it always renders the error page; on the client you need `fatal: true` for the full-screen error page (otherwise it surfaces in the nearest `<NuxtErrorBoundary>`):

```vue
<!-- app/pages/products/[slug].vue -->
<script setup lang="ts">
const slug = useRoute().params.slug as string
const { data: product } = await useAsyncData(`product:${slug}`, () =>
  $fetch(`/api/products/${slug}`).catch(() => null)
)

if (!product.value) {
  throw createError({ statusCode: 404, statusMessage: 'Product not found', fatal: true })
}
</script>
```

Call `createError` **after** the data resolves — not inside a `try` that catches and discards it.

In **Nitro routes**, throw `createError` to send an HTTP error; the storefront's `useFetch`/`$fetch` receives it as a rejected promise:

```ts
// server/api/widgets/index.get.ts
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)   // throws 401 automatically
  const widget = await getWidget(user.id)
  if (!widget) throw createError({ statusCode: 404, statusMessage: 'No widget' })
  return widget
})
```

`createError({ statusCode, statusMessage, fatal?, data?, cause? })` — `statusCode`/`statusMessage` are the canonical fields.

---

## Root Error Page — `app/error.vue`

Catches fatal errors across the whole app. It receives an `error` prop and replaces the normal layout. `clearError({ redirect })` clears the error state and (optionally) navigates away:

```vue
<!-- app/error.vue -->
<script setup lang="ts">
import type { NuxtError } from '#app'
const props = defineProps<{ error: NuxtError }>()
const handleError = () => clearError({ redirect: '/' })
</script>

<template>
  <div>
    <h1>{{ error.statusCode }}</h1>
    <p>{{ error.statusCode === 404 ? 'Page not found' : 'Something went wrong' }}</p>
    <button @click="handleError">Back to home</button>
  </div>
</template>
```

Branch on `error.statusCode` to render 404 vs 500 messaging — there is one root error page, not per-segment files.

---

## Scoped Boundary — `<NuxtErrorBoundary>`

Wrap a widget so a non-fatal error in it doesn't take down the page. The `#error` slot exposes `error` and `clearError`; the boundary auto-clears on route change:

```vue
<template>
  <NuxtErrorBoundary @error="logError">
    <RecommendationsWidget />
    <template #error="{ error, clearError }">
      <p>Couldn't load recommendations.</p>
      <button @click="clearError">Retry</button>
    </template>
  </NuxtErrorBoundary>
</template>
```

Use this for optional, non-blocking sections (recommendations, recently-viewed). Use `createError({ fatal: true })` for the things a page can't render without (the product itself).

---

## Redirects

```ts
// In a page setup, middleware (return it), or plugin:
return navigateTo('/login')                          // default 302
return navigateTo('/new-url', { redirectCode: 301 }) // permanent
return navigateTo('https://example.com', { external: true })  // external requires external:true
navigateTo('/path', { replace: true })               // replace history entry
```

`navigateTo` is for the app runtime. In a **Nitro route** use `sendRedirect` instead — `navigateTo` is not available server-side:

```ts
// server/api/old-path.get.ts
export default defineEventHandler((event) => {
  return sendRedirect(event, '/new-path', 301)
})
```

---

## Error Surface Summary

| Need | Use |
|------|-----|
| 404 / fatal page error | `throw createError({ statusCode, fatal: true })` → `app/error.vue` |
| HTTP error from a Nitro route | `throw createError({ statusCode, statusMessage })` |
| Require auth in a Nitro route | `requireUserSession(event)` (auto-401) |
| Gate a route in the app | route middleware → `return navigateTo(...)` / `return abortNavigation(...)` |
| Non-blocking section failure | `<NuxtErrorBoundary>` |
| Redirect (app) | `return navigateTo(...)` |
| Redirect (Nitro) | `sendRedirect(event, ...)` |
| Read current error state | `useError()` |
