# Product Attributes — Constraints, Options, and Multi-Value Patterns

## Attribute Constraints

Attribute constraints control how an attribute's value may vary across variants of the same product. Set per attribute definition on the ProductType.

| Constraint | Description | When to use |
|------------|-------------|-------------|
| **None** | No constraint — each variant can have any value | Default; most attributes |
| **SameForAll** | All variants must share the same value | Attributes that don't vary by variant (e.g., brand, material) |
| **Unique** | Each variant must have a distinct value | Attributes where no two variants should be identical (e.g., serial number) |
| **CombinationUnique** | The combination of values across `CombinationUnique` attributes must be unique per variant | Variant dimensions like size + color — prevents duplicate SKU combinations |

**CombinationUnique is the key constraint for variant dimensions.** If `Size` and `Color` are both `CombinationUnique`, the platform enforces that no two variants of the same product can have the same (size, color) pair.

---

## Attribute Options

Two boolean flags on each attribute definition:

| Option | Default | Effect |
|--------|---------|--------|
| **Required** | false | If `true`, every product of this type must have a value for this attribute. Enforced at save time. |
| **Searchable** | false | If `true`, the attribute is indexed in CT Search and can be used in full-text search and filter queries. Impacts index size. |

**Caution:** Making an attribute searchable retroactively requires a full reindex of all products using that Product Type. Decide searchability at design time when possible.

**Required vs data quality:** Use `Required = true` sparingly — it blocks import when the value is unknown. Prefer validation in your PIM/import pipeline over forcing it in CT schema.

---

## Attribute Sets (Set of X)

Any attribute type can be wrapped in a Set to allow multiple values. Examples:
- `Set of String` — multiple keywords or tags
- `Set of Enum` — multiple category codes
- `Set of Reference` — product linked to multiple related products

Set attributes can hold zero or more values. The uniqueness constraints above apply per value within the set.

**Searchability note:** `Set of Enum` and `Set of Localized Enum` attributes are searchable in CT Search. `Set of Nested` is not — Nested types are never searchable regardless of the flag.

---

## Use Case: Multiple Attribute Values per Locale from a PIM (e.g., Akeneo)

**Question:**

Product data is maintained in a PIM (Akeneo). The PIM has the ability to store more than one value for the same attribute (and same Locale) based on what Akeneo calls **channels** (data consumer). This way they can have, for example, different product descriptions for a catalog and for eCommerce.

The customer has a B2B (actually B2B2C) and a B2C application (very little in common between the two), but one source of data — including different values for some attributes for B2B and B2C.

Reference on Akeneo scopable/localisable attributes: https://help.akeneo.com/v2-discover-akeneo-concepts/95-v2-what-is-an-attribute#about-scopable-localisable-and-locale-specific-attributes

**Context:**

commercetools product attributes are structured around a `locale → value` mapping. Unlike Akeneo's channel-based scoping (where the same locale can have different values per channel/consumer), commercetools does not natively support multiple values for the same attribute and locale combination.

**Recommended Approach:**

For B2B vs B2C channel differentiation, consider one or more of the following patterns:

- **Separate Product Types** for B2B and B2C, with channel-specific attributes duplicated (e.g., `description-b2b`, `description-b2c`).
- **Store-specific or Channel-specific data** using the commercetools Stores and Channels feature to scope pricing and availability, combined with custom attributes to hold channel-specific copy.
- **Custom Attributes per channel** on the product variant, using a naming convention to differentiate values intended for different consumers (e.g., `description-ecommerce`, `description-catalog`).
- **External PIM as source of truth**, pushing channel-resolved data into commercetools at import time rather than storing multi-channel raw data inside commercetools.
