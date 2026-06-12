# Nuxt Project Layout

This is the Nuxt 4 project shape that the generic `commercetools-storefront` patterns assume when the framework is Nuxt. The `/nuxtjs-setup-project` command scaffolds all of it; this file documents the resulting layout and the load-bearing config so you can reason about it or repair a partial setup.

## Version gates (CRITICAL)

| Package | Required | Why |
|---|---|---|
| `nuxt` | `^4` | App source under `app/`; `shared/` for isomorphic code; Nitro server layer |
| `@nuxtjs/i18n` | `^10` | Targets Nuxt 4 / Vue Router 5 / Vue I18n 11; the "restructure" file layout |
| `nuxt-auth-utils` | `^0.5` (pin exact — pre-1.0) | Sealed-cookie sessions; `@nuxt/kit ^4` |
| `@pinia/nuxt` + `pinia` | `^0.11` + `^3` | Official Nuxt 4 state management |
| `@nuxt/image` | `^2` | `<NuxtImg>`; the `none` provider for CT CDN pass-through |
| `@commercetools/platform-sdk` | `^8` | Storefront SDK |
| `@commercetools/ts-client` | `^4` | Token + middleware client |
| `tailwindcss` + `@tailwindcss/vite` | `^4` | Tailwind v4 via the Vite plugin (not the legacy Nuxt module) |

Optional: `nuxt-og-image` (`^6`) for dynamic OG images — see [best-practices/metadata.md](./best-practices/metadata.md).

## Directory structure

Nuxt 4 splits source across three roots. `app/` is the default `srcDir` (so `~`/`@` → `app/`); `server/` and `shared/` sit beside it at the project root (`~~`/`@@` → project root).

```
storefront/                      # <root-dir> — project root
├── nuxt.config.ts               # modules, runtimeConfig, i18n, image, nitro, vite
├── app/                         # srcDir — the Vue app (server + client)
│   ├── app.vue                  # root component
│   ├── error.vue                # root error page (see best-practices/error-handling.md)
│   ├── layouts/                 # default.vue, etc.
│   ├── pages/                   # file-based routing ([slug].vue, checkout/, etc.)
│   ├── components/{ui,layout,product}/   # auto-imported; OgImage/ for og-image templates
│   ├── composables/             # auto-imported client-side composables
│   ├── stores/                  # Pinia stores (auto-imported)
│   ├── middleware/              # route middleware (auth.ts, *.global.ts)
│   ├── plugins/                 # Nuxt plugins (init-session.ts)
│   └── assets/css/main.css      # @import "tailwindcss"
├── server/                      # <server> — Nitro, server-only (never imported by app)
│   ├── api/                     # BFF routes (auth, account, cart, checkout, shipping-methods, channels)
│   └── utils/
│       ├── ct/                  # server-only commercetools helpers + client.ts (getApiRoot)
│       ├── mappers/             # commercetools → app mappers
│       └── session.ts           # thin nuxt-auth-utils helpers (optional)
├── shared/                      # isomorphic — auto-imported in app AND server
│   ├── types/                   # boundary types (Product, Cart, Session augmentation)
│   └── utils/                   # COUNTRY_CONFIG, formatMoney, getLocalizedString
├── i18n/
│   ├── i18n.config.ts           # Vue I18n options (fallbackLocale, formats)
│   └── locales/                 # <locale>.json message catalogs
└── public/                      # static files served at /
```

> **The boundary:** `app/` may never import from `server/`. Secrets live only in `server/utils/ct/`. Isomorphic helpers (types, `COUNTRY_CONFIG`, formatters) live in `shared/` — importable from both, but they must not import Vue or Nitro APIs.

## @nuxtjs/i18n locale routing

Configure in `nuxt.config.ts` with `strategy: 'prefix'` so every route carries a locale prefix. Derive `locales` from `COUNTRY_CONFIG` (the isomorphic source of truth in `shared/utils/`):

```ts
// nuxt.config.ts (excerpt)
import { COUNTRY_CONFIG } from './shared/utils'

// single source of truth — add a locale in COUNTRY_CONFIG and it flows here
const locales = Object.keys(COUNTRY_CONFIG).map((code) => ({
  code,
  language: code,
  file: `${code}.json`,
}))

export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n', '@pinia/nuxt', '@nuxt/image', 'nuxt-auth-utils'],
  i18n: {
    strategy: 'prefix',            // locale prefix on every route
    defaultLocale: 'en-US',
    lazy: true,                    // lazy-load message files
    locales,                       // derived from COUNTRY_CONFIG above
    // restructureDir defaults to 'i18n'; langDir defaults to 'locales'
    // → message files resolve under i18n/locales/
  },
})
```

```ts
// i18n/i18n.config.ts — non-message Vue I18n options
export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: DEFAULT_LOCALE.locale,
}))
```

**Always build localized hrefs through `useLocalePath()`** — `<NuxtLink :to="localePath('/cart')">`. For switching languages use `useSwitchLocalePath()`; for programmatic navigation `navigateTo(localePath('/path'))`. Dynamic-segment pages that need slug-per-locale resolution set params with `useSetI18nParams()` so `switchLocalePath` resolves correctly.

## Tailwind v4

Use the `@tailwindcss/vite` plugin (the current recommended path for Tailwind v4) — not the legacy `@nuxtjs/tailwindcss` module. No `tailwind.config.js`; theme tokens are declared in CSS via `@theme`:

```ts
// nuxt.config.ts (excerpt)
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
})
```

```css
/* app/assets/css/main.css */
@import "tailwindcss";

@theme {
  --color-brand: #0a7cff;
}
```

Do not use the legacy `@tailwind base/components/utilities` directives — v4 uses the single `@import "tailwindcss"`.

## Image config

Set the `none` provider so `@nuxt/image` passes commercetools CDN URLs through untouched (the CDN 403s on optimizer query params), and allow the remote host via `domains`:

```ts
// nuxt.config.ts (excerpt)
export default defineNuxtConfig({
  image: {
    provider: 'none',                      // never append ?w=&q=
    domains: ['storage.googleapis.com'],   // allow the CT CDN host
  },
})
```

See [best-practices/image.md](./best-practices/image.md) for `<NuxtImg>` usage, `sizes`, and LCP `preload`.

## Deploy

Nitro auto-detects Vercel and Netlify when building in their CI, so zero config is often enough. To pin a target explicitly:

```ts
// nuxt.config.ts (excerpt)
export default defineNuxtConfig({
  nitro: { preset: 'vercel' },   // or 'netlify'
})
```

`npm run build` produces the platform-ready output; `npm run preview` runs it locally. Env vars prefixed `NUXT_` map onto `runtimeConfig` at runtime — set these in the platform dashboard (never commit them):

| Env var | Maps to |
|---|---|
| `NUXT_SESSION_PASSWORD` (≥ 32 chars) | `nuxt-auth-utils` sealed-cookie key |
| `NUXT_CT_PROJECT_KEY` / `NUXT_CT_CLIENT_ID` / `NUXT_CT_CLIENT_SECRET` | `runtimeConfig.ct*` (server-only) |
| `NUXT_CT_AUTH_URL` / `NUXT_CT_API_URL` | `runtimeConfig.ctAuthUrl` / `ctApiUrl` |

Use a **Frontend (non-admin) API client** for these credentials. Delete `server/api/health.get.ts` before deploying.
