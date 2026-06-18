# Cart Discount Scenarios — Concrete Configurations

A scenario cookbook for common cart discount requirements. Each scenario includes the business intent, the key structural choices, and the JSON that implements it.

---

## Item Discount Distribution Modes

When using an **Item** cart discount (targets line items, not total price), the amount can be distributed across eligible line items in three ways:

| Mode | Description | When to use |
|------|-------------|-------------|
| **Individually** | Discount value applied to each eligible line item independently | Percentage off (relative) discounts — each item gets the same % |
| **Distributed Evenly** | Total discount split equally across all eligible items | Fixed amount split uniformly |
| **Distributed Proportionately** | Total discount split across items in proportion to their price | Fixed or absolute amount spread fairly; avoids over-discounting cheap items |

**Configurable for:** `applicationMode` is configurable for both absolute (amount off / fixed price) and relative (percentage off) values across Item, Buy and Get, and Discount Bundles effects.

> **Note — `applicationMode` availability:** The `applicationMode` field is available on both absolute/fixed cart discount values (`CartDiscountValueAbsoluteDraft`) and relative (percentage-based) cart discount values (`CartDiscountValueRelativeDraft`). The three modes apply identically regardless of value type:
>
> - **`ProportionateDistribution`** (default): Distributes the discount proportionally across matched line items by their price
> - **`EvenDistribution`**: Distributes the discount evenly across matched line items regardless of price
> - **`IndividualApplication`**: Applies the full discount amount to each matched line item independently
>
> This matters for Buy and Get and Discount Bundles scenarios with relative values where you want to control how the percentage discount is spread — for example, distributing a 50% discount proportionately across trigger + target items rather than applying the full percentage to each item individually.

---

## Proportional Distribution in Buy & Get

Relative Buy & Get discounts can distribute the discount amount **proportionately across both trigger and target line items** — not just the target. This means:
- The discount is still calculated based on the target item's price
- But the discounted amount is prorated across all involved line items (trigger + target)
- Return scenarios are simpler: each line item carries its proportional discount, derivable without manual recalculation

**Example:** "50% off the cheapest Category A item when you spend $100+ in Category A" — with proportional distribution, the discount spreads across all qualifying items rather than applying 50% entirely to one.

Configure in MC: Buy and Get discount → "distributed proportionately across all involved items" (not "only applied to the discounted items").

---

## Buy and Get — Apply On Parameter

When the `targetPattern` is broader than a single specific variant (e.g., a category that applies to multiple line items), the **Apply On** parameter determines which items are selected for the discount:

- **Cheapest items** — sort eligible items low-to-high, apply discount starting from the least expensive
- **Most expensive items** — sort eligible items high-to-low, apply discount starting from the most expensive

If the `targetPattern` specifies a single variant SKU, this setting has no effect (only one item qualifies).

In JSON, this maps to `selectionMode`:
- `"Cheapest"` = Cheapest items
- `"MostExpensive"` = Most expensive items

---

## Buy and Get — Multiple Applications Parameter

Controls how many times a Buy and Get discount can fire per cart:

| Setting | JSON | Behavior |
|---------|------|----------|
| **Disabled** | `maxOccurrence: 1` (or omit with single match) | Fires at most once per cart |
| **Enabled (Unlimited)** | omit `maxOccurrence` or set `null` | Fires as many times as the pattern matches |
| **Enabled (Specify N)** | `maxOccurrence: N` (N > 1) | Fires up to N times per cart |

Use **Unlimited** for BOGO-style promotions that should apply to every qualifying pair. Use **Specify N** for limited promotions (e.g., "up to 3 times per order"). Use **Disabled** for one-time promotions.

---

## Core Structural Concepts

### Buy and Get vs Discount Bundles

Two target types share the `pattern` structure but serve different purposes:

