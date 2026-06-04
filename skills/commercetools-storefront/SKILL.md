---
name: commercetools-storefront
description: Production patterns for building customer-facing storefronts on commercetools with Next.js 16, NextIntl v4, TypeScript, Tailwind v4, and JWT sessions. Covers B2C (anonymous carts, customer auth, BOPIS, bundles, promotions, CSR impersonation) and B2B (business units, as-associate API, quotes, approval workflows, store-scoped pricing, purchase lists, recurring orders). Includes BFF architecture, JWT session handling, ct SDK client setup, parallel fetching, and deployment patterns common to both. Use for PDP, PLP, cart, checkout flow, customer login, search/facets, locale handling, and any B2B- or B2C-specific feature.
when_to_use:
  - "Implementing a storefront on Next.js with commercetools"
  - "Building B2C storefront with features like anonymous carts, customer auth, BOPIS, bundles, promotions, or CSR impersonation"
  - "Building B2B storefront with features like quotes, approval workflows, store-scoped pricing, purchase lists, or recurring orders"
metadata:
  contentType: SKILL
  area:
    - b2b
    - b2c
    - storefront
    - nextjs
---

# Next.js + commercetools Storefront

Production patterns for commercetools storefronts on Next.js 16, NextIntl v4, TypeScript, Tailwind v4, and JWT sessions — covering the full range from shared BFF foundation to B2C and B2B surface-specific features.

## Workflow

When this skill is invoked, always follow these steps:

1. **Search documentation first** — Before providing any guidance, fetch the latest documentation:
   ```bash
   node scripts/docs-search.mjs \
     --query "<extract key terms from user's question>" \
     --client-name "<current-client>" \
     --model "<current-model>" \
     --skill-name "commercetools-storefront" \
     --limit 3
   ```
   Use the search results to inform your response with current, accurate information.

2. **Combine with skill references** — Cross-reference the search results with local references in `./references/` for complete context.

3. **Provide implementation guidance** — Synthesize the documentation with the specific integration mode the user is targeting.

## Key Takeaways

**The BFF pattern is non-negotiable.** All commercetools API calls go through Next.js Route Handlers (`app/api/`). The browser never calls commercetools directly. Secrets never get a `NEXT_PUBLIC_` prefix.

**Sessions are JWT HTTP-only cookies.** Session data is signed with `jose` (HS256), stored in a single `your-store-session` cookie, and read/written only in server-side code. `SESSION_SECRET` must be at least 32 characters and is never hardcoded.

**Server Components for catalog data, SWR hooks for mutable user state.** Category pages and PDPs are async Server Components that call `lib/ct/*` directly. Cart, account, and user-specific data use SWR hooks → Route Handlers → commercetools SDK.

**commercetools login endpoint.** Always use `apiRoot.login().post()` — `apiRoot.customers().login()` does not exist in commercetools SDK v2.

**`lib/ct/*` is server-only.** Never import from any `'use client'` file. Import types from `lib/types.ts`.

**Every B2B operation uses the as-associate API chain.** Cart reads, cart writes, orders, quotes, approval flows — all go through `apiRoot.asAssociate().withAssociateIdValue({ associateId }).inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey }).*`. commercetools enforces associate permissions server-side.

---

## Reference Index

### Shared Foundation (`references/core/`)

