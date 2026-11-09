---
name: feed-prerequisites
description: "The feed records for what must exist in the project before products load: channel, customerGroup, taxCategory, and the inventoryEntry stock records that name a supply channel."
metadata:
  contentType: REFERENCE
---

# Feed records: prerequisites and stock

These records are part of the canonical catalog feed. The shape, the variant axes and the two load-bearing rules are in [catalog-feed-contract.md](catalog-feed-contract.md).

## `channel` and `customerGroup` — prerequisites, not imports

These two are unlike every other record: **they are created through the
platform API, not the Import API.** The Import API has no channel or
customer-group resource — neither can be imported at all.

That matters because prices reference them. A price scoped to a channel the
project does not hold becomes an Import Operation that sits `unresolved` for
**48 hours and then expires**, taking the price with it. The load reports every
request accepted, the operation is gone before anyone looks, and the price is
simply absent.

So `load` creates them first, before any import, and only the ones that are
missing:

- it reads the project for the declared keys;
- absent ones are **created** through the platform API;
- present ones are **left exactly as they are** — never patched;
- a present channel lacking a role the plan needs is an **error**, reported and
  not modified, because roles govern stores and inventory too.

They are the first two entries in `loadOrder`, and they are reported
separately from the containers because they are a different mechanism: created
synchronously, with no container and no operation states. The dry run reads the
project as well, so it can name exactly which ones it would create; if that
read fails it says so and reports them as *existence unknown* rather than
guessing.

Three consequences follow:

- **The `code` is the key, used verbatim — never prefixed.** A price
  references the project's own channel key, and channels are often created by
  store setup long before a catalog migration runs. These two, and
  [`taxCategory`](#taxcategory--how-products-are-taxed-per-country) for the
  same reason, are the only deliberate exceptions to `<prefix>-<sourceCode>`. ProductTypes used to be a
  second, accidental one — keyed verbatim from the feed's `productType` code —
  and are now prefixed like everything else.
- **A teardown scoped to `keys.prefix` will not remove them**, with one opt-in:
  `--include-created-tax-categories` removes a tax category that `load` created
  ([teardown](running-the-pipeline.md#teardown)). A channel or customer group the
  load created has to be removed by hand.
- **Creating them needs scopes the import does not.** `manage_products` covers
  channels; customer groups need `view_customer_groups` and
  `manage_customer_groups`, which `manage_products` does not grant.

| `channel` field | Notes |
| :--- | :--- |
| `code` | required — the channel's key in the project, verbatim |
| `roles` | required, at least one. **A price-scoped channel needs `ProductDistribution`** |
| `name`, `description` | optional, localized |

| `customerGroup` field | Notes |
| :--- | :--- |
| `code` | required — the key in the project, verbatim |
| `name` | optional; `CustomerGroup.name` is required by the API, so the code stands in |

`ProductDistribution` is not cosmetic. The API refuses a Standalone Price
referencing a channel without it — `MissingRoleOnChannelError`, *"does not have
the required role"* — so `validate` makes that an **error** under
`priceMode: standalone` and a warning under `embedded`, where the price
imports but channel price selection cannot find it.

`validate` refuses a price scoped to an undeclared channel or customer group,
and warns about a declared channel nothing references. `preflight` then reads
the project: a missing one is a **warning** — `load` will create it — while one
that exists with insufficient roles is an **error**, because that is the case
`load` refuses to fix for you. `preflight --apply` creates neither; it changes
project settings only, and creating resources belongs to `load`.

## `taxCategory` — how products are taxed, per country

A prerequisite shaped like `channel`: the Import API has **no tax-category
resource**, so `load` creates a missing one through the platform API, before
any import, with its `code` as the key **verbatim**. Verbatim because a tax
category is usually shared with shipping methods and set up by whoever owns
tax — the migration references the project's category, it does not own one.

**The reference is what matters, and it is on the product.** Under the default
`Platform` tax mode a cart takes its rate from the product's tax category and
the shipping address's country. A product with none **loads, verifies, and
cannot be taxed at checkout** — no stage of the platform reports it. `validate`
counts those products and warns; it cannot make it an error, because under
`External` or `ExternalAmount` tax mode an outside service supplies the rate
and no category is needed ([tax modes](https://docs.commercetools.com/api/carts-orders-overview.md#tax-modes)).
Which mode applies is a step-0 question, recorded as `target.taxMode`: set to
`External` or `ExternalAmount`, it silences that warning and the two rate-gap
warnings (`tax-category-without-rates`, `tax-rate-country-missing`); left out,
it means `Platform`. A source
that taxes **per variant** cannot be mapped one-to-one — see
[writing-an-adapter.md](writing-an-adapter.md#tax).

A product whose `taxCategory` does not resolve is worse than a price whose
channel does not: the **whole product draft** sits `unresolved` — variants and
prices with it — and expires after 48 hours. So `validate` refuses a reference
to an undeclared category outright.

| `taxCategory` field | Notes |
| :--- | :--- |
| `code` | required — the category's key in the project, verbatim |
| `name` | optional; required by the API and **unique per project**, so the code stands in and `preflight` checks nobody else holds it |
| `description` | optional |
| `rates[]` | optional; each `{country, state?, amount, includedInPrice, taxRoundingTarget?, name?, subRates?}` |

| `rates[]` field | Notes |
| :--- | :--- |
| `country` | required, ISO 3166-1 alpha-2. A rate is selected by **exact** match on the shipping address |
| `state` | optional, case-sensitive. A rate with a state matches only carts whose address carries the same state |
| `amount` | required, a **fraction**: `0.2` for 20%. The schema refuses anything above 1, because a source's `20` copied across is a 2000% rate |
| `includedInPrice` | required, **no default** — `true` means prices are gross for that country, `false` net. Backwards, every price is off by the rate |
| `taxRoundingTarget` | optional, `Net` or `Tax`; absent means the API's default, `Net`. When `includedInPrice` is `true`, tax is carved out of a gross price and only one of the two derived amounts can be rounded; this picks the net price (`Net`) or the tax amount (`Tax`), and the other is the exact remainder. Use `Tax` where the tax authority expresses the calculation as a fraction of the gross price — the docs give [UK VAT as an example](https://docs.commercetools.com/api/carts-orders-overview.md#tax-rounding-target). With `includedInPrice: false` it has no effect, and `validate` warns (`tax-rounding-target-ignored`). `preflight` and `verify` compare it like the other rate fields |
| `name` | optional; required by the API and **printed on orders** as the tax portion's name, so a derived one (`GB 20%`) is recorded for review |
| `subRates[]` | optional; each `{name, amount}`, the portions a combined rate is made of. `amount` stays required and must **equal their sum**: `validate` refuses a mismatch (`tax-subrates-sum-mismatch`) and the audit gate checks it again, because the API refuses the whole category. Float noise is tolerated: `0.07 + 0.03` against `0.1` passes |

**Rates are used once, at creation.** A category that already exists is left
exactly as found — rates included — because its rates also tax shipping and
belong to whoever owns tax, and `replaceTaxRate` in passing would change what
open carts are charged the next time they recalculate. `preflight` names any difference between the feed's
rates and the project's; `verify` names it again as a warning. The products are
taxed at the **project's** rates either way.

One rate per `(country, state)` in a category — the API refuses a second, and
refuses the whole category with it. `validate` also warns when a category's
products are priced in, or a store trades in, a country the category has no
rate for, and when a category declares no rates at all: right for `External`
tax mode, and under `Platform` every cart containing those products fails to
calculate tax.

Use `subRates` when the total tax is a combination of several taxes — the API's
own examples are local, state or provincial, and federal portions — so that carts
and orders can show each portion. They suit a combined rate that is stable. A
jurisdiction like US sales tax, which combines state, county and city rates that
change often, is not a case for project configuration at all: the product-modeling
guidance is an external tax service
([net and gross prices and tax](https://docs.commercetools.com/learning-model-b2b-commerce/configure-b2b-pricing/net-and-gross-prices-and-tax.md)).

A teardown scoped to `keys.prefix` will not remove a tax category unless it is
told to remove the ones its `load` created
([teardown](running-the-pipeline.md#teardown)). No extra
scope for the load: `manage_products` grants tax categories for backward
compatibility, as do the dedicated `view_tax_categories` and
`manage_tax_categories`.

## `inventoryEntry` — stock per SKU and supply channel

Stock is a record of its own, not a field on `variant`. Prices are authored on
the variant, so following them is the obvious move — but stock is refreshed on
a cadence the catalog is not, and in most exports it arrives in a different
file. A separate record means **a feed can be regenerated for stock alone**,
without rebuilding and re-validating every variant line to change one number.

| Field | Notes |
| :--- | :--- |
| `sku` | required — must match a declared `variant` |
| `quantityOnStock` | required, integer ≥ 0. Overall stock *including* reserved |
| `supplyChannel` | optional; code of a declared channel with `InventorySupply`. Absent means project-wide |
| `restockableInDays` | optional |
| `expectedDelivery` | optional, ISO-8601 instant |

**Identity is the pair `(sku, supplyChannel)`**, which is what the API treats
as unique, and the key is derived from it rather than supplied. The derivation
is what makes a second run over refreshed stock *update* the same entries
instead of creating a parallel set — the same reasoning as a price key. One
SKU may legitimately have an entry per warehouse and a project-wide entry
beside them; two entries for one pair are a contradiction, and `validate`
refuses them rather than letting the second silently win.

**Do not emit `availableQuantity`.** The platform computes it as stock minus
reservations. It is not importable, and `verify` deliberately does not compare
it: a cart holding two of something makes it differ from `quantityOnStock`
legitimately.

Two failures the Import API will not catch, which is why both are errors here:

- **An entry for an unknown SKU imports successfully.** Nothing rejects it, at
  any stage, ever — it simply becomes stock against a SKU nothing sells.
  `validate` checks the SKU against the feed, and the audit gate re-checks it
  against the written plan, because a variant can be lost between the two.
- **An entry naming a channel that does not exist goes `unresolved`**, waits 48
  hours and expires — the same trap as a price scoped to a missing channel, and
  the reason `load` creates channels before it imports anything.

One it can only warn about: stock in a channel that no store lists, when some
store lists others, imports cleanly and is hidden from reads through those
stores (`inventory-supply-channel-not-in-store`). A warning, because stores
created after cutover or stock read by channel are legitimate — record which.

**Zero is a figure, not a gap.** A deliberate out-of-stock has to survive the
pipeline: dropping it turns "we know there are none" into "we do not know",
which most storefronts render as available.

Keys are prefixed like any other imported resource, but they are unique among
**InventoryEntries only** — so project-wide stock for SKU `TEE-M` keys as
`<prefix>-TEE-M` alongside the variant of the same name, and that is legal.

No extra scope: `manage_products` already covers InventoryEntries and the
inventory Import Request, and `view_products` covers reading them back.
