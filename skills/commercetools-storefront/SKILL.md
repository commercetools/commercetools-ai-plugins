---
name: commercetools-storefront
description: Production patterns for building customer-facing storefronts on commercetools - the full B2C and B2B domain feature set. Patterns are stated as decisions plus commercetools-exact code; framework-specific implementation. Assumes a server tier exists to host the BFF. Use for PDP, PLP, cart, checkout flow, customer login, search/facets, locale handling, and any B2B- or B2C-specific feature.
when_to_use:
  - "Implementing a commercetools storefront (BFF, sessions, carts, checkout, B2C/B2B features) regardless of frontend framework"
  - "Adding a new feature to an existing commercetools storefront"
  - "Building a B2C storefront: anonymous carts, customer auth, BOPIS, bundles, promotions, or CSR impersonation"
  - "Building a B2B storefront: quotes, approval workflows, store-scoped pricing, purchase lists, or recurring orders"
  - "Deciding server-rendered vs client-fetched data loading, designing the commercetools type boundary, or the as-associate API chain"
  - "Implementing a spec/plan/tasks.md task annotated [SKILL: commercetools-storefront]"
  - "An implementation-plan step that builds a storefront surface (PDP/PLP/cart/customer/B2B)"
metadata:
  contentType: SKILL
  area:
    - b2b
    - b2c
    - storefront
---

# commercetools Storefront (framework-agnostic)

Production patterns for commercetools storefronts — covering the full range from the shared BFF foundation to B2C and B2B surface-specific features. The patterns here are framework-neutral: each is stated as a decision plus commercetools-exact code. Your frontend framework supplies the implementation primitives (file layout, render and routing primitives, the cookie read/write binding).

> **Architecture assumption — a server tier exists.** These patterns assume your storefront runs on a stack with a server-side tier (SSR / server components / a standalone BFF service) that can hold secrets and proxy commercetools. The BFF and secret rules below are non-negotiable and depend on this. They are designed SSR-first. For a specific framework, use its stack adapter under `references/stack/` — e.g. the **[Next.js stack](./references/stack/nextjs/overview.md)** — which maps each concept here to that framework's primitives and owns all file-layout and render-primitive details.

> **Reference implementation.** Where a code example shows a file path or a render primitive, it uses the Next.js App Router as the reference implementation. The framework-neutral rule is always in the surrounding prose; the adapter pins the exact primitive.

**Path & state conventions.**

Each reference implementation follows these conventions for paths and state management. The conventions are not technically required, but they are widely used in production storefronts and make it easier to navigate the codebase and onboard new developers. Find the `concept-mapping.md` in your stack adapter for the exact primitives used.
> | Convention | Meaning |
> | --- | --- |
> | `<server>/` | Your server-side code root; each stack pins the actual directory (Example Next.js: `lib/`) |
> | `<api>/` | the client-facing API surface the browser calls and routes |
> | `<server>/ct/*` | The commercetools helper modules |
> | `<server>/ct/client` | The `apiRoot` singleton |
> | `<server>/types` | The app type-mapping root (the boundary types) |
> | `<server>/mappers/` | The commercetools→app mappers |
> | **Client state** | Your framework's client-side state-management / cache layer (the specific library is a stack choice) — use it for mutable per-user data |

## Workflow

When this skill is invoked, always follow these steps:

1. **Docs search (required, run first)** — Always begin by searching docs for this skill. This is the mandatory grounding step: it gathers the latest verified documentation as context for you (the agent). **Do not skip it, and do not replace it with another tool** (such as an MCP documentation-search tool) This script optimizes for tuned search results — run this command:
   ```bash
   node scripts/docs-search.mjs \
     --query "<extract key terms from user's question>" \
     --app-name "<current-app ex: claude, copilot, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-storefront" \
     --limit 10
   ```
   Use its output as your primary grounding. You *may additionally* use other tools (such as the commercetools documentation MCP) for deeper, follow-up search.

