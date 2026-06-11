---
name: overview
description: Nuxt 4 stack adapter for the commercetools-storefront skill — maps the framework-neutral storefront patterns onto Nuxt 4 + Nitro + @nuxtjs/i18n v10 + nuxt-auth-utils + Pinia + Tailwind v4 primitives.
when_to_use:
  - "Implementing a commercetools storefront on Nuxt 4 (Vue, SSR)"
metadata:
  contentType: REFERENCE
  area:
    - nuxtjs
    - storefront
---

# Nuxt Stack — commercetools Storefront

> **Nuxt stack adapter.** This is the Nuxt 4 implementation layer for the [`commercetools-storefront`](../../../SKILL.md) skill. That skill states every commercetools fact and B2C/B2B rule as a framework-neutral decision; this stack maps each one to Nuxt 4 + Nitro + `@nuxtjs/i18n` v10 + `nuxt-auth-utils` + Pinia + Tailwind v4 primitives. Use it together with the skill's `core/`, `b2c/`, and `b2b/` references when the storefront's frontend is Nuxt.

When you read a rule in the generic skill phrased as "server-rendered data load", "server endpoint", "the framework's locale-aware link", or "the framework's server-side cache-with-TTL primitive", come here for the concrete Nuxt mapping.

## The one rule that shapes everything

Nuxt has two runtimes: the **Vue app** (`app/`, runs on both server and client) and the **Nitro server** (`server/`, server-only). commercetools credentials live in Nitro and are reachable only from `server/`. The app **never imports `server/` code** — the bundler would otherwise leak secrets to the browser.

Therefore **every** commercetools read or write — catalog *and* mutable — goes through a Nitro route under `server/api/`, and pages reach it with `useFetch` / `useAsyncData` / `$fetch`. During SSR an internal `useFetch('/api/...')` is a direct in-process call (no real network hop), so this costs nothing for server-rendered pages. This is the BFF boundary from the generic skill, realized in Nitro.

## Reference Index

| Task | Reference |
|------|-----------|
| Generic concept → Nuxt primitive lookup table; routing, navigation, page & store shapes | [concept-mapping.md](./concept-mapping.md) |
| Project layout (`app/`, `server/`, `shared/`), `nuxt.config.ts`, i18n wiring, Tailwind v4, version gates, deploy | [project-layout.md](./project-layout.md) |
| The Nuxt side of data loading: `nuxt-auth-utils` sealed session, Nitro route shape, `defineCachedFunction`, SSR/Pinia hydration, route params, health-check route | [data-loading.md](./data-loading.md) |
| `<NuxtImg>` config, `provider: 'none'`, `domains`, `sizes`, LCP `preload` | [best-practices/image.md](./best-practices/image.md) |
| `useSeoMeta` / `useHead`, dynamic meta, title template, `nuxt-og-image` v6 | [best-practices/metadata.md](./best-practices/metadata.md) |
| SSR/client boundary, `<ClientOnly>`, hydration safety, server-only code, `useState` vs module refs | [best-practices/rendering.md](./best-practices/rendering.md) |
| `createError`, `app/error.vue`, `<NuxtErrorBoundary>`, `navigateTo` / `sendRedirect`, route middleware | [best-practices/error-handling.md](./best-practices/error-handling.md) |

## Commands

| Task | Command |
|------|---------|
| Scaffold a new Nuxt 4 + commercetools storefront | Run `/nuxtjs-setup-project` |

`/nuxtjs-setup-project` verifies Node, creates the Nuxt 4 app, installs pinned dependencies, writes `nuxt.config.ts` (modules, Tailwind v4, `image: { provider: 'none' }`, i18n `strategy: 'prefix'`, server-only `runtimeConfig`), lays down the `app/`/`server/`/`shared/` structure with shared types/utils, the commercetools client, a generated `NUXT_SESSION_PASSWORD`, and a health-check route, then verifies the full chain. See [project-layout.md](./project-layout.md) for the resulting layout.

