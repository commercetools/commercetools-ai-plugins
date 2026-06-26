# Next.js Project Layout

This is the Next.js project shape that the generic `commercetools-storefront` patterns assume when the framework is Next.js. The `/nextjs-setup-project` command scaffolds all of it; this file documents the resulting layout and the load-bearing config so you can reason about it or repair a partial setup.

## Version gates (CRITICAL)

| Package | Required | Why |
|---|---|---|
| `next` | `^16` (must be `> 16.0.0`) | Next.js 15.x has known security vulnerabilities |
| `next-intl` | `^4` | Compatible with `next@^16` locale routing |
| `@commercetools/platform-sdk` | `^8` | Storefront SDK version |
| `@commercetools/ts-client` | `^4` | Token + middleware client |

Also installed: `swr`, `jose`, `tailwindcss @tailwindcss/postcss postcss`. Scaffold with `create-next-app@^16` using `--app --typescript --tailwind=false` (passing `--tailwind` would install Tailwind v3).

## Directory structure

```
<repo root>/
├── vercel.json              # Vercel build config (next to <root-dir>/, NOT inside it)
├── netlify.toml             # Netlify build config (next to <root-dir>/)
└── <root-dir>/
    ├── app/
    │   ├── layout.tsx        # root layout — SWRConfig fallback hydration
    │   ├── [locale]/         # locale-prefixed routes (page.tsx, layout.tsx, error.tsx, not-found.tsx)
    │   └── api/              # BFF Route Handlers (auth, account, cart, checkout, shipping-methods, channels)
    ├── lib/
    │   ├── ct/               # server-only commercetools helpers + client.ts singleton + image-config.ts
    │   ├── mappers/          # commercetools → app type mappers
    │   ├── session.ts        # jose JWT session (see data-loading.md)
    │   ├── types.ts          # app types (components import from here)
    │   ├── cache-keys.ts     # SWR cache keys
    │   └── utils.ts          # COUNTRY_CONFIG, formatMoney, getLocalizedString
    ├── hooks/                # 'use client' SWR hooks
    ├── context/              # React context providers (CartContext, etc.)
    ├── components/{ui,layout,product}/
    ├── i18n/
    │   ├── routing.ts        # next-intl defineRouting + createNavigation
    │   └── request.ts        # next-intl getRequestConfig
    ├── messages/             # <locale>.json message catalogs
    ├── proxy.ts              # locale middleware
    ├── next.config.ts        # createNextIntlPlugin + images config
    └── postcss.config.mjs    # @tailwindcss/postcss
```

> **Co-located with a Connect connector?** If `<root-dir>/` (e.g. `site/`) is a sibling of a `connect.yaml` and its connector apps in the same repo, the storefront still deploys exactly as above — keep the platform's project root scoped to `<root-dir>/` so it ignores the connector code. For the monorepo layout and why the connector apps must be root siblings, see the commercetools-connect skill's [monorepo-with-storefront.md](../../../../commercetools-connect/references/monorepo-with-storefront.md).

## next-intl locale routing

`i18n/routing.ts` derives locales from `COUNTRY_CONFIG` and exports the locale-aware navigation primitives — **always import `Link`/`useRouter`/`redirect` from here, never from `next/link` or `next/navigation` directly** in locale-prefixed UI:

```typescript
// i18n/routing.ts
import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { COUNTRY_CONFIG } from '@/lib/utils';

export const routing = defineRouting({
  locales: Object.keys(COUNTRY_CONFIG) as [string, ...string[]],
  defaultLocale: 'en-US',
  localePrefix: 'always',
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
```

`i18n/request.ts` loads the per-locale messages via `getRequestConfig`. `next.config.ts` wires the plugin and the image config:

```typescript
// next.config.ts
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,   // commercetools CDN rejects Next's optimizer query params — keep it
    remotePatterns: [
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default withNextIntl(nextConfig);
```

`proxy.ts` is the locale middleware: it skips `/api`, `/_next`, files; passes through already-locale-prefixed paths (setting `x-next-intl-locale`); and otherwise redirects to `/<locale>/...` using the `your-shop-country-locale` cookie (BCP-47) or the default. Its matcher is `['/((?!api|_next|favicon|.*\\..*).*)', '/']`.

## Tailwind v4

No config file. `postcss.config.mjs` uses `@tailwindcss/postcss`; `app/globals.css` starts with `@import 'tailwindcss';` and declares theme tokens via `@theme { ... }`. Use `@source inline('...')` to safelist dynamically-composed class names (e.g. grid column spans).

## Deploy

Both targets build from `<root-dir>/` with `npm run build` and publish `.next`. Config files live at the repo root:

```json
// vercel.json
{ "buildCommand": "npm run build", "outputDirectory": ".next", "installCommand": "npm install", "framework": "nextjs" }
```

```toml
# netlify.toml
[build]
  base    = "site"
  command = "npm run build"
  publish = ".next"
[build.environment]
  NODE_VERSION = "22"
```

Run `/nextjs-deploy-vercel` or `/nextjs-deploy-netlify` — they enforce the Frontend (non-admin) API client, verify `SESSION_SECRET ≥ 32 chars`, and walk through project import and env vars. Delete `app/api/health/route.ts` before deploying.


## Commands

| Task | Command |
|------|---------|
| Scaffold the project (steps above, automated) | `/nextjs-setup-project` |
| Deploy to Vercel | `/nextjs-deploy-vercel` |
| Deploy to Netlify | `/nextjs-deploy-netlify` |
