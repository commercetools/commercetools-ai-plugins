---
name: commercetools-composable-patterns
description: Using commercetools as a standalone module — cart-only, order ledger only, B2B accounts only, or subscription-only. Covers external prices, product stubs, custom line items, recurring order stance, and the trade-offs of each composable stance vs. full platform adoption.
when_to_use:
  - "Using only ct cart (no product catalog or pricing managed in ct)"
  - "Using ct as an order ledger only, with external fulfillment"
  - "Using ct B2B accounts (Business Units) standalone without a full storefront"
  - "External prices on line items, product stubs, custom line items"
  - "Recurring orders as a standalone subscription module"
  - "Trade-off analysis: full ct platform vs composable module stance"
  - "Custom line items for fees, services, or non-catalog items on an order"
metadata:
  contentType: SKILL
  area:
    - platform
    - commerce
    - b2b
---

# commercetools Composable Patterns

Patterns for using commercetools as a standalone module rather than a full platform. Each composable stance trades platform automation for flexibility — choose deliberately.

## Key Takeaways

**Cart-only stance: external prices on line items.** Set `priceMode: ExternalPrice` on the cart. Provide `externalPrice` on each line item draft instead of relying on CT to resolve prices from the catalog. CT will not validate prices against the catalog — your price engine is the source of truth. This is common in B2B marketplaces, real-time auction pricing, or projects where pricing lives in an external CPQ.

**Custom line items represent fees, services, or non-catalog items.** Use `customLineItems` on the cart for anything that isn't a product variant: shipping surcharges, handling fees, gift wrapping, services, or external digital products. Custom line items have a `name`, `money`, `taxCategory`, `slug`, and optional custom fields — they do not reference a product.

**Order ledger stance: CT as the system of record for order state, not fulfillment.** CT manages the order lifecycle state machine (Confirmed → Complete, payment transitions, return/refund states) while an external OMS handles physical fulfillment. Feed fulfillment events back into CT via the Orders API to keep order state accurate for customer-facing order history.

**B2B accounts standalone: Business Units without a full storefront.** Use CT Business Units, associate roles, and approval flows as a standalone B2B account management layer. The actual order processing can be handled by an external system — use `externalId` on orders to link CT and the external OMS.

**Recurring orders standalone: subscription management without a full storefront.** Use the CT Recurring Orders API to manage subscription schedules, recurrence policies, and subscription lifecycle (pause, skip, cancel) independently of your storefront stack. The generated recurring orders can be fulfilled by an external OMS.

**Product stubs in external-price carts.** Even in a cart-only stance, CT line items must reference a valid product variant (`productId` + `variantId`). Create lightweight product stubs — products with minimal attributes (name, key, one variant) — purely to satisfy the reference. The real product data lives in your PIM or external catalog.

**`taxMode: ExternalAmount` for composable stances with external tax services.** When using external prices and an external tax service (AvaTax, Vertex), use `taxMode: ExternalAmount` so CT accepts tax amounts directly from your tax service without attempting to recalculate them.

**The trade-off of composable stances is lost platform automation.** Each composable stance you take means losing one layer of CT's built-in logic: price resolution, product discount evaluation, shipping method resolution, etc. Document explicitly which automations are disabled and how they are replaced.

---

## Reference Index

| Topic | Reference | Source |
|-------|-----------|--------|
| Cart API vs in-store cart API — scoping, external pricing, custom line items | [references/cart-api-vs-instore.md](references/cart-api-vs-instore.md) | CSEA: "Cart API vs InStore Cart API" |
| Recurring orders — RecurrencePolicy, priceSelectionMode, /orders vs /recurring-orders | [references/recurring-orders.md](references/recurring-orders.md) | Recurring Orders API Cheat Sheet |
| Custom Associate Roles — role definition, permission keys, B2B standalone patterns | [references/custom-associate-roles.md](references/custom-associate-roles.md) | CSEA: "B2B Custom Roles" |
| Payments — Payment object model for composable payment stances | [references/payments.md](references/payments.md) | ES: 2026 Payments and Taxes deck |
| Taxes — ExternalAmount mode for composable tax integration | [references/taxes.md](references/taxes.md) | ES: 2026 Payments and Taxes deck |

---

## Composable Stance Trade-off Table

| Stance | CT handles | You handle | Key config |
|--------|-----------|------------|------------|
| **Cart-only** | Cart, order state, checkout flow | Pricing, product catalog | `priceMode: ExternalPrice` on cart |
| **Order ledger** | Order state machine, returns, refunds | Fulfillment, warehouse, shipping | Feed fulfillment events via Orders API |
| **B2B accounts** | Business Units, associates, approval flows | Ordering surface, product catalog | `as-associate` API chain |
| **Subscription module** | Recurring order schedule, lifecycle (pause/skip/cancel) | Storefront, fulfillment | `POST /recurring-orders` only |
| **Full platform** | All of the above | Storefront UI | Default CT stance |

---

## Priority Tiers

### CRITICAL

- **Cart-only stance requires `priceMode: ExternalPrice` set at cart creation.** You cannot change pricing mode on an existing cart.
- **Custom line items must have a `taxCategory`.** Even for fee line items, a tax category is required — create a "zero rate" tax category if the fee is non-taxable.
- **All B2B operations (even in standalone B2B accounts stance) must use the `as-associate` API chain.** Project-level `apiRoot.*` does not enforce B2B permissions.
- **`POST /orders` on a mixed cart creates both a regular order and recurring orders.** In a subscription-only stance, use `POST /recurring-orders` if you do not want an immediate regular order.

### HIGH

- **Product stubs must exist for every product variant referenced in a cart line item.** CT validates product and variant IDs at line item creation, even in external-price mode.
- **`taxMode: ExternalAmount` requires that your integration supplies tax amounts on every line item.** Missing tax amounts on any line item causes cart calculation errors.
- **Recurring order lifecycle (pause, skip, cancel) must be surfaced to the customer.** If you don't expose these operations, subscription churn increases. CT provides API actions for each.
- **`priceSelectionMode: "Fixed"` locks the subscription price at creation.** Use `"Fixed"` for price-guaranteed subscriptions; `"Dynamic"` for commodity subscriptions where the customer accepts price changes.

### MEDIUM

- **Keep product stubs minimal.** Product stubs only need enough data to satisfy CT validation. Avoid duplicating your full PIM data into CT if CT is not your product catalog.
- **Use `externalId` on all composable orders to link CT and external systems.** This is required for reconciliation, customer service, and rollback in multi-system architectures.
- **Document which CT automations are disabled in your composable stance.** External prices disable Product Discounts. ExternalAmount tax mode disables CT tax calculation. Make these explicit in your architecture documentation.
