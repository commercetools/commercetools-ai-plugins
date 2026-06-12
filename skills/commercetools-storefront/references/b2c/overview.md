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

# commercetools B2C Storefront

Production-tested patterns for building a B2C storefront on commercetools with server-managed sessions, derived from the b2c-starter-kit — a working production storefront. The patterns are framework-neutral; load a framework adapter for the implementation primitives.

> **Shared foundation:** BFF architecture, session setup, commercetools SDK singleton, project scaffold, `COUNTRY_CONFIG`, performance patterns, image config, and the shared auth base are in this skill's `core/` references. 
> Find the adapter's `overview.md` it owns the file layout, render primitives, deploy, and the /commands.

## Key Takeaways (B2C-specific)

**Anonymous cart merge is mandatory.** Pass `anonymousCartId` and `anonymousCartSignInMode: 'MergeWithExistingCustomerCart'` on login so the pre-login cart is preserved.

**Locales use BCP-47 format everywhere.** `en-US`, `de-DE` — the same format commercetools uses. The framework routes locale-prefixed paths (`/en-US/`, `/de-DE/`, etc.). The `your-shop-country-locale` cookie stores the BCP-47 locale and drives which locale the entry redirect chooses on first visit.


## Reference Index

### Shared Foundation

These shared-foundation references live in this skill's `core/`. For frontend implementation, see the stack's `overview.md` of the adapter.

| Task | Reference |
|------|-----------|
| Scaffold a new project (deps, styling, locale routing) | Framework-specific example — Next.js: run `/nextjs-setup-project` |
| commercetools SDK singleton, server-managed sessions, BFF boundary | [ct-client.md](../core/ct-client.md) |
| Shared auth base: commercetools login, server endpoint, client state hook, logout | [customer-auth.md](../core/customer-auth.md) |
| Add a new country / currency / locale (`COUNTRY_CONFIG`) | [add-country.md](../core/add-country.md) |
| Parallel fetching, server-side TTL caching, client-cache hydration, image optimization | [performance.md](../core/performance.md) |
| Product image URL transforms (CDN, Imgix, Cloudinary) | [image-config.md](../core/image-config.md) |

### Core — Green-Field Build (follow in order)

| Task | Reference |
|------|-----------|
| Category pages, product mapper, commercetools Search API, ProductCard/Grid | [product-listing.md](./product-listing.md) |
| PDP route, image gallery, variant selectors, AddToCartButton | [product-detail.md](./product-detail.md) |
| Cart CRUD, cart state/context, client state hook, mini-cart drawer | [cart.md](../core/cart.md) |
| Shipping methods, order placement, multi-step checkout, confirmation | [checkout.md](./checkout.md) |
| Register, login, anonymous cart merge, protected account layout | [customer-auth.md](./customer-auth.md) |
| Full-text search, facet config, URL state, renderers | [search-facets.md](../core/search-facets.md) |

### Enhancement — Modify Existing Features

| Task | Reference |
|------|-----------|
| Add a new BFF endpoint + client state hook (the 3-layer pattern) | [add-api.md](../core/add-api.md) — or run the `b2c-api-scaffolder` agent to generate the files automatically |
| Add a new standalone or CMS-driven page | [add-page.md](../core/add-page.md) |
| Use or extend the shared UI component library | [ui-components.md](./ui-components.md) |
| Server-rendered vs client-fetched decisions, mappers, BFF shape, 409 retry | [data-loading.md](../core/data-loading.md) |
| Configure PDP variant selectors (blocklist, swatch, sort order) | [variant-config.md](./variant-config.md) |

### Optional Features — Separate Skills
These features have their own skills with focused trigger descriptions. Load them when needed.

| Feature | Skill |
|---------|-------|
| CSR impersonation, dual session, line-item price override | [superuser.md](./optional/superuser.md) |
| Buy Online Pick Up In Store — channel API, per-store inventory | [bopis.md](./optional/bopis.md) |
| Product bundles — parent/child cart items, cascade updates | [bundles.md](./optional/bundles.md) |
| Product discounts, cart discounts, discount codes, promotion banners | [promotions.md](./optional/promotions.md) |
| Deploy to Vercel | Run `/deploy-vercel` — checks commercetools credentials, then hands off to Vercel's official agent skill |
| Deploy to Netlify | Run `/deploy-netlify` — checks commercetools credentials, then hands off to Netlify's official agent skill |


## Priority Tiers (B2C-specific additions)

> Shared CRITICAL/HIGH/MEDIUM rules (BFF, session secrets, parallel fetching, type safety, mappers, Product Search API, server-side TTL caching) are in this skill's top-level SKILL.md.
Find adapter's `overview.md` file for stack's specific priority.

### HIGH

- **Anonymous cart merge** — Pass `anonymousCartId` to commercetools login so the cart is preserved on sign-in.
- **Client state invalidation** — refresh/invalidate `KEY_CART` and `KEY_ACCOUNT` after login/logout/order placement.

### MEDIUM

- **Single locale format** — BCP-47 everywhere: URL segments, commercetools API calls, cookie, COUNTRY_CONFIG keys all use `en-US`, `de-DE`. No conversion needed.


## Anti-Patterns Quick Reference (B2C-specific)

> Shared anti-patterns (apiRoot in a client component, endpoint fetch in a component, client-exposed secrets, etc.) are in this skill's top-level SKILL.md. Framework-specific anti-patterns (e.g. the locale-aware link) are in the adapter.

| Anti-pattern | Correct approach |
|---|---|
| Per-user data in a shared server-side TTL cache | Client state (client) or a direct commercetools call (per-request server) |
