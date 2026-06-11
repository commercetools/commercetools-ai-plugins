---
name: product-detail
description: PDP route structure, server-rendered fetches, variant URL strategy, components, metadata, and attribute labels.
when_to_use:
  - "Building the product detail page"
  - "Implementing variant selectors"
  - "Handling variant-driven URL updates"
  - "Configuring product metadata"
metadata:
  contentType: REFERENCE
  area:
    - pdp
    - ui

---

# Product Detail Page (PDP)

Shared patterns for PDP across B2C and B2B storefronts. Individual storefront references extend this. The patterns are framework-agnostic.

## Route Structure

Pick one identifier and use it consistently:

- **SKU-based:** route keyed by `[sku]` (e.g. `/p/[sku]`)
- **Product ID-based:** route keyed by `[productId]`

Don't mix strategies — your `getProductBy*` helper must match the chosen identifier.

## PDP Page (server-rendered)

The PDP is server-rendered. Fetch all independent data with `Promise.all` — never waterfall serial fetches:

```typescript
const [product, attributeLabels, ...rest] = await Promise.all([
  getProductBySku(sku, ...).catch(() => null),
  getAttributeLabels(locale).catch(() => ({})),
  // any other data fetching
  ...
]);

// when product is null, return the framework's not-found response
```

Return the not-found response immediately when the product is null — don't render a fallback. See the adapter's `concept-mapping.md`.

## Variant URL Strategy

Switching variants updates only the `[sku]` URL segment — the server-rendered page re-runs automatically. No client-side fetch needed.

- Product lookup always uses `sku` or `productId`, never `slug`
- `slug` in the URL is the category slug — for breadcrumb only

## Components

- **Image gallery** — images from the active variant
- **Variant selector** — lists all SKUs; clicking one updates the URL (the server-rendered page re-runs)
- **Availability indicator** — per-variant in/out-of-stock
- **Price display** — correct price; crossed-out original when discounted; handles recurring prices (see commercetools-knowledge MCP → Recurrence Policies)
- **Add to Cart button** — disabled when variant is out of stock or has no price
- **Breadcrumb** — uses the framework's locale-aware link — no bare `<a>`

## Metadata

Derive SEO metadata from the product, fetched with the **same context** as the page — a mismatch can serve a wrong SEO title or description:

```typescript
// e.g. title: product.metaTitle ?? product.name; description: product.metaDescription ?? product.description
const product = await getProductBySku(sku, ...).catch(() => null);
if (!product) return {};
```

(Next.js: `generateMetadata` — see the adapter's metadata reference.)

## Attribute Labels

`getAttributeLabels(bcp47)` loads localised attribute display names from commercetools product types. Fetch it in parallel with the product and pass to any component rendering product attributes — never hardcode attribute names in the UI.

## Checklist

- [ ] Route uses consistent identifier (SKU or product ID — not both)
- [ ] SEO metadata returns title + description, derived from the product with matching context
- [ ] The not-found response is returned when the product doesn't resolve
- [ ] `Promise.all` for all independent fetches — no waterfalls
- [ ] Breadcrumb uses the framework's locale-aware link — no bare `<a>`
- [ ] Variant selector pushes new URL — no client-side state
- [ ] Discount price shown with original crossed out
- [ ] Out-of-stock variants disable Add to Cart
- [ ] `getAttributeLabels(bcp47)` fetched in parallel with the product
