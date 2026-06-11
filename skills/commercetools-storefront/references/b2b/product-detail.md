---
name: product-detail
description: B2B PDP extensions covering session-scoped pricing, channel-driven availability, and purchase list functionality.
when_to_use:
  - "Building the B2B product detail page"
  - "Implementing channel-scoped pricing on PDP"
  - "Displaying store-specific availability"
  - "Adding purchase list features to the PDP"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - pdp
    - variant-config
---

# Product Detail Page — B2B

This extends [product-detail.md](../core/product-detail.md) with B2B-specific concerns. Route structure, the framework's not-found response, parallel fetching, variant URL strategy, component list, page metadata, and attribute labels follow the shared patterns.

## Data Fetching

Use `Promise.all` as per the shared pattern. The helper you call (`getProductBySku` or `getProductById`) depends on your chosen route identifier. The critical B2B addition: always pass `session` to the product fetch — it carries the channel and store context required for correct pricing and availability.

Apply the same when building page metadata via the framework's page-metadata API — pass `session` there too, or the SEO title and description may not match what the customer sees in their channel.

## Session and Channel Scoping

Passing `session` to `ProductApi` injects these parameters into every commercetools query automatically:

- `priceChannel` → `session.distributionChannelId` — scopes price to the customer's channel
- `availabilityChannel` → `session.supplyChannelId` — scopes availabiltiy to the customer's channel
- `storeProjection` → `session.storeKey` — filters to store-visible products
- `priceCustomerGroupAssignments` → applies B2B customer group discounts

Without `session`, the product loads at list price with no channel or store filtering. The session is populated during Business Unit selection — never bypass it.

## Availability

Use `variant.availability.channels[supplyChannelId].availableQuantity` for stock display — not `variant.availability.isOnStock`.

`isOnStock` aggregates across all channels and shows in-stock even when the customer's specific supply channel is out of stock. In a multi-channel B2B setup, this is always wrong.

```typescript
const channelStock = variant.availability?.channels?.[supplyChannelId];
// channelStock.availableQuantity → correct
// variant.availability.isOnStock  → never use in B2B
```

`supplyChannelId` comes from `session`, populated during BU selection.

## Pricing

Channel-scoped pricing is applied automatically when `session` is passed. Price display follows the shared pattern — discount with strikethrough, recurring price support.

## Components

Same as the shared component list, with these B2B additions:

- **Product title** — product name + active SKU
- **Description** — from the product description field
- **Info attributes** — attributes listed in `PDP_INFO_ATTRIBUTES`
- **Related products** — products sharing the same category
- **Purchase list** — add to BU shopping list (requires auth)

## Purchase List

Authenticated B2B users can add items to their Business Unit's shared shopping list. Render the purchase list button only when the user is authenticated — it is not available to guests.

## Checklist

- [ ] Pass `session` to product fetch — never call without it
- [ ] Pass `session` when building page metadata (framework's page-metadata API) — ensures channel-scoped SEO content
- [ ] Use `channelStock.availableQuantity` (not `isOnStock`) for availability
- [ ] `supplyChannelId` comes from `session` — set during BU selection
- [ ] Purchase list rendered only for authenticated users
