---
name: erp-data-mapping
description: "Map ERP master data onto commercetools resources — material to SKU and Product key, price conditions to Price scope, units of measure and pack sizes, tax classification to Tax Categories, ERP account hierarchy to Business Units and Associates, order lines and freight to a sales order, invoices onto the Order — including the money and rounding rules and where the mapping tables belong."
when_to_use:
  - "Deciding how ERP fields land on commercetools resources before building the sync"
  - "Mapping price conditions, units of measure, pack sizes, or tax classifications from an ERP"
  - "Mapping an ERP account hierarchy (sold-to, ship-to, payer, bill-to) onto Business Units and Associates"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - erp
    - integration
---

# Mapping ERP data onto commercetools

The mapping is where ERP integrations quietly go wrong: nothing errors, the data just means something slightly different on the other side. Decide each row below **with the user**, write it down, and keep the tables in configuration or a CustomObject — not in code, because they change without your connector changing.

Product *content* modeling (families, attribute types, locales, media, categories) is the PIM sub-area's: [pim/data-mapping.md](../pim/data-mapping.md). This file covers the ERP-specific decisions.

The commercetools docs include a worked SAP mapping (MATMAS → Product/Variant, classification IDOCs → Product Type/Attributes, COND_A → Prices, stock IDOCs → Inventory, invoice IDOCs → Order Custom Fields) — use it as an illustration of the shape, and take the actual field and segment names from the ERP's current documentation: [SAP ERP integration example](https://docs.commercetools.com/tutorials/erp-integration.md#sap-erp-integration-example).

## Identity and keys — decide first, change never

| ERP concept | commercetools | Rule |
|---|---|---|
| Material / item number | Variant `sku` **and** a deterministic resource `key` | The ERP identifier is the natural key for both. Keys make every import and upsert idempotent |
| Product family / grouping | `Product` `key` | If the ERP has no product-level grouping, derive one deterministically and document the derivation |
| Plant / warehouse / location | supply `Channel` `key` | Create the Channels in `postDeploy`; an unmapped location silently falls into the channel-less pool |
| Sales organization / distribution channel | distribution `Channel`, and/or `Store` | Drives price selection; get it right before prices land |
| Customer / account number | `Customer.externalId`, or Business Unit `key` | `Customer` has `externalId`; Business Unit uses `key` |
| Sales order number | `SyncInfo` (via `updateSyncInfo`) or an Order Custom Field | `Order` has **no** `externalId` |
| Invoice / document number | Order Custom Field (or CustomObject keyed by order + document) | Also the idempotency key for the write-back |

Treat SKU as immutable. The docs advise against changing SKUs, since it triggers performance-impacting changes in related resources such as Product Selections — so never map SKU to an ERP field the business renumbers.

## Money — the rules that produce rounding disputes

- Prices are minor units: `centAmount` + `currencyCode`, and the number of fraction digits is currency-specific (JPY has none). An ERP that exports decimal amounts must be converted once, in one place, with an explicit rounding rule.
- Where the ERP carries more precision than the currency allows (per-unit prices on high-volume or weight-priced goods), use high-precision money rather than pre-rounding: [high-precision-money.md](../../../commercetools-commerce-patterns/references/high-precision-money.md).
- **Net vs gross.** ERPs commonly master net prices with tax determined at invoicing; commercetools price and tax behavior depends on the Tax Category and the cart's tax mode. Decide which the imported price is, and confirm it matches the project's tax setup, or every total is wrong by the VAT rate.
- Reconcile totals, not lines. Rounding differences between an ERP's line-level and commercetools' cart-level arithmetic are normal; agree a tolerance and where the ERP's number wins.

## Prices — conditions onto Price scope

An ERP price condition record maps onto a Price plus its **scope**: currency, country, `customerGroup`, `channel`, and `validFrom`/`validUntil`; quantity scales map onto price tiers.

