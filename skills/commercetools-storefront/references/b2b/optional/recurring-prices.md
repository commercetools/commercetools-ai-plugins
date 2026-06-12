---
name: recurring-prices-b2b
description: B2B-specific recurring price patterns — login gate, as-associate add-to-cart with recurrenceInfo
when_to_use:
  - "Gating the B2B subscribe-and-save component on login and recurring price availability"
  - "Adding a B2B line item with recurrenceInfo via the as-associate chain"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - subscriptions
    - pricing
---

# Recurring Prices — B2B

Start from the shared [recurring prices reference](../../core/optional/recurring-prices.md) and implement Patterns 1–5 from there first. This file covers B2B-specific decisions layered on top.

## Table of Contents
- [B2B Extension: PDP Gate](#b2b-extension-pdp-gate)
- [B2B Extension: Add to Cart with Recurrence](#b2b-extension-add-to-cart-with-recurrence)
- [Checklist](#checklist)

---

## B2B Extension: PDP Gate

Extends **Pattern 3** from the shared reference.

The B2B subscription UI requires three conditions to all be true:

1. The user is **logged in** (`isLoggedIn === true`)
2. `recurringPrices.length > 0` for the selected variant
3. At least one recurrence policy is available (`recurrencePolicies.length > 0`)

Any variant that has `recurrencePrices` entries is eligible. Login is required because anonymous B2B users cannot have recurring orders.

Only show policies in the selector that have a matching entry in `recurringPrices` (`availablePolicies = policies.filter(pol => recurringPrices.some(p => p.recurrencePolicy?.id === pol.id))`). Showing all policies would let users select a schedule with no corresponding price.

---

## B2B Extension: Add to Cart with Recurrence

Extends **Pattern 5** from the shared reference.

B2B cart operations go through the as-associate chain with `associateId` (= `session.customerId`) and `businessUnitKey`. Implement a dedicated `addLineItemWithRecurrence` wrapper in `<server>/ct/cart` that calls the base `addLineItem` with `recurrenceInfo` attached.

`priceSelectionMode: 'Fixed'` is the only mode used in B2B. Do not use `'Dynamic'`.

---

## Checklist

- [ ] `recurrencePrices` mapped from `variant.recurrencePrices[]` — not filtered out of `variant.prices[]`
- [ ] `regularPrice` and `recurringPrices` separated in `PDPAddToCart` and passed as distinct props — same pattern as core Pattern 2/3
- [ ] Gate: `isLoggedIn && recurringPrices.length > 0 && recurrencePolicies.length > 0`
- [ ] `availablePolicies` filtered to only those with a matching `recurrencePrices` entry on the variant
- [ ] `addLineItemWithRecurrence` goes through the as-associate chain
- [ ] `priceSelectionMode: 'Fixed'` on all B2B recurrence add-to-cart actions
