---
name: overview
description: Next.js (App Router) stack adapter for the commercetools-storefront skill — maps the framework-neutral storefront patterns onto Next.js 16 + next-intl v4 + Tailwind v4 primitives and ships the /nextjs-* scaffold & deploy commands.
when_to_use:
  - "Implementing a commercetools storefront on Next.js (App Router)"
metadata:
  contentType: REFERENCE
  area:
    - nextjs
    - storefront
---

# Next.js Stack — commercetools Storefront

> **Next.js stack adapter.** This is the Next.js (App Router) implementation layer for the [`commercetools-storefront`](../../../SKILL.md) skill. That skill states every commercetools fact and B2C/B2B rule as a framework-neutral decision; this stack maps each one to Next.js 16 + next-intl v4 + Tailwind v4 primitives and ships the `/nextjs-*` commands. Use it together with the skill's `core/`, `b2c/`, and `b2b/` references when the storefront's frontend is Next.js.

When you read a rule in the generic skill phrased as "server-rendered data load", "server endpoint", "the framework's locale-aware link", or "the framework's server-side cache-with-TTL primitive", come here for the concrete Next.js mapping.

## Reference Index

| Task | Reference |
|------|-----------|
| Generic concept → Next.js primitive lookup table; routing, navigation, error, and metadata shells | [concept-mapping.md](./concept-mapping.md) |
| Project layout (`<root-dir>/`, `app/[locale]/`, `app/api/`), `next.config.ts`, next-intl wiring, `proxy.ts`, Tailwind v4, version gates, deploy files | [project-layout.md](./project-layout.md) |
| The Next.js side of data loading: `lib/session.ts` (jose), BFF Route Handler shape, `unstable_cache`, `SWRConfig` hydration, async `params`, health-check route | [data-loading.md](./data-loading.md) |
| `next/image` config, `unoptimized`, `remotePatterns`, `fill`+`sizes`, LCP `priority` | [best-practices/image.md](./best-practices/image.md) |
| Static & dynamic metadata, `generateMetadata`, OG images, React `cache()` dedup | [best-practices/metadata.md](./best-practices/metadata.md) |
| Server vs Client Component boundary, no-function-props rule | [best-practices/server-components.md](./best-practices/server-components.md) |
| `error.tsx`, `not-found.tsx`, `redirect()`/`notFound()` gotchas, `unstable_rethrow` | [best-practices/error-handling.md](./best-practices/error-handling.md) |

## Commands

| Task | Command |
|------|---------|
| Scaffold a new Next.js + commercetools storefront | Run `/nextjs-setup-project` |
| Deploy to Vercel | Run `/nextjs-deploy-vercel` |
| Deploy to Netlify | Run `/nextjs-deploy-netlify` |

## Priority Tiers

### CRITICAL

- **Next.js version** — Always use `next@^16`. Never write `"next": "15.x"`. Next.js 15.x has known security vulnerabilities.
- **next-intl version** — Always use `next-intl@^4`, compatible with `next@^16`.

### HIGH

- **Locale-aware link** — `import { Link } from '@/i18n/routing'`, never bare `import Link from 'next/link'`. The next-intl `Link` preserves the active locale prefix.
- **Server Component boundary** — never pass a function prop (`onClick`/`onChange`) across the server→client boundary. Extract interactive UI into a `'use client'` child and pass plain data. See [best-practices/server-components.md](./best-practices/server-components.md).
- **Navigation APIs are not catchable** — never wrap `redirect()`/`notFound()`/`forbidden()`/`unauthorized()` in `try/catch`; they throw internal control-flow errors. Call them outside the `try`, or re-throw with `unstable_rethrow`. See [best-practices/error-handling.md](./best-practices/error-handling.md).

## Anti-Patterns Quick Reference

| Anti-pattern | Correct approach |
|---|---|
| `"next": "15.x"` or `next-intl` < 4 | `next@^16` and `next-intl@^4` |
| `import Link from 'next/link'` in a page component | `import { Link } from '@/i18n/routing'` |
| Removing `images.unoptimized: true` from `next.config.ts` | Keep it — the commercetools CDN rejects Next's optimizer query params |
| `redirect()` / `notFound()` inside a `try/catch` | Call outside the `try`, or `unstable_rethrow(error)` |
| `metadata` / `generateMetadata` in a `'use client'` page | Metadata is Server-Component-only — move client logic to a child |
| `unstable_cache` for per-user/session data | Only for stable public data; per-user state uses SWR |

## How this maps to the generic skill

The generic skill is the source of truth for *what* to build; this adapter is *how* to build it in Next.js. Every framework-neutral term in the generic skill resolves through [concept-mapping.md](./concept-mapping.md):

- "server-rendered data load" → `async` Server Component calling `lib/ct/*` directly
- "server endpoint (BFF)" → Route Handler `app/api/<resource>/route.ts`
- "client-fetched mutable state" → SWR hook → Route Handler
- "the framework's server-side cache-with-TTL primitive" → `unstable_cache`
- "the framework's locale-aware link / client navigation" → `Link` / `useRouter` from `@/i18n/routing`

The portable app conventions — `lib/ct/*`, `lib/mappers/*`, `lib/types.ts`, `lib/cache-keys.ts`, `hooks/*`, `context/*` — are identical in both skills; this adapter does not redefine them.
