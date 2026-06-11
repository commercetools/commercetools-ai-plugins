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

# commercetools B2B Storefront

Production-tested patterns for the b2b-site — a B2B ecommerce storefront built on commercetools with server-managed sessions. The key B2B concepts are: associates acting on behalf of business units, store-scoped pricing/inventory, associate permissions enforced by commercetools, and B2B-only features (quotes, approval workflows, purchase lists, recurring orders). The patterns are framework-neutral; load a framework adapter for the implementation primitives.

> **Shared foundation:** BFF architecture, session setup, commercetools SDK singleton, project scaffold, `COUNTRY_CONFIG`, performance patterns, image config, and the shared auth base are in this skill's `core/` references.

## Key Takeaways (B2B-specific)

**Every B2B operation uses the as-associate API chain.** Cart reads, cart writes, orders, quotes, approval flows — all go through `apiRoot.asAssociate().withAssociateIdValue({ associateId }).inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey }).*`. The `associateId` is always `session.customerId`; the `businessUnitKey` is always `session.businessUnitKey`. commercetools enforces associate permissions server-side — no app-level permission checks in the server endpoints.

**Session carries five B2B-specific fields.** `businessUnitKey`, `storeKey`, `distributionChannelId`, `supplyChannelId`, and `productSelectionId` are resolved once (at login or BU selection) from the store record and written atomically into the session. Every product search and cart operation reads these from the session.

**Prices and availability are session-scoped, not global.** `ProductApi.buildProjectionParams()` injects `priceChannel` (distributionChannelId), `storeProjection` (storeKey), and `priceCustomerGroupAssignments` (accountGroupIds) into every search. Without a store context (unauthenticated users), commercetools returns "Price on request."

**Locale uses `COUNTRY_CONFIG` with three-field atomicity.** Same `COUNTRY_CONFIG` flat structure as B2C (key = BCP-47 locale like `de-DE`; same value used for commercetools API calls and URL routing). When changing locale or currency, `locale`, `currency`, and `country` must all be updated together and `cartId` must be reset — commercetools cart currency is immutable.

**Permission enforcement is dual-layer.** The UI uses `usePermissions()` to hide/disable buttons. The API enforces everything automatically via the as-associate chain — a 403 from commercetools means the associate lacks the permission. No app-level authorization code in the server endpoints.


## Reference Index

### Shared Foundation

These shared-foundation references live in this skill's `core/`. Find your stack's `overview.md` file.

| Task | Reference |
|------|-----------|
| Scaffold a new project (deps, styling, locale routing) | Framework-specific — find adapter's `overview.md` |
| commercetools SDK singleton, server-managed sessions, BFF boundary | [ct-client.md](../core/ct-client.md) |
| Shared auth base: commercetools login, server endpoint, client state hook, logout | [customer-auth.md](../core/customer-auth.md) |
| Add a new country / currency / locale (`COUNTRY_CONFIG`) | [add-country.md](../core/add-country.md) |
| Parallel fetching, server-side TTL caching, client-cache hydration, image optimization | [performance.md](../core/performance.md) |
| Product image URL transforms (CDN, Imgix, Cloudinary) | [image-config.md](../core/image-config.md) |

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
| Quote lifecycle, multi-round negotiation, commercetools data model, client state hooks | [quotes.md](./quotes.md) |
| Approval rules, approval flows, predicate builder, tier model | [approval-workflows.md](./approval-workflows.md) |
| Dashboard shell, stat widgets, pages, sidebar nav items | [dashboard.md](./dashboard.md) |
| Recurring orders — pause, resume, cancel, duplicate | [recurring-orders.md](./optional/recurring-orders.md) |
| Purchase lists (commercetools ShoppingList via as-associate, BU-scoped) | [purchase-lists.md](./shopping-lists.md) |

### Enhancement — Modify Existing Features

| Task | Reference |
|------|-----------|
| Add a new BFF endpoint + client state hook (no-fetch-in-client, 3-layer pattern) | [add-api.md](./add-api.md) |
| Server-rendered vs client-fetched decisions, mappers, BFF shape, commercetools type boundary | [data-loading.md](./data-loading.md) |
| Add a new page — standalone or dashboard section | [add-page.md](../core/add-page.md) |
| Configure PDP variant selectors (blocklist, swatch, sort order) | [variant-config.md](./variant-config.md) |

