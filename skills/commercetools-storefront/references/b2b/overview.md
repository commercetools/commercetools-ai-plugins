---
name: overview
description: B2B storefront overview covering key architectural concepts, as-associate API chain, session B2B fields, prices/availability scoping, and priority tiers.
when_to_use:
  - "Starting a B2B storefront project"
  - "Understanding B2B architectural concepts and as-associate operations"
  - "Reviewing B2B anti-patterns"
  - "Learning about associate-based API calls"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - session
    - permissions
---

# Next.js + commercetools B2B Storefront

Production-tested patterns for the b2b-site — a B2B ecommerce storefront built on commercetools with Next.js 16 App Router, TypeScript, Tailwind v4, and JWT sessions. The key B2B concepts are: associates acting on behalf of business units, store-scoped pricing/inventory, associate permissions enforced by commercetools, and B2B-only features (quotes, approval workflows, purchase lists, recurring orders).

> **Shared foundation:** BFF architecture, JWT session setup, commercetools SDK singleton, project scaffold, `COUNTRY_CONFIG`, performance patterns, image config, Netlify deployment, and the shared auth base are in the `commercetools-storefront` skill. Load that skill alongside this one when starting a new project.

## Key Takeaways (B2B-specific)

**Every B2B operation uses the as-associate API chain.** Cart reads, cart writes, orders, quotes, approval flows — all go through `apiRoot.asAssociate().withAssociateIdValue({ associateId }).inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey }).*`. The `associateId` is always `session.customerId`; the `businessUnitKey` is always `session.businessUnitKey`. commercetools enforces associate permissions server-side — no app-level permission checks in Route Handlers.

**Session carries five B2B-specific fields.** `businessUnitKey`, `storeKey`, `distributionChannelId`, `supplyChannelId`, and `productSelectionId` are resolved once (at login or BU selection) from the store record and written atomically into the JWT cookie. Every product search and cart operation reads these from the session.

**Prices and availability are session-scoped, not global.** `ProductApi.buildProjectionParams()` injects `priceChannel` (distributionChannelId), `storeProjection` (storeKey), and `priceCustomerGroupAssignments` (accountGroupIds) into every search. Without a store context (unauthenticated users), commercetools returns "Price on request."

**Locale uses `COUNTRY_CONFIG` with three-field atomicity.** Same `COUNTRY_CONFIG` flat structure as B2C (key = BCP-47 locale like `de-DE`; same value used for commercetools API calls and URL routing). When changing locale or currency, `locale`, `currency`, and `country` must all be updated together and `cartId` must be reset — commercetools cart currency is immutable.

**Permission enforcement is dual-layer.** The UI uses `usePermissions()` to hide/disable buttons. The API enforces everything automatically via the as-associate chain — a 403 from commercetools means the associate lacks the permission. No app-level authorization code in Route Handlers.


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

### Core — B2B Foundation (follow in order)

| Task | Reference |
|------|-----------|
| Session fields, BU/store selection, channel data, BusinessUnitContext | [session-and-bu.md](./session-and-bu.md) |
| ProductApi session scoping — store, channels, price injection, availability | [product-listing.md](./product-listing.md) |
| PDP route, variant selectors, session-scoped PDP pricing | [product-detail.md](./product-detail.md) |
| as-associate cart CRUD, CartContext, auto-creation with BU+store | [cart.md](./cart.md) |
| Order placement from cart and from quote, confirmation | [checkout.md](./checkout.md) |
| Login endpoint, BU auto-select, session fields written at login | [customer-auth.md](./customer-auth.md) |
| Full-text search, facet config, URL state, renderers | [search-facets.md](../core/search-facets.md) |
| RBAC — all permission strings, usePermissions, UI gating patterns | [permissions.md](./permissions.md) |

### B2B Feature Modules

| Task | Reference |
|------|-----------|
| Quote lifecycle, multi-round negotiation, commercetools data model, SWR hooks | [quotes.md](./quotes.md) |
| Approval rules, approval flows, predicate builder, tier model | [approval-workflows.md](./approval-workflows.md) |
| Dashboard shell, stat widgets, pages, sidebar nav items | [dashboard.md](./dashboard.md) |
| Recurring orders — pause, resume, cancel, duplicate | [recurring-orders.md](./optional/recurring-orders.md) |
| Purchase lists (commercetools ShoppingList via as-associate, BU-scoped) | [purchase-lists.md](./shopping-lists.md) |

### Enhancement — Modify Existing Features

