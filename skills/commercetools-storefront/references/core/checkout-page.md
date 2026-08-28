---
name: checkout-page
description: Multi-step checkout structure, address step, shipping method selection, payment via commercetools SDK, and confirmation page patterns.
when_to_use:
  - "Building the checkout flow"
  - "Implementing shipping method selection"
  - "Integrating the payment step with Checkout SDK"
  - "Handling order confirmation pages"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - session
---

# Checkout Page

**Impact: HIGH — The checkout route is the revenue path. A failed order placement or stale cart version drops the conversion entirely.**

This reference covers the shared checkout structure used by both B2C and B2B storefronts: the multi-step page shell, shipping method selection, payment via the Checkout frontend SDK, and the confirmation page. Address step details and order placement are storefront-specific — see the relevant extension file.

## Table of Contents
- [Pattern 1: Multi-Step Checkout Structure](#pattern-1-multi-step-checkout-structure)
- [Pattern 2: Address Step](#pattern-2-address-step)
- [Pattern 3: Shipping Method Selection](#pattern-3-shipping-method-selection)
- [Pattern 4: Payment Step — Checkout Frontend SDK](#pattern-4-payment-step--checkout-frontend-sdk)
- [Pattern 5: Confirmation Page](#pattern-5-confirmation-page)
- [Checklist](#checklist)

---

## Pattern 1: Multi-Step Checkout Structure

The checkout is URL-based with three steps: `addresses`, `shipping`, `payment`. The index reads the cart state and redirects to the furthest step the user can access. The decision is framework-agnostic:

- `hasAddr = !!(cart.shippingAddress?.streetName && cart.billingAddress?.streetName)`; `hasMethod = !!cart.shippingInfo`.
- `hasAddr && hasMethod` → `payment`; else `hasAddr` → `shipping`; else → `addresses`.
- Each step repeats the guard and redirects back when prerequisites are unmet (e.g. on `shipping` with no address → `addresses`).
- Wait until the cart has loaded before deciding (skip while `cart === undefined`).

Layout: two-column grid — steps on the left (3 cols), sticky order summary on the right (2 cols).

The index and step components are client components that drive step changes through the framework's client navigation (locale-aware replace).

> Find the adapter's `concept-mapping.md` for the client-navigation shell implementation.

---

## Pattern 2: Address Step

Address step details differ between storefronts — saved address sources and validation rules vary. See the storefront-specific extension for the full address step implementation.

- Only store address details when moving to the next step
- Display the "State" field only when the selected country requires it

---

## Pattern 3: Shipping Method Selection

Shipping methods are fetched via a server endpoint that filters by the **session currency** — a method with no rate for the current currency must never appear. The endpoint reads `currency` from `getLocale()`, loads `getShippingMethods()`, filters to methods with a matching rate, and returns `{ shippingMethods }` (or `[]` on failure).

On the client, a client state hook reads the shipping-methods server endpoint. Its cache key is keyed on the current `country` + `currency` (null until both are known, so it doesn't fetch prematurely). Configure it not to re-fetch on tab focus — shipping methods change rarely.

When the user selects a method, call the cart update endpoint with `shippingMethodId` and update the client state-manager/cache/state from the response (no refetch).

---

## Pattern 4: Payment Step — Checkout Frontend SDK

The payment step is handled entirely by the Checkout frontend SDK, which renders the full payment UI and drives order placement.

> **Reference:** See the [Checkout frontend SDK](../../../commercetools-checkout/references/payment-only-mode.md) implementation skill for full setup, component mounting, and event handling.

Key rules:
- Do not implement a custom payment form — mount the SDK component and let it manage the flow.
- The SDK handles order creation internally; do not create a method/call to handle order creation.
- After the SDK signals order completion, clear `cartId` from the session and redirect to the confirmation page.

---

## Pattern 5: Confirmation Page

The confirmation page is **server-rendered**: it fetches the order directly from commercetools by `orderId` from the URL. Do not rely on the client state cache here — the order may not yet appear in a freshly revalidated client state-manager/cache. Fetch `getOrderById(orderId)` in a `try/catch`; on failure, show a minimal confirmation without line items.

Both flows (cart checkout and quote checkout) redirect to `/checkout/confirmation?orderId=<id>` on success.

> Find the adapter's `concept-mapping.md`. Example: **Next.js:** the Server Component shell (`app/[locale]/checkout/confirmation/[orderId]/page.tsx` with `await params`) is in the adapter's [concept-mapping.md](../stack/nextjs/concept-mapping.md).

---

## Checklist

- [ ] Checkout index redirects to the correct step based on cart state
- [ ] Step skip guards redirect back if prerequisites are not met
- [ ] The shipping-methods endpoint filters by session currency
- [ ] Address changes debounced to update cart address method
- [ ] Payment step mounts the Checkout frontend SDK — no custom payment form
- [ ] `cartId` cleared from session after the SDK signals order completion
- [ ] Confirmation page is server-rendered and fetches the order by ID from commercetools
