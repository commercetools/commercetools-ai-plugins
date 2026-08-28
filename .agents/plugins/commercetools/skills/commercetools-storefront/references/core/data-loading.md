---
name: data-loading
description: Server-rendered vs client-fetched decision matrix, commercetools type boundaries, BFF endpoint shape, version conflict, and server-side caching patterns.
when_to_use:
  - "Deciding between server-side and client-side data fetching"
  - "Designing server endpoints"
  - "Mapping commercetools types to application types"
  - "Implementing cache strategies"
metadata:
  contentType: REFERENCE
  area:
    - performance
    - session
---

# Data Loading

**Impact: HIGH — Calling commercetools from a Client Component or importing `<server>/ct/*` in a hook are the most common violations. commercetools types must never reach a component — map them at the commercetools layer.**

## Table of Contents
- [Pattern 1: Server-rendered vs Client-fetched Decision](#pattern-1-server-rendered-vs-client-fetched-decision)
- [Pattern 2: commercetools Type Boundary](#pattern-2-commercetools-type-boundary)
- [Pattern 3: BFF Server Endpoint Shape](#pattern-3-bff-server-endpoint-shape)
- [Pattern 4: Version Conflict](#pattern-4-version-conflict)
- [Pattern 5: Server-Side Caching](#pattern-5-server-side-caching)
- [Checklist](#checklist)

---

## Pattern 1: Server-rendered vs Client-fetched Decision

This is the core data-loading decision and it is framework-agnostic. Use a **server-rendered load** for first-paint data — no spinner, no hydration delay, SEO-friendly. Use **client-fetched** data (client state) only for data that changes after user interaction.

| Data | Pattern | Reason |
|---|---|---|
| Initial product list | Server-rendered | First paint, SEO, no spinner |
| Category tree | Server-rendered + TTL cache | Stable, needs SSR |
| Cart | Client-fetched (client state) | Changes after add/remove actions |
| Account / orders | Client-fetched (client state) | Changes after login |
| Search results | Server-rendered (via URL params) | SEO, shareable URLs |

Rules:
- Server-rendered pages fetch on the server and call `<server>/ct/*` directly — no client-side bundle unless the page needs browser APIs
- Pass `session` to commercetools functions rather than calling `getSession()` inside each function
- Return a not-found response for missing required resources

> Find adapter's `data-loading.md` file for implementation of this decision (async Server Component vs SWR hook → Route Handler)

---

## Pattern 2: commercetools Type Boundary

commercetools responses must be mapped to app types before leaving `<server>/ct/`. Components import from `<server>/types` — never from `@commercetools/platform-sdk`.

Mappers live in `<server>/mappers/`. Each file maps one commercetools resource to one app type:

| File | Maps |
|---|---|
| `<server>/mappers/product` | `ProductProjection` → `Product` |
| `<server>/mappers/category` | commercetools `Category` → app `Category` |
| `<server>/mappers/cart` | commercetools `Cart` → app `Cart` |
| `<server>/mappers/order` | commercetools `Order` → app `Order` |
| `<server>/mappers/line-item` | commercetools `LineItem` → app `LineItem` |
| `<server>/mappers/customer` | commercetools `Customer` → app `Account` |
| `<server>/mappers/money` | commercetools `TypedMoney` → app `Money` |
| `<server>/mappers/facet` | commercetools facet results → `FacetResult[]` |

`getLocalizedString(field, locale)` resolves `LocalizedString` to a plain string — falls back to default locale then first available. Call it only inside `<server>/ct/` or `<server>/mappers/`, never in components.

---

## Pattern 3: BFF Server Endpoint Shape

A server endpoint (your framework's request handler) has exactly three responsibilities — no more:

1. Validate session
2. Call `<server>/ct/<namespace>.ts` — never the commercetools SDK directly
3. Return JSON with the correct status

Never put raw SDK calls in a server endpoint. Never call the endpoint (`fetch('/<api>/*')`) directly in a component — put it in a client data hook (`hooks/*Api.ts`).

> The concrete login server endpoint follows the BFF endpoint shell, find it in  `data-loading.md` of the adapter's.

---

## Pattern 4: Version Conflict

commercetools uses optimistic locking — every cart mutation needs the current `version`. When two requests arrive simultaneously one will be rejected with `409 ConcurrentModification`. Re-fetch the entity's version before the action.

The refetch logic belongs in `<server>/ct/<entity>.ts` (or a route-handler-level helper), not scattered across components.
For example when updating cart fetch the cart version using the refetch logic in `<server>/ct/cart` and use it in the cart update.

---

## Pattern 5: Server-Side Caching

Cache stable, rarely-changing public data (category tree, project config) with your framework's server-side cache-with-TTL primitive. Such a cache is shared across all requests — **never cache per-user or per-session data this way**; use client state (client-side) or a direct per-request `<server>/ct/*` call for user-specific data.

Prefer a real cache primitive over module-level variables — module-level caches reset on cold starts and are not shared across serverless instances.

---

## Checklist

- [ ] `<server>/ct/` never imported in client components — import types from `<server>/types`
- [ ] commercetools responses mapped to app types inside `<server>/ct/<namespace>.ts` via mappers
- [ ] `getLocalizedString` called only in `<server>/ct/` or `<server>/mappers/`
- [ ] Components import from `<server>/types` — never from `@commercetools/platform-sdk`
- [ ] All independent server-side fetches use `Promise.all`
- [ ] Server endpoints have exactly 3 responsibilities: validate session, call `<server>/ct/`, return JSON
- [ ] Endpoint calls (`fetch('/<api>/*')`) live in client data hooks (`hooks/*Api.ts`), not in components
- [ ] Avoid Cart version conflict by refetch — logic lives in `<server>/ct/cart`
- [ ] Stable public data cached with the framework's server-side cache-with-TTL — never per-user data
