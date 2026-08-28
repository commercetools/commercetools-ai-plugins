---
name: performance
description: Parallel fetching, server-side TTL caching, client-cache hydration from the server, and N+1 anti-patterns to avoid.
when_to_use:
  - "Optimising page load times"
  - "Implementing caching strategies"
  - "Designing data fetching sequences"
  - "Eliminating N+1 query patterns"
metadata:
  contentType: REFERENCE
  area:
    - performance
---

# Performance

**Impact: MEDIUM — Correct patterns are already enforced by the architecture (server-rendered loads, BFF). Violations show up as waterfalls, N+1 queries, or unnecessary client re-fetches.**

This reference covers parallel data fetching, server-side TTL caching for stable data, hydrating the client state-manager/cache from server-fetched data, image optimization, and the anti-patterns that crater TTFB. The decisions here are framework-agnostic; the Next.js mechanics are linked at each point.

## Table of Contents
- [Pattern 1: Parallel Fetching on the Server](#pattern-1-parallel-fetching-on-the-server)
- [Pattern 2: TTL Cache for Stable commercetools Data](#pattern-2-ttl-cache-for-stable-commercetools-data)
- [Pattern 3: Hydrate the client state-manager/cache from the Server](#pattern-3-hydrate-the-client-state-managercache-from-the-server)
- [Pattern 4: Image Optimization](#pattern-4-image-optimization) → see [image-config.md](./image-config.md)
- [Pattern 5: N+1 Anti-Patterns to Avoid](#pattern-5-n1-anti-patterns-to-avoid)
- [Checklist](#checklist)

---

## Pattern 1: Parallel Fetching on the Server

**INCORRECT:** Awaiting independent fetches sequentially — this creates a waterfall where each request waits for the previous one:

```typescript
// WRONG — sequential waterfall
const session = await getSession();        // 50 ms
const locale = await getLocale();          // 50 ms
const categories = await getCategoryTree(locale); // 200 ms
// Total: 300 ms
```

**CORRECT — `Promise.all` for all independent fetches:**

```typescript
// CORRECT — parallel, total ≈ longest individual fetch
const [session, locale, messages, validCountryConfig] = await Promise.all([
  getSession(),
  getLocale(),
  getMessages(),
  getValidCountryConfig(), // cached with a server-side TTL cache
]);
// Total: ~50 ms (session/locale win, messages/validation cached)
```

**Category page example** — category metadata and tree must be parallel:

```typescript
// server-rendered category page
const [category, categoryTree] = await Promise.all([
  getCategoryBySlug(slug, locale),
  getCategoryTree(locale),
]);
if (!category) return; // return the framework's not-found response here

// Then build the breadcrumb by walking the in-memory tree — zero extra commercetools calls
const flat = categoryTree.flat();
let current = category;
while (current.parent) {
  const parent = flat.find((c) => c.id === current.parent?.id);
  if (parent) { breadcrumb.unshift({ name: parent.name, slug: parent.slug }); current = parent; }
  else break;
}
```

> **Rule:** If two fetches don't depend on each other's output, they must run in `Promise.all`. The most common violation is awaiting `getSession()` before calling `getLocale()` when neither needs the other.

---

## Pattern 2: TTL Cache for Stable commercetools Data

**INCORRECT:** Re-fetching the commercetools project configuration on every request — this data changes rarely and adds ~50 ms to every page render.

**CORRECT — wrap rarely-changing data in your framework's server-side cache-with-TTL.** For example, validate `COUNTRY_CONFIG` against the project's `apiRoot.get()` countries/currencies/languages once and reuse the result:

```typescript
// <server>/ct/locale-validation — the fetch + filter is portable
async function fetchValidCountryConfig() {
  const res = await apiRoot.get().execute();
  const { countries = [], currencies = [], languages = [] } = res.body;
  return Object.fromEntries(
    Object.entries(COUNTRY_CONFIG).filter(([country, config]) =>
      countries.includes(country) &&
      currencies.includes(config.currency) &&
      languages.some((l: string) => l.toLowerCase() === config.locale.toLowerCase())
    )
  );
}
// Wrap fetchValidCountryConfig in the framework's TTL cache (≈300s) and export the cached version.
```

**What to cache:**

| Data | Cache TTL | Reason |
|------|-----------|--------|
| commercetools project config (countries, currencies) | 300 s | Changes only on project reconfiguration |
| Category tree | 60 s | Rarely edited; high reuse across pages |
| Shipping methods | 60 s | Rarely edited; no per-user variation |
| Product prices | **Do not cache** | Can change on promotion rules; per-currency |
| Cart data | **Do not cache** | Per-session, changes frequently |

> **Never cache per-user or per-session data in a shared server-side cache** — it is shared across all requests. Use a client-side cache (the client-state hook) or a direct per-request `<server>/ct/*` call for user-specific data.

> Find the `data-loading.md` file of the adapter's to see framework's server-side cache-with-TTL patterns.
---

## Pattern 3: Hydrate the client state-manager/cache from the Server

**INCORRECT:** Letting the client state-manager/cache fetch the cart and account on initial page load — this causes a loading-spinner flash on first render.

**CORRECT — inject server-fetched data into the client state-manager/cache at the root so the first render has data:**

- Pre-fetch the cart server-side only if `session.cartId` exists; if it is stale or non-Active, leave it null and let the client clear it.
- Build the initial user object from session fields — **no extra commercetools call needed.**

The session already carries `customerId`, `customerEmail`, `customerFirstName`, `customerLastName`. For the account avatar and navigation this is sufficient; a full commercetools customer fetch is only needed on the account profile page where the user updates fields.

---

## Pattern 4: Image Optimization

Image rendering and URL transforms are covered in [image-config.md](./image-config.md) (transform functions are framework-agnostic). The performance-critical rules in brief:

- **Never use a raw `<img>`** — use the framework's image primitive so below-fold images lazy-load automatically.
- **One LCP image per page gets priority** — the PDP main carousel image or hero banner only. Product card images on listing pages must not.
- Keep any framework image-optimizer disabled — the commercetools CDN rejects optimizer query params; the transform functions handle sizing.

> See adapter's `best-practices/image.md` file.

---

## Pattern 5: N+1 Anti-Patterns to Avoid

### Category breadcrumb — N+1 parent lookups

**INCORRECT:** Fetching each parent category one by one:

```typescript
// WRONG — O(depth) commercetools calls
let current = category;
while (current.parent) {
  current = await getCategoryById(current.parent.id, locale); // commercetools call per level
  breadcrumb.unshift(current);
}
```

**CORRECT — fetch the full tree once, walk it in memory:**

```typescript
// CORRECT — 1 commercetools call for the whole tree, O(n) in-memory walk
const [category, categoryTree] = await Promise.all([
  getCategoryBySlug(slug, locale),
  getCategoryTree(locale),        // fetches all categories (limit: 500)
]);

const flat = categoryTree.flat();
let current = category;
while (current.parent) {
  const parent = flat.find((c) => c.id === current.parent?.id);
  if (parent) { breadcrumb.unshift({ name: parent.name, slug: parent.slug }); current = parent; }
  else break;
}
```

### Product card prices — N+1 price fetches

**INCORRECT:** Fetching each variant's price separately after a product list query:

```typescript
// WRONG — 1 extra commercetools call per product
for (const product of products) {
  product.price = await getVariantPrice(product.id, currency, country);
}
```

**CORRECT — pass `priceCurrency` + `priceCountry` in the search query body:**

```typescript
// CORRECT — commercetools resolves prices in the same search response
const body: ProductSearchRequest = {
  productProjectionParameters: {
    priceCurrency: currency,
    priceCountry: country,
  },
  // ...
};
// Variants arrive with .price already set — no extra fetch
```

### Account page — serial user + orders fetch

**INCORRECT:** Awaiting user before fetching orders:

```typescript
// WRONG — sequential
const customer = await getCustomerById(session.customerId);
const orders = await getCustomerOrders(session.customerId);
```

**CORRECT — parallel, both need only `customerId` from session:**

```typescript
// CORRECT
const [customer, ordersResult] = await Promise.all([
  getCustomerById(session.customerId),
  getCustomerOrders(session.customerId, 5), // last 5 for the dashboard
]);
```

---

## Checklist

- [ ] All independent server-side fetches use `Promise.all`
- [ ] Stable commercetools data (category tree, shipping methods, project config) wrapped in a server-side TTL cache
- [ ] The TTL cache is never used for per-user or per-session data
- [ ] The client state-manager/cache (cart, account) is pre-populated from server-fetched data — no spinner flash on first paint
- [ ] `initialUser` is built from session fields — no extra `getCustomerById` call at the root
- [ ] One LCP image per page uses the priority hint; product card images do not — see [image-config.md](./image-config.md)
- [ ] Category breadcrumb walks the in-memory tree — not individual `getCategoryById` calls
- [ ] Product search passes `priceCurrency`/`priceCountry` — no post-query price fetches
