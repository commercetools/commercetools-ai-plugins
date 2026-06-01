# External Search Integration — Sync Architecture and Patterns

**Source:** "Integrating with external search" (Professional Services Americas, 2022 template); Product Search QBR Q1 2026; Expert Services Americas engagements

---

## When You Need External Search

External search providers (Algolia, Elasticsearch/OpenSearch, Constructor, Bloomreach) make sense when:

- The business requires a **merchandising UI** for non-technical users to manage rankings, pin products, and manage synonym dictionaries
- **Predictive autocomplete with typo tolerance** is a day-one requirement
- **Behavioral personalization** (click signals, add-to-cart, purchases driving rank) is required
- **Built-in search analytics** dashboards are expected by the merchandising team
- **AI/ML relevance tuning** beyond what CT native search offers is required

At the cost: external search typically adds 20–100% of the CT platform ACV in additional licensing, plus significant integration development and ongoing maintenance.

---

## Core Integration Architecture

The fundamental pattern for any external search integration with CT:

```
CT Product Catalog
        │
        │  product created/updated/published
        ▼
CT Subscriptions (SQS, Pub/Sub, etc.)
        │
        │  ProductPublished / ProductCreated / ProductVariantAdded messages
        ▼
Index Sync Service (custom Lambda / Cloud Function)
        │
        │  transform CT ProductProjection → search provider document
        ▼
External Search Index (Algolia, Elasticsearch, etc.)
        │
        │  search query from storefront
        ▼
Search Results → Storefront
```

**Key principle:** The external search index is a derived, read-optimized copy of the CT catalog. CT remains the system of record. The sync service must keep the index current.

---

## Subscription-Based Sync

CT Subscriptions deliver change notifications to SQS, Pub/Sub, or an EventBridge bus whenever products are modified. The sync service consumes these messages and updates the external index.

**Relevant message types:**
- `ProductPublished` — a product's staged representation was published (this is the key event for search index updates)
- `ProductCreated` — new product created
- `ProductVariantAdded` — new variant added
- `ProductDeleted` — product removed (must delete from index)
- `ProductPriceAdded` / `ProductPriceChanged` / `ProductPriceRemoved` — embedded price changes
- `StandalonePriceCreated` / `StandalonePriceChanged` — standalone price changes (separate event stream)

```json
{
  "destination": {
    "type": "SQS",
    "queueUrl": "https://sqs.us-east-1.amazonaws.com/123456789/search-sync-queue",
    "accessKey": "...",
    "accessSecret": "...",
    "region": "us-east-1"
  },
  "messages": [
    { "resourceTypeId": "product", "types": ["ProductPublished", "ProductDeleted"] },
    { "resourceTypeId": "standalone-price", "types": ["StandalonePriceCreated", "StandalonePriceChanged"] }
  ]
}
```

---

## Document Shape — What to Index

The search index document is typically a **denormalized, flat representation** of the CT ProductProjection. Include everything a storefront search result needs to display or filter on:

```json
{
  "objectID": "ct-product-id",
  "name": { "en": "Running Shoe", "de": "Laufschuh" },
  "slug": { "en": "running-shoe-v2" },
  "description": { "en": "High-performance running shoe..." },
  "categories": [
    { "id": "cat-id-footwear", "name": "Footwear", "slug": "footwear" }
  ],
  "brand": "Nike",
  "variants": [
    {
      "sku": "SHOE-RED-42",
      "color": "red",
      "size": 42,
      "price_EUR": 9900,
      "price_USD": 10500,
      "inStock": true
    }
  ],
  "masterVariantSku": "SHOE-RED-42",
  "imageUrl": "https://cdn.example.com/shoe.jpg",
  "publishedAt": "2024-01-15T10:00:00Z"
}
```

**Design decisions:**
- Denormalize category names at index time (avoids a second lookup at query time)
- Include one price per currency rather than the full CT price array
- Flatten variant attributes your storefront filters on
- If using customer-group pricing, you may need separate index documents per group, or handle price selection at query time via a backend-for-frontend (BFF)

---

## Price Freshness Problem

Prices change frequently (promotions, markdown, channel-specific pricing). This is the most common source of stale data in external search integrations.

**Strategies:**

1. **Event-driven price sync** — subscribe to `ProductPriceAdded`, `ProductPriceChanged`, `ProductPriceRemoved` (embedded) or `StandalonePriceCreated`, `StandalonePriceChanged`, `StandalonePriceDeleted` (standalone). Update only the affected products in the index.

2. **Price on PDP, not on PLP** — show a displayed price in search results from the index (acceptable to be slightly stale), but always fetch the authoritative price from CT on the product detail page and in the cart. Never trust the indexed price for cart creation.

3. **Separate price index** — store prices in a separate lookup table and join at query time in your BFF. Slower but always fresh.

**Gotcha:** Discount codes and cart discounts are not part of the product record — they are evaluated at cart time. Do not index "discounted prices" in external search.

---

## Inventory Freshness

Inventory (in-stock status) changes continuously during high-traffic periods. Options:

1. Subscribe to `InventoryEntryCreated` / `InventoryEntryQuantitySet` messages and update the `inStock` field in the index. Acceptable lag of seconds to minutes.
2. Filter out-of-stock products at the search layer only for PLP display. Always verify availability in the CT cart (CT enforces inventory on `addLineItem`).
3. For very high inventory update volumes, consider a "soft out-of-stock" approach: hide products from search when they hit zero but do not sync every individual quantity change.

---

## Multi-Store / Multi-Region Considerations

If the CT project uses stores and product selections to control catalog assortment:

- The external search index must replicate this scoping. Build separate index replicas per store, or add a `storeKeys` field to each document and filter at query time.
- `ProductSelection` membership changes are not surfaced as product messages — listen for `ProductSelectionProductAdded` / `ProductSelectionProductRemoved` messages to keep store assortment current.
- Category trees are per-locale only, not per-store — localization must be applied at index time.

---

## Delta vs. Full Reindex

**Delta sync (event-driven):** Use subscriptions. Low latency, efficient, preferred for ongoing operation.

**Full reindex trigger conditions:**
- Initial setup
- After a bulk import (Import API) that generates high volumes of messages
- After a schema change to the search index document shape
- Recovery from a sync gap (e.g., subscription queue backed up or dropped messages)

For a full reindex, use the CT Product Projections query endpoint with pagination (`offset` + `limit`, or cursor-based) to read all published products and push to the search provider's batch import API.

---

## Gotchas

- **Product Projection Search ≠ the external search index.** A common mistake is treating CT's Product Projection Search as an "external" search. It is still native CT search and has none of the merchandising, autocomplete, or analytics capabilities of Algolia or Elasticsearch.
- **Never skip the sync service.** Direct webhook calls from Algolia/Elasticsearch to CT are not supported. The sync must be a service you own.
- **Message deduplication.** CT subscriptions can deliver the same message more than once. Your sync service must be idempotent (indexing the same product twice is safe; double-deleting must be handled).
- **Published state only.** Only `published` products should appear in the storefront index. The CT message payload may include staged-only data — always fetch the published projection when syncing.
- **Locale handling.** CT stores localized content as `{ "en": "...", "de": "..." }`. External providers have different localization models. Decide upfront whether to index all locales into one document or create locale-specific index replicas.
