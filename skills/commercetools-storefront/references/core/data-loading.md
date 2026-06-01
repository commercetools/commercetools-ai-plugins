---
name: data-loading
description: Server vs SWR decision matrix, commercetools type boundaries, BFF route shape, version conflict, and server-side caching patterns.
when_to_use:
  - "Deciding between server-side and client-side data fetching"
  - "Designing API route handlers"
  - "Mapping commercetools types to application types"
  - "Implementing cache strategies"
metadata:
  contentType: REFERENCE
  area:
    - performance
    - session
---

# Data Loading

**Impact: HIGH — Calling commercetools from a Client Component or importing `lib/ct/*` in a hook are the most common violations. commercetools types must never reach a component — map them at the commercetools layer.**

## Table of Contents
- [Pattern 1: Server vs SWR Decision](#pattern-1-server-vs-swr-decision)
- [Pattern 2: commercetools Type Boundary](#pattern-2-ct-type-boundary)
- [Pattern 3: BFF API Route Shape](#pattern-3-bff-api-route-shape)
- [Pattern 4: Version Conflict](#pattern-4-version-conflict)
- [Pattern 5: Server-Side Caching](#pattern-5-server-side-caching)
- [Checklist](#checklist)

---

## Pattern 1: Server vs SWR Decision

Use async Server Components for first-paint data — no spinner, no hydration delay, SEO-friendly. Use SWR only for data that changes after user interaction.

| Data | Pattern | Reason |
|---|---|---|
| Initial product list | Server Component | First paint, SEO, no spinner |
| Category tree | Server Component + TTL cache | Stable, needs SSR |
| Cart | SWR (`useCartSWR`) | Changes after add/remove actions |
| Account / orders | SWR | Changes after login |
| Search results | Server Component (via URL params) | SEO, shareable URLs |

Rules:
- All page components are `async` by default — no `'use client'` unless the page needs browser APIs
- Always `await params` — it's a Promise in Next.js 15+
- Call `notFound()` for missing required resources
- Pass `session` to commercetools functions rather than calling `getSession()` inside each function

---

## Pattern 2: commercetools Type Boundary

commercetools responses must be mapped to app types before leaving `lib/ct/`. Components import from `@/lib/types` — never from `@commercetools/platform-sdk`.

Mappers live in `lib/mappers/`. Each file maps one commercetools resource to one app type:

| File | Maps |
|---|---|
| `lib/mappers/product.ts` | `ProductProjection` → `Product` |
| `lib/mappers/category.ts` | commercetools `Category` → app `Category` |
| `lib/mappers/cart.ts` | commercetools `Cart` → app `Cart` |
| `lib/mappers/order.ts` | commercetools `Order` → app `Order` |
| `lib/mappers/line-item.ts` | commercetools `LineItem` → app `LineItem` |
| `lib/mappers/customer.ts` | commercetools `Customer` → app `Account` |
| `lib/mappers/money.ts` | commercetools `TypedMoney` → app `Money` |
| `lib/mappers/facet.ts` | commercetools facet results → `FacetResult[]` |

`getLocalizedString(field, locale)` resolves `LocalizedString` to a plain string — falls back to default locale then first available. Call it only inside `lib/ct/` or `lib/mappers/`, never in components.

---

## Pattern 3: BFF API Route Shape

Route handlers have exactly three responsibilities — no more:

1. Validate session
2. Call `lib/ct/<namespace>.ts` — never the commercetools SDK directly
3. Return JSON with the correct status

Never put raw SDK calls in a route handler. Never call `fetch('/api/*')` directly in a component — put it in `hooks/*Api.ts`.

---

## Pattern 4: Version Conflict

commercetools uses optimistic locking — every cart mutation needs the current `version`. When two requests arrive simultaneously one will be rejected with `409 ConcurrentModification`. Re-fetch the entity's version before the action.

The refetch logic belongs in `lib/ct/<entity>.ts` (or a route-handler-level helper), not scattered across components. 
For example when updating cart fetch the cart version using the refetch logic in `lib/ct/cart.ts` and use it in the cart update.

---

## Pattern 5: Server-Side Caching

Use `unstable_cache` for stable, rarely-changing public data (category tree, project config). It is shared across all requests on the same server — **never cache per-user or per-session data here**.

```typescript
export const getCategoryTree = unstable_cache(
  fetchCategoryTree,
  ['category-tree'],
  { revalidate: 60 }
);
```

Prefer `unstable_cache` over module-level variables — module-level caches reset on cold starts and are not shared across serverless instances.

---

## Checklist

- [ ] `lib/ct/` never imported in `'use client'` files — import types from `@/lib/types`
- [ ] commercetools responses mapped to app types inside `lib/ct/<namespace>.ts` via mappers
- [ ] `getLocalizedString` called only in `lib/ct/` or `lib/mappers/`
- [ ] Components import from `@/lib/types` — never from `@commercetools/platform-sdk`
- [ ] All independent server-side fetches use `Promise.all`
- [ ] API routes have exactly 3 responsibilities: validate session, call `lib/ct/`, return JSON
- [ ] `fetch('/api/*')` calls live in `hooks/*Api.ts`, not in components
- [ ] Avoid Cart version conflict by refetch — logic lives in `lib/ct/cart.ts`
- [ ] Stable public data cached with `unstable_cache` — never per-user data
