# Stores — Concept, Scoping, and API Support

**Source:** 2024 Revised Channels and Stores (Expert Services / CSE Americas)

---

## What Is a Store?

A Store is a grouping construct used to model a distinct selling context — a physical retail location, a brand-specific storefront, a country-specific site, or a B2B buyer context. Stores constrain what products, prices, inventory, channels, customers, carts, and orders are accessible within that context.

Project limit: **300,000 stores per project**.

Stores provide:
- **Store-specific carts and orders** — carts/orders created in-store are scoped to that store
- **Store-specific customer accounts** — customers can be tied to a store (see customer scoping below)
- **Store-based scopes and permissions** — API clients can be granted scopes limited to specific stores
- **Store-specific Product Selections** — control which products are visible in a store
- **Filtered prices** — only prices with matching distribution channels (or no channel) are returned
- **Filtered inventory** — only inventory entries with matching supply channels (or no channel) are returned

**Note:** Product Projection Search API does not support `productSelections` filtering. Use `storeProjection` for price/availability filtering, not for catalog restriction in search.

---

## Store Draft — What to Include

A well-formed StoreDraft typically includes:

- One or more **distribution channels** (for price filtering and selection)
- One or more **supply channels** (for inventory filtering and reservation)
- An array of **languages** (for locale filtering in product projections)
- Optional **countries** (for price country filtering)
- Optional **product selections** (to restrict the catalog visible in this store)
- Optional **custom fields** (via custom type for any extended metadata)

---

## Global vs. Store-Specific Customers

- **Global customers** exist at the project level and are not tied to any store
- **Store-specific customers** are created in a store context and only have access to resources inside that store
- A customer is **either global or store-specific — not both**
- This architectural decision must be made during the project design phase — it cannot be reversed without migration

Authenticate a store-specific customer:
```
POST /oauth/{projectKey}/in-store/key={storeKey}/customers/token
```

---

## API Support

Stores work across:
- **REST API** — via the `/in-store/key=<storeKey>/` URL prefix
- **GraphQL** — via the `storeKey` argument on mutations/queries
- **Password Authentication flow** — customer tokens scoped to a store

### REST in-store pattern

```
GET  /{projectKey}/in-store/key={storeKey}/carts
POST /{projectKey}/in-store/key={storeKey}/carts
GET  /{projectKey}/in-store/key={storeKey}/product-projections/search
```

### GraphQL in-store pattern

```graphql
mutation {
  updateCart(
    id: "123e4567-e89b-12d3-a456-426655440000"
    version: 1
    actions: [{ addLineItem: { sku: "..." } }]
    storeKey: "store-key"
  )
}
```

---

## Store Projection in Product Searches

When a project has many distribution and supply channels, product projection responses can become very large (many price and availability records). The `storeProjection` query parameter reduces noise by filtering the response to only include data relevant to the specified store.

```
GET /{projectKey}/in-store/key={storeKey}/product-projections/{id}
```

Filtering behavior when using store projection:

- **Distribution channels set on store:** only prices whose channel is in the store's distribution channels, or prices with no channel, are returned
- **Supply channels set on store:** only inventory entries whose channel is in the store's supply channels, or entries without a channel, are returned
- **Languages set on store:** only localized strings for those languages are returned

**Anti-pattern:** Do not expect `storeProjection` to completely hide prices that have no channel — prices without a channel are always included. This is by design to support fallback pricing.
