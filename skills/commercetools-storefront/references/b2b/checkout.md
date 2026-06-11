---
name: checkout
description: B2B checkout flows — cart checkout with order placement and "Request a Quote" submission, BU address selection, approval flow handling.
when_to_use:
  - "Building B2B checkout flows"
  - "Implementing quote request submission from the cart"
  - "Handling BU address selection at checkout"
  - "Managing approval-pending orders"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - checkout
    - quotes
    - approval-workflows
---

# Checkout — B2B

See the shared [reference](../core/checkout-page.md) for the multi-step page structure, shipping method selection, payment step, and confirmation page. This file covers B2B-specific details: two checkout flows, address sources, order placement sequence, and quote request submission.

## Table of Contents
- [Flow 1: Cart Checkout](#flow-1-cart-checkout)
- [Flow 2: Request a Quote](#flow-2-request-a-quote)
- [Checklist](#checklist)

---

## Flow 1: Cart Checkout

### Address Step — Saved Addresses from the Business Unit

The address step reads saved addresses from the active business unit, not from the commercetools customer account directly. Fetch addresses from the BU object (`businessUnit.addresses`) and identify defaults via `businessUnit.defaultShippingAddressId` and `businessUnit.defaultBillingAddressId`. Auto-select these on load; allow the user to pick another BU address.

**IMPORTANT** Never allow user to enter their own address. No address form in checkout. If there are no addresses in business unit, show user and error.

### Order Placement Sequence

```
addresses (shipping + billing) → shipping method → payment (Checkout SDK) → confirmation
```

1. **Addresses step** — shipping and billing addresses persisted to cart when moving to the next step. All cart writes use the as-associate chain — see the [reference](./cart.md).
2. **Shipping step** — user selects a method with `shippingMethodId`
3. **Payment step** — Checkout frontend SDK mounts and handles payment capture and order placement. If a PO Number payment method is configured in the Checkout frontend SDK, it will appear automatically — no custom PO Number field is needed in the checkout form.
4. **Confirmation** — SDK signals completion → clear `cartId` from session → redirect to `/checkout/confirmation?orderId=<id>`

Order placement is handled entirely by the Checkout frontend SDK. Do not implement a separate `POST /<api>/checkout` route for order creation.

> **Reference:** See the [Checkout frontend SDK](../../../commercetools-checkout/references/payment-only-mode.md) implementation skill for SDK setup and the order-completion event handler.

### BU + Store Validation

Before rendering the checkout page, validate that `session.businessUnitKey` and `session.storeKey` are present. Return a `400` or redirect to an error page if either is missing — a cart without BU/store context cannot be checked out via the as-associate chain.

### Approval Flows

If the order triggers a B2B approval rule, commercetools creates an `ApprovalFlow` automatically upon order creation. 
---

## Flow 2: Request a Quote

### Entry Point

The cart page renders a **Request a Quote** button below the standard Checkout button. Clicking it navigates to the quote request flow — it does not submit anything immediately.

### Steps

```
addresses (shipping + billing) → shipping method → comment → submit
```

Steps 1 and 2 (addresses and shipping method) follow the same patterns as Flow 1 — BU address selection and shipping method selection from the shared reference. Step 3 is specific to this flow.

**Step 3 — Comment**

A free-text comment field. The value is stored on the quote request as the `comment` field. It is optional but the step must always be shown so the user has the opportunity to add context for the seller.

### Submission

**Shipping address requirement:** commercetools requires a shipping address on the cart before a `QuoteRequest` can be created. The address step in this flow satisfies that — do not skip it or allow bypassing it. If the BU has no addresses and none can be selected, show an error before reaching this step.

The submit button is labelled **Submit Quote Request**. Clicking it calls an action that creates a commercetools `QuoteRequest` from the current cart. All cart writes up to this point (addresses, shipping method) use the as-associate chain.

After a successful submission, clear `cartId` from the session and redirect to:

```
/checkout/quote-request-confirmation?quoteRequestId=<id>
```

### Confirmation Page

The quote-request confirmation view reads `quoteRequestId` from the URL query and fetches the quote request to display its details (line items, addresses, shipping method, comment, submission date).

After submission, the quote progresses through seller review and negotiation. See [quotes.md](./quotes.md) for the dashboard view and [quote-actions.md](./quote-actions.md) for buyer acceptance, decline, and renegotiation.

---

## Checklist

- [ ] Extends shared checkout patterns (page structure, shipping methods, payment SDK, confirmation)
- [ ] Address step reads BU addresses, auto-selects `defaultShippingAddressId` / `defaultBillingAddressId`
- [ ] All cart writes in checkout use the as-associate chain
- [ ] `session.businessUnitKey` and `session.storeKey` validated before rendering checkout
- [ ] Order placement driven by Checkout frontend SDK — no custom order route for cart checkout
- [ ] PO Number not added manually — relies on Checkout SDK configuration if needed
- [ ] Confirmation page handles `order.orderState === 'Open'` (approval pending) gracefully
- [ ] Cart page shows **Request a Quote** button below the Checkout button
- [ ] Quote request flow: addresses and shipping use the same BU patterns as Flow 1
- [ ] Cart has a shipping address before `QuoteRequest` creation (enforced by the address step)
- [ ] Comment step always rendered; value stored as `comment` on the QuoteRequest
- [ ] Submit button labelled "Submit Quote Request"
- [ ] `cartId` cleared from session after quote request creation
- [ ] Quote request confirmation at `/checkout/quote-request-confirmation?quoteRequestId=<id>`
- [ ] `cartId` cleared from session after order or quote order completion
