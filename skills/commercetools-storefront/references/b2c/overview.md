---
name: overview
description: B2C storefront overview covering key takeaways, anonymous cart merge, locale formats, and priority tiers.
when_to_use:
  - "Starting a B2C storefront project"
  - "Understanding B2C architectural concepts"
  - "Reviewing B2C anti-patterns"
  - "Learning about BCP-47 locale usage"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - session
---

# Next.js + commercetools B2C Storefront

Production-tested patterns for building a B2C storefront on commercetools with Next.js 16, TypeScript, Tailwind v4, and JWT sessions. Derived from the b2c-starter-kit — a working production storefront.

> **Shared foundation:** BFF architecture, JWT session setup, commercetools SDK singleton, project scaffold, `COUNTRY_CONFIG`, performance patterns, image config, Netlify deployment, and the shared auth base are in the `commercetools-storefront` skill. Load that skill alongside this one when starting a new project.

## Key Takeaways (B2C-specific)

**Anonymous cart merge is mandatory.** Pass `anonymousCartId` and `anonymousCartSignInMode: 'MergeWithExistingCustomerCart'` on login so the pre-login cart is preserved.

**Locales use BCP-47 format everywhere.** `en-US`, `de-DE` — the same format commercetools uses. next-intl routes under `/en-US/`, `/de-DE/`, etc. The `your-shop-country-locale` cookie stores the BCP-47 locale and drives which locale the middleware redirects to on first visit.


## Reference Index

### Shared Foundation

Load the `commercetools-storefront` skill for these references:

| Task | Reference |
|------|-----------|
| Scaffold the app, Tailwind v4, next-intl routing, middleware | Run `/setup-project` |
| commercetools SDK singleton, JWT sessions, BFF architecture | [ct-client.md](../core/ct-client.md) |
| Shared auth base: commercetools login, Route Handler, SWR hook, logout | [customer-auth.md](../core/customer-auth.md) |
| Add a new country / currency / locale (`COUNTRY_CONFIG`) | [add-country.md](../core/add-country.md) |
| Parallel fetching, `unstable_cache`, SWR prefetch, image optimization | [performance.md](../core/performance.md) |
| Product image URL transforms (CDN, Imgix, Cloudinary) | [image-config.md](../core/image-config.md) |
| Deploy to Netlify | [netlify.md](../core/netlify.md) |

### Core — Green-Field Build (follow in order)

| Task | Reference |
|------|-----------|
| Category pages, product mapper, commercetools Search API, ProductCard/Grid | [product-listing.md](./product-listing.md) |
| PDP route, image gallery, variant selectors, AddToCartButton | [product-detail.md](./product-detail.md) |
| Cart CRUD, CartContext, SWR hook, mini-cart drawer | [cart.md](../core/cart.md) |
| Shipping methods, order placement, multi-step checkout, confirmation | [checkout.md](./checkout.md) |
| Register, login, anonymous cart merge, protected account layout | [customer-auth.md](./customer-auth.md) |
| Full-text search, facet config, URL state, renderers | [search-facets.md](../core/search-facets.md) |

### Enhancement — Modify Existing Features

| Task | Reference |
|------|-----------|
| Add a new BFF endpoint + SWR hook (the 3-layer pattern) | [add-api.md](../core/add-api.md) — or run the `b2c-api-scaffolder` agent to generate the files automatically |
| Add a new standalone or CMS-driven page | [add-page.md](../core/add-page.md) |
| Use or extend the shared UI component library | [ui-components.md](./ui-components.md) |
| Server vs SWR decisions, mappers, BFF shape, 409 retry | [data-loading.md](../core/data-loading.md) |
| Configure PDP variant selectors (blocklist, swatch, sort order) | [variant-config.md](./variant-config.md) |
| Deploy to Netlify | Run `/deploy-netlify` — checks credentials, runs provisioning script, guides repo connection |

### Optional Features — Separate Skills
These features have their own skills with focused trigger descriptions. Load them when needed.

| Feature | Skill |
|---------|-------|
| CSR impersonation, dual session, line-item price override | [superuser.md](./optional/superuser.md) |
| Buy Online Pick Up In Store — channel API, per-store inventory | [bopis.md](./optional/bopis.md) |
| Product bundles — parent/child cart items, cascade updates | [bundles.md](./optional/bundles.md) |
| Product discounts, cart discounts, discount codes, promotion banners | [promotions.md](./optional/promotions.md) |


## Priority Tiers (B2C-specific additions)

> Shared CRITICAL/HIGH/MEDIUM rules (BFF, session secrets, parallel fetching, type safety, mappers, Product Search API, `unstable_cache`) are in the `commercetools-storefront` skill.

### CRITICAL

- **Next.js version** — Always use `next@^16`. Never write `"next": "15.x"` in `package.json`. Next.js 15.x has known security vulnerabilities and is unsupported. For new projects, run `/setup-project` which pins the correct version automatically.
- **NextIntl version** — Always use `next-intl@^4` compatible with `next@^16`. Never write `"next-intl": "3.x"` in `package.json`.

### HIGH

- **Anonymous cart merge** — Pass `anonymousCartId` to commercetools login so the cart is preserved on sign-in.
- **SWR cache invalidation** — Mutate `KEY_CART` and `KEY_ACCOUNT` after login/logout/order placement.

### MEDIUM

- **Single locale format** — BCP-47 everywhere: URL segments, commercetools API calls, cookie, COUNTRY_CONFIG keys all use `en-US`, `de-DE`. No conversion needed.


## Anti-Patterns Quick Reference (B2C-specific)

> Shared anti-patterns (apiRoot in client, fetch in component, NEXT_PUBLIC_ secrets, etc.) are in the `commercetools-storefront` skill.

| Anti-pattern | Correct approach |
|---|---|
| `import Link from 'next/link'` in a page component | `import { Link } from '@/i18n/routing'` |
| Per-user data in `unstable_cache` | SWR hook (client) or direct commercetools call (per-request server) |
