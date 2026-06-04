---
name: commercetools-checkout
description: The commercetools Checkout product — payment-only mode (integrating commercetools Checkout for payments while owning the rest of the flow), full hosted checkout (checkoutFlow), widget integration via @commercetools/checkout-browser-sdk, configuration, PSP connector setup (Stripe, Adyen, Mollie), and webhook handling. Use when integrating commercetools Checkout (the product) into a storefront or headless app — not for generic cart-to-order patterns (see commercetools-storefront).
when_to_use:
  - "Integrating the commercetools Checkout product into a storefront or headless app"
  - "Setting up payment-only mode while keeping existing address and shipping flows"
  - "Configuring PSP connectors such as Stripe, Adyen, or Mollie"
  - "Handling payment webhooks and order confirmation"
metadata:
  contentType: SKILL
  area:
    - checkout
    - payments
    - psp
---

# commercetools Checkout

The commercetools Checkout product provides hosted payment and checkout experiences via the Browser SDK.

## Integration Modes

Three modes — choose based on how much of the checkout flow commercetools Checkout should own:

- **`paymentFlow`** (payment-only) — keep existing address/shipping UI, replace only the payment step with the commercetools Checkout widget. Least invasive.
- **`checkoutFlow`** (full hosted) — replace the entire multi-step checkout with a single commercetools-hosted page covering address, shipping, and payment.
- **`expressPayment`** — add Apple Pay / Google Pay express buttons to cart or PDP. Can coexist with either mode above.

## Workflow

When this skill is invoked, always follow these steps:

1. **Search documentation first** — Before providing any guidance, fetch the latest documentation:
   ```bash
   node scripts/docs-search.mjs \
     --query "<extract key terms from user's question>" \
     --client-name "<current-client>" \
     --model "<current-model>" \
     --skill-name "commercetools-checkout" \
     --limit 3
   ```
   Use the search results to inform your response with current, accurate information.

2. **Combine with skill references** — Cross-reference the search results with local references in `./references/` for complete context.

3. **Provide implementation guidance** — Synthesize the documentation with the specific integration mode the user is targeting.

## References

See [payment-only-mode.md](./references/payment-only-mode.md) for:
- Full architecture diagram (Browser SDK → commercetools Checkout service → PSP)
- Session creation (`/api/checkout/session` → commercetools Sessions API)
- `paymentFlow`, `checkoutFlow`, and `expressPayment` implementation patterns
- PSP connector setup (Stripe, Adyen, Mollie)
- Webhook handling and order confirmation
