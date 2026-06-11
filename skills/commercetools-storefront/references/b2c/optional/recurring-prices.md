---
name: recurring-prices-b2c
description: B2C-specific recurring price patterns — project-level add-to-cart with recurrenceInfo, PDP gate on recurring price availability
when_to_use:
  - "Gating B2C subscribe-and-save on recurring price availability for the selected variant"
  - "Adding a B2C line item with recurrenceInfo via the project-level cart API"
  - "Separating recurringPrices from regularPrice on the B2C PDP"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - subscriptions
    - pricing
---

# Recurring Prices — B2C

Start from the shared [recurring prices reference](../../core/optional/recurring-prices.md) and implement Patterns 1–5 from there first. This file covers B2C-specific decisions layered on top.

## Table of Contents
- [B2C Extension: PDP Gate](#b2c-extension-pdp-gate)
- [B2C Extension: Add to Cart with Recurrence](#b2c-extension-add-to-cart-with-recurrence)
- [Legacy Note: Older SDK Cast Pattern](#legacy-note-older-sdk-cast-pattern)
- [Checklist](#checklist)

---

## B2C Extension: PDP Gate

Extends **Pattern 3** from the shared reference.

Show the subscription UI when `recurringPrices.length > 0` for the selected variant. If the variant has no `recurrencePrices` entries, render the standard Add to Cart button only.

In B2C there is no required login gate — anonymous users can also see subscription pricing. If your storefront requires login before subscribing, enforce that in the add-to-cart handler (redirect to login), not by hiding the selector.

---

## B2C Extension: Add to Cart with Recurrence

Extends **Pattern 5** from the shared reference.

B2C cart operations use the project-level `apiRoot.carts()` — not the as-associate chain. The `recurrenceInfo` field on `CartAddLineItemAction` is a commercetools extension not yet in the SDK type. Cast the entire action at the call site in `<server>/ct/cart`:

```typescript
const action = {
  action: 'addLineItem',
  productId, variantId, quantity,
  ...(recurrencePolicyId ? { recurrenceInfo: { ... } } : {}),
} as CartUpdateAction;
```

When the user selects "one-time", spread nothing — do not pass `recurrenceInfo: undefined`. The absence of the field is meaningful; an explicit `undefined` may behave differently depending on the serialiser.

---

## Checklist

- [ ] Recurring prices read from `variant.recurrencePrices[]` — not filtered out of `variant.prices[]`
- [ ] Mapped `Price` type includes `recurrencePolicy?: { id: string }`
- [ ] Show subscription UI when `recurringPrices.length > 0` for the selected variant — no product attribute check required
- [ ] Cart operations use project-level `apiRoot.carts()` — not as-associate chain
- [ ] `addLineItem` action cast as `CartUpdateAction` when attaching `recurrenceInfo`
- [ ] One-time selection: omit `recurrenceInfo` entirely — do not spread `recurrenceInfo: undefined`
- [ ] Recurring prices filtered by current currency + country before passing to the selector
- [ ] Policy name resolved via `policies.find(p => p.id === price.recurrencePolicy.id)?.name`; raw ID as fallback
