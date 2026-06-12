---
name: commercetools-checkout
description: The Checkout — payment-only mode (integrating Checkout for payments while owning the rest of the flow), full hosted checkout (checkoutFlow), widget integration via @commercetools/checkout-browser-sdk, configuration, PSP connector setup (Stripe, Adyen, Mollie), and webhook handling. Use when integrating Checkout (the product) into a storefront or headless app — not for generic cart-to-order patterns (see commercetools-storefront).
when_to_use:
  - "Integrating the Checkout into a storefront or headless app"
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

# Checkout

The Checkout provides hosted payment and checkout experiences via the Browser SDK.

## Integration Modes

Three modes — choose based on how much of the checkout flow Checkout should own:

- **`paymentFlow`** (payment-only) — keep existing address/shipping UI, replace only the payment step with the Checkout widget. Least invasive.
- **`checkoutFlow`** (full hosted) — replace the entire multi-step checkout with a single commercetools-hosted page covering address, shipping, and payment.
- **`expressPayment`** — add Apple Pay / Google Pay express buttons to cart or PDP. Can coexist with either mode above.

## Workflow

When this skill is invoked, always follow these steps:

1. **Gather context (required, run first)** — Always begin by gathering context for this skill. This is the mandatory grounding step: it gathers the latest verified documentation as context for you (the agent). **Do not skip it, and do not replace it with another tool** (such as an MCP documentation-search tool) — run this command:
   ```bash
   node scripts/gather-context.mjs \
     --query "<extract key terms from user's question>" \
     --client-name "<current-client>" \
     --model "<current-model>" \
     --skill-name "commercetools-checkout" \
     --limit 3
   ```
   Use its output as your primary grounding. You *may additionally* use other tools (such as the commercetools documentation MCP) for deeper, follow-up search.

2. **Combine with skill references** — Cross-reference the analysis output with local references in `./references/` for complete context.

3. **Provide implementation guidance** — Synthesize the documentation with the specific integration mode the user is targeting.

## References

See [payment-only-mode.md](./references/payment-only-mode.md) for:
- Full architecture diagram (Browser SDK → Checkout service → PSP)
- Session creation (`/<api>/checkout/session` → commercetools Sessions API)
- `paymentFlow`, `checkoutFlow`, and `expressPayment` implementation patterns
- PSP connector setup (Stripe, Adyen, Mollie)
- Webhook handling and order confirmation
