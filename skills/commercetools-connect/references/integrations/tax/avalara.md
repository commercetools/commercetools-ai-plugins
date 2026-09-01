---
name: tax-avalara-specifics
description: Avalara AvaTax tax connector ground truth from the certified open-source connector — connect.yaml keys, AvaTax createTransaction (quote vs commit), tax-code/entity-use mapping, MC config app, address validation — plus TaxJar as the build-from-template contrast. The tax sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - tax
    - connect
    - avalara
---

# Avalara (and TaxJar) specifics

Two grounded engines: **Avalara** — the certified, open-source connector (rung 1/3), the authoritative model — and **TaxJar** — a from-template build (rung 4), the contrast for when no connector exists. Read alongside [tax-contract.md](./tax-contract.md).

## Avalara — the certified connector (ground truth)

Source: [`mediaopt/avalara-commercetools-connector`](https://github.com/mediaopt/avalara-commercetools-connector) (open source, certified). It is the reference implementation of the two-app pattern, plus a Merchant Center config app.

### Three applications

| App | type | endpoint | Role |
|---|---|---|---|
| `service` | `service` | `/service` | Calculator (cart API Extension) |
| `event` | `event` | `/event` | Recorder (order Subscription): commit / void / refund / recalculate |
| `mc-app` | `merchant-center-custom-application` | (MC) | Config/admin UI — credential test, address-origin validation, settings |

TypeScript throughout; `avatax` npm SDK; Express; Jest. Both service+event run `postDeploy: npm install && npm run build && npm run connector:post-deploy`.

### Calculation (the `service` app)

- **API Extension** on `cart`, `[Create, Update]`, condition `shippingAddress is defined and shippingInfo is defined and lineItems is not empty` — the strong call-reduction gate.
- **AvaTax call:** `AvaTaxClient.createTransaction()` (Avalara `/api/v2/transactions/create`). For the **quote** phase it sets `type = SalesOrder (0)` and **`commit: false`** — a tax estimate that files nothing.
- **Tax mode `ExternalAmount`**, returned via `changeTaxMode` plus the full set of tax actions: `setLineItemTaxAmount`, `setCustomLineItemTaxAmount`, `setShippingMethodTaxAmount`, `setCartTotalTax`. `taxRate` name is `avaTaxRate`, `amount` derived from the AvaTax response detail.
- **Idempotency / call reduction:** `hashCart(cart)` compared to a stored `avalaraHash` custom field; recalculates only when the hash changed or `taxedPrice` is absent, then persists the new hash.
- **Fail-closed:** returns `400` (*"No Avalara merchant configuration found."*) on error/misconfig — blocks the cart rather than persisting untaxed.
- **Ship-from / ship-to:** `shipFrom` = configured origin address; `shipTo` = `cart.shippingAddress`.

### Recording (the `event` app)

- **Subscription** on `order`, destination built from the injected broker (`GoogleCloudPubSub` or `SNS`), message types `OrderCreated`, `OrderStateChanged`, `OrderStateTransition`, `OrderReturnShipmentStateChanged`.
- A transaction manager drives the lifecycle, mostly keyed on **merchant-configured order-state ID lists** (settings in a custom object), not hardcoded names:
  - `commitTransaction` — files the sale (on `OrderCreated` if the boolean `commitOnOrderCreation`, or when state ∈ `commitOrderStates`).
  - `voidOrRefundTransaction` — on state ∈ `cancelOrderStates` (plus a residual hardcoded `orderState === 'Cancelled'` check in the `OrderStateChanged` path).
  - `partiallyRefundTransaction` — on return-shipment state change, gated by the boolean `activateReturns` (a flag, not a state-ID list).
  - `recalculateTransaction` — for order edits.

  The lesson to carry over on a fork/build: model the commit/cancel *states* as configurable lists (state keys differ per project); returns can be a simpler on/off flag.

### Config keys (exact)

- **service `standardConfiguration`:** `CTP_REGION`; custom-type keys/names for shipping, line item, category, shipping-method, customer, order (e.g. `avalara-connector-custom-shipping`, `avalara-connector-order`); `AVATAX_PRODUCT_ATTRIBUTE_NAME` (optional, default `avatax-code`).
- **service `securedConfiguration`:** `CTP_PROJECT_KEY` / `CTP_CLIENT_ID` / `CTP_CLIENT_SECRET` / `CTP_SCOPE`, `AVALARA_USERNAME`, `AVALARA_PASSWORD`, `AVALARA_COMPANY_CODE`, `AVALARA_ENV`, `FRONTEND_API_KEY` (optional).
- **event:** standard `CTP_REGION` + `AVATAX_PRODUCT_ATTRIBUTE_NAME`; secured = same CTP + Avalara keys.
- **mc-app:** standard `CUSTOM_APPLICATION_ID`, `CLOUD_IDENTIFIER` (default `gcp-eu`), `ENTRY_POINT_URI_PATH`.

> **Note:** it supplies `CTP_CLIENT_ID/SECRET` **manually** (secured config), not via `inheritAs.apiClient.scopes`. On a fork or new build, prefer native client provisioning ([config-from-requirements.md](./config-from-requirements.md#native-client-provisioning-prefer-this)) — it's the more modern, lower-maintenance form.

### Enterprise features worth knowing (they're config, not forks)

- **Tax-code mapping, multi-level:** product attribute (`AVATAX_PRODUCT_ATTRIBUTE_NAME`, default `avatax-code`) → category custom fields (`getCategoryTaxCodes`) → shipping/custom-line-item types.
- **Exemptions:** `getCustomerEntityUseCode(cart.customerId)` reads the customer's Avalara entity-use code from a Customer custom field (`avalaraEntityUseCode`).
- **Address validation:** `/avalara/check-address` → `client.resolveAddress()` (`/addresses/resolve`), toggleable.
- **Settings in custom objects,** managed by the MC app: address-validation toggle, `commitOnOrderCreation`, `commitOrderStates`/`cancelOrderStates`, `activateReturns`, logging, tax-code map, entity-use codes.

The takeaway for the decision ladder: most Avalara "customization" requests are **settings**, not forks — check the MC-app/custom-object surface before concluding rung 3.

## TaxJar — the build-from-template contrast (rung 4)

TaxJar has **no public connector** ([connector-selection.md](./connector-selection.md)), so it's the canonical from-template build. It's a good contrast to Avalara because the *architecture is identical* — only the engine calls and mapping differ, and the enterprise features (MC app, address validation, multi-level tax codes) are simply absent unless you add them.

### The engine calls (the two halves)

- **Calculate:** `POST /v2/taxes` (live `api.taxjar.com`, sandbox `api.sandbox.taxjar.com`). Send destination address + line items (major-unit `unit_price`) + shipping; get back `tax.amount_to_collect`, `tax.rate`, and `tax.breakdown.line_items[]` / `tax.breakdown.shipping`. **Stateless — stores nothing.**
- **Record:** `POST /v2/transactions/orders`. Send `transaction_id` (= order id, for idempotency), `transaction_date`, destination, `amount` (net), `shipping`, `sales_tax`, `line_items[]`. **This is what appears in the dashboard.**

### Mapping notes

- Convert commercetools minor units (`centAmount`/`fractionDigits`) to TaxJar major-unit decimals once, in the mapper.
- Emit all four `ExternalAmount` actions; take per-line tax from `tax.breakdown.line_items[]` keyed by the line id you sent, shipping tax from `tax.breakdown.shipping`, and fall back to the effective `tax.rate` when a breakdown entry is absent.
- Product tax code: read a Custom Field (e.g. `taxjar-tax-code`) and pass as `product_tax_code`; omit when absent (TaxJar treats it as fully taxable).

### TaxJar-specific gotchas (learned from a real build)

- **`to_state` is required on transactions** — a destination without a state yields `406 to_state can't be blank`. Ensure the address carries `state`, and omit blank optional fields rather than sending empty strings.
- **Sandbox does not persist transactions.** `POST /v2/transactions/orders` returns `201`, but GET returns canned demo data and nothing appears in the dashboard. Transactions only show up on a **live** account. Prove recording against live (with cleanup), not sandbox — [verification.md](./verification.md).
- **Zero tax without nexus.** TaxJar only collects where the account has nexus; a destination outside your nexus correctly returns `amount_to_collect: 0`. Test against a nexus region.
- **Duplicate = success.** A redelivered order hits TaxJar's duplicate-`transaction_id` guard (`422`); treat it as already-recorded.

## Cross-engine summary

| Dimension | Avalara (certified) | TaxJar (from template) |
|---|---|---|
| Rung | 1 configure / 3 fork | 4 build |
| Calculate API | `createTransaction` (`commit:false`) | `POST /v2/taxes` |
| Record API | `createTransaction` (`commit:true`) | `POST /v2/transactions/orders` |
| Tax mode | `ExternalAmount` | `ExternalAmount` |
| Lifecycle | commit/void/refund/recalc on configured states | `OrderCreated` (add void/refund yourself) |
| Tax codes | product attr → category → type (multi-level) | single custom field passthrough |
| Exemptions | entity-use code from Customer field | add yourself |
| Address validation | yes (`resolveAddress`) | no |
| Config UI | MC app + custom objects | env/config only |
| Extra apps | + merchant-center-custom-application | none |

Both are the *same two-app spine*; Avalara shows how far the pattern hardens for compliance, TaxJar shows the minimal correct core.
