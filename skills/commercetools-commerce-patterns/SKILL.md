---
name: commercetools-commerce-patterns
description: Surface-independent commerce domain logic — pricing models (customer groups, channel fallback, high-precision money), discount stacking (Product/Cart/Code/Direct/Groups), shipping predicates and cart score, tax modes, payment object modeling, Import API bulk patterns, and catalog architecture. Use for commerce-domain questions that are independent of surface (storefront, MC app, Connect).
when_to_use:
  - "Pricing models: customer group pricing, channel price fallback, high-precision money, limited-time pricing"
  - "Discount stacking order, Direct Discounts blocking Discount Codes, sortOrder semantics"
  - "Cart Discounts: Buy/Get, Discount Bundles, BOGO, spend thresholds, Discount Groups"
  - "Shipping predicates, cart score tiers, price functions, dynamic shipping rate calculation"
  - "Tax modes: Platform, ExternalRate, ExternalAmount, Disabled — when to use each"
  - "Payment object modeling — PSP transaction states, interfaceId immutability, tax services"
  - "Import API: batch size limits, ordering guarantees, productDraftImport vs productVariantPatch"
  - "Catalog architecture: ProductType design, bundle patterns, item substitutes, inventory modeling"
  - "B2B order flows: Business Unit hierarchy, as-associate API, approval rules, quote lifecycle"
  - "Recurring orders: RecurrencePolicy, priceSelectionMode, recurringOrderScope"
metadata:
  contentType: SKILL
  area:
    - commerce
    - b2c
    - b2b
---

# commercetools Commerce Patterns

Surface-independent commerce domain logic from Expert Services engagements. Covers the full discount stack, pricing models, shipping configuration, tax modes, payment modeling, catalog architecture, B2B order flows, and recurring orders.

## Key Takeaways

**Discount stacking follows a strict priority chain.** Product Discounts → Cart Discounts → Discount Codes → Direct Discounts. Direct Discounts on a cart **block all Discount Codes** — a very common support escalation. Never mix Direct Discounts and Discount Code flows on the same cart.

**sortOrder direction: higher value fires first.** For both Product Discounts and Cart Discounts, the discount with the highest `sortOrder` value (closest to 1) is applied first. `0.9` fires before `0.5`. For Product Discounts only one applies (no stacking); for Cart Discounts they stack by default unless `stackingMode: StopAfterThisDiscount` is set.

**Product Discounts cannot be used with external pricing.** If a project uses an external price source, Product Discounts are not applied. Use Cart Discounts for any promotional discounts when external pricing is active.

**Discount Groups bundle multiple cart discounts under one entity.** A Discount Group has its own `sortOrder` and a `"Best deal"` prioritization mode — only the cart discount from the group that gives the customer the greatest saving is applied. Use Discount Groups to manage large-scale campaigns (e.g., Black Friday) where deactivating dozens of individual discounts at once would otherwise be error-prone.

**Customer Group pricing is set on embedded prices, not at the customer level.** The customer's `customerGroup` reference is resolved at cart calculation time — the price with the matching `customerGroup` on the variant is selected. For B2B buyers, assign a `customerGroup` directly to the buyer's customer record or via the Business Unit.

**Cart Score is the key to dynamic shipping rates.** Set the project's shipping rate input type to "Cart Score" in Merchant Center. Call `setShippingRateInput` with a `Score` type and an integer score. CT will look up the rate tier matching that score. The score must be a non-negative integer.

**Cart Score is not available in shipping predicates — copy it to a cart custom field.** The `score` is not directly queryable in predicates. Write the underlying value (e.g., distance in km) to a cart custom field. Write your shipping predicate against that custom field.

**Price functions turn cart score into a continuous rate.** Configure a `priceFunction` (e.g., `(x / 30)`) where `x` is the cart score. CT evaluates the function and sets the resulting amount as the shipping price, enabling rates that scale smoothly without enumerating every possible value.

**Use `taxMode: ExternalAmount` for most PSP/tax service integrations.** This mode lets your tax service calculate the exact tax amount per line item and pass it directly to CT, eliminating rounding discrepancies between CT's engine and external tax services (AvaTax, Vertex).

