# Product Data Modeling — Foundations

**Source:** 2026 Product Data Modeling deck (Expert Services)

---

## Core Terminology

| Term | Definition |
|------|-----------|
| **Product Type** | Schema definition — a template of attribute definitions shared by similar products |
| **Product** | Abstract container with attribute values. **Not sellable** — acts as parent structure. Must have at least one variant (the Master Variant). |
| **Product Variant** | Concrete, sellable good. Mapped to a specific SKU. Inventory and pricing modeled per variant. |
| **Product Attribute** | A unique characteristic or piece of information about a Product (defined in Product Types) |
| **Product Attribute Group** | Grouping for fine-grained access control and workflow management |
| **Category** | Hierarchical classification. Used for navigation, promotions, and search requirements. |

**Products Data Structure:**
```
ProductType (Attribute Definition: Size, Color, Brand)
    └─ defines ──► Product (Attribute: Size, Color, Brand)
                       └─ has variants ──► ProductVariant (SKU, Attribute values, Prices, Inventory)
                           └─ is assigned to ──► Category
```

---

## Attribute Types

There are 14 attribute types:

| Type | Example Value |
|------|--------------|
| Boolean | `true` / `false` |
| String | `"green"`, `"light green"` |
| Localized String | `en: "green"`, `de: "grün"` |
| Enum | `["red", "green", "blue"]` — predefined values only |
| Localized Enum | `en: ["red", "green"]`; `de: ["rot", "grün"]` |
| Number | numeric values |
| Money | `currencyCode: EUR, centAmount: 4200` (ISO 4217) |
| Date | ISO date |
| Time | time string |
| DateTime | `YYYY-MM-DDThh:mm:ss.sssZ` (ISO 8601, UTC) |
| Reference | pointer to another CT resource |
| Nested | structured tabular data (set of another ProductType) |
| Set (of any above) | multi-value for any type |

**Choosing the right attribute type governs data quality.** Use Enum / Localized Enum when values come from a fixed vocabulary. Use String only when the set of values is truly open-ended.

### Reference Type

The Reference attribute points to another CT resource. Requires:
- `name`: the attribute name
- `referenceTypeId`: the resource type being referenced

Supported `referenceTypeId` values: `category`, `channel`, `custom-object`, `product`, `product-type`, `review`, `customer`, `state`, `zone`, `shipping-method`, and more.

**Pattern — linking structured data via Custom Object reference:**
```json
{
  "container": "authors-container",
  "key": "auth-1",
  "value": {
    "name": "Gabriel Garcia Marquez",
    "birthPlace": { "en": "Colombia", "de": "Kolumbien" }
  }
}
```
Use a Reference attribute pointing to `custom-object` when data is shared across many products (e.g., an author shared by multiple books). The Custom Object is an independent entity that can be retrieved via reference expansion.

### Nested Type

Nested attributes model **tabular, structured data inline** within the product variant. Example use case: nutritional information (each row = one nutrient with quantity + type code).

```
food-product-type:
  taste: text
  nutrients: Set of nutrient-information (nested ProductType)
    ├── quantityContained: Number
    └── nutrientTypeCode: String
```

**Critical limitations:**
- **Not searchable** — Nested attribute values cannot be used in CT Search queries or filters
- **Cannot be used for promotions** — discount predicates cannot target Nested attributes

---

## Nested vs Custom Object — Decision Matrix

| Criterion | Nested Type | Custom Object (via Reference) |
|-----------|------------|-------------------------------|
| Data perception | Naturally part of the product model, tabular | Independent entity — referred by products |
| Update frequency | Changes infrequently | High-update scenarios |
| Reuse | No reuse — embedded per product | Can be reused by multiple products |
| Publish required on update | Yes — product must be republished | No — updates take effect immediately |
| Scope of update | One product at a time | Update once; all referencing products reflect it |
| Payload inclusion | Included in product/projection responses | Fetched separately via reference expansion |
| Searchability | Not searchable | Can be queried directly via Custom Objects API |
| MC editability | Easy to edit in Merchant Center | Not directly editable in MC |

