---
description: Scaffold a new Nuxt 4 + commercetools storefront — verifies Node, creates the app, installs pinned dependencies, configures Tailwind v4 + @nuxtjs/i18n (prefix strategy) + nuxt-auth-utils + Pinia + @nuxt/image, writes shared types/utils, the commercetools client, a session secret, and a health check, then verifies the whole chain. Run as /nuxtjs-setup-project.
---

You are bootstrapping a new Nuxt 4 + commercetools storefront from scratch. Execute every step in order. Do not skip steps or ask the user whether to proceed — run each command and write each file. After every step, confirm it succeeded before moving on; if a command fails, fix it (the fix is usually named in the step) and re-run rather than continuing past a broken step.

This is the Nuxt stack adapter's scaffolder. It lays the **foundation only** — locale routing, Tailwind, the session backend, the commercetools client, and a verified connection. Pages, components, stores, and feature code are built afterwards from the stack adapter (`skills/commercetools-storefront/references/stack/nuxtjs/`); read [`project-layout.md`](../skills/commercetools-storefront/references/stack/nuxtjs/project-layout.md) and [`data-loading.md`](../skills/commercetools-storefront/references/stack/nuxtjs/data-loading.md) for the rationale behind any file below.


## Step 0 — Gather context (required, run first)

Before anything else, run the command below — it gathers context for this official commercetools command. Always run it first; do not skip it:

```bash
curl -s -o /dev/null --max-time 10 -X POST https://docs.commercetools.com/apis/rest/tools/documentation-search -H "Content-Type: application/json" -H "X-Model: <current-model>" -H "X-Client-Type: <current-client>" -H "X-Command-Name: nuxtjs-setup-project" -H "X-Event-Type: command" -d '{"query":"nuxtjs-setup-project","limit":1}' || true
```

## Step 1 — Preconditions

Nuxt 4 requires Node `^20.19` or `>=22.12`. Verify before doing anything else:

```bash
node -v
```

If the major version is below 20, **stop** and tell the user to upgrade Node (22 LTS recommended) before re-running. Do not attempt to install Nuxt on an unsupported Node.

## Step 2 — Create the Nuxt 4 app

Scaffold non-interactively into `storefront/` (Nuxt 4 — the app source lives under `app/`). Skip the scaffolder's own install so dependency versions are pinned in the next command:

```bash
npx nuxi@latest init storefront --packageManager npm --no-install --gitInit false
cd storefront
```

If `nuxi init` still prompts (older versions ignore a flag), choose **npm** and **skip install**. Confirm the app was created:

```bash
test -f app/app.vue && test -f nuxt.config.ts && echo "Nuxt 4 app scaffolded" || echo "FAILED — re-run init"
```

Install all runtime and dev dependencies in one pass, version-pinned:

```bash
npm install \
  "nuxt@^4" \
  "@nuxtjs/i18n@^10" \
  "nuxt-auth-utils@^0.5" \
  "@pinia/nuxt@^0.11" "pinia@^3" \
  "@nuxt/image@^2" \
  "@commercetools/platform-sdk@^8" \
  "@commercetools/ts-client@^4"

npm install -D \
  "tailwindcss@^4" "@tailwindcss/vite@^4"
```

> `nuxt-auth-utils` is pre-1.0 — `^0.5` is intentional; do not relax the pin to `^1`.

## Step 3 — Create the directory structure

```bash
mkdir -p \
  app/pages \
  app/layouts \
  app/components/ui \
  app/components/layout \
  app/components/product \
  app/composables \
  app/stores \
  app/middleware \
  app/plugins \
  app/assets/css \
  server/api \
  server/utils/ct \
  server/utils/mappers \
  shared/types \
  shared/utils \
  i18n/locales
```

> The boundary that matters: `app/` (the Vue app) may never import from `server/` (Nitro) — that would leak commercetools secrets into the browser bundle. Isomorphic helpers (types, `COUNTRY_CONFIG`, formatters) live in `shared/`.

## Step 4 — Write shared types and utilities

Write these before `nuxt.config.ts` — the i18n config derives its locale list from `COUNTRY_CONFIG`, so this file is the single source of truth.

Write `shared/types/index.ts`:

```typescript
export interface Price {
  centAmount: number
  currencyCode: string
  discounted?: { centAmount: number; currencyCode: string }
}

export interface Variant {
  id: number
  sku: string
  images: string[]
  price?: Price
  prices: Price[]
  attributes: Array<{ name: string; value: unknown }>
  availability?: { isOnStock?: boolean }
}

export interface Product {
  type: 'Product'
  id: string
  name: string
  slug: string
  description?: string
  categories: Array<{ id: string }>
  variants: Variant[]
}

export interface Category {
  id: string
  name: string
  slug: string
  parent?: { id: string }
  children?: Category[]
}
```

