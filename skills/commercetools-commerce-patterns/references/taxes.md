# Taxes — Cart Tax Modes and Integration Patterns

**Source:** 2026 Payments and Taxes deck (Expert Services)

---

## Cart Tax Modes

The `taxMode` on a cart controls how taxes are calculated. Set at cart creation.

| Mode | Description | Recommended for |
|------|-------------|-----------------|
| `Platform` | CT calculates tax using tax categories and rates configured in the project | Simple setups with static tax rates |
| `ExternalRate` | Tax rate provided per line item by the client | Dynamic rates from external engine, not recommended for complex scenarios |
| `ExternalAmount` | Client provides the exact tax amount per line item | **Recommended for most integrations** — full control, consistent results |
| `Disabled` | No tax calculation | B2B where taxes are handled externally |

**Use `ExternalAmount` for most tax integrations.** With this mode your tax microservice calculates the exact tax amount and passes it directly. This eliminates rounding discrepancies between CT's calculation engine and an external tax service (e.g., Avalara/AvaTax), and ensures the displayed tax amount always matches the amount charged.

---

## Tax Configuration

When using Platform or ExternalRate mode, taxes are configured via:

- **Tax Categories** — named groups (e.g., "Standard", "Reduced", "Exempt") assigned to products and shipping methods
- **Tax Rates** — defined per country (optionally per state/region) with:
  - `name`: rate label
  - `amount`: percentage (0.0–1.0, e.g., 0.19 for 19%)
  - `country`: ISO 3166-1 alpha-2 country code
  - `state` (optional): for US state-level tax
  - `includedInPrice`: whether tax is included in the product price (`true`) or added on top (`false`)

---

## Tax Calculation

### includedInPrice — Two Directions

**`includedInPrice: true` (Top-down calculation):**
The listed price includes tax. CT extracts the tax from the price.
```
Price = 100.00 (tax included)
Tax rate = 19%
Net price = 100.00 / 1.19 = 84.03
Tax amount = 100.00 - 84.03 = 15.97
```

**`includedInPrice: false` (Bottom-up calculation):**
Tax is added on top of the net price.
```
Net price = 84.03
Tax rate = 19%
Tax amount = 84.03 × 0.19 = 15.97
Gross price = 84.03 + 15.97 = 100.00
```

### Calculation Mode

Controls how line item tax is computed when quantity > 1:

| Mode | Behavior |
|------|----------|
| **Line Item Level** (default) | Tax computed on `unitPrice × quantity` — one calculation per line item |
| **Unit Price Level** | Tax computed per unit, then summed — can produce different rounding results |

Use **Unit Price Level** when your PSP or tax authority requires per-unit tax calculation to avoid rounding discrepancies on high-quantity line items.

### Rounding Modes

| Mode | Behavior | Default |
|------|----------|---------|
| `HalfEven` | Round half to nearest even digit (banker's rounding) | Yes |
| `HalfDown` | Round 0.5 down | No |
| `HalfUp` | Round 0.5 up | No |

The rounding mode applies to the final cent-level tax amount after calculation. `HalfEven` minimizes cumulative rounding error across many transactions.

---

## Tax Integration Patterns

### Pattern 1: API Extension Approach

An API Extension is triggered on cart update events and calls an external tax service:

1. Customer updates cart (adds item, changes address)
2. CT triggers API Extension (synchronous)
3. Extension calls tax service with cart contents + shipping address
4. Tax service returns line-item-level tax amounts
5. Extension returns `setLineItemTaxAmount` / `setCustomLineItemTaxAmount` actions to CT
6. CT stores the exact tax amounts on the cart (`taxMode: ExternalAmount`)

**Constraints:**
- Extension must respond within **2 seconds** (synchronous timeout)
- Pre-warm connections to the tax service; use connection pooling
- Cache tax results for unchanged line items to minimize calls

### Pattern 2: External Microservice / Middleware Approach

A middleware layer sits between the storefront and CT:

1. Storefront calls middleware instead of CT directly
2. Middleware calls CT to get cart
3. Middleware calls tax service
4. Middleware calls CT with `setLineItemTaxAmount` actions
5. Returns updated cart to storefront

This decouples the tax logic from the CT extension timeout constraint — the middleware can take as long as needed before submitting the final update.

| Factor | API Extension | External Microservice |
|--------|--------------|----------------------|
| Latency | Adds to checkout latency (2s limit) | No CT timeout constraint |
| Complexity | Simpler architecture | More moving parts |
| Fault tolerance | Extension failure = cart update failure | Middleware can retry, cache, degrade gracefully |
| Real-time tax | Always current | Depends on middleware caching policy |

### AvaTax Integration Steps

1. Determine which CT resources map to AvaTax entities (product → AvaTax tax code, address → jurisdiction)
2. Set cart `taxMode: ExternalAmount`
3. Call AvaTax `createTransaction` API with cart line items and shipping destination
4. Map AvaTax line-level tax amounts back to CT `setLineItemTaxAmount` update actions
5. Apply the tax amounts to the cart; CT stores them and includes in cart total
6. On order creation, commit the AvaTax transaction for audit trail