**Rule of thumb:** Use Nested when the data is purely read-heavy, infrequently updated, and conceptually part of the product (nutrition facts, technical specs). Use Custom Objects (via Reference attribute) when data is updated frequently, shared across products, or needs to take effect without a product republish.

---

## Attribute Groups

Attribute Groups are containers that group product attributes for **access control and workflow management**.

- Users must have edit permission for an attribute group to edit any attribute belonging to that group
- Can be used to organize attributes in custom UIs (e.g., Merchant Center custom views)
- Attributes can belong to **multiple groups simultaneously**
- **Maximum: 100 attribute groups per project**

**Example:** Create separate groups for `physical-dimensions` (objective data — any editor) vs `marketing-copy` (subjective — only marketing team has edit access).

---

## Product Types — Strategy

### Three Approaches

| Approach | Description | Trade-offs |
|----------|-------------|------------|
| **1. Catch-all type** | One `generic-object` type for all products | Simple assignment; sparse attributes; poor data quality governance |
| **2. Few coarse types** | e.g., `apparel-footwear`, `homegoods` | Moderate grouping; some shared unused attributes |
| **3. Fine-grained types** | e.g., `shirt`, `shoes`, `luggage`, `beverage` | Best data fit; complex assignment; harder integrations |

**Recommendation: Keep the number of Product Types as low as possible** for easier maintenance and simpler integrations. Fine-grained types are harder to manage when merchandisers assign products and when integration systems (PIM, ERP) must map to each type.

### How Many — Trade-offs

**More types:**
- Fewer attributes per type (tighter schema)
- Merchandiser complexity: difficult to assign products to the right type
- Integration complexity: mapping logic multiplies per type

**Fewer types:**
- More attributes per type, some will always be empty for certain products
- Simpler integrations — one mapping to rule them all
- Preferred when product data is managed and enriched in an external PIM/ERP

### Considerations Before Designing

- Total number of attributes being handled
- Which attributes are common across product categories
- How many attributes will be empty for specific product types
- How product data is maintained (external PIM/ERP vs directly in CT)
- Search requirements — attributes used for search/filter must be searchable
- Integration mapping — ProductType attribute definitions must align with source system field names

### Integration Pattern

When product master data lives in an external PIM or ERP:
- Initial load + continuous propagation is required
- If multiple source systems exist, consolidate to one before building a single CT integration
- Use Attribute Groups + field restrictions to define which system controls which attributes — prevents conflicting updates from multiple sources

---

## Product Variants

Product Variants are the concrete, sellable units (SKU-level). A Product groups variants that share most attributes but differ on **variant dimensions** (size, color, etc.).

- Each Product must have at least one variant: the **Master Variant**
- Inventory and pricing are modeled **per variant** (not per product)
- Clearly define the variant dimensions for each Product Type — this determines how many variants a product will have and how they relate to each other

**Example:** "Women's Pants" product → variants: (size 36, red), (size 38, green), (size 40, green). Size and color are the variant dimensions.

---

## Product Projections — Staged vs Current

Products in commercetools have two catalog versions:

| Version | Description |
|---------|-------------|
| **Staged** | Draft/unpublished version — where edits land before going live |
| **Current** | Published version — what the storefront reads |

**Product lifecycle states:**

| State | Description |
|-------|-------------|
| **Unpublished** | Product exists but has no "current" projection — staged data only, not visible on storefront |
| **Published** | Staged == Current — changes have been published; storefront shows this version |
| **Modified** | Changes made after publish — staged differs from current; storefront still shows the old current until next publish |

**Implications:**
- Always write to `staged`; publish to promote to `current`
- Most storefront queries should use `current` projection (default in Product Projections API)
- Promotions using categories rely on the `current` projection — if a category assignment hasn't been published, the cart discount won't match
- Attribute Groups + field restrictions can control which teams can edit which staged attributes

---

## Prices — Embedded vs Standalone

Prices are always associated with a specific product variant.