**CT records payment state; the PSP does the actual financial transaction.** The Payment object is a ledger. Use `addTransaction` update actions to track each PSP event (Authorization, Charge, Refund, Chargeback). Only set `state: "Success"` after confirmed PSP confirmation.

**`interfaceId` on a Payment is immutable once set.** This field links CT Payment to the PSP's identifier. Record it correctly the first time — there is no update path.

**Cart prices are snapshotted at order creation.** If a product price changes between cart creation and order creation, the cart holds the old price. Use the `recalculate` action on the cart to refresh prices before checkout.

**Business Units are the core B2B entity — all B2B operations run through them.** All B2B operations use the `as-associate` API chain: `apiRoot.asAssociate().withAssociateIdValue({associateId}).inBusinessUnitKeyWithBusinessUnitKeyValue({businessUnitKey}).*`. Never use project-level cart/order APIs for B2B user-facing operations.

**The quote lifecycle has four entities: QuoteRequest → StagedQuote → Quote → Order.** A buyer creates a `QuoteRequest`; a sales rep creates a `StagedQuote` (working draft with negotiated prices); the `Quote` is the finalized offer; if accepted, the buyer converts it to an Order. Each step has its own state machine.

**`POST /orders` vs `POST /recurring-orders` produce fundamentally different results.** Calling `POST /orders` on a cart with recurring line items creates both a regular order (immediate) and a recurring order. Calling `POST /recurring-orders` creates only the recurring order. Use `/orders` for "subscribe and ship now" flow; use `/recurring-orders` for future-dated subscriptions.

**Cart discount `recurringOrderScope` controls whether a discount repeats.** Set `"NonRecurringOrdersOnly"` for one-time welcome promotions. Set `"AnyOrder"` for standing loyalty discounts that should apply on every recurrence cycle.

---

## Reference Index

### Pricing & Promotions

| Topic | Reference | Source |
|-------|-----------|--------|
| Discount stacking rules, sortOrder, Direct Discount blocking Discount Codes | [references/discount-fundamentals.md](references/discount-fundamentals.md) | CSEA: "Discounts Topics" |
| Buy/Get cart discount — triggerPattern, targetPattern, excludeCount | [references/bundle-discounting.md](references/bundle-discounting.md) | CSEA: "Bundle Discounting Pattern" |
| Cart discount scenario cookbook — 12 named scenarios with full JSON | [references/cart-discount-scenarios.md](references/cart-discount-scenarios.md) | PS: Cart Discount Scenarios PDF |
| Fixed-price combo discount — buy N of X+Y at fixed combined price | [references/fixed-price-combo.md](references/fixed-price-combo.md) | CSEA: "Fixed Price Combo Discount" |
| Customer Group-based pricing — embedded price selection, group assignment | [references/customer-group-pricing.md](references/customer-group-pricing.md) | CSEA: "Customer Groups Based Pricing" |
| B2B customer group pricing — buyer-specific pricing via Customer Groups | [references/b2b-customer-group-pricing.md](references/b2b-customer-group-pricing.md) | CSEA: "Customer Groups Based Pricing" |
| High Precision Money — fractionDigits, currency configuration, rounding | [references/high-precision-money.md](references/high-precision-money.md) | CSEA: "HighPrecisionMoney" |
| Discount Groups and Promotion Prioritization — best-deal selection | [references/discount-groups.md](references/discount-groups.md) | Discounts Deepdive deck (2026) |
| Store credit & loyalty currency — external ledger pattern | [references/store-credit.md](references/store-credit.md) | CSEA: "Store Credit Best Practices" |
| Limited-time pricing — validFrom/validUntil on embedded prices | [references/limited-time-pricing.md](references/limited-time-pricing.md) | CSEA: "Pattern for Limited Time Pricing" |
| Discount code usage — code generation, redemption limits | [references/discount-code-usage.md](references/discount-code-usage.md) | CSEA: "Discount Code Usage" |

### Shipping & Fulfillment