### Optional Features — Not Required for Core B2B Storefront

| Task | Reference |
|------|-----------|
| Superuser role — view all store carts, switch carts, merchant-origin carts | [superuser.md](./optional/superuser.md) |
| Personal wishlists (project-level, not as-associate) | [wishlists.md](./shopping-lists.md) |
| Deploy to Vercel | Run `/deploy-vercel` — checks commercetools credentials, then hands off to Vercel's official agent skill |
| Deploy to Netlify | Run `/deploy-netlify` — checks commercetools credentials, then hands off to Netlify's official agent skill |


## Priority Tiers (B2B-specific additions)

> Shared CRITICAL/HIGH/MEDIUM rules (BFF, session secrets, commercetools login endpoint, parallel fetching, type safety, mappers, Product Search API, server-side TTL caching) are in this skill's top-level SKILL.md. 

### CRITICAL


- **as-associate chain** — ALL B2B writes (cart, order, quote, approval, BU) go through `apiRoot.asAssociate().*`. Never use project-level `apiRoot.*` for user-facing mutations.
- **Session B2B fields** — `businessUnitKey` + `storeKey` + `distributionChannelId` + `supplyChannelId` + `productSelectionId` are always written together from `getStoreChannelData(storeKey)`.
- **Three-field locale atomicity** — `locale`, `currency`, `country` must all be updated together. Reset `cartId` on locale/currency change.
- **Session fields for product pricing** — always pass `session` to `searchProducts()` and `getProductBySku()`. Without `distributionChannelId` and `storeKey`, commercetools returns unscoped "Price on request" prices.

### HIGH

- **BU key in client state-manager/cache keys** — all dashboard state is keyed by `[KEY, businessUnitKey]` so it refreshes on BU switch.
- **Permission gating** — gate all UI actions with `usePermissions()`. commercetools enforces on the API side; the UI must not show what commercetools will reject.
- **CartContext auto-creation** — if `session.cartId` is absent when adding an item, the server endpoint creates a cart with `businessUnit` + `store` + `currency` + `country` from the session.

### MEDIUM

- **No-fetch-in-client** — all endpoint (`fetch('/<api>/*')`) calls live in `hooks/*Api.ts` functions, not in component or context files.
- **Store data cache** — `storeDataCache` in `<server>/ct/stores` is a module-level `Map` with no TTL. It is the single source for `storeId`, `distributionChannelId`, `supplyChannelId`, `productSelectionId`.
- **Product type cache** — `_productTypesCache` in `facets.ts` has a 60-second TTL (the only timed cache in the codebase).
- **Approval flow graceful degradation** — the approval-flows endpoint returns `{ results: [], total: 0 }` on commercetools 403, never a 4xx to the browser.
- **Quote `sellerComment` is per-round** — read from `Quote.sellerComment` (snapshot), not from `StagedQuote.sellerComment` (mutable latest).


## Anti-Patterns Quick Reference (B2B-specific)

> Shared anti-patterns (apiRoot in a client component, client-exposed secrets, sequential awaits, etc.) are in this skill's top-level SKILL.md.

| Anti-pattern | Correct approach |
|---|---|
| `apiRoot.carts().post(...)` for a logged-in user | `asAssociate().withAssociateIdValue(...).inBusinessUnitKey(...).carts().post(...)` |
| Single `locale` | Single `locale` field in BCP-47 (e.g. `de-DE`) — same value for routing and commercetools API calls |
| Setting `locale` without resetting `currency`, `country`, `cartId` | Update all three fields atomically via the session-locale endpoint |
| Omitting `distributionChannelId` in product search | Pass full session to `searchProducts()` — `ProductApi` injects channel automatically |
| BU-scoped client state not keyed by BU | Key the state entry by `businessUnitKey` (e.g. `[KEY_ORDERS, businessUnitKey]`) — must scope to the active BU |
| Reading approval flow version from client state | `fetchApprovalFlowRaw()` to get current version before every approve/reject |
| `StagedQuote.sellerComment` for per-round display | `Quote.sellerComment` — the snapshot at quote creation time |
| `apiRoot.shoppingLists()` for purchase lists | `asAssociate().*.shoppingLists()` — BU-scoped, permission-enforced |