| Type | Description | Use when |
|------|-------------|----------|
| **Embedded** | Prices stored directly on the variant within the Product resource | Simpler setups; updated via `addPrice`/`changePrice` product actions |
| **Standalone** | Independent Price resources, linked to a variant via `sku` | High-volume price updates (e.g., daily price feeds); independent lifecycle from product publish |

**Key differences:**

- Embedded prices require a product publish to appear in projections; standalone prices take effect immediately
- Standalone prices support their own validity periods (`validFrom`/`validUntil`) and staged/current states independent of the product
- Use Standalone Prices when price updates should not trigger a product republish (common with pricing systems and ERP integrations)
- Both types use the same price selection logic: country, currency, customer group, channel, and date range

**Price tiers:** Both embedded and standalone prices support tiered pricing — an array of `(minimumQuantity, value)` pairs. The tier with the highest qualifying `minimumQuantity` wins.

---

## Categories

Categories are hierarchical classifications. Every product variant can be assigned to one or more categories.

**Categories serve three purposes:**
1. **Navigation** — organizing the storefront menu tree
2. **Promotions** — cart discount predicates can target categories (`categories.key contains "beds"`)
3. **Search** — faceted filtering by category in CT Search

**Hierarchy:**
- Categories form a tree via `parent` reference
- Up to N levels of nesting supported
- `categoriesWithAncestors` in predicates traverses the full ancestor chain — use this when products are in leaf categories but discounts should cover the whole tree

**Critical for discounts:** A product must be published with the category assignment before that assignment is visible in cart discount predicates. Staging a category assignment does not make it discount-eligible.

**Category external IDs:** Use `externalId` to store the category key from an external system (PIM, ERP) for sync purposes. The `key` field is the CT-native identifier used in predicates.

---

## Inventory

Inventory is tracked at the variant (SKU) level.

**Two scoping options:**

| Scope | Description |
|-------|-------------|
| **By SKU only** | One inventory entry per SKU — project-wide stock |
| **By SKU + Channel** | One entry per (SKU, Channel) pair — warehouse/location-specific stock |

Use channels to model separate warehouses, fulfillment centers, or stores. The inventory channel is set on the `supplyChannel` reference in inventory entries.

**BOPIS (Buy Online, Pick Up In Store):** Use inventory channels to represent store locations. When the customer selects a pickup store, filter available inventory by that store's channel.

**Inventory tracking modes on line items:**
- `TrackOnly` — inventory exists and is tracked but not reserved on cart add
- `ReserveOnOrder` — inventory is reserved when the order is created
- No tracking — some products don't use inventory at all

**Replenishment pattern:** On `OrderCreated` message, decrease inventory; on `OrderCancelled`, increase it back. Use the `changeQuantity` action on the inventory entry.

---

## Product Selections

Product Selections model store-specific catalogs without duplicating product data.

**Relationship:**
```
Store → (ProductSelectionList) → ProductSelection → Product
```

- A Store can reference multiple Product Selections
- A Product Selection is a named list of products (by product reference)
- One Product Selection can be assigned to many Stores (many-to-many)

**Use cases:**
- Restrict which products are visible/purchasable in a given store
- Manage regional catalogs (e.g., EU store gets products A, B, C; US store gets B, C, D)
- Exclude products from specific channels without removing them from the catalog

**IndividualExclusion mode:** A Product Selection in `IndividualExclusion` mode starts with ALL products and excludes the listed ones — useful for large catalogs where most products are visible everywhere and only a small subset is store-restricted.

---

## Infrastructure as Code (IaC) Recommendations

When managing the CT project configuration via IaC (Terraform, custom scripts):

- Manage Product Types in source control — attribute definitions are schema-critical and hard to reconstruct
- Treat Product Type changes as migrations: adding attributes is safe; removing or renaming requires a data migration plan
- Export current Product Types before any structural change and store in version control
- Use the CT Terraform provider for project settings, Tax Categories, Shipping Methods, and Product Types
- Custom Types (for custom fields) are also IaC candidates — document all resource types and field definitions
