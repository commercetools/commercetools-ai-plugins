# Bundle Discounting Pattern Using 'Buy Get Cart Discount'

---

This document outlines how to configure **bundle discounts** using the new **Buy/Get Pattern Cart Discount** functionality.

The discount will apply only when all targeted SKUs in a bundle are present in a customer's cart. These discounts can be either absolute ($ off) or relative (% off). Since there are no predefined product types representing bundles in the current system, the setup leverages the flexibility of the Buy/Get Cart Discount feature to achieve this goal.

## Key Requirements

- **Bundle Criteria**: Discounts trigger only when all SKUs in the specified bundle are in the cart.
- **Discount Type**: Support for both absolute ($ off) and relative (% off) discounts.
- **SKU-Based Trigger**: The discount applies based on the presence of specific SKUs.

## Solution Overview

The Buy/Get Cart Discount feature allows for setting conditions and outcomes for discounts, making it ideal for implementing bundle-based promotions. Here's how to set it up:

### Define the Trigger

Using the Merchant Center, specify the Variant ID (SKU) required for the discount. For example, if SKUs LPC-09, ADPC-09 & LPC-011 form the bundle:

```json
"triggerPattern": [
    {
        "type": "CountOnLineItemUnits",
        "predicate": "sku = \"LPC-09\"",
        "minCount": 1,
        "maxCount": 1
    },
    {
        "type": "CountOnLineItemUnits",
        "predicate": "sku = \"ADPC-09\"",
        "minCount": 1,
        "maxCount": 1
    },
    {
        "type": "CountOnLineItemUnits",
        "predicate": "sku = \"LPC-011\"",
        "minCount": 1,
        "maxCount": 1
    }
]
```

### Set the Discount Target

Use the **targetPattern** to apply the discount to the bundle as a whole. Specify the eligible SKUs in the Merchant Center:

```json
"targetPattern": [
    {
        "type": "CountOnLineItemUnits",
        "predicate": "sku = \"LPC-09\"",
        "minCount": 1,
        "maxCount": 1,
        "excludeCount": 0
    },
    {
        "type": "CountOnLineItemUnits",
        "predicate": "sku = \"ADPC-09\"",
        "minCount": 1,
        "maxCount": 1,
        "excludeCount": 0
    },
    {
        "type": "CountOnLineItemUnits",
        "predicate": "sku = \"LPC-011\"",
        "minCount": 1,
        "maxCount": 1,
        "excludeCount": 0
    }
]
```

While setting the **targetPattern**, you have the option of configuring the **excludeCount** setting.

The `excludeCount` feature ensures that items used to trigger a discount (e.g., "Buy 3") are excluded from receiving the discount themselves. Once a discount iteration is applied to a cart, the excluded and discounted items from that iteration are locked in and won't be considered for subsequent iterations of the same discount. If there aren't enough items left to meet the trigger condition, the discount stops.

### Set Discount Value and Distribution

Discount of this type may be absolute ($ off) or relative (% off), and you can decide if the discount should be:

- Distributed evenly across all eligible items
- Applied individually to each eligible item
- Distributed proportionately across all eligible items

**Discount Distribution is configurable for "Amount Off" and "Fixed Price" discount types. As of 2026, proportional distribution is also available for relative ("Percentage Off") discounts in Buy & Get promotions** — see the Recent Enhancements section below.

Example discount value configuration (absolute, even distribution):

```json
"value": {
    "type": "absolute",
    "money": [
        {
            "type": "centPrecision",
            "currencyCode": "EUR",
            "centAmount": 1000,
            "fractionDigits": 2
        },
        {
            "type": "centPrecision",
            "currencyCode": "GBP",
            "centAmount": 1000,
            "fractionDigits": 2
        },
        {
            "type": "centPrecision",
            "currencyCode": "USD",
            "centAmount": 1000,
            "fractionDigits": 2
        }
    ],
    "applicationMode": "EvenDistribution"
```

---

## Recent Enhancement: Proportional Distribution for Relative (%) Discounts in Buy & Get

As of 2026, relative (percentage-off) discounts in Buy & Get promotions support a new distribution mode that spreads the discount amount proportionally across **all involved line items** (both trigger and target), not just the target item.

**Why this matters for returns:**

Previously, the full percentage discount applied only to the target item. If a customer returned the trigger item, the refund calculation required manual work because the trigger item had received no discount. With proportional distribution enabled:

- The discount amount is prorated across both trigger and target line items.
- A return of the trigger item generates a correct prorated refund derivable directly from the original order — no manual recalculation needed.

**Example:** "50% off the cheapest Category A item when you spend $100+ in Category A"

With proportional distribution, the 50% discount is spread across all qualifying items rather than applied entirely to the cheapest one. This simplifies return handling and financial reconciliation.

**Available distribution modes for relative Buy & Get discounts:**

| Mode (MC label) | Behavior |
|-----------------|----------|
| `distributed proportionally across all involved items` | Prorates discount across all trigger + target items |
| `distributed evenly across all involved items` | Splits discount equally across trigger + target items |
| `only applied to the discounted items` | Previous behavior: full discount on target item only |

## Benefits of This Approach

- **Flexibility**: Supports a wide range of discount configurations (absolute or relative, distribution rules).
- **Precision**: Ensures discounts apply only when all bundle SKUs are present.
- **Efficiency**: Eliminates the need for manual bundle definitions by leveraging the Buy/Get Cart Discount functionality.