| Task | Reference |
|------|-----------|
| Add a new BFF endpoint + SWR hook (no-fetch-in-client, 3-layer pattern) | [add-api.md](./add-api.md) |
| Server vs SWR decisions, mappers, BFF shape, commercetools type boundary | [data-loading.md](./data-loading.md) |
| Add a new page — standalone or dashboard section | [add-page.md](../core/add-page.md) |
| Configure PDP variant selectors (blocklist, swatch, sort order) | [variant-config.md](./variant-config.md) |

### Optional Features — Not Required for Core B2B Storefront

| Task | Reference |
|------|-----------|
| Superuser role — view all store carts, switch carts, merchant-origin carts | [superuser.md](./optional/superuser.md) |
| Personal wishlists (project-level, not as-associate) | [wishlists.md](./shopping-lists.md) |


## Priority Tiers (B2B-specific additions)

> Shared CRITICAL/HIGH/MEDIUM rules (BFF, session secrets, commercetools login endpoint, parallel fetching, type safety, mappers, Product Search API, `unstable_cache`) are in the `commercetools-storefront` skill.

### CRITICAL

- **Next.js version** — Always use `next@^16`. Never write `"next": "15.x"` in `package.json`. Next.js 15.x has known security vulnerabilities and is unsupported. For new projects, run `/setup-project` which pins the correct version automatically.
- **NextIntl version** — Always use `next-intl@^4` compatible with `next@^16`. Never write `"next-intl": "3.x"` in `package.json`.
- **as-associate chain** — ALL B2B writes (cart, order, quote, approval, BU) go through `apiRoot.asAssociate().*`. Never use project-level `apiRoot.*` for user-facing mutations.
- **Session B2B fields** — `businessUnitKey` + `storeKey` + `distributionChannelId` + `supplyChannelId` + `productSelectionId` are always written together from `getStoreChannelData(storeKey)`.
- **Three-field locale atomicity** — `locale`, `currency`, `country` must all be updated together. Reset `cartId` on locale/currency change.
- **Session fields for product pricing** — always pass `session` to `searchProducts()` and `getProductBySku()`. Without `distributionChannelId` and `storeKey`, commercetools returns unscoped "Price on request" prices.

### HIGH

- **BU key in SWR cache keys** — all dashboard hooks use `[KEY, businessUnitKey]` tuple keys so the cache auto-invalidates on BU switch.
- **Permission gating** — gate all UI actions with `usePermissions()`. commercetools enforces on the API side; the UI must not show what commercetools will reject.
- **CartContext auto-creation** — if `session.cartId` is absent when adding an item, the Route Handler creates a cart with `businessUnit` + `store` + `currency` + `country` from the session.

### MEDIUM

- **No-fetch-in-client** — all `fetch('/api/*')` calls live in `hooks/*Api.ts` functions, not in component or context files.
- **Store data cache** — `storeDataCache` in `lib/ct/stores.ts` is a module-level `Map` with no TTL. It is the single source for `storeId`, `distributionChannelId`, `supplyChannelId`, `productSelectionId`.
- **Product type cache** — `_productTypesCache` in `facets.ts` has a 60-second TTL (the only timed cache in the codebase).
- **Approval flow graceful degradation** — `GET /api/approval-flows` returns `{ results: [], total: 0 }` on commercetools 403, never a 4xx to the browser.
- **Quote `sellerComment` is per-round** — read from `Quote.sellerComment` (snapshot), not from `StagedQuote.sellerComment` (mutable latest).


## Anti-Patterns Quick Reference (B2B-specific)

> Shared anti-patterns (apiRoot in client, NEXT_PUBLIC_ secrets, sequential awaits, etc.) are in the `commercetools-storefront` skill.

| Anti-pattern | Correct approach |
|---|---|
| `apiRoot.carts().post(...)` for a logged-in user | `asAssociate().withAssociateIdValue(...).inBusinessUnitKey(...).carts().post(...)` |
| Separate `urlLocale` / `locale` fields in session | Single `locale` field in BCP-47 (e.g. `de-DE`) — same value for routing and commercetools API calls |
| Setting `locale` without resetting `currency`, `country`, `cartId` | Update all three fields atomically via `POST /api/session/locale` |
| Omitting `distributionChannelId` in product search | Pass full session to `searchProducts()` — `ProductApi` injects channel automatically |
| `useSWR(KEY_ORDERS, ...)` without BU key | `useSWR([KEY_ORDERS, businessUnitKey], ...)` — cache must scope to the active BU |
| Reading approval flow version from client state | `fetchApprovalFlowRaw()` to get current version before every approve/reject |
| `StagedQuote.sellerComment` for per-round display | `Quote.sellerComment` — the snapshot at quote creation time |
| `apiRoot.shoppingLists()` for purchase lists | `asAssociate().*.shoppingLists()` — BU-scoped, permission-enforced |