| Feature | Buy and Get | Discount Bundles |
|---|---|---|
| `triggerPattern` | Required (non-empty) | Empty `[]` |
| `targetPattern` | Required | Required |
| Use case | "Buy X, get Y discounted" | "Any N of these items at discount/fixed price" |
| MC effect type | "Buy and Get" | "Discount bundles" |

**Discount Bundles** applies directly when the cart contains the targeted items — no separate trigger is needed. **Buy and Get** requires the trigger condition to be met first, then discounts the target items.

### selectionMode

When more qualifying items are in the cart than `maxCount` allows, `selectionMode` determines which items get the discount:
- `"Cheapest"` — discounts the least expensive qualifying items (protects margin on high-value items)
- `"MostExpensive"` — discounts the most expensive qualifying items (greater perceived value for the customer)

### maxOccurrence

Controls how many times the discount pattern can fire per cart. Set to `1` if the discount should apply at most once (e.g., "buy 3 get $150 off — once per cart"). Omit or set `null` for unlimited application (e.g., BOGO that applies to every pair).

### categories.key vs categoriesWithAncestors.key

- `categories.key = "beds"` — matches only items directly assigned to a category with key "beds"
- `categoriesWithAncestors.key contains "beds"` — matches items in "beds" AND any subcategory of "beds"

Use `categoriesWithAncestors` when products are organized in a hierarchy and the discount should apply to the whole tree.

### value types

- `"relative"` with `permyriad` — percentage discount (10000 = 100%, 5000 = 50%, 2500 = 25%)
- `"absolute"` with `money` array — fixed amount off (in centAmount)
- `"fixed"` with `money` array — set the total price of the targeted items to this amount (e.g., "3 items for $15 total")

---

## Buy X Get Y Scenarios

### Scenario 1: Buy 2+ of product A, get 1 of product B free

**Business intent:** Buy two or more large ceramic plates and get a classic beer mug for free.

```json
{
  "value": { "type": "relative", "permyriad": 10000 },
  "cartPredicate": "1 = 1",
  "target": {
    "type": "pattern",
    "triggerPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "product.key = \"large-ceramic-plate\"",
        "minCount": 2
      }
    ],
    "targetPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "product.key = \"classic-beer-mug\"",
        "minCount": 1,
        "maxCount": 1
      }
    ],
    "maxOccurrence": 1,
    "selectionMode": "Cheapest"
  }
}
```

Key notes:
- Trigger has no `maxCount` — 2 or more plates qualify.
- Target `maxCount: 1` ensures only 1 beer mug is made free.
- `maxOccurrence: 1` — the free mug is given once per cart regardless of plate quantity.
- `permyriad: 10000` = 100% off the target item.

---

### Scenario 2: Spend $100+ on item from category A, get $25 off an item from category B

**Business intent:** Spend at least $100 on a furniture item and get $25 off any home decor item.

```json
{
  "value": {
    "type": "absolute",
    "money": [{ "currencyCode": "USD", "centAmount": 2500, "fractionDigits": 2 }],
    "applicationMode": "ProportionateDistribution"
  },
  "cartPredicate": "1 = 1",
  "target": {
    "type": "pattern",
    "triggerPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "categories.key contains \"furniture\" and price.centAmount > 10000",
        "minCount": 1,
        "maxCount": 1
      }
    ],
    "targetPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "categories.key contains \"home-decor\"",
        "minCount": 1,
        "maxCount": 1
      }
    ],
    "selectionMode": "Cheapest"
  }
}
```

Key notes:
- `price.centAmount > 10000` inside the trigger predicate filters on per-item price (centAmount 10000 = $100.00), not cart total. This is a `CountOnLineItemUnits` predicate — it can combine category and price conditions on the line item.
- Use `lineItemGrossTotal` in `cartPredicate` instead if you need a category spend threshold (see Scenario 5).

---

### Scenario 3: Buy N of category A, get M of category B for a fixed price

**Business intent:** Buy 3 beds, get any 2 rugs for $75.

