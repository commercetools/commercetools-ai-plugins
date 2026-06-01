---
name: product-detail
description: PDP route structure, Server Component fetches, variant URL strategy, components, metadata, and attribute labels.
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

Shared patterns for PDP across B2C and B2B storefronts. Individual storefront references extend this.

## Route Structure

Pick one identifier and use it consistently:

- **SKU-based:** `app/[locale]/p/[sku]/page.tsx`
- **Product ID-based:** `app/[locale]/p/[productId]/page.tsx`

Don't mix strategies — your `getProductBy*` helper must match the chosen identifier.

## PDP Page (Server Component)

The PDP is a Server Component. Fetch all independent data with `Promise.all` — never waterfall serial fetches:

```typescript
const [product, attributeLabels, ...rest] = await Promise.all([
  getProductBySku(sku, ...).catch(() => null),
  getAttributeLabels(locale).catch(() => ({})),
  // any other data fetching
  ...
]);

if (!product) notFound();
```

Call `notFound()` immediately when the product is null — don't render a fallback.

## Variant URL Strategy

Switching variants updates only the `[sku]` URL segment — the Server Component re-runs automatically. No client-side fetch needed.

- Product lookup always uses `sku` or `productId`, never `slug`
- `slug` in the URL is the category slug — for breadcrumb only

## Components

- **Image gallery** — images from the active variant
- **Variant selector** — lists all SKUs; clicking one updates the URL (Server Component re-runs)
- **Availability indicator** — per-variant in/out-of-stock
- **Price display** — correct price; crossed-out original when discounted; handles recurring prices (see commercetools-knowledge MCP → Recurrence Policies)
- **Add to Cart button** — disabled when variant is out of stock or has no price
- **Breadcrumb** — uses `<Link>` from `@/i18n/routing` — no bare `<a>`

## Metadata

Fetch with the same context as the page — a mismatch can serve wrong SEO title or description:

```typescript
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = await getProductBySku(sku, ...).catch(() => null);
  if (!product) return {};
  return {
    title: product.metaTitle ?? product.name,
    description: product.metaDescription ?? product.description,
  };
}
```

## Attribute Labels

`getAttributeLabels(bcp47)` loads localised attribute display names from commercetools product types. Fetch it in parallel with the product and pass to any component rendering product attributes — never hardcode attribute names in the UI.

## Checklist

- [ ] Route uses consistent identifier (SKU or product ID — not both)
- [ ] `generateMetadata` returns title + description for SEO
- [ ] `notFound()` called when product doesn't resolve
- [ ] `Promise.all` for all independent fetches — no waterfalls
- [ ] Breadcrumb uses `<Link>` from `@/i18n/routing` — no bare `<a>`
- [ ] Variant selector pushes new URL — no client-side state
- [ ] Discount price shown with original crossed out
- [ ] Out-of-stock variants disable Add to Cart
- [ ] `getAttributeLabels(bcp47)` fetched in parallel with the product
