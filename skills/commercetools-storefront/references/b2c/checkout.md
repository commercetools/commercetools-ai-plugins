---
name: checkout
description: B2C checkout extensions covering saved addresses from customer account, auto-selection of default addresses, and order placement sequence.
when_to_use:
  - "Building the B2C checkout flow"
  - "Implementing saved address selection"
  - "Handling default address auto-selection"
  - "Integrating payment SDK with checkout"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - checkout
---

# Checkout — B2C

See the shared [reference](../core/checkout-page.md) for the multi-step page structure, shipping method selection, payment step, and confirmation page. This file covers B2C-specific details: the address step and order placement sequence.

---

## Address Step — Saved Addresses from Logged-In Customer

The address step reads saved addresses from the logged-in commercetools customer account via `useAccount()`. On load, auto-select the address flagged `isDefaultShipping` for the shipping field and `isDefaultBilling` for the billing field. The user may pick a different saved address from the list or enter a new one manually.

Saved addresses are display-only in the selector — editing or adding a new address during checkout writes only to the cart (when moving to the next step), not back to the customer account.

---

## Order Placement Sequence

```
addresses (shipping + billing) → shipping method → payment (Checkout SDK) → confirmation
```

1. **Addresses step** — shipping and billing addresses persisted to cart in real time
2. **Shipping step** — user selects a method
3. **Payment step** — Checkout frontend SDK mounts, handles payment capture and order placement
4. **Confirmation** — SDK signals completion → clear `cartId` from session → redirect to `/checkout/confirmation?orderId=<id>`

Order placement is handled entirely by the Checkout frontend SDK on the payment step. Do not implement a separate `POST /<api>/checkout` route for order creation.

> **Reference:** See the [Checkout frontend SDK](../../../commercetools-checkout/references/payment-only-mode.md) implementation skill for SDK setup and the order-completion event handler.

---

## Checklist

- [ ] Extends shared checkout patterns (page structure, shipping methods, payment SDK, confirmation)
- [ ] Address step auto-selects `isDefaultShipping` / `isDefaultBilling` from `useAccount()`
- [ ] Saved address list shown as selectable options; manual entry also allowed
- [ ] Address changes debounced to `PATCH /<api>/cart` (inherited from shared)
- [ ] Shipping method filtered by session currency (inherited from shared)
- [ ] Order placement driven by Checkout frontend SDK — no custom order route
- [ ] `cartId` cleared from session after SDK order completion event