```json
{
  "value": {
    "type": "fixed",
    "money": [{ "currencyCode": "USD", "centAmount": 7500, "fractionDigits": 2 }],
    "applicationMode": "ProportionateDistribution"
  },
  "cartPredicate": "1 = 1",
  "target": {
    "type": "pattern",
    "triggerPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "categories.key contains \"beds\"",
        "minCount": 3
      }
    ],
    "targetPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "categories.key contains \"rugs\"",
        "minCount": 2,
        "maxCount": 2
      }
    ],
    "maxOccurrence": 1,
    "selectionMode": "Cheapest"
  }
}
```

Key notes:
- `value.type: "fixed"` sets the total price of the 2 target items to $75, distributed proportionately across both.
- `maxCount: 2` in target — exactly 2 rugs receive the fixed price.

---

### Scenario 4: Cart contains item from category A AND category B → $100 off order total

**Business intent:** Get $100 off if the cart has at least one bedroom furniture item AND one living room furniture item.

```json
{
  "value": {
    "type": "absolute",
    "money": [{ "currencyCode": "USD", "centAmount": 10000, "fractionDigits": 2 }],
    "applicationMode": "ProportionateDistribution"
  },
  "cartPredicate": "lineItemExists(categories.id contains \"<bedroom-category-id>\") = true and lineItemExists(categories.id contains \"<living-room-category-id>\") = true",
  "target": { "type": "totalPrice" },
  "references": [
    { "typeId": "category", "id": "<bedroom-category-id>" },
    { "typeId": "category", "id": "<living-room-category-id>" }
  ]
}
```

Key notes:
- **`lineItemExists` AND compound** — the only way to express "cart must contain at least one item from category A AND at least one from category B" in a cart predicate. Each `lineItemExists` clause is a separate condition.
- Uses category **IDs**, not keys. IDs are resolved via the `references` array on the cart discount (shown in MC as "Category" reference picker).
- `target.type: "totalPrice"` — discount applies to the overall cart total, not specific line items.
- This is a Total Price discount effect in MC, not a Buy and Get or Discount Bundles effect.

---

### Scenario 5: Spend $500+ on category A items → percentage off a specific product

**Business intent:** Spend at least $500 on furniture products and get 25% off a classic beer mug.

```json
{
  "value": { "type": "relative", "permyriad": 2500 },
  "cartPredicate": "lineItemGrossTotal(categories.key = (\"furniture\")) >= \"500.00 USD\"",
  "target": {
    "type": "lineItems",
    "predicate": "product.key = \"classic-beer-mug\""
  }
}
```

Key notes:
- **`lineItemGrossTotal(categories.key = (...)) >= "X.XX USD"`** — the only predicate function for "spend threshold on a specific category." Takes the sum of gross prices for all matching line items. Currency must be included in the string value.
- `target.type: "lineItems"` with a predicate — a simpler target form that applies to all matching line items (not capped by `maxCount`).
- This is an **Item** discount effect in MC, combined with a cart predicate.

---

## Discount Bundles Scenarios

### Scenario 6: N items for the price of M (percentage-based)

**Business intent:** Buy 5 large ceramic plates for the price of 3 (pay for 3, get 2 free → 40% off).

**Math:** 2 free items out of 5 = 40% discount. `permyriad = 4000`.

```json
{
  "value": { "type": "relative", "permyriad": 4000 },
  "cartPredicate": "1 = 1",
  "target": {
    "type": "pattern",
    "triggerPattern": [],
    "targetPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "product.key = \"large-ceramic-plate\"",
        "minCount": 5,
        "maxCount": 5
      }
    ],
    "selectionMode": "Cheapest"
  }
}
```

Key notes:
- Empty `triggerPattern: []` — this is a Discount Bundles effect, not Buy and Get.
- `minCount: 5, maxCount: 5` — the discount applies to exactly a set of 5. A second set of 5 would also qualify (unlimited occurrence).
- **N for price of M formula:** `permyriad = ((N - M) / N) * 10000`. For 5 for 3: `(2/5) * 10000 = 4000`.