| Topic | Reference | Source |
|-------|-----------|--------|
| Tiered rates, cart score setup, ScoreShippingRateInput | [references/tiered-rates-cart-score.md](references/tiered-rates-cart-score.md) | CSEA: "Shipping tiered rates and Shipping predicates" |
| Shipping predicates — predicate syntax, custom field workaround | [references/shipping-predicates.md](references/shipping-predicates.md) | CSEA: "Shipping tiered rates and Shipping predicates" |
| Price functions — priceFunction configuration, function syntax | [references/price-functions.md](references/price-functions.md) | CSEA: "Dynamic Shipping Rate Calculation using Functions" |
| Dynamic shipping costs — external calculation, setCustomShippingMethod | [references/dynamic-shipping-costs.md](references/dynamic-shipping-costs.md) | CSEA: "Handling dynamic shipping costs" |
| BOPIS shipping — multiple shipping methods, delivery group setup | [references/bopis-shipping.md](references/bopis-shipping.md) | CSEA: "BOPIS Pattern Using Multiple Shipping Methods" |

### Payments & Tax

| Topic | Reference | Source |
|-------|-----------|--------|
| Payments — Payment object model, transactions, PSP integration flow | [references/payments.md](references/payments.md) | ES: 2026 Payments and Taxes deck |
| Taxes — cart tax modes (Platform/ExternalRate/ExternalAmount/Disabled) | [references/taxes.md](references/taxes.md) | ES: 2026 Payments and Taxes deck |
| Financing & installments — BNPL integration, CT payment modeling | [references/financing-options.md](references/financing-options.md) | CSEA: "Financing options" |

### B2B Order Flows

| Topic | Reference | Source |
|-------|-----------|--------|
| Custom Associate Roles — role definition, permission keys, assignment to BU | [references/custom-associate-roles.md](references/custom-associate-roles.md) | CSEA: "B2B Custom Roles" |
| Business Unit hierarchy — parent/child BUs, inherited roles, store assignment | [references/business-unit-hierarchy.md](references/business-unit-hierarchy.md) | b2b-patterns cross-reference |
| Approval rules — predicate design, approval flow lifecycle | [references/approval-rules.md](references/approval-rules.md) | b2b-patterns cross-reference |
| Quote lifecycle — QuoteRequest, StagedQuote, Quote, Order conversion | [references/quote-lifecycle.md](references/quote-lifecycle.md) | b2b-patterns cross-reference |
| as-associate API pattern — chain construction, scope | [references/as-associate-api.md](references/as-associate-api.md) | commercetools-storefront skill |

### Recurring Orders

| Topic | Reference | Source |
|-------|-----------|--------|
| Recurring orders — RecurrencePolicy, priceSelectionMode, /orders vs /recurring-orders | [references/recurring-orders.md](references/recurring-orders.md) | Recurring Orders API Cheat Sheet |

### Catalog & Import

| Topic | Reference | Source |
|-------|-----------|--------|
| Product data modeling — hierarchy, all 14 attribute types, Nested vs Custom Object | [references/product-data-modeling.md](references/product-data-modeling.md) | ES: 2026 Product Data Modeling deck |
| Bundle product modeling — ProductType design, child SKU reference, BFF orchestration | [references/bundle-modeling.md](references/bundle-modeling.md) | CSEA: "Bundles Hands-On" |
| Import API — containers, batching, async processing, delta imports | [references/import-api.md](references/import-api.md) | CSEA: "Import API" |
| Import API performance — 15M record pattern, container count, batch size | [references/import-performance.md](references/import-performance.md) | CSEA: "Import API" |
| Item substitutes — modeling substitute/replacement products | [references/item-substitutes.md](references/item-substitutes.md) | CSEA: "Item Substitutes" |
| Inventory modeling — supply channels, inventory entries, backorder | [references/inventory-modeling.md](references/inventory-modeling.md) | CSEA: "Inventory Modeling" |

---

## Priority Tiers

### CRITICAL