| Task | Reference |
|------|-----------|
| Scaffold the app, Tailwind v4, next-intl routing, locale proxy, folder structure | Run `/commercetools-nextjs-setup-project` |
| commercetools SDK singleton, JWT sessions, BFF Route Handler shape | [core/ct-client.md](./references/core/ct-client.md) |
| Shared auth patterns: commercetools login endpoint, Route Handler structure, SWR hook, logout | [core/customer-auth.md](./references/core/customer-auth.md) |
| Add a new country / currency / locale — `COUNTRY_CONFIG` flat structure | [core/add-country.md](./references/core/add-country.md) |
| Parallel fetching, `unstable_cache`, SWR prefetch, N+1 avoidance | [core/performance.md](./references/core/performance.md) |
| Product image URL transforms (CDN, Imgix, Cloudinary) | [core/image-config.md](./references/core/image-config.md) |
| Cart CRUD, CartContext, SWR hook, mini-cart drawer | [core/cart.md](./references/core/cart.md) |
| Full-text search, facet config, URL state, renderers | [core/search-facets.md](./references/core/search-facets.md) |
| Add a new BFF endpoint + SWR hook (the 3-layer pattern) | [core/add-api.md](./references/core/add-api.md) |
| Add a new standalone or CMS-driven page | [core/add-page.md](./references/core/add-page.md) |
| Server vs SWR decisions, mappers, BFF shape, 409 retry | [core/data-loading.md](./references/core/data-loading.md) |
| Checkout page flow, step routing, order placement | [core/checkout-page.md](./references/core/checkout-page.md) |
| PDP route, variant selectors, shared product detail patterns | [core/product-detail.md](./references/core/product-detail.md) |
| Shopping lists (wishlist, saved items) | [core/shopping-lists.md](./references/core/shopping-lists.md) |

### Core Optional Features (`references/core/optional/`)
| Task | Reference |
|------|-----------|
| Recurring prices — mapper, PDP gate, selector component, add-to-cart with recurrenceInfo | [core/recurring-prices.md](./references/core/optional/recurring-prices.md) |
| Recurring orders — scoping, state transitions, post-checkout creation, recurrence policies | [core/recurring-orders.md](./references/core/optional/recurring-orders.md) |
| Deploy to Vercel | Run `/deploy-vercel` — checks commercetools credentials, then hands off to Vercel's official agent skill |
| Deploy to Netlify | Run `/deploy-netlify` — checks commercetools credentials, then hands off to Netlify's official agent skill |

### B2C Storefront (`references/b2c/`)

| Task | Reference |
|------|-----------|
| B2C overview, key takeaways, full reference index | [b2c/overview.md](./references/b2c/overview.md) |
| Category pages, product mapper, commercetools Search API, ProductCard/Grid | [b2c/product-listing.md](./references/b2c/product-listing.md) |
| B2C PDP route, image gallery, variant selectors, AddToCartButton | [b2c/product-detail.md](./references/b2c/product-detail.md) |
| Register, login, anonymous cart merge, protected account layout | [b2c/customer-auth.md](./references/b2c/customer-auth.md) |
| Multi-step checkout, shipping methods, order placement | [b2c/checkout.md](./references/b2c/checkout.md) |
| Navigation patterns, header, mobile menu | [b2c/navigation.md](./references/b2c/navigation.md) |
| Shared UI component library | [b2c/ui-components.md](./references/b2c/ui-components.md) |
| PDP variant selector configuration (blocklist, swatch, sort) | [b2c/variant-config.md](./references/b2c/variant-config.md) |
| Wishlist functionality | [b2c/wishlist.md](./references/b2c/wishlists.md) |


### B2C Optional Features (`references/b2c/optional/`)

| Task | Reference |
|------|-----------|
| CSR impersonation, dual session, line-item price override | [b2c/optional/superuser.md](./references/b2c/optional/superuser.md) |
| Buy Online Pick Up In Store — channel API, per-store inventory | [b2c/optional/bopis.md](./references/b2c/optional/bopis.md) |
| Product bundles — parent/child cart items, cascade updates | [b2c/optional/bundles.md](./references/b2c/optional/bundles.md) |
| Product discounts, cart discounts, discount codes, promotion banners | [b2c/optional/promotions.md](./references/b2c/optional/promotions.md) |
| Recurring prices — recurrencePrices[] array, gate | [b2c/recurring-prices.md](./references/b2c/optional/recurring-prices.md) |
| Recurring orders — customer scoping, originOrder expand, post-checkout create, skip/setSchedule | [b2c/recurring-orders.md](./references/b2c/optional/recurring-orders.md) |

