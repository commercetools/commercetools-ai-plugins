---
name: pricing-and-money
description: "Minor-unit conversion without floating-point error, price scope and validity, and embedded versus standalone pricing including the scopes each needs."
metadata:
  contentType: REFERENCE
---

# Money and prices

The two things most likely to be wrong in a way that looks right.

Reference: [pricing and discounts overview](https://docs.commercetools.com/api/pricing-and-discounts-overview.md),
[Standalone Prices](https://docs.commercetools.com/api/projects/standalone-prices.md).

## Minor units

commercetools money is expressed in minor units (`centAmount`), and **the digit
count is not 2 everywhere**:

| Fraction digits | Currencies |
| :--- | :--- |
| 0 | JPY, KRW, and others |
| 2 | most |
| 3 | BHD, KWD, OMR, TND |

Defaulting to 2 does not error. It multiplies a 0-digit price by 100 and loads
it. `market.currencyFractionDigits` therefore requires an explicit entry per
currency, and a missing one is a hard error rather than a default.

## Convert on the digit string, never through a float

A binary float cannot represent most decimal amounts exactly. `0.07 * 100` is
`7.000000000000001`. The error surfaces as an off-by-one cent on a fraction of
records — the worst kind of migration defect, because everything looks fine.

Amounts travel through the feed as decimal strings and are converted by string
manipulation:

```
"19.99"  GBP (2)  →  1999
"4500"   JPY (0)  →  4500        not 450000
"12.345" BHD (3)  →  12345
"0.07"   EUR (2)  →  7
```

**Excess precision is refused, not rounded.** Rounding would silently change a
price, and nobody reviews a price they were not told changed:

```
"29.999"  GBP (2)  →  error: 3 decimal places but GBP allows 2
"4500.5"  JPY (0)  →  error
```

**Trailing zeros beyond the currency's precision are not a loss.** `"29.9900"`
is exactly `29.99` and is accepted.

Verify after mapping: `plan --payloads` writes the prices of one sample
product per variant shape, embedded or standalone, decoded back from minor
units to a decimal, so the numbers can be checked against the source.

## Price scope

A price's scope is **currency, country, customer group, channel, and validity
window**. Only one price may exist per scope.

**A store is not part of that scope.** There is no `store` field on a price,
and there never was — a store scopes prices *indirectly*, by listing the
distribution channels it trades through. In a store's context the candidate
prices are the ones whose channel it lists, plus every price with no channel.
The channel is the pricing unit; the store is only the binding. Two
distribution channels on one store, each with a price for the variant, match at
the same fallback step and the storefront has to pick with
`setLineItemDistributionChannel`. See
[catalog-feed-contract.md](catalog-feed-contract.md) for the store record.

Two of those are references to resources **the Import API cannot create**: it
has no channel or customer-group type. So a price scoped to either must declare
it in the feed (`channel` / `customerGroup` records), and `load` creates the
missing ones through the platform API before any import runs. Without that, the
price becomes an operation that sits `unresolved` for 48 hours and then expires
— a green load and a missing price.

`validate` refuses an undeclared reference. `preflight` reports one the project
is missing as a warning, since `load` will create it, and one that exists
without the roles the plan needs as an error, since that is the case `load`
refuses to fix. See [catalog-feed-contract.md](catalog-feed-contract.md).

Adding an embedded price is rejected when:

- another embedded price has the same scope *and* the same `validFrom` /
  `validUntil`, or
- two prices have **overlapping validity periods** within the same scope.

One nuance that matters, and that a naive check gets wrong: **a price with no
validity period does not conflict with a price defined for a time period.** A
base price plus a dated promotion in the same currency and country is the normal
shape, and flagging it would be a false positive that gets the gate switched
off.

Validity intervals are half-open, so one window ending exactly where the next
begins does not overlap.

The audit gate checks all of this offline. Resolving inherited prices produces
duplicate-scope shapes very easily, which is why it is worth catching before the
API names one offending record and stops.

## Field name

The feed calls it `validTo`. The API field is **`validUntil`**. The mapper
translates; hand-written payloads often do not.

## Embedded versus standalone

| | Embedded | Standalone |
| :--- | :--- | :--- |
| Stored | inside the Product Variant | as independent resources |
| Limit | 100 per variant (soft) | 50,000 per variant (soft) |
| Catalog model | `Classic` only | both — and the only option under `Modular` |
| Scope needed | `manage_products` | `manage_standalone_prices` |
| Scoped price search (filter/facet/sort) | supported | inconsistent — only embedded prices are considered |

Both modes work on `Classic`. **`Modular` allows only `standalone`** — it has
no embedded prices at all, a `VariantImport` has no price field, and the config
loader refuses the other pair. `priceMode: standalone` emits
`StandalonePriceImport` resources keyed by SKU as the final load stage, after
the products (and, under Modular, after the variants those prices reference by
SKU).

Both limits are **soft** — increasable per Project after a performance review,
like the category and ProductType counts. See
[limit increase guidance](https://docs.commercetools.com/api/limit-increase-guidance.md).
Treat them as a modelling signal rather than a wall: hitting 100 embedded
prices on a variant usually means the price scopes want rethinking, not that
the limit wants raising.

Mixing both types on one product is possible but degrades performance, so the
pipeline takes a single choice.

Three things about standalone pricing that only bite at load time:

- **It needs `manage_standalone_prices`.** `manage_products` does *not* grant
  it, unlike every other import request this pipeline sends. A client set up for
  an embedded load fails on that one stage with a 403 and nothing else.
- **`sku` is a plain string, not a KeyReference, and the API does not validate
  it.** A price for a SKU no variant has is created successfully and prices
  nothing. The audit gate checks every SKU against the plan's own variants,
  because that is the only place it can be caught.
- **`priceMode` on the product decides which prices are read.** A product
  declaring `Embedded` whose prices are standalone resources imports with every
  operation reporting `imported`, and then shows no price anywhere. The gate
  treats any disagreement between the config, the products and where the prices
  actually are as an error.

Uniqueness differs between the two, and so does what a duplicate means:

| | Embedded | Standalone |
| :--- | :--- | :--- |
| Unique per | variant + scope | SKU + scope (project-wide) |
| Overlapping validity in one scope | rejected | accepted |

Because standalone overlaps are accepted, the gate reports them as a warning
rather than an error: the API will take them, but which price wins stops being
something the migration decides. An open-ended base price alongside a dated
promotion is not an overlap in either mode — that pair is the normal shape of a
priced catalog.

Keep the embedded price count low by leaning on price-selection fallback: one
price for a currency with no country beats one price per country, and a
channel-less base price beats a price per channel.

## Things to report rather than approximate

Report these as information loss rather than approximating them:

- **Quantity breaks / tiered pricing.** Embedded and Standalone Prices both
  support native `tiers`, but **the feed contract has no field for them**, so
  the pipeline cannot load one in either price mode. Until it can, a quantity
  break is information loss, or becomes a Cart Discount, which is a modelling
  decision, not a translation.
- **An unmappable customer-group price.** Loading a trade or staff price
  unscoped shows it to every shopper *and* collides with the base price as a
  duplicate scope. Skip and report. Skipping is recoverable; wrong data in
  production is not.
- **Net versus gross.** Whether a price includes tax is usually a setting
  elsewhere in the source, not a property of the price row, so a price read on
  its own does not tell you what its number means. Getting it backwards changes
  every price on the site by the tax rate and nothing in the data contradicts
  you. Under `Platform` tax mode it lands as `includedInPrice` on each rate of a
  [`taxCategory`](catalog-feed-contract.md#taxcategory--how-products-are-taxed-per-country)
  record, which has no default for exactly this reason — find the store-level
  setting in the source and state it per rate. Which tax mode applies at all is
  a modelling decision, asked in step 0.

  "Gross" is also not the whole answer: **gross at which country's rate?** A
  source can treat every price as including its *home* country's tax and
  re-gross it for a foreign destination — Magento does exactly that with
  tax-inclusive prices and cross-border trade switched off, so an Irish
  €21.00 entered under a UK default is charged at about €21.53. commercetools
  applies the destination's rate to the price as given, so the same figure
  comes out as €21.00. Look for the setting that decides this whenever prices
  are gross and more than one country is sold into, and have whoever owns
  tax confirm the foreign prices are the intended shelf prices.
- **A tax code is not a tax rate.** A product tax code is a reference into an
  external tax engine. Carry it across verbatim; never derive a rate from it.
  The rates on a `taxCategory` come from whoever owns tax, not from a code —
  and a rate is a fraction, `0.2` for 20%, which the schema enforces.

## Currency and locale acceptance

A project rejects money in a currency it does not accept, and localized strings
in locales it does not accept. The audit gate checks every price currency
against `market.requiredCurrencies`, and making the project accept them is a
prerequisite of the load — an idempotent, additive step, not a manual click.
