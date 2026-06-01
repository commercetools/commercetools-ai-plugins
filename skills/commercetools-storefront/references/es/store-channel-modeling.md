# Store and Channel Modeling Patterns

**Source:** 2024 Revised Channels and Stores (Expert Services / CSE Americas)

---

## Core Relationship

Stores group channels. A store's distribution channels define which prices are visible; a store's supply channels define which inventory entries are visible. This grouping lets you scope pricing and inventory to a specific selling context without duplicating product data.

```
Store
  ├─ distributionChannels[] → prices filtered to these channels (+ prices with no channel)
  └─ supplyChannels[]       → inventory filtered to these channels (+ inventory with no channel)
```

---

## Modeling Pattern 1: One-to-One (Store = Channel)

Each store has its own dedicated distribution channel and supply channel. Pricing and inventory are fully isolated per store.

```
Store XYZ
  ├─ Distribution Channel (Store XYZ)   ← store-specific prices
  └─ Supply Channel (Store XYZ)         ← store-specific inventory
```

**When to use:** Each location has independently negotiated pricing and its own warehouse stock.

---

## Modeling Pattern 2: Shared Pricing, Discrete Inventory

Multiple stores share a single distribution channel (shared price list) but each has its own supply channel (separate warehouse/inventory).

```
Store MNO
  ├─ Distribution Channel (Shared Pricing)   ← same prices across stores
  ├─ Supply Channel (Store ABC)              ← location A inventory
  ├─ Supply Channel (Store DEF)              ← location B inventory
  └─ Supply Channel (Store GHI)              ← location C inventory
```

**When to use:** Retail chains where pricing is centrally managed but stock levels are per-location (e.g., BOPIS scenarios where you need to check specific store availability).

---

## Use Case: Multi-Brand Selling

Create a store per brand. Each store has:
- A unique set of distribution channels (brand-specific price lists)
- A unique set of product selections (brand-specific catalog)
- Separate supply channels if brand-specific inventory is required

Stores maintain distinct brand identities and keep assortment/pricing rules separated without creating separate CT projects.

---

## Use Case: Multi-Country / Multi-Locale

Stores simplify localization. Each country store can have:
- Languages array (filters localized strings in projections)
- Country-scoped distribution channels (country-specific pricing)
- Country-specific tax categories and shipping methods attached via other resources

---

## Use Case: Digital and Physical (Omnichannel)

Stores can represent both digital (web, app) and physical (brick-and-mortar) sales contexts while sharing resources (product catalogs, channels, assortments) as needed.

A typical BOPIS setup:
- One store per physical location with its own supply channel
- A shared digital store (or no store) for the web channel
- `shippingMode: Multiple` on carts to support split fulfillment (ship-to-home + in-store pickup)

---

## Use Case: B2B with Stores

Stores are a flexible tool for B2B. Combined with Business Units, stores enable:
- Company-specific pricing (via distribution channels on the store)
- Company-specific catalog (via product selections on the store)
- Company-specific inventory visibility (via supply channels)

Any cart or order referencing a Business Unit must use only the stores, product selections, and channels of that Business Unit (if any are set on it).

---

## Key Gotchas

- **Supply channel on a line item must match the store's supply channels.** If the cart is in-store and you specify a `supplyChannel` on a line item, it must be one of the store's supply channels or the request will fail.
- **In-store carts are not returned by the project-level cart listing.** `GET /{projectKey}/carts` does not include in-store carts. Always query `/in-store/key=<storeKey>/carts` for store-scoped cart lookup.
- **Prices without a channel are always returned in store projections.** These act as the fallback. Do not use "no channel" prices as the only price — have explicit channel prices where channel-specific pricing matters.
- **Product Projection Search does not filter by product selections.** To restrict search to a store's assortment, you need a separate catalog-aware approach (e.g., filter by SKU lists or use the in-store product-projections endpoint which does apply product selection filtering).
