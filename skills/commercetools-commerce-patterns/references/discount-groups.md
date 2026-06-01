# Discount Groups and Promotion Prioritization

**Source:** Discounts Deepdive deck (Expert Services, 2026)

---

## Discount Groups

Discount Groups let you bundle multiple cart discounts under a single logical entity. This is the primary tool for managing large-scale campaigns like Black Friday or Cyber Week.

### Why use them

Without Discount Groups, disabling a campaign means toggling off each individual discount rule one by one. A Discount Group can be deactivated in a single action, instantly stopping all discounts in that group.

### Limits

- Up to **100 Cart Discounts per Discount Group**
- Up to **100 Discount Groups per project**

### How selection works within a group

When a cart qualifies for multiple discounts within the same Discount Group, the platform applies only the **one that results in the greatest saving** for the customer ("Best deal" mode). The group's `sortOrder` controls prioritization relative to other groups and standalone discounts.

Discount application sequence when Discount Groups are active:

1. Product discounts are pre-computed and applied to the product price.
2. Cart discounts are computed against the **original (non-product-discounted) price**. If cart discounts belong to a group, only the best one from that group is selected.
3. The product-discounted price is compared against the cart-discounted price, and the **lower of the two** is applied to the cart.

### Creating a group

Each Discount Group has:
- A `key` (unique identifier)
- A `rank` / `sortOrder` (between 0 and 1, higher fires first)
- A `Discount prioritization mode` — currently only "Best deal" is available (applies the discount with the lowest resulting cart price)

To assign a cart discount to a group, set the optional `Discount group` field on the cart discount. The cart discount inherits the group's priority. This can be changed at any time.

---

## Promotion Prioritization (Project-Level Setting)

Promotion Prioritization controls how Product Discounts and Cart Discounts interact when both are active on the same cart. It is a **project-level setting** configured in Merchant Center under **Settings → Project Settings → Miscellaneous**. It cannot be changed on a per-cart basis.

### Two modes

| Mode | Behavior |
|------|----------|
| **Best Deal** | The engine compares the product-discounted price vs. the cart-discounted price and applies whichever results in the lower cart price for the customer. Only one type applies (not both simultaneously). |
| **Apply 1 product discount + multiple cart discounts** (default) | One product discount applies to the product variant price, then cart discounts apply on top in sortOrder sequence. Stacking can erode margins when a cart discount applies on top of an already-discounted product price. |

### Best Deal application sequence

1. Product discounts are pre-computed and applied to the product price.
2. Cart discounts are computed against the **original (non-product-discounted) price** (if discounts belong to a Discount Group, only the best one per group is selected).
3. The product-discounted price is compared against the cart-discounted price. The **lower of the two** is applied.

**Warning:** With Best Deal disabled (default mode), a cart discount applies on top of an already-discounted product price. This can result in double-discounting and margin erosion during sales periods.

### discountTypeCombination response field

When Promotion Prioritization is active, the cart response includes a `discountTypeCombination` field that shows:
- Which mode was used (`BestDeal` or the standard mode)
- Which discount type won (`ProductDiscount` or `CartDiscount`)

Use this field for discount analytics and debugging unexpected discount outcomes.

---

## Platform Limits Reference (Cart Discounts)

| Limit | Value | Notes |
|-------|-------|-------|
| Active cart discounts without a code | 100 | Configurable |
| Total cart discounts per project (active + inactive) | ~1 million | Undocumented |
| Cart discounts requiring codes (for MC customer support) | 500 | Undocumented |
| Cart discounts per Discount Group | 100 | |
| Discount Groups per project | 100 | |
| Cart discounts per discount code | 10 | |
| Discount codes per cart | 10 | |
| Active product discounts | 500 | |

---

## Store-Specific Discount Codes

Store-specific discount codes link a discount code to store-aware cart discounts so the promotion only applies in the intended store context.

- No additional implementation work — associate the discount code with a cart discount that has a store assignment. The code automatically inherits the store context.
- The `store` field on cart discounts is an **array** — a single cart discount can apply across up to **500 stores**.
- There is no project-level toggle. The feature activates implicitly when a code is associated with a store-specific cart discount.
- Use case: merchants using stores as regional or brand partitions — prevents discount code conflicts across store boundaries and simplifies regional campaign management.