---

### Scenario 7: BOGO 50% (buy 1 get 1 at half price)

**Business intent:** Buy one furniture item, get a second furniture item at 50% off.

**Math:** 50% off one item across 2 items = 25% off each. `permyriad = 2500`.

```json
{
  "value": { "type": "relative", "permyriad": 2500 },
  "cartPredicate": "1 = 1",
  "target": {
    "type": "pattern",
    "triggerPattern": [],
    "targetPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "categories.key = (\"furniture\")",
        "minCount": 2,
        "maxCount": 2
      }
    ],
    "selectionMode": "MostExpensive"
  }
}
```

Key notes:
- `permyriad: 2500` = 25% off each of 2 items = financially equivalent to 50% off 1 item.
- `selectionMode: "MostExpensive"` — discounts the 2 most expensive furniture items (maximizes customer's perceived value).
- No `maxOccurrence` → applies to every pair of qualifying items in the cart. Add `maxOccurrence: 1` to cap at one BOGO per cart.
- **BOGO 50% permyriad formula:** `permyriad = (discount_percent / 2) * 100`. For 50% off one: `(50/2) * 100 = 2500`.

---

### Scenario 8: Fixed price for up to N items

**Business intent:** Buy up to 3 classic beer mugs for $15 total.

```json
{
  "value": {
    "type": "fixed",
    "money": [{ "currencyCode": "USD", "centAmount": 1500, "fractionDigits": 2 }],
    "applicationMode": "ProportionateDistribution"
  },
  "cartPredicate": "1 = 1",
  "target": {
    "type": "pattern",
    "triggerPattern": [],
    "targetPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "product.key = \"classic-beer-mug\"",
        "minCount": 1,
        "maxCount": 3
      }
    ],
    "maxOccurrence": 1,
    "selectionMode": "Cheapest"
  }
}
```

Key notes:
- `minCount: 1, maxCount: 3` — the $15 fixed price applies to 1, 2, or 3 mugs (whichever are in the cart, up to 3).
- `applicationMode: "ProportionateDistribution"` splits the $15 across the selected items proportionally.
- `maxOccurrence: 1` — the $15 deal fires only once per cart.

---

### Scenario 9: Category quantity threshold → fixed amount off

**Business intent:** Purchase any 3 beds (category key: beds) and get $150 off those items.

```json
{
  "value": {
    "type": "absolute",
    "money": [{ "currencyCode": "USD", "centAmount": 15000, "fractionDigits": 2 }],
    "applicationMode": "ProportionateDistribution"
  },
  "cartPredicate": "1 = 1",
  "target": {
    "type": "pattern",
    "triggerPattern": [],
    "targetPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "categories.key contains \"beds\"",
        "minCount": 3
      }
    ],
    "maxOccurrence": 1,
    "selectionMode": "MostExpensive"
  }
}
```

Key notes:
- No `maxCount` on the target — the $150 is distributed across all 3+ qualifying bed items.
- `selectionMode: "MostExpensive"` — the 3 most expensive beds are selected for discount attribution.
- `maxOccurrence: 1` — $150 off is applied once even if the cart has 6+ beds.

---

### Scenario 10: First item in a category is free (including subcategories)

**Business intent:** The first product from any 'beds' category (including subcategories) is free.

```json
{
  "value": { "type": "relative", "permyriad": 10000 },
  "cartPredicate": "1 = 1",
  "target": {
    "type": "pattern",
    "triggerPattern": [],
    "targetPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "categoriesWithAncestors.key contains \"beds\"",
        "minCount": 1,
        "maxCount": 1
      }
    ],
    "maxOccurrence": 1,
    "selectionMode": "Cheapest"
  }
}
```

Key notes:
- **`categoriesWithAncestors.key contains "beds"`** instead of `categories.key contains "beds"` — this is the only way to include products assigned to subcategories of "beds" (e.g., "king-beds", "bunk-beds"). Use `categoriesWithAncestors` whenever the category hierarchy matters.
- `maxCount: 1` + `maxOccurrence: 1` = exactly one free item per cart, choosing the cheapest.

---

### Scenario 11b: Buy 2 of the same item at a fixed price, limit 5 applications per order

**Business intent:** Any 2 candle holders for $5.00 each (fixed bundle price), applicable up to 5 times per cart.

This uses Discount Bundles (no trigger) with `maxOccurrence: 5` and `Fixed price` type.

MC configuration:
- Effect type: **Discount bundles**
- Count: is equal to 2, Item Criteria: category key includes "candle-holders"
- Apply On: Cheapest items
- Multiple applications: Enabled, specify **5** times
- Discount type: Fixed price
- Discount value: EUR 5.00

API JSON:
```json
{
  "value": {
    "type": "fixed",
    "money": [{ "currencyCode": "EUR", "centAmount": 500, "fractionDigits": 2 }],
    "applicationMode": "ProportionateDistribution"
  },
  "cartPredicate": "1 = 1",
  "target": {
    "type": "pattern",
    "triggerPattern": [],
    "targetPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "categories.key contains \"candle-holders\"",
        "minCount": 2,
        "maxCount": 2
      }
    ],
    "maxOccurrence": 5,
    "selectionMode": "Cheapest"
  }
}
```

Key notes:
- `maxOccurrence: 5` caps the number of qualifying pairs — a cart with 12 candle holders gets the deal on 5 pairs (10 items), 2 items at full price.
- Fixed price type distributes the total proportionately across both items in the pair.

---

### Scenario 11c: Buy 3 of an item, get the next 2 at half-price

**Business intent:** Each time the cart has at least 3 candle holders, the next 2 (up to) get 50% off.

This uses Buy and Get: trigger on 3+ items, target up to 2 items at 50% off.

MC configuration:
- Trigger: "Each time the cart contains" — count is at least 3, category key includes "candle-holders"
- Target: "Apply Discount on" — count is up to 2, category key includes "candle-holders"
- Apply On: Cheapest items
- Multiple applications: Disabled (fires once per pattern match)
- Discount type: Percentage off, 50

API JSON:
```json
{
  "value": { "type": "relative", "permyriad": 5000 },
  "cartPredicate": "1 = 1",
  "target": {
    "type": "pattern",
    "triggerPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "categories.key contains \"candle-holders\"",
        "minCount": 3
      }
    ],
    "targetPattern": [
      {
        "type": "CountOnLineItemUnits",
        "predicate": "categories.key contains \"candle-holders\"",
        "minCount": 1,
        "maxCount": 2
      }
    ],
    "selectionMode": "Cheapest"
  }
}
```

Key notes:
- The trigger and target reference the same category — this is valid. CT handles the deduplication.
- `maxCount: 2` on target — at most 2 items receive the half-price discount per trigger occurrence.
- No `maxOccurrence` — if the cart has 9 candle holders, the pattern fires 3 times (3 trigger → 2 discounted, 3 trigger → 2 discounted, 3 trigger → 2 discounted).

---

## Gift Line Item and Shipping Scenarios

### Scenario 11: Spend $100, get a free gift item

**Business intent:** When the cart net total reaches $100, add a specific gift product to the cart at zero cost.

```json
{
  "value": {
    "type": "giftLineItem",
    "product": { "typeId": "product", "id": "<gift-product-id>" },
    "variantId": 1
  },
  "cartPredicate": "cartNetTotal >= \"100.00 USD\""
}
```

Key notes:
- Use `value.type: "giftLineItem"` — the dedicated gift value type. When the `cartPredicate` evaluates true, commercetools automatically **adds** the referenced product variant to the cart as a gift; you do not pre-add it and do not set a `target`. The gift product variant must have a price that can be selected for the cart (add `supplyChannel`/`distributionChannel` to the value if channel-specific price selection is needed).
- In the cart response, the gifted line item has `"lineItemMode": "GiftLineItem"`, `quantity: 1`, and `totalPrice.centAmount: 0`. This mode is what distinguishes gift items from regular purchased items.
- A 100% relative discount on a normal line item does **not** produce a `GiftLineItem` — the line item keeps `lineItemMode: Standard` and is merely discounted to zero. Use `giftLineItem` for a true auto-added gift.
- Only one item can be added per gift line item discount; for "customer's choice of gift from N items," let the customer add their chosen product and price it to zero with a separate relative/absolute discount instead.
- The cart predicate uses `cartNetTotal` (excludes shipping and tax). Use `totalPrice` to include shipping in the threshold calculation.

---

### Scenario 12: Free shipping when cart total ≥ $35

**Business intent:** Remove the shipping fee entirely when the cart net total is $35 or more.

```json
{
  "value": { "type": "relative", "permyriad": 10000 },
  "cartPredicate": "cartNetTotal >= \"35.00 USD\"",
  "target": { "type": "shipping" }
}
```

Key notes:
- `target.type: "shipping"` — applies the discount to the cart's shipping cost. This is distinct from the `lineItems` and `totalPrice` targets.
- `permyriad: 10000` = 100% off shipping. For partial shipping discounts (e.g., "$5 off shipping"), use `"type": "absolute"` with a `money` array instead.
- In the cart response, `shippingInfo.price.centAmount` will show the original shipping rate, while `shippingInfo.discountedPrice.centAmount` will show `0`.
- Shipping discounts can also be configured three ways: via shipping methods in Project Settings, as a cart discount targeting `shipping`, or through discount codes. The cart discount approach shown here is the most flexible for conditional free-shipping campaigns.
- The `cartNetTotal` predicate computes the sum of all line item prices before shipping and tax. This ensures the threshold is based on product spend only, not the shipping cost itself.

---

## Promotion Prioritization — Product Discounts vs Cart Discounts

When both a Product Discount and Cart Discount apply to the same item, the default behavior is **stacking** (both apply). This can erode margins when a cart discount applies on top of an already-discounted product price.

**Promotion Prioritization** is a **project-level setting** in Merchant Center → Settings → Project Settings → Miscellaneous:

| Mode | Behavior |
|------|----------|
| **Best Deal** | Engine compares product discount and cart discount; applies only the one giving the greatest saving to the customer. The cart response includes a `chosenDiscountType` field showing which type won. |
| **Apply 1 product discount + multiple cart discounts** | Default stack behavior — one product discount applies, then cart discounts stack on top |

Use **Best Deal** when product discounts and cart discounts can target the same items and you want to prevent double-dipping. This setting cannot be overridden on a per-cart basis.

---

## Discount Codes — Key Limits and Store-Specific Behavior

### Usage limits

| Field | Description |
|-------|-------------|
| `maxApplications` | Maximum total uses of this code across all customers |
| `maxApplicationsPerCustomer` | Maximum uses per individual customer |

Validity periods (`validFrom` / `validUntil`) are optional. No validity period = code is always valid until manually deactivated.

### Capacity limits

- One discount code can reference **up to 10 cart discounts**
- A cart can have **up to 10 discount codes** applied simultaneously

### Store-specific discount codes

Discount codes can be restricted to specific stores by associating them with **store-aware cart discounts**:

- No additional implementation required — link the discount code to a cart discount that has `stores` set
- The code automatically inherits the store context from the cart discount
- The `stores` field on a cart discount is an array — one discount can apply across multiple stores
- A cart discount can be associated with up to **500 stores**; a discount code reaches stores indirectly through the cart discount(s) it references
- Feature activates implicitly when you associate a code with a store-specific cart discount — no project-level toggle

**Use case:** Multi-region or multi-store merchants where a promotional code should only work in the intended regional store. Prevents code conflicts across stores and simplifies campaign management.
