---
name: commercetools-migration
description: Migrating to commercetools from competitor platforms — Shopify, Salesforce B2C Commerce (SFCC), VTEX, and Magento. Covers concept mapping, data migration patterns, cutover strategies, and common migration pitfalls. Use when the conversation involves transitioning from a legacy platform to commercetools.
when_to_use:
  - "Migrating from Shopify to commercetools — concept and data mapping"
  - "Migrating from Salesforce B2C Commerce (SFCC) to commercetools"
  - "Migrating from VTEX or Magento/Adobe Commerce to commercetools"
  - "Cutover strategy: big-bang vs phased, traffic switching"
  - "Legacy concept equivalents in CT (products, customers, orders, promotions, variants)"
  - "Running old and new platforms in parallel during migration"
metadata:
  contentType: SKILL
  area:
    - platform
---

# commercetools Migration

Patterns and concept maps for migrating from legacy ecommerce platforms to commercetools.

## Key Takeaways

**commercetools is composable-first — there is no "theme" or "plugin" model.** Platforms like Shopify and Magento abstract complexity through themes and plugins. CT provides API primitives — product, cart, customer, order — and you compose them into your storefront. The migration is not just a data migration; it's an architecture shift.

**Map concepts explicitly before migrating data.** Most migration failures come from assuming a 1:1 concept map between the old platform and CT. Explicitly document how each legacy concept maps to CT (e.g., Shopify "product" = CT Product; Shopify "variant" = CT ProductVariant; Shopify "collection" = CT Category).

**Region migration requires a full data export and reimport.** If the legacy platform hosts data in a different region than your target CT project, design the migration data pipeline to handle the region boundary explicitly. CT does not provide cross-region project migration.

**Plan a phased cutover to de-risk launch.** A big-bang cutover (all traffic switched at once) is high-risk. Prefer a phased approach: (1) launch CT in parallel with the legacy platform for a subset of traffic or product catalog, (2) validate end-to-end flows, (3) shift remaining traffic. Feature flags or a load balancer with traffic splitting support this pattern.

**Order history and customer accounts require explicit migration strategy.** Decide upfront whether to migrate historical orders and customer accounts, or start fresh with CT. Historical orders can be imported as CT orders with a custom `externalId` field linking to the legacy order ID.

**`externalId` is the migration link between legacy and CT resources.** Set `externalId` on all migrated customers, orders, and products to reference the legacy platform's identifier. This enables incremental migration, rollback, and reconciliation.

---

## Concept Maps

### Shopify → commercetools

| Shopify | commercetools | Notes |
|---------|--------------|-------|
| Product | Product | CT products have ProductType; Shopify products have tags |
| Variant | ProductVariant | CT variants have attributes; Shopify variants have options |
| Collection | Category | CT categories are a hierarchy tree |
| Customer | Customer | CT customers can be global or store-specific |
| Order | Order | CT orders have state machines |
| Cart | Cart | CT carts are server-side; Shopify carts can be client-side |
| Discount Code | Discount Code + Cart Discount | CT separates the code from the discount logic |
| Metafields | Custom Types + Custom Fields | CT Custom Types are typed and global |
| Location | Channel (InventorySupply) + Store | CT separates inventory location (channel) from selling context (store) |
| Price | Embedded Price or Standalone Price | CT supports both embedded (on variant) and standalone pricing |

### SFCC (Salesforce B2C Commerce) → commercetools

| SFCC | commercetools | Notes |
|------|--------------|-------|
| Site / Realm | Project | CT projects are isolated data environments |
| Catalog | Product catalog (no named catalog concept) | CT uses Category trees and ProductType to organize catalog |
| Storefront (SFRA) | Storefront + commercetools-storefront skill | CT provides APIs; storefront is custom-built |
| Promotion Engine | Cart Discounts + Product Discounts | CT discount stacking order is different from SFCC's |
| Customer List | Customer group (global customers) | SFCC customer lists ≈ CT store-specific customers |
| Business Manager | Merchant Center | MC has a custom app extension mechanism |
| Open Commerce API (OCAPI) | commercetools REST API | CT REST API is fully documented; SDK available |

### Magento/Adobe Commerce → commercetools

| Magento | commercetools | Notes |
|---------|--------------|-------|
| Configurable Product | Product with ProductVariants | CT has no "simple vs configurable" distinction — all products have variants |
| Attribute Set | ProductType | CT ProductTypes are immutable after data exists with that type |
| Bundle Product | External bundle orchestration | CT has no native bundle type — see bundle-modeling reference |
| Website / Store View | Project / Store | CT Store ≈ Magento Store View for scoping |
| Customer Group | Customer Group | Direct equivalent; CT uses it for pricing |
| Cart Price Rule | Cart Discount | CT uses a predicate-based system, not rule-based UI |
| Catalog Price Rule | Product Discount | CT Product Discounts are predicate-based |
| Extension / Plugin | API Extension + Subscribe | CT uses API Extensions and Subscriptions instead of hooks |

---

## Reference Index

| Topic | Reference | Source |
|-------|-----------|--------|
| Project migration — key change, region migration, data export/import process | [references/project-migration.md](references/project-migration.md) | CSEA: "Customer Support and Migrating Projects" |
| Import API — containers, batching, async processing, ordering guarantees | [references/import-api.md](references/import-api.md) | CSEA: "Import API" |
| Data flows — Import API vs REST, PIM/OMS/ERP integration patterns | [references/data-flows.md](references/data-flows.md) | ES: "Data Flows" deck |
| Implementation guide — migration steps, common migration mistakes | [references/implementation-guide.md](references/implementation-guide.md) | ES: Implementation Guide deck |

---

## Priority Tiers

### CRITICAL

- **Map concepts explicitly before migrating data.** Never assume a 1:1 concept map between the legacy platform and CT. Document the mapping upfront.
- **`externalId` is the migration link.** Set it on all migrated resources (customers, orders, products) to reference the legacy platform's identifier. This is required for reconciliation and rollback.
- **Global vs. store-specific customers is an irreversible design decision.** Make this choice during migration planning — it is a CT architectural decision, not just a data question.
- **Product Discounts do not work with external pricing.** If migrating a platform that uses external prices, design all promotions as Cart Discounts.

### HIGH

- **Plan historical order migration explicitly.** Decide whether to migrate historical orders or start fresh. Historical orders can be imported as CT orders with `externalId` referencing the legacy order ID.
- **ProductType attribute constraints cannot be changed after data exists.** Plan attribute constraints during the migration design phase.
- **`productDraftImport` is destructive.** Use `productVariantPatch` for targeted attribute updates during incremental migration.
- **Run migration in Dev/staging before production.** Validate data shape, references, and volume in a non-production environment.

### MEDIUM

- **Use a phased cutover to de-risk launch.** Big-bang cutovers are high-risk for large catalogs and customer bases.
- **Validate price migration.** CT supports both embedded prices (on product variants) and standalone prices. Migrating to standalone requires `priceMode: Standalone` and a separate price import.
- **Test your storefront against migrated data in staging.** Migrated data often has edge cases (missing images, null attributes, unusual characters) that cause frontend rendering bugs.