2. **Combine with skill references** — Cross-reference the analysis output with local references in `./references/` for complete context.

3. **Provide implementation guidance** — Synthesize the documentation with the specific integration mode the user is targeting.

### Optional scripts

**Fetch GraphQL schema** — Run this when you need context about a commercetools GraphQL query or mutation — for example, to inspect a resource's fields, types, and available operations before writing a query, or to verify a GraphQL query/mutation you have just generated against the real schema. It fetches the partial GraphQL SDL for a single commercetools resource:
   ```bash
   node scripts/graphql-schemata.mjs \
     --resource-name "<commercetools resource, e.g. Cart, Product, Order>" \
     --app-name "<current-app, e.g. claude, copilot, cursor, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-storefront"
   ```
   The output is the GraphQL SDL for that resource. If the resource name is not recognized, the script prints the list of valid resource names — pick the correct one and re-run. **Note:** the SDL may contain *stubbed types* — referenced resources rendered as stubs, with their real type name given in a comment. Fetch any you need separately by re-running this script with that type name as `--resource-name`.

**Fetch OpenAPI (REST) schema** — Run this when you need context about a commercetools REST endpoint, request/response payload, or update action — for example, to inspect a resource's REST operations before constructing a request, or to verify a REST request/payload you have just generated against the real specification. It fetches the partial OpenAPI specification for a single commercetools resource:
   ```bash
   node scripts/openApi-schemata.mjs \
     --resource-name "<commercetools resource, e.g. api-Cart-write, api-Customer-read, checkout-Application>" \
     --app-name "<current-app, e.g. claude, copilot, cursor, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-storefront"
   ```
   The output is the OpenAPI specification (YAML) for that resource. REST resources use a read/write-split naming form (e.g. `api-Cart-read`, `api-Cart-write`). If the resource name is not recognized, the script prints the list of valid resource names — pick the correct one and re-run. **Note:** the spec does not include reference-expansion schemas — fetch a referenced resource's schema separately by re-running this script with that resource as `--resource-name`.

## Key Takeaways

**The BFF pattern is non-negotiable.** All commercetools API calls go through a server endpoint (BFF). The browser never calls commercetools directly. Secrets are never exposed to the client bundle (no public env prefix). *(This requires a server tier — see the architecture assumption above.)*

**Sessions are server-managed.** The BFF owns session state and is the only tier that reads or writes it. How it's stored is a stack choice — a signed token in an HTTP-only cookie (stateless BFF), or a server-side session store keyed by an opaque cookie (stateful BFF). Either way the client never holds session secrets or raw commercetools credentials — only an opaque reference. Any session-signing secret must be strong and is never hardcoded or exposed to the client.

**Server-rendered loads for catalog data; client state for mutable user state.** Catalog/immutable data (category pages, PDPs) is loaded on the server, calling `<server>/ct/*` directly. Cart, account, and user-specific data are loaded into client-side state management → server endpoint → commercetools SDK.


**`<server>/ct/*` is server-only.** Never import it from a client component. Import types from the app type-mapping root (`<server>/types`).


---

## Decision Steps

Build a storefront in this order — each step maps to a section of the Reference Index below:

1. **Choose your stack (if exists).** Pick the adapter under `references/stack/<name>/` for your frontend. It owns file layout, render/routing primitives, the session mechanism, the client-state library, and deploy.
2. **Implement the shared foundation.** Wire the BFF boundary, sessions, commercetools client, type boundary, cart, and data-loading — `references/core/`.
3. **Add optional core features.** Layer in cross-cutting extras (e.g. recurring prices/orders) as needed — `references/core/optional/`.
4. **Choose B2C or B2B.** Load the matching surface for its domain features and rules — `references/b2c/` or `references/b2b/`.
5. **Add optional surface features.** Layer in surface-specific extras .

---

## Reference Index

### Stacks

Pick the adapter for your frontend stack. Each stack folder under `references/stack/<name>/` maps the framework-neutral patterns in this skill onto that stack's primitives and owns its file layout, render primitives, and deploy.

