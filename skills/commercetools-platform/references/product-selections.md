# Product Selections — Store-Specific Catalogs

**Source:** 2024 Revised Channels and Stores (Expert Services / CSE Americas)

---

## What Are Product Selections?

Product Selections let you define a subset of the project's product catalog and assign that subset to one or more stores. A store with product selections applied only exposes those products through the in-store APIs — all other products in the project are not visible in that store context.

This is the primary mechanism for **store-specific assortment management** without splitting products into separate projects.

---

## How Product Selections Work with Stores

A store can reference one or more Product Selections. When a product projection is requested through the in-store endpoint, only products included in the store's product selections are returned.

```
Store
  └─ productSelections[]
       └─ ProductSelection
            └─ products[] (set of product references)
```

The in-store product projections endpoint applies product selection filtering:
```
GET /{projectKey}/in-store/key={storeKey}/product-projections
GET /{projectKey}/in-store/key={storeKey}/product-projections/{id}
GET /{projectKey}/in-store/key={storeKey}/product-projections/search
```

**Important limitation:** The **Product Projection Search API** does not support product selections filtering. If you use `product-projections/search` in-store, the search returns results from the full project catalog — not restricted to the store's product selections. Use the non-search in-store endpoints for catalog-scoped browsing, or design around this limitation (e.g., pre-filter by SKU list).

---

## Product Selections as an Alternative to Supply Channels for Availability

The slides note an alternative pattern: instead of using supply channels to control which products appear available in a store, you can use product selections. If a product has no inventory in a given supply channel, excluding it from the product selection achieves the same visibility constraint declaratively.

**Supply channel approach:** Product is in catalog; inventory query determines availability.
**Product selection approach:** Only include products in the selection when they should be visible; inventory is secondary.

The right choice depends on how dynamic the assortment is and whether real-time inventory drives visibility.

---

## Product Selections in B2B / Business Unit Contexts

Business Units can be associated with stores, and those stores carry product selections. This creates a three-layer scoping:

```
Business Unit → Store → Product Selections → Visible Catalog
                     → Distribution Channels → Visible Prices
                     → Supply Channels → Visible Inventory
```

Any cart referencing a Business Unit must use only the stores (and their product selections/channels) of that Business Unit. This enforces company-specific catalog and pricing automatically at the API level.

---

## Key Gotchas

- **Product Projection Search ignores product selections.** This is a known platform limitation. Design catalog search flows to account for this — either use non-search product projection endpoints for catalog browsing, or apply post-filtering.
- **Product selections are additive.** If a store references multiple product selections, a product is visible if it appears in any one of them.
- **Removing a product from a selection does not affect active carts.** Line items already in carts retain their product reference; the selection only affects which products can be found and added going forward.
