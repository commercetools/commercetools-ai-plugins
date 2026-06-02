---
name: recurring-prices
description: Shared patterns for surfacing recurring (subscription) prices from the commercetools product search api through the BFF mapper to the PDP selector component — variant.recurrencePrices[] is the standard field in both B2B and B2C
when_to_use:
  - "Building a subscribe-and-save or subscription pricing UI on the PDP"
  - "Mapping recurring prices in the product variant mapper"
  - "Gating the SubscribeAndSave component by eligibility and price availability"
  - "Adding a line item to cart with recurrenceInfo attached"
  - "Resolving policy names for display in cart items or mini cart"
metadata:
  contentType: REFERENCE
  area:
    - subscriptions
    - pricing
    - pdp
---

# Recurring Prices

**Impact: MEDIUM — Recurring prices are the UI entry point for subscriptions. Getting the gating wrong (showing subscription UI on ineligible products, or hiding it when prices exist) is a UX defect.**

Recurring prices represent the discounted or fixed price a customer pays when they commit to a recurring delivery. They are regular commercetools price entries augmented with a reference to a `RecurrencePolicy`. The policy reference is the link that connects a price to a schedule.

## Table of Contents
- [Pattern 1: The Recurring Price Signal](#pattern-1-the-recurring-price-signal)
- [Pattern 2: BFF Mapper](#pattern-2-bff-mapper)
- [Pattern 3: PDP Separation and Gate](#pattern-3-pdp-separation-and-gate)
- [Pattern 4: Policy Selector Component](#pattern-4-policy-selector-component)
- [Pattern 5: Add to Cart with Recurrence](#pattern-5-add-to-cart-with-recurrence)
- [Tips and Tricks](#tips-and-tricks)

---

## Pattern 1: The Recurring Price Signal

A price is "recurring" when it carries a `recurrencePolicy` reference. A price without this reference is a one-time price. The reference holds only the policy `id` — the full policy name and schedule must be resolved separately from the recurrence policies list.

commercetools stores recurring prices in a dedicated array on the product variant: `variant.recurrencePrices[]`. This is a first-class field in the commercetools platform SDK — available in both B2B and B2C, no cast required, no extra expand needed. The array comes back automatically in the standard product projection alongside `variant.prices[]`.

Each entry in `recurrencePrices` has the same money shape as a regular price entry plus a `recurrencePolicy: { id, typeId: 'recurrence-policy' }` reference.

The mapped `Price` type in app code should expose `recurrencePolicy?: { id: string }` so the rest of the app can check presence without knowing the commercetools field structure.

---

## Pattern 2: BFF Mapper

Extract the recurring price signal in the product mapper (`lib/mappers/product.ts`), not in route handlers or components. The mapper is the single place that reads from the commercetools SDK response. By the time a `Price` object reaches the UI, it should already have `recurrencePolicy` normalised to `{ id: string } | undefined`.

The mapped `Price` interface must include:

```
recurrencePolicy?: { id: string }   // present iff this is a recurring price
```

Map `v.recurrencePrices` in the variant mapper alongside `v.prices`. The `recurrencePolicy` reference is already typed in the SDK — no cast required. Preserve it as-is on each mapped price entry.

---

## Pattern 3: PDP Separation and Gate

On the PDP, split prices by the presence of `recurrencePolicy`:

- `regularPrice` — the first price without `recurrencePolicy`
- `recurringPrices` — all prices with `recurrencePolicy`

Gate the subscription UI on two conditions:
1. A context-specific eligibility check — see B2B/B2C files (e.g. login state, BU membership)
2. `recurringPrices.length > 0` for the selected variant

If either condition is false, render the standard Add to Cart button only.

Component chain: `PDPAddToCart → PDPActions → SubscribeAndSave / SubscribeAndSaveBox`

The separation into `regularPrice` and `recurringPrices` should happen as high in the tree as possible (in `PDPAddToCart`) so that leaf components receive typed, already-partitioned data rather than raw arrays.

---

## Pattern 4: Policy Selector Component

The subscription selector lets users choose between a one-time purchase and one of the available recurring schedules.

**Props the component needs:**
- `oneTimePrice` — the regular price for the one-time option
- `recurringPrices` — array of recurring prices, each with a `recurrencePolicy.id`
- `policies` — the full `RecurrencePolicy[]` list for resolving names and schedules
- `value` — `'one-time'` or a `recurrencePolicyId`
- `onChange` — callback receiving `'one-time'` or the selected policy ID

**Policy name lookup:** map `price.recurrencePolicy.id` → `policies.find(p => p.id === id)?.name`. Render the raw ID as a fallback if the policy is not in the list.

**Show only policies that have a price:** filter `availablePolicies` to those that have a matching entry in `recurringPrices`. Showing all policies would let users select a schedule with no price defined for the current variant.

---

## Pattern 5: Add to Cart with Recurrence

When the user confirms their selection:

- If selected value is `'one-time'`: add the line item with no `recurrenceInfo`. Do not pass `recurrencePolicyId` at all — do not pass it as `undefined` or `null`.
- If selected value is a policy ID: attach `recurrenceInfo` to the `addLineItem` action.

The `recurrenceInfo` shape:
```
recurrenceInfo: {
  recurrencePolicy: { typeId: 'recurrence-policy', id: recurrencePolicyId },
  priceSelectionMode: 'Fixed',
}
```

`priceSelectionMode: 'Fixed'` tells commercetools to use the specific recurring price for this policy, not to run dynamic pricing.

This field is a commercetools extension not in the `CartAddLineItemAction` SDK type. Cast the action at the call site in `lib/ct/cart.ts` — not in route handlers or components.

---

## Tips and Tricks

**Filter by currency and country before rendering:** `recurringPrices` may contain entries for multiple currencies and countries. Filter to the current locale's currency + country before passing them to the selector.

**Policy display labels:** use a `formatInterval(policy.schedule)` helper to convert `{ intervalUnit: 'Months', value: 2 }` into "Every 2 months". Handle both singular and plural variants of `intervalUnit` (e.g. `'month'` and `'months'`) — commercetools data uses both forms inconsistently.

**SWR deduplication for policies:** two hooks typically exist — one returning `Map<id, label>` for inline display in cart items and mini cart, and one returning the full `RecurrencePolicy[]` for the selector. Both must share the same SWR cache key so only one HTTP request is made.

**Do not add recurrencePrices to PRODUCT_PROJECTION_EXPANDS:** they come back automatically in product projections. Adding them to the expand list has no effect.
