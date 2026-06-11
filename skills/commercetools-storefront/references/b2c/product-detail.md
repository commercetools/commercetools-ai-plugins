---
name: product-detail
description: B2C PDP patterns extending the shared reference with currency/country context and attribute labels.
when_to_use:
  - "Building the B2C product detail page"
  - "Implementing session-aware pricing on PDP"
  - "Configuring attribute labels"
  - "Handling variant selectors"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - pdp
    - ui
---

# Product Detail Page — B2C

The core PDP patterns — route structure, server-rendered fetch, variant URL strategy, components, metadata, and attribute labels — are in [product-detail.md](../core/product-detail.md).

**Attribute labels** fetch `getAttributeLabels(bcp47)` in parallel with the product and pass the result to any component that renders product attributes.

Use `getLocale()` to get `country`, `currency`, and `locale` for the current session. Pass these to product and price fetches to ensure market-correct pricing.

**Next:** [cart.md](../core/cart.md)