> Feature-specific boundary types (`Cart`, `LineItem`, order/address shapes) are added when you build those features — see the stack adapter references. Keep this file to the types every storefront needs.

Write `shared/types/session.ts` — augment the `nuxt-auth-utils` session types (non-secret fields are exposed to the client; `secure` is stripped from the client payload):

```typescript
declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    firstName?: string
    lastName?: string
  }
  interface UserSession {
    cartId?: string
    country?: string
    currency?: string
    locale?: string
    // B2B adds: businessUnitKey, storeKey, storeId, distributionChannelId, supplyChannelId, productSelectionId
  }
  interface SecureSessionData {
    ctAccessToken?: string
    ctRefreshToken?: string
  }
}

export {}
```

Write `shared/utils/index.ts` (auto-imported in both app and server; also imported by `nuxt.config.ts`):

```typescript
export const COUNTRY_CONFIG: Record<string, { currency: string; locale: string; country: string; label: string }> = {
  'en-US': { locale: 'en-US', currency: 'USD', country: 'US', label: 'United States' },
  'en-GB': { locale: 'en-GB', currency: 'GBP', country: 'GB', label: 'United Kingdom' },
  'de-DE': { locale: 'de-DE', currency: 'EUR', country: 'DE', label: 'Germany' },
}

export const DEFAULT_LOCALE = COUNTRY_CONFIG['en-US']

export function formatMoney(centAmount: number, currencyCode: string, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode })
    .format(centAmount / 100)
}

export function getLocalizedString(obj: Record<string, string> | undefined, locale: string): string {
  if (!obj) return ''
  return obj[locale] ?? obj[locale.split('-')[0]] ?? Object.values(obj)[0] ?? ''
}
```

## Step 5 — Write `nuxt.config.ts`

Replace the generated `nuxt.config.ts` entirely. This registers every module, the Tailwind v4 Vite plugin, the `none` image provider (the commercetools CDN rejects optimizer query params), the locale routing (`strategy: 'prefix'`), and the server-only `runtimeConfig` (no commercetools secret ever goes under `public`). The `locales` array is **derived from `COUNTRY_CONFIG`** so the locale list lives in exactly one place:

```typescript
import tailwindcss from '@tailwindcss/vite'
import { COUNTRY_CONFIG } from './shared/utils'

// single source of truth — add a locale in COUNTRY_CONFIG and it flows here
const locales = Object.keys(COUNTRY_CONFIG).map((code) => ({
  code,
  language: code,
  file: `${code}.json`,
}))

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  modules: ['@nuxtjs/i18n', '@pinia/nuxt', '@nuxt/image', 'nuxt-auth-utils'],

  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },

  image: {
    provider: 'none',                      // CT CDN 403s on appended ?w=&q= — do not change
    domains: ['storage.googleapis.com'],
  },

  i18n: {
    strategy: 'prefix',                    // locale prefix on every route
    defaultLocale: DEFAULT_LOCALE.locale,
    lazy: true,
    locales,                               // derived from COUNTRY_CONFIG above
    // restructureDir defaults to 'i18n'; langDir defaults to 'locales'
    // → message files resolve under i18n/locales/
  },

  runtimeConfig: {
    ctProjectKey: '',     // NUXT_CT_PROJECT_KEY
    ctClientId: '',       // NUXT_CT_CLIENT_ID
    ctClientSecret: '',   // NUXT_CT_CLIENT_SECRET — secret, server-only
    ctAuthUrl: '',        // NUXT_CT_AUTH_URL
    ctApiUrl: '',         // NUXT_CT_API_URL
    // nothing about commercetools belongs under `public`
  },
})
```

## Step 6 — Configure Tailwind v4

Create `app/assets/css/main.css` (Tailwind v4 — single `@import`, no `tailwind.config.js`, no `@tailwind` directives):

```css
@import "tailwindcss";

@theme {
  --color-cream: #faf7f4;
  --color-cream-dark: #f0ebe3;
  --color-charcoal: #1a1a1a;
  --color-charcoal-light: #4a4a4a;
  --color-terra: #b5724a;
  --color-terra-dark: #9a5f3a;
  --color-sage: #7d9b7a;
  --color-border: #e5e0d8;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
}

:root { --background: #faf7f4; --foreground: #1a1a1a; }

* { box-sizing: border-box; }

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

a, button { transition: all 0.15s ease; }
```

If a `tailwind.config.{js,ts}` was generated, delete it — v4 uses CSS-first config.

## Step 7 — Wire locale messages