### B2B Storefront (`references/b2b/`)

| Task | Reference |
|------|-----------|
| B2B overview, key takeaways, full reference index | [b2b/overview.md](./references/b2b/overview.md) |
| Session fields, BU/store selection, channel data, BusinessUnitContext | [b2b/session-and-bu.md](./references/b2b/session-and-bu.md) |
| ProductApi session scoping — store, channels, price injection, availability | [b2b/product-listing.md](./references/b2b/product-listing.md) |
| B2B PDP route, variant selectors, session-scoped pricing | [b2b/product-detail.md](./references/b2b/product-detail.md) |
| as-associate cart CRUD, CartContext, auto-creation with BU+store | [b2b/cart.md](./references/b2b/cart.md) |
| Cart checkout and "Request a Quote" submission, BU addresses, order placement | [b2b/checkout.md](./references/b2b/checkout.md) |
| Login endpoint, BU auto-select, session fields written at login | [b2b/customer-auth.md](./references/b2b/customer-auth.md) |
| RBAC — all permission strings, usePermissions, UI gating patterns | [b2b/permissions.md](./references/b2b/permissions.md) |
| Quotes dashboard — CT data model, unified thread list per BU, status labels, SWR hooks | [b2b/quotes.md](./references/b2b/quotes.md) |
| Quote buyer actions — accept & place order, decline, renegotiate, state guards | [b2b/quote-actions.md](./references/b2b/quote-actions.md) |
| Approval rules, approval flows, predicate builder, tier model | [b2b/approval-workflows.md](./references/b2b/approval-workflows.md) |
| Dashboard shell, stat widgets, pages, sidebar nav items | [b2b/dashboard.md](./references/b2b/dashboard.md) |
| Purchase lists (commercetools ShoppingList via as-associate, BU-scoped) | [b2b/purchase-lists.md](./references/b2b/shopping-lists.md) |
| Add a new B2B BFF endpoint + SWR hook | [b2b/add-api.md](./references/b2b/add-api.md) |
| B2B data loading — server vs SWR, mappers, BFF shape | [b2b/data-loading.md](./references/b2b/data-loading.md) |
| B2B variant selector configuration | [b2b/variant-config.md](./references/b2b/variant-config.md) |

### B2B Optional Features (`references/b2b/optional/`)

| Task | Reference |
|------|-----------|
| Superuser role — view all store carts, switch carts | [b2b/superuser.md](./references/b2b/optional/superuser.md) |
| Recurring prices — recurrencePrices[] array, as-associate add-to-cart, PDP gate | [b2b/recurring-prices.md](./references/b2b/optional/recurring-prices.md) |
| Recurring orders — BU scoping, cart expand, create-from-cart, duplicate, dashboard | [b2b/recurring-orders.md](./references/b2b/optional/recurring-orders.md) |

### Next.js Framework Patterns (`references/next-best-practices/`)

| Task | Reference |
|------|-----------|
| `next/image` usage, `unoptimized: true`, image-config transforms, LCP priority | [next-best-practices/image.md](./references/next-best-practices/image.md) |
| Static & dynamic metadata, `generateMetadata`, OG images, `cache()` deduplication | [next-best-practices/metadata.md](./references/next-best-practices/metadata.md) |
| Server vs Client Component boundary, event handler rules | [next-best-practices/server-components.md](./references/next-best-practices/server-components.md) |
| `error.tsx`, `not-found.tsx`, `redirect()` and `notFound()` gotchas, `unstable_rethrow` | [next-best-practices/error-handling.md](./references/next-best-practices/error-handling.md) |

---

## Priority Tiers

### CRITICAL