| Stack | Reference | Commands |
|-------|-----------|----------|
| **Next.js 16** (App Router) + next-intl v4 + Tailwind v4 | [stack/nextjs/overview.md](./references/stack/nextjs/overview.md) | `/nextjs-setup-project`, `/nextjs-deploy-vercel`, `/nextjs-deploy-netlify` |
| **Nuxt 4** (Vue, SSR) + Nitro + @nuxtjs/i18n v10 + nuxt-auth-utils + Pinia + Tailwind v4 | [stack/nuxtjs/overview.md](./references/stack/nuxtjs/overview.md) | `/nuxtjs-setup-project` |


### Shared Foundation (`references/core/`)

| Task | Reference |
|------|-----------|
| Scaffold a new project (deps, styling, locale routing, folder structure) | Framework-specific - see the adapter's `overview.md` |
| commercetools SDK singleton, server-managed sessions, BFF boundary | [core/ct-client.md](./references/core/ct-client.md) |
| Shared auth patterns: commercetools login endpoint, server endpoint structure, client state hook, logout | [core/customer-auth.md](./references/core/customer-auth.md) |
| Add a new country / currency / locale — `COUNTRY_CONFIG` flat structure | [core/add-country.md](./references/core/add-country.md) |
| Parallel fetching, server-side TTL caching, client-cache hydration, N+1 avoidance | [core/performance.md](./references/core/performance.md) |
| Product image URL transforms (CDN, Imgix, Cloudinary) | [core/image-config.md](./references/core/image-config.md) |
| Cart CRUD, cart state/context, client state hook, mini-cart drawer | [core/cart.md](./references/core/cart.md) |
| Full-text search, facet config, URL state, renderers | [core/search-facets.md](./references/core/search-facets.md) |
| Add a new BFF endpoint + client state hook (the 3-layer pattern) | [core/add-api.md](./references/core/add-api.md) |
| Add a new standalone or CMS-driven page | [core/add-page.md](./references/core/add-page.md) |
| Server-rendered vs client-fetched decisions, mappers, BFF shape, 409 retry | [core/data-loading.md](./references/core/data-loading.md) |
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
| Quotes dashboard — CT data model, unified thread list per BU, status labels, client state hooks | [b2b/quotes.md](./references/b2b/quotes.md) |
| Quote buyer actions — accept & place order, decline, renegotiate, state guards | [b2b/quote-actions.md](./references/b2b/quote-actions.md) |
| Approval rules, approval flows, predicate builder, tier model | [b2b/approval-workflows.md](./references/b2b/approval-workflows.md) |
| Dashboard shell, stat widgets, pages, sidebar nav items | [b2b/dashboard.md](./references/b2b/dashboard.md) |
| Purchase lists (commercetools ShoppingList via as-associate, BU-scoped) | [b2b/purchase-lists.md](./references/b2b/shopping-lists.md) |
| Add a new B2B BFF endpoint + client state hook | [b2b/add-api.md](./references/b2b/add-api.md) |
| B2B data loading — server-rendered vs client-fetched, mappers, BFF shape | [b2b/data-loading.md](./references/b2b/data-loading.md) |
| B2B variant selector configuration | [b2b/variant-config.md](./references/b2b/variant-config.md) |

### B2B Optional Features (`references/b2b/optional/`)

| Task | Reference |
|------|-----------|
| Superuser role — view all store carts, switch carts | [b2b/superuser.md](./references/b2b/optional/superuser.md) |
| Recurring prices — recurrencePrices[] array, as-associate add-to-cart, PDP gate | [b2b/recurring-prices.md](./references/b2b/optional/recurring-prices.md) |
| Recurring orders — BU scoping, cart expand, create-from-cart, duplicate, dashboard | [b2b/recurring-orders.md](./references/b2b/optional/recurring-orders.md) |

---

## Priority Tiers

