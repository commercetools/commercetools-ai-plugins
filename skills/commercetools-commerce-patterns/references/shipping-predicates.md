# Shipping Predicates: Syntax, Custom Field Workaround, and Warehouse Eligibility Patterns

## The Core Limitation: Score Is Not Supported in Shipping Predicates

Score is not supported in shipping predicates. The solution is to copy the score (when it is calculated) to a custom field in the cart. Since custom fields can be used in predicates, this resolves the limitation.

## Custom Field Workaround

When the cart score is calculated (e.g. the distance between warehouse and shipping address), copy that value into a **custom field on the cart** so it can be referenced in a shipping predicate.

Two custom fields are needed:

1. **`custom.distance`** — the distance value (same integer as the cart score)
2. **`custom.fulfillment_wh`** — the warehouse or fulfillment center that will serve the cart/order (must also be set as a custom field to be used in the predicate)

## Predicate Syntax Example: Warehouse Eligibility with Distance Range Exclusion

The following predicate ensures the warehouse `WH-6` can only ship when the distance is **outside** the unsupported range of 20–30 miles. For all other warehouses the shipping method is unrestricted:

```
( custom.fulfillment_wh = "WH-6" and (custom.distance < 20 or custom.distance > 30) ) OR custom.fulfillment_wh != "WH-6"
```

### How to read this predicate

- If the fulfillment warehouse is `WH-6`, the shipping method is only valid when the distance is less than 20 OR greater than 30 (i.e. the 20–30 mile dead zone is excluded).
- If the fulfillment warehouse is **not** `WH-6`, the shipping method is always valid (no distance restriction applies for other warehouses).

## Real-World Implementation Note

> The customer that raised this problem opted to use this technique but used **separate shipping methods for different warehouses or different countries** with the appropriate predicates to make sure only the right shipping methods are retrieved when `Get ShippingMethods` is invoked.

This means rather than one complex predicate, they created per-warehouse shipping methods, each with a predicate scoped to that warehouse's constraints.

## Key Rules

- Cart score must be an **integer**. For fractional distances, multiply by 10 or 100 before storing.
- Cart score **cannot** be referenced directly in shipping predicates — always mirror it to a custom field.
- The fulfillment warehouse must also be stored as a custom field for predicate-based filtering.
- Use `Get ShippingMethods for a Cart` (not the generic endpoint) so predicates are evaluated against the cart's custom fields.

## Useful Links

- https://docs.commercetools.com/tutorials/shipping-method-with-predicate
- https://docs.commercetools.com/api/projects/predicates
- https://docs.commercetools.com/api/projects/shippingMethods#get-shippingmethod
- https://docs.commercetools.com/api/projects/shippingMethods#get-shippingmethods-for-a-cart-and-location