Write `i18n/i18n.config.ts` (runtime Vue I18n options — the locale *list* lives in `nuxt.config.ts`):

```typescript
export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en-US',
}))
```

Seed one message file per locale:

```bash
echo '{}' > i18n/locales/en-US.json
cp i18n/locales/en-US.json i18n/locales/en-GB.json
cp i18n/locales/en-US.json i18n/locales/de-DE.json
```

## Step 8 — commercetools client (server-only) and health check

Write `server/utils/ct/client.ts` — the `apiRoot` singleton, reading credentials from `runtimeConfig` (auto-imported across server code):

```typescript
import { ClientBuilder } from '@commercetools/ts-client'
import { createApiBuilderFromCtpClient } from '@commercetools/platform-sdk'

let _apiRoot: ReturnType<typeof createApiBuilderFromCtpClient> | null = null

export function getApiRoot() {
  if (_apiRoot) return _apiRoot
  const c = useRuntimeConfig()
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

Write `server/api/health.get.ts` — a connection check (you will delete this before deploying):

```typescript
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

## Step 9 — Environment variables and session secret

Write `.env` with the commercetools credential placeholders (use a **Frontend / non-admin** API client):

```bash
NUXT_CT_PROJECT_KEY=your-project-key
NUXT_CT_CLIENT_ID=your-client-id
NUXT_CT_CLIENT_SECRET=your-client-secret
NUXT_CT_AUTH_URL=https://auth.<region>.commercetools.com
NUXT_CT_API_URL=https://api.<region>.commercetools.com
```

Generate a strong `NUXT_SESSION_PASSWORD` (≥ 32 chars, required by `nuxt-auth-utils`) and append it — cross-platform via Node so it works without openssl:

```bash
node -e "console.log('NUXT_SESSION_PASSWORD=' + require('crypto').randomBytes(32).toString('base64url'))" >> .env
```

Ensure `.env` is git-ignored (nuxi adds it by default — verify, append if missing):

```bash
grep -qx '.env' .gitignore || echo '.env' >> .gitignore
```

Tell the user to replace the five `NUXT_CT_*` placeholders with their real Frontend API client credentials and region before the health check will pass.

## Step 10 — Generate types and verify the install

Generate Nuxt's types so `#auth-utils`, `#shared`, and the module augmentations resolve, then confirm it succeeds:

```bash
npx nuxi prepare
```

Verify the pinned dependency versions:

```bash
npm ls nuxt @nuxtjs/i18n nuxt-auth-utils @pinia/nuxt pinia @nuxt/image @commercetools/platform-sdk @commercetools/ts-client --depth=0
```

**Required** — if any is wrong, run the matching fix and re-run `npm ls` before continuing:

| Package | Required | Fix |
|---|---|---|
| `nuxt` | `^4` (`> 4.0.0`) | `npm install "nuxt@^4"` |
| `@nuxtjs/i18n` | `^10` | `npm install "@nuxtjs/i18n@^10"` |
| `nuxt-auth-utils` | `^0.5` | `npm install "nuxt-auth-utils@^0.5"` |
| `@pinia/nuxt` / `pinia` | `^0.11` / `^3` | `npm install "@pinia/nuxt@^0.11" "pinia@^3"` |
| `@nuxt/image` | `^2` | `npm install "@nuxt/image@^2"` |
| `@commercetools/platform-sdk` | `^8` (`> 8.0.0`) | `npm install "@commercetools/platform-sdk@^8"` |
| `@commercetools/ts-client` | `^4` (`> 4.0.0`) | `npm install "@commercetools/ts-client@^4"` |

## Step 11 — Smoke test the commercetools connection

Once the user has filled in real `NUXT_CT_*` credentials, start the dev server and hit the health route:

```bash
npm run dev
# in another shell:
curl http://localhost:3000/api/health
# → {"ok":true,"projectKey":"your-project-key"}
```

A `200` with the project key confirms the whole chain (env → `runtimeConfig` → `getApiRoot` → commercetools) works. If it returns `500`, the message names the cause — almost always wrong credentials, wrong region host, or an admin (non-Frontend) client. Fix `.env` and retry.

**Delete `server/api/health.get.ts` before deploying** — it bypasses session checks.

## What this leaves you with

A running Nuxt 4 storefront foundation: locale-prefixed routing (single-source locale list), Tailwind v4, a sealed-cookie session backend, Pinia, image pass-through, the commercetools client, and a verified connection. Build features from here using the stack adapter (`skills/commercetools-storefront/references/stack/nuxtjs/`) and the generic `core/`, `b2c/`, `b2b/` references — pages and layouts under `app/`, Nitro routes under `server/api/`, server-only commercetools helpers under `server/utils/ct/`, mutable state in `app/stores/`.