### CRITICAL

- **BFF architecture** — `<server>/ct/*` is server-only. Zero commercetools SDK imports in any client component. (Requires a server tier — see the architecture assumption.)
- **Session & client secrets** — the commercetools client secret and any session-signing secret are server-only env vars, never hardcoded and never exposed to the client bundle (no public env prefix).
- **commercetools login endpoint** — `apiRoot.login().post()`, never `apiRoot.customers().login()`.
- **B2B: as-associate chain** — ALL B2B writes (cart, order, quote, approval, BU) go through `apiRoot.asAssociate().*`. Never use project-level `apiRoot.*` for user-facing B2B mutations.
- **B2B: session B2B fields** — `businessUnitKey` + `storeKey` + `distributionChannelId` + `supplyChannelId` + `productSelectionId` are always written together from `getStoreChannelData(storeKey)`.
- **B2B: three-field locale atomicity** — `locale`, `currency`, `country` must all be updated together. Reset `cartId` on locale/currency change.

> Framework-version gates, find `overview.md` of your stack.

### HIGH

- **Parallel fetching** — `Promise.all` for independent fetches in server-rendered loads. No request waterfalls.
- **Type safety** — Frontend components import types from the app type-mapping root (`<server>/types`), never from `<server>/ct/*`.
- **commercetools type boundary** — Map commercetools SDK responses to app types in `<server>/mappers/` before they leave `<server>/ct/`.
- **Client state invalidation** — invalidate/refresh the relevant client state after login, logout, and order placement.
- **B2B: BU key in client state-manager/cache keys** — all dashboard state is keyed by `businessUnitKey` (e.g. a `[KEY, businessUnitKey]` tuple) so it refreshes on BU switch.

### MEDIUM

- **Product Search API** — Use `apiRoot.products().search()`, never the deprecated `productProjections().search()`. See the `commercetools-platform` skill → [product-search.md](../commercetools-platform/references/product-search.md).
- **Server-side TTL cache** — Wrap rarely-changing commercetools data in the framework's server-side cache-with-TTL. Never use it for per-user or per-session data. (Next.js: `unstable_cache` — see the adapter.)

---

## Anti-Patterns Quick Reference

| Anti-pattern | Correct approach |
|---|---|
| Importing `<server>/ct/client` (`apiRoot`) in a client component | Use a client state hook → server endpoint → `<server>/ct/` |
| Calling the endpoint (`fetch('/<api>/*')`) directly in a component | Encapsulate it in a client data/state module |
| `new ClientBuilder()` inside a page or server endpoint | Singleton `apiRoot` in `<server>/ct/client` |
| Raw `fetch()` to commercetools REST endpoints | Always use `apiRoot` — the SDK manages OAuth tokens and refresh |
| Exposing a commercetools secret to the client bundle (public env prefix) | Server-only env var, no public prefix |
| `product.name['en-US']` (hardcoded locale key) | `getLocalizedString(product.name, locale)` |
| `(centAmount / 100).toFixed(2)` | `formatMoney(centAmount, currencyCode, locale)` |
| Sequential `await` for independent fetches | `Promise.all([fetchA(), fetchB()])` |
| `apiRoot.customers().login()` | `apiRoot.login().post()` |
| commercetools SDK types in components | Types from `<server>/types`; mapped in `<server>/mappers/` |
| B2B: `apiRoot.carts().post(...)` for a logged-in user | `asAssociate().withAssociateIdValue(...).inBusinessUnitKey(...).carts().post(...)` |
| B2B: BU-scoped client state not keyed by BU | Key the state entry by `businessUnitKey` (e.g. `[KEY_ORDERS, businessUnitKey]`) |
| B2B: `StagedQuote.sellerComment` for per-round display | `Quote.sellerComment` — the snapshot at quote creation time |
| B2B: `apiRoot.shoppingLists()` for purchase lists | `asAssociate().*.shoppingLists()` — BU-scoped, permission-enforced |

