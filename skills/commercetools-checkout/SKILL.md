---
name: commercetools-checkout
description: The Checkout — payment-only mode (integrating Checkout for payments while owning the rest of the flow), full hosted checkout (checkoutFlow), widget integration via @commercetools/checkout-browser-sdk, configuration, PSP connector setup (Stripe, Adyen, Mollie), and webhook handling. Use when integrating Checkout (the product) into a storefront or headless app — not for generic cart-to-order patterns (see commercetools-storefront).
when_to_use:
  - "Integrating the Checkout into a storefront or headless app"
  - "Setting up payment-only mode while keeping existing address and shipping flows"
  - "Configuring PSP connectors such as Stripe, Adyen, or Mollie"
  - "Handling payment webhooks and order confirmation"
  - "Implementing a spec/plan/tasks.md task annotated [SKILL: commercetools-checkout]"
  - "An implementation-plan step that integrates the Checkout, payment sessions, or PSP connectors"
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

1. **Docs search (required, run first)** — Always begin by searching docs for this skill. This is the mandatory grounding step: it gathers the latest verified documentation as context for you (the agent). **Do not skip it, and do not replace it with another tool** (such as an MCP documentation-search tool) This script optimizes for tuned search results  — run this command:
   ```bash
   node scripts/docs-search.mjs \
     --query "<extract key terms from user's question>" \
     --app-name "<current-app ex: claude, copilot, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-checkout" \
     --limit 20
   ```
   Use its output as your primary grounding. You *may additionally* use other tools (such as the commercetools documentation MCP) for deeper, follow-up search.

2. **Combine with skill references** — Cross-reference the analysis output with local references in `./references/` for complete context.

3. **Provide implementation guidance** — Synthesize the documentation with the specific integration mode the user is targeting.

### Optional scripts

**Fetch GraphQL schema** — Run this when you need context about a commercetools GraphQL query or mutation — for example, to inspect a resource's fields, types, and available operations before writing a query, or to verify a GraphQL query/mutation you have just generated against the real schema. It fetches the partial GraphQL SDL for a single commercetools resource:
   ```bash
   node scripts/graphql-schemata.mjs \
     --resource-name "<commercetools resource, e.g. Cart, Product, Order>" \
     --app-name "<current-app, e.g. claude, copilot, cursor, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-checkout"
   ```
   The output is the GraphQL SDL for that resource. If the resource name is not recognized, the script prints the list of valid resource names — pick the correct one and re-run. **Note:** the SDL may contain *stubbed types* — referenced resources rendered as stubs, with their real type name given in a comment. Fetch any you need separately by re-running this script with that type name as `--resource-name`.

**Fetch OpenAPI (REST) schema** — Run this when you need context about a commercetools REST endpoint, request/response payload, or update action — for example, to inspect a resource's REST operations before constructing a request, or to verify a REST request/payload you have just generated against the real specification. It fetches the partial OpenAPI specification for a single commercetools resource:
   ```bash
   node scripts/openApi-schemata.mjs \
     --resource-name "<commercetools resource, e.g. api-Cart-write, api-Customer-read, checkout-Application>" \
     --app-name "<current-app, e.g. claude, copilot, cursor, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-checkout"
   ```
   The output is the OpenAPI specification (YAML) for that resource. REST resources use a read/write-split naming form (e.g. `api-Cart-read`, `api-Cart-write`). If the resource name is not recognized, the script prints the list of valid resource names — pick the correct one and re-run. **Note:** the spec does not include reference-expansion schemas — fetch a referenced resource's schema separately by re-running this script with that resource as `--resource-name`.

## References

See [payment-only-mode.md](./references/payment-only-mode.md) for:
- Full architecture diagram (Browser SDK → Checkout service → PSP)
- Session creation (`/<api>/checkout/session` → commercetools Sessions API)
- `paymentFlow`, `checkoutFlow`, and `expressPayment` implementation patterns
- PSP connector setup (Stripe, Adyen, Mollie)
- Webhook handling and order confirmation