- **Next.js version** — Always use `next@^16`. Never write `"next": "15.x"`. Next.js 15.x has known security vulnerabilities.
- **NextIntl version** — Always use `next-intl@^4` compatible with `next@^16`.
- **BFF architecture** — `lib/ct/*` is server-only. Zero commercetools SDK imports in any `'use client'` file.
- **Session secrets** — `SESSION_SECRET` and `CTP_CLIENT_SECRET` are server-only env vars, never hardcoded or `NEXT_PUBLIC_`.
- **commercetools login endpoint** — `apiRoot.login().post()`, never `apiRoot.customers().login()`.
- **B2B: as-associate chain** — ALL B2B writes (cart, order, quote, approval, BU) go through `apiRoot.asAssociate().*`. Never use project-level `apiRoot.*` for user-facing B2B mutations.
- **B2B: session B2B fields** — `businessUnitKey` + `storeKey` + `distributionChannelId` + `supplyChannelId` + `productSelectionId` are always written together from `getStoreChannelData(storeKey)`.
- **B2B: three-field locale atomicity** — `locale`, `currency`, `country` must all be updated together. Reset `cartId` on locale/currency change.

### HIGH

- **Parallel fetching** — `Promise.all` for independent fetches in Server Components. No request waterfalls.
- **Type safety** — Frontend components import types from `lib/types.ts`, never from `lib/ct/*`.
- **commercetools type boundary** — Map commercetools SDK responses to app types in `lib/mappers/` before they leave `lib/ct/`.
- **SWR cache invalidation** — Mutate relevant cache keys after login, logout, and order placement.
- **B2B: BU key in SWR cache keys** — all dashboard hooks use `[KEY, businessUnitKey]` tuple keys.

### MEDIUM

- **Product Search API** — Use `apiRoot.products().search()`, never the deprecated `productProjections().search()`. See the `commercetools-platform` skill → [product-search.md](../commercetools-platform/references/product-search.md).
- **`unstable_cache`** — Wrap rarely-changing commercetools data with a TTL. Never use it for per-user or per-session data.

---

## Anti-Patterns Quick Reference

| Anti-pattern | Correct approach |
|---|---|
| `import { apiRoot } from '@/lib/ct/client'` in a `'use client'` file | Use a SWR hook → Route Handler → `lib/ct/` |
| `fetch('/api/*')` directly in a component | Encapsulate in a hook in `hooks/` |
| `new ClientBuilder()` inside a page or Route Handler | Singleton `apiRoot` in `lib/ct/client.ts` |
| Raw `fetch()` to commercetools REST endpoints | Always use `apiRoot` — the SDK manages OAuth tokens and refresh |
| `NEXT_PUBLIC_CTP_CLIENT_SECRET=...` | Server-only env var, no `NEXT_PUBLIC_` prefix |
| `product.name['en-US']` (hardcoded locale key) | `getLocalizedString(product.name, locale)` |
| `(centAmount / 100).toFixed(2)` | `formatMoney(centAmount, currencyCode, locale)` |
| Sequential `await` for independent fetches | `Promise.all([fetchA(), fetchB()])` |
| `apiRoot.customers().login()` | `apiRoot.login().post()` |
| commercetools SDK types in components | Types from `lib/types.ts`; mapped in `lib/mappers/` |
| `next-intl` < 4 or `next` ≤ 16 | Use `next@>16` and `next-intl@^4` |
| `import Link from 'next/link'` in a page component | `import { Link } from '@/i18n/routing'` |
| B2B: `apiRoot.carts().post(...)` for a logged-in user | `asAssociate().withAssociateIdValue(...).inBusinessUnitKey(...).carts().post(...)` |
| B2B: `useSWR(KEY_ORDERS, ...)` without BU key | `useSWR([KEY_ORDERS, businessUnitKey], ...)` |
| B2B: `StagedQuote.sellerComment` for per-round display | `Quote.sellerComment` — the snapshot at quote creation time |
| B2B: `apiRoot.shoppingLists()` for purchase lists | `asAssociate().*.shoppingLists()` — BU-scoped, permission-enforced |