## Priority Tiers

### CRITICAL

- **Nuxt version** — use `nuxt@^4`. The app source lives under `app/` (the default `srcDir`); server code under `server/`; isomorphic code under `shared/`.
- **Secrets never leave Nitro** — commercetools client id/secret live in `runtimeConfig` (server-only, no `public` key) and are read with `useRuntimeConfig(event)` inside `server/`. Never reference them from a component or a `public` config key.
- **`@nuxtjs/i18n` strategy** — use `strategy: 'prefix'` so every route carries a locale prefix.
- **Session password** — `nuxt-auth-utils` requires `NUXT_SESSION_PASSWORD` ≥ 32 chars; set it as a real platform env var in production, never commit it.

### HIGH

- **Locale-aware links** — build hrefs with `useLocalePath()` (`<NuxtLink :to="localePath('/cart')">`), never a bare string path; the prefix would be lost.
- **No `$fetch` in `setup()`** — bare `$fetch` in a component's `setup` runs twice (SSR + hydration). Use `useFetch` / `useAsyncData` for initial data; reserve `$fetch` for event handlers and Nitro routes / store actions.
- **`createError`/`navigateTo` are control flow** — `createError({ ..., fatal: true })` throws; in route middleware `navigateTo`/`abortNavigation` **must be returned**. See [best-practices/error-handling.md](./best-practices/error-handling.md).
- **`@nuxt/image` must not transform CT URLs** — set `image: { provider: 'none' }`. The commercetools CDN rejects optimizer query params. See [best-practices/image.md](./best-practices/image.md).

## Anti-Patterns Quick Reference

| Anti-pattern | Correct approach |
|---|---|
| Importing `server/utils/ct/*` into a page/component | Call it through a Nitro route via `useFetch('/api/...')` — never import server code into the app |
| commercetools secret under `runtimeConfig.public` | Top-level `runtimeConfig` only (server-only); read with `useRuntimeConfig(event)` |
| `<NuxtLink to="/cart">` in localized UI | `<NuxtLink :to="localePath('/cart')">` via `useLocalePath()` |
| Bare `$fetch('/api/...')` in `setup()` | `useFetch`/`useAsyncData` (deduped, SSR-payload-hydrated) |
| `createError`/`navigateTo` inside a swallowing `try/catch` (middleware) | `return navigateTo(...)` / `return abortNavigation(...)` at the top level |
| Keeping `image.provider` as `ipx` for CT images | `image: { provider: 'none' }` — CT CDN 403s on `?w=&q=` |
| Module-level `ref()` for shared state | `useState(key, init)` or a Pinia store (request-isolated on the server) |
| `@nuxtjs/tailwindcss` for Tailwind v4 | `@tailwindcss/vite` plugin + `@import "tailwindcss"` |

## How this maps to the generic skill

The generic skill is the source of truth for *what* to build; this adapter is *how* to build it in Nuxt. Every framework-neutral term resolves through [concept-mapping.md](./concept-mapping.md):

- "server endpoint (BFF)" → Nitro route `server/api/<resource>.ts` (`defineEventHandler`)
- "server-rendered data load" → `useFetch`/`useAsyncData` against a Nitro route (SSR, payload-hydrated)
- "client-fetched mutable state" → a Pinia store whose actions call `$fetch('/api/...')`
- "the framework's server-side cache-with-TTL primitive" → `defineCachedFunction` / `routeRules` cache
- "the framework's locale-aware link / client navigation" → `useLocalePath()` + `<NuxtLink>` / `navigateTo`
- "server-managed session" → `nuxt-auth-utils` sealed encrypted cookie (stateless BFF)

The portable app conventions — the commercetools SDK calls (`apiRoot.*`, the as-associate chain), the mappers, and `getLocalizedString`/`formatMoney` — are identical to the generic skill; only their *location* (`<server>/` → `server/utils/`, `shared/`) and the render/state primitives around them are Nuxt-specific.