- **Direct Discounts block Discount Codes.** Never add a Direct Discount to a cart if the checkout flow expects users to enter discount codes.
- **sortOrder: higher value fires first** — for both Product Discounts and Cart Discounts. `0.9` is applied before `0.5`. This is a common misconception that causes incorrect promotion behavior.
- **Product Discounts do not work with external pricing.** If the project uses an external price source, switch all promotional discounts to Cart Discounts.
- **triggerPattern SKU predicates are ANDed across entries.** A single `CountOnLineItemUnits` entry can only match one SKU — add separate entries per bundle component.
- **Score must be set before shipping rate lookup.** `setShippingRateInput` must be called before checkout and before shipping rate totals are calculated. Calling it after order creation has no effect.
- **Shipping predicate failures are silent.** If a predicate syntax error exists, CT may silently return no methods or all methods. Always test predicate behavior explicitly with `GET /shipping-methods?cartId=<id>`.
- **All B2B writes MUST use the `as-associate` API chain.** Project-level `apiRoot.carts().*` does not enforce B2B permissions. This is a security requirement, not just a convention.
- **An Associate must have `CreateMyCarts` permission to add items to a cart as-associate.** Missing permissions result in a 403.
- **`POST /orders` creates both a regular order and recurring orders from a mixed cart.** Design the order confirmation flow to handle multiple order IDs.
- **A RecurrencePolicy cannot be deleted while in use.** Remove all line item and cart references before attempting deletion.
- **Never set a Payment transaction to `Success` before PSP confirmation.** Optimistic success marking creates reconciliation failures.
- **`interfaceId` on a Payment cannot be changed once set.** Record the PSP transaction identifier correctly on the first write.
- **Import API has no ordering guarantee.** Poll the first operation's status before submitting the second.
- **`productDraftImport` is destructive.** Any field not included in the draft is deleted.
- **Version conflicts (409 ConcurrentModification) require retry with the latest version.** Do NOT use the version from the failed request.

### HIGH

- **Customer Group pricing requires the customer to be logged in and have a customerGroup set.** Anonymous carts get the default price.
- **HighPrecisionMoney must be consistent across all prices in a cart.** Mixing centPrecision and highPrecision prices in the same cart/order causes calculation errors.
- **Discount Code `maxApplications` is global across all customers.** Use `maxApplicationsPerCustomer` for per-customer limits — they are separate fields.
- **Cart Score is not available in shipping predicates.** Copy the distance or weight value to a cart custom field before writing predicates against it.
- **Per-warehouse predicates need the warehouse key in a cart custom field.** The cart's assigned supply channel is not directly queryable in a shipping predicate.
- **StagedQuotes hold negotiated line item prices.** When converting a StagedQuote to a Quote, prices from the StagedQuote are locked in.
- **Approval Rules are evaluated at Order creation, not Cart creation.** Design the cart-to-order UX to set buyer expectations about the approval wait.
- **`priceSelectionMode` must be set intentionally per use case.** `"Fixed"` provides price guarantee; `"Dynamic"` always applies current catalog pricing.
- **`recurringOrderScope` on cart discounts defaults to applying on all orders.** Explicitly set `"NonRecurringOrdersOnly"` for introductory discounts.
- **Nested attributes are not searchable and cannot target discount predicates.** Use flat attribute types for any attribute that must appear in search filters or predicates.
- **Batch size for Import API is max 20 operations per request.** Always chunk.
- **Changing a ProductType attribute constraint after data exists requires a migration.** Plan attribute constraints during initial design.

### MEDIUM

- **`isActive` on a Cart Discount is a soft toggle.** Use this for scheduled campaigns rather than creating/deleting discounts.
- **Use `stackingMode: StopAfterThisDiscount`** to make a specific discount exclusive. Cart discounts stack by default.
- **Rounding for discounted prices ending in `.5` always favors the customer** (half-down rounding). Budget margin accordingly for high-volume campaigns.
- **For unsupported discount scenarios, the pattern is an API Extension on cart/order** that calculates and injects a Direct Discount or custom line item.
- **`lineItemGrossTotal(categories.key = (...)) >= "X.XX USD"` is the pattern for category spend thresholds.** The currency string must be included in the value.
- **Price functions are evaluated server-side at rate lookup time.** Do not try to replicate the function in your frontend.
- **Quote negotiation supports multiple rounds.** Track negotiation rounds via custom fields on QuoteRequest if your business requires round history.
- **Customer Group assignment on the buyer's customer record is the simplest B2B pricing pattern.** All their carts inherit the group pricing automatically.
- **Order confirmation UX must handle multiple order IDs.** A single cart checkout with recurring items at different frequencies produces N+1 orders.
- **Standalone prices via Import API support `validFrom`/`validUntil`** for time-limited pricing without product republication.
- **Notify CS/support before large imports (>1M records) in production.**