- Choose **Embedded vs Standalone Prices** before the first import. Standalone supports up to **50000** prices per variant — a soft limit, increasable per Project after a performance review ([limits](https://docs.commercetools.com/api/limits.md#standalone-prices)) — is queried independently, and is *required* by the Modular catalog model, which does not support Embedded Prices at all ([Product catalog overview](https://docs.commercetools.com/api/product-catalog-overview.md)). ERP condition tables are usually large and multi-dimensional — Standalone is the usual answer. Note the second ceiling that bites exactly that case: at most **10000** Standalone Prices per Product can be *indexed for Product Search* ([limits](https://docs.commercetools.com/api/limits.md#product-search)), well below the 50000-per-variant storage limit.
- Give every Standalone Price a deterministic `key` derived from the condition's own identity (SKU + currency + country + group/channel + validity), or re-runs create duplicates instead of updating.
- **Contract / negotiated B2B pricing** is a modeling decision, not just a mapping: a Channel per price set, with the Channel and any Product Selection assigned to a **Store**, and the **Store** assigned to the Business Unit — Products and Product Selections never attach to a Business Unit directly ([Customers overview → Business Units](https://docs.commercetools.com/api/customers-overview.md), [Company-specific Product catalogs](https://docs.commercetools.com/learning-model-b2b-commerce/design-b2b-catalogs/company-specific-product-catalogs.md)). Patterns: [b2b-customer-group-pricing.md](../../../commercetools-commerce-patterns/references/b2b-customer-group-pricing.md), [customer-group-pricing.md](../../../commercetools-commerce-patterns/references/customer-group-pricing.md), [limited-time-pricing.md](../../../commercetools-commerce-patterns/references/limited-time-pricing.md).
- If the condition logic genuinely cannot be projected (customer-specific formulas, thousands of dimensions), that is the case for external prices resolved by the BFF — with the documented cost that external prices can't be filtered, faceted, or sorted in Product Search.
- Discounts in the ERP are not commercetools discounts. An ERP discount condition may belong in the price, or as a Cart Discount, or nowhere — decide per condition type instead of importing all of them as prices.

## Units of measure, pack sizes, and quantities

commercetools quantities are unitless integers, so the ERP's UoM model has to be flattened deliberately:

- Fix the **sales unit** per SKU (each, case, kg-portion) and make quantity mean that unit everywhere. Store the ERP's base UoM, conversion factor, and pack size as Product/Variant attributes so the storefront and the export can display and reverse them.
- Convert in exactly one place — the middleware or the connector, never both — and export order quantities back in the unit the ERP expects, using the same factor.
- Minimum, maximum, and step quantities: `minCartQuantity`/`maxCartQuantity` on the `InventoryEntry` cover per-line limits; step/pack-multiple enforcement is application logic.
- Weight-priced or catch-weight goods need an explicit decision: order in units and settle on the invoice, or price per weight with high-precision money.

## Classification, categories, and tax

- **Classification → Product Types and attributes.** ERP classification hierarchies are engineering taxonomies. Map only the attributes the storefront or search actually needs, and place them in a restricted AttributeGroup so they stay ERP-owned.
- **The ERP hierarchy is not your navigation.** Keep it as an attribute for traceability and build Categories for merchandising, unless the business explicitly wants the ERP tree in the storefront.
- **Tax classification → `TaxCategory` key.** Map the ERP's tax class to an existing Tax Category rather than inventing rates per product. If a tax engine is in the architecture, tax on the cart is *its* job — the ERP flow should not compute it: [tax/overview.md](../tax/overview.md).

## Accounts and the B2B hierarchy

| ERP concept | commercetools |
|---|---|
| Sold-to party / customer account | `BusinessUnit` (`Company`), `key` = account number |
| Branch, plant, or division of the account | child `BusinessUnit` (`Division`) |
| Contact person / user | `Customer` + `Associate` on the Business Unit, with roles |
| Ship-to party | Business Unit address, referenced in `shippingAddressIds` |
| Bill-to / payer | Business Unit address in `billingAddressIds`; payer identity as a Custom Field if it differs from the account |
| Credit limit, payment terms, price group | Custom Fields on the Business Unit (and a Customer Group / Channel for the price group) |

Model the hierarchy once and deliberately — depth and inheritance affect associate permissions and price resolution: [business-unit-hierarchy.md](../../../commercetools-commerce-patterns/references/business-unit-hierarchy.md). Map ERP partner *functions* to addresses and Custom Fields, not to extra Business Units, unless they really are separate buying entities.

## The order payload

Map the Order onto a sales order explicitly; every ERP rejects a different omission.

- **Header**: `orderNumber` (the dedupe key), order date, sold-to/ship-to/bill-to references, currency, PO number, payment terms, sales organization, incoterms where relevant.
- **Lines**: `sku` → material, quantity in the ERP's UoM, unit and total price, per-line discounts, tax, requested delivery date, and the ERP's line identity if the ERP echoes one back (keep it in a Line Item Custom Field for later status mapping).
- **Non-product amounts**: shipping/freight from `shippingInfo`, surcharges and fees from Custom Line Items — map each to the ERP's condition type instead of folding them into line prices.
- **Taxes and totals**: send `taxedPrice` when the ERP must reconcile rather than recompute, and state which side wins on a mismatch.
- **Payment**: commercetools tracks payment status; map to the ERP's payment/clearing document reference, and decide whether an unpaid order may exist in the ERP at all.
- **Returns and credit memos** are a distinct mapping (return line → credit document); scope them explicitly rather than assuming the order mapping covers them.

## Where the mapping lives

- Small, stable lookups (location → Channel, tax class → Tax Category, UoM factors): `standardConfiguration` keys.
- Large or business-maintained tables: CustomObjects, read at runtime and cached — so a mapping change is a data change, not a redeploy.
- Nothing in code. A hardcoded mapping table is the most common reason an ERP connector needs a release to onboard one new plant.

## Checklist
- [ ] Keys fixed per resource from ERP identifiers, and SKU mapped to something the business never renumbers
- [ ] Money rules written down: minor units, per-currency fraction digits, rounding, net-vs-gross, high-precision where needed
- [ ] Embedded vs Standalone Prices decided; Standalone Price keys deterministic; price scope mapped from the condition dimensions
- [ ] Contract/B2B pricing modeled (Channel / Store / Customer Group), not improvised per order
- [ ] Sales unit fixed per SKU; conversion factor and pack size stored; conversion done in exactly one place and reversed on export
- [ ] Classification mapped to Product Types/attributes with ERP-owned attributes restricted; ERP hierarchy not mistaken for navigation
- [ ] Tax class mapped to Tax Categories; tax calculation left to the tax engine if one exists
- [ ] Account hierarchy mapped to Business Units/Associates with addresses and Custom Fields for partner functions, credit, and terms
- [ ] Order payload mapped field by field including freight, surcharges, taxes, PO number, and line back-references
- [ ] Returns/credit documents scoped explicitly
- [ ] Every mapping table in config or CustomObjects, none in code
