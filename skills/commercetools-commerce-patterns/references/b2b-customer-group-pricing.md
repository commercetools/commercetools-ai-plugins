# B2B Customer Group Pricing

---

## Overview

Customer Groups are the primary mechanism for applying differentiated pricing to B2B buyers in commercetools. They work as one of several **price selection parameters** that the platform evaluates at query time and at line-item addition to select the correct price from a product variant's price list.

---

## Price Selection Parameters

commercetools uses a combination of the following parameters to select a price from the variant's embedded price array:

| Parameter | Notes |
|---|---|
| `currencyCode` | Required. Drives which price entry is eligible. |
| `country` | Optional. Narrows selection to country-specific prices. |
| `customerGroup` | Optional. Narrows selection to group-specific prices. |
| `channel` | Optional. Narrows selection to channel-specific prices (e.g. distribution channel). |
| `priceDate` (`validFrom` / `validTo`) | Optional. Filters prices that are valid at the given point in time. |

These parameters are also known as **price selection criteria**.

---

## How Price Selection Works

### 1. Product Projection Search

If currency and additional price selection parameters are passed in a Product Projection Search request, the platform applies price selection logic and returns the matching price for each product/variant. See the official docs: [Price Selection](https://docs.commercetools.com/api/pricing-and-discounts-overview#price-selection).

### 2. Cart Line Items

When `addLineItem` is called on a cart, the platform uses the cart's own price selection parameters (`currencyCode`, `country`, `customerGroup`, `channel`) to resolve the price for that line item. For price selection to work correctly:

- The relevant price selection parameters must be set **on the cart** before or at the time line items are added.
- The Customer Group is typically derived from the customer's profile and propagated to the cart automatically, but it can also be set explicitly.

Reference: [Carts API](https://docs.commercetools.com/api/projects/carts)

### 3. Fallback / Default Price

It is strongly recommended to include a **default price** (one without any customer group, channel, or country constraint) within the variant's pricing model. This serves as a fallback when none of the more specific price selection criteria match, preventing scenarios where no price is resolved.

---

## Customer Group Constraints and Limitations

### Deletion Constraint

A Customer Group **cannot be deleted** while it is still referenced by product pricing entries. Attempting to do so returns an HTTP `400` error with the message:

> "Can not delete a source while it is referenced from at least one 'product'."

**Migration workflow** when replacing a Customer Group:
1. Create the new Customer Group.
2. Update all product prices (and any discounts referencing the old group) to reference the new Customer Group.
3. Delete the old Customer Group once no pricing entries reference it.

### Multiple Groups Per Customer

A Customer can hold **multiple Customer Groups** via `customerGroupAssignments` (up to 500). The legacy single `customerGroup` field still exists but is no longer the only option. Price selection resolves the **best qualifying price across all assigned groups**. If a buyer's pricing tier changes (e.g. they move from "Silver" to "Gold"), update the customer's group assignments accordingly.

---

## B2B Recommendations

- **Segment pricing tiers** using Customer Groups (e.g. `tier-bronze`, `tier-silver`, `tier-gold`, `distributor`, `reseller`).
- **Always define a base/default price** to avoid null prices for customers not assigned to any group.
- **Use Channel + Customer Group** together when pricing also varies by distribution channel (e.g. online vs. in-store B2B).
- **Automate group assignment** as part of the customer onboarding or account management workflow so carts always carry the correct Customer Group from the start.
