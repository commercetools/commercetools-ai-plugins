---
name: catalog-feed-contract
description: "Every record type in the canonical NDJSON catalog feed, with the two load-bearing rules: axis codes are separate from axis labels, and money is a decimal string."
metadata:
  contentType: REFERENCE
---

# The canonical catalog feed

The pipeline's source boundary. Adapters write these shapes; the pipeline reads
nothing else. No source system is named anywhere in the contract, by design.

Authoritative schema: `schema/catalog-feed.schema.json` in the
[pipeline repository](https://github.com/commercetools/ct-catalog-migration-pipeline)
(JSON Schema draft 2020-12). This page explains the intent; the schema is what
validates.

- [Shape](#shape)
- [Variant axes](#variant-axes)
- [Two rules that are load-bearing](#two-rules-that-are-load-bearing) — [axis codes vs labels](#axis-codes-and-axis-labels-are-separate-fields), [money as a decimal string](#money-is-a-decimal-string-never-a-json-number)
- [Record types](#record-types) — [`channel` / `customerGroup`](#channel-and-customergroup--prerequisites-not-imports), [`taxCategory`](#taxcategory--how-products-are-taxed-per-country), [`productSelection` / `store`](#productselection-and-store--assortments-and-where-they-apply), [`category`](#category), [`attributeDefinition`](#attributedefinition), [`product`](#product), [`variant`](#variant), [`asset`](#asset), [`inventoryEntry`](#inventoryentry--stock-per-sku-and-supply-channel)
- [Resolve in the adapter what commercetools cannot express](#resolve-in-the-adapter-what-commercetools-cannot-express)
- [Choosing a code](#choosing-a-code) — [`externalId` only maps on a category](#externalid-only-maps-on-a-category)
- [Validation](#validation)

## Shape

A feed is a **directory** of `*.ndjson` files. One JSON record per line, each
tagged with `_type`. Splitting across files is the adapter's choice — record
order is not significant, and forward references are allowed, so an adapter can
stream products before the categories they belong to.

```jsonc
{"_type":"category","code":"tops","name":{"en-GB":"Tops"},"parent":"apparel","sourceOrder":1}
{"_type":"attributeDefinition","name":"colour","type":"lenum","level":"variant","axis":true,
 "values":[{"key":"BLK","label":{"en-GB":"Black"}}]}
{"_type":"product","code":"TEE-01","name":{"en-GB":"Cotton Tee"},"categories":["tops"],
 "axes":["colour","size"],"attributes":{"material":{"en-GB":"Cotton"}}}
{"_type":"variant","sku":"TEE-01-BLK-M","product":"TEE-01",
 "axisValues":{"colour":"BLK","size":"M"},
 "prices":[{"currency":"GBP","amount":"19.99","country":"GB"}]}
```

## Variant axes

An **axis** is a dimension along which a product's variants differ. A tee in 3
colours × 4 sizes has two axes — `colour` and `size` — and each of its 12
variants is one point in that grid.

The term is the feed's own. commercetools has no axis field: the platform says
the same thing with `attributeConstraint: 'CombinationUnique'` on a
variant-level attribute, and `derive` performs that translation. The feed
records what the source means; the pipeline chooses the mechanism.

Three records share the work:

- an `attributeDefinition` with `"axis": true` declares that an attribute may
  carry variant identity — only legal at `"level": "variant"`;
- a `product` lists the axes **it** varies by in `axes`, in order; absent or
  empty means a single-variant product;
- a `variant` gives its own coordinate in `axisValues`, with display text kept
  separately in `axisLabels`.

An axis is not merely an attribute whose value happens to differ between
variants. Four things follow from marking one:

- **The constraint is a one-way door.** `CombinationUnique` can be relaxed to
  `None` later but never re-tightened or switched, because
  `changeAttributeConstraint` accepts only `None`. Getting it wrong means
  recreating the attribute and rewriting its data, which is why `derive` records
  every such choice as irreversible.
- **Values must be language-independent codes**, never localized text — the
  next section is that rule.
- **Coverage and uniqueness are enforced.** Every variant must carry a value for
  every axis its product declares, and no two variants of one product may share
  a combination.
- **An attribute cannot be an axis in one product and a plain attribute in
  another product of the same ProductType.** One definition carries one
  constraint, so the ProductType has to be split — see
  [product-model.md](product-model.md).

## Two rules that are load-bearing

These are enforced by the schema rather than left to discipline, because both
failure modes are silent.

### Axis codes and axis labels are separate fields

`axisValues` takes a language-independent **code** per axis. `axisLabels` takes
display text. A localized value therefore *cannot* become variant identity.

```jsonc
// Correct — identity is a code, display text is separate
{"axisValues":{"colour":"BLK"},"axisLabels":{"colour":{"en-GB":"Black","de-DE":"Schwarz"}}}

// Wrong, and the schema rejects an ltext axis: the same SKU would key
// differently per language and break when a second locale is added
{"axisValues":{"colour":"Black"}}
```

If the source only has a localized colour *name* with no stable code, derive one
in the adapter and record the derivation. That derivation is a decision worth
reviewing, not an implementation detail.

**One code, one label.** A `lenum` holds a single label per key, so if two
products give the same axis code different display text — `M` as "Medium" on
one style and "Mid" on another — only the first survives. `derive` reports
which labels it dropped (lossy, needing review) rather than picking quietly,
because the winner used to depend on feed line order.

Three ways out, and the choice turns on whether the axis has to work as a
**cross-product facet**:

| | What it costs |
| :--- | :--- |
| **Pick one label deliberately** | The other wording is lost. Fine when the labels are synonyms ("Medium" / "Mid"); wrong when they name different things. |
| **Make the codes differ** | Keeps both meanings and keeps the facet — but only if the source has something stable to differ *by*. Deriving a code from a field the source does not guarantee is stable breaks a repeatable load, so check the re-export answer from step 0c first. |
| **Keep the shared code, carry the exact wording as its own attribute** | Keeps the facet *and* every label. The per-variant text stops being variant identity, which is usually correct — it was display text, not a code. |

What to avoid: keying the axis on something per-product, such as a full
style-plus-colour code. It resolves the collision and **destroys the axis as a
facet** — every product gets its own value set, so "show me everything in
black" cannot be expressed. It is the route a source with no distinguishing
code invites, and the third row above is the better answer in exactly that
situation.

**`axisLabels` only reach the project on an `enum` or `lenum` axis.** Those are
the only types with a key and display text as separate fields. An axis declared
`text` *is* its own display text, so every label supplied for it is discarded —
`derive` warns (`axis-labels-ignored`) rather than dropping them silently.

### Money is a decimal string, never a JSON number

```jsonc
{"currency":"GBP","amount":"19.99"}   // correct
{"currency":"GBP","amount":19.99}     // rejected by the schema
```

A binary float cannot represent most decimal amounts exactly, and the error
surfaces as an off-by-one cent on a fraction of records — the worst kind of
migration defect, because it looks like everything worked. Minor units are
derived at map time from the currency's configured `fractionDigits`, and an
amount with more decimal places than the currency allows is a hard error rather
than a silent rounding. Detail in [pricing-and-money.md](pricing-and-money.md).

## Record types

All `code` fields are language-independent identifiers matching
`[A-Za-z0-9_-]`, and they end up inside commercetools keys, so they must be
**stable across exports**. A code that changes between runs creates a duplicate
rather than an update.

### `channel` and `customerGroup` — prerequisites, not imports

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
- **A teardown scoped to `keys.prefix` will not remove them.** If the load
  created one, it has to be removed by hand.
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

### `taxCategory` — how products are taxed, per country

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
| `rates[]` | optional; each `{country, state?, amount, includedInPrice, name?, subRates?}` |

| `rates[]` field | Notes |
| :--- | :--- |
| `country` | required, ISO 3166-1 alpha-2. A rate is selected by **exact** match on the shipping address |
| `state` | optional, case-sensitive. A rate with a state matches only carts whose address carries the same state |
| `amount` | required, a **fraction**: `0.2` for 20%. The schema refuses anything above 1, because a source's `20` copied across is a 2000% rate |
| `includedInPrice` | required, **no default** — `true` means prices are gross for that country, `false` net. Backwards, every price is off by the rate |
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

The feed cannot express **`taxRoundingTarget`**; report it as loss if the source
needs it.

A teardown scoped to `keys.prefix` will not remove a tax category. No extra
scope for the load: `manage_products` grants tax categories for backward
compatibility, as do the dedicated `view_tax_categories` and
`manage_tax_categories`.

### `productSelection` and `store` — assortments, and where they apply

These two answer a different question from everything else in the contract: not
*what* the catalog contains, but **which products exist, and at what price, in
a given shopping context.** They also split along the line that organises this
whole pipeline:

| | Import API | Key | Teardown |
| :--- | :--- | :--- | :--- |
| `productSelection` | **yes**, resource `product-selection` | `<prefix>-<code>` | removed by a prefix-scoped teardown |
| `store` | **no** — platform API | **verbatim** | left behind |

#### How prices, channels and stores actually relate

There is **no `store` field on a price.** Ever. The relationship is indirect
and mediated entirely by channels:

```
Price ──carries──> Channel (role: ProductDistribution)
                      ^
Store ──lists─────────┘  distributionChannels[]
```

In a store's context the candidate prices are those whose channel the store
lists, **plus every price with no channel at all**. Selection among the
candidates then follows the documented fallback: customer group + channel +
country, then progressively dropping dimensions, down to the bare price.

Three consequences worth planning around:

- **The channel is the pricing unit; the store is only the binding.** Giving
  three stores three different prices means three *channels*. A store with no
  distribution channels sees only channel-less prices.
- **Equal specificity is ambiguous, and the platform will not resolve it.** If
  a store lists two distribution channels and a variant is priced in both, both
  match at the same fallback step, and the storefront has to disambiguate with
  `setLineItemDistributionChannel`. Modelling "one channel per price list *and*
  one per store" is legal and needs middleware — know that before choosing it.
- **Cheapest wins within a step.** A stray channel price silently undercuts the
  intended one rather than erroring.

`supplyChannels` is the inventory twin — the same Channel resource with the
`InventorySupply` role. It is **wiring only**: the stock itself is
[`inventoryEntry`](#inventoryentry--stock-per-sku-and-supply-channel) records
naming that channel. A store listing a supply channel nothing stocks gets
created, wired and empty, so `validate` warns
(`store-supply-channel-unstocked`) rather than letting a correct-looking store
imply migrated stock. The reverse warns too: a store that lists supply
channels projects stock **only** from those (plus project-wide stock), so a
stocked channel no store lists is invisible through every such store
(`inventory-supply-channel-not-in-store`). A store listing none filters
nothing.

#### Product selections decide which products exist

A selection is a named subset of the catalog. On its own it does **nothing** —
it takes effect only when a store references it.

| `productSelection` field | Notes |
| :--- | :--- |
| `code` | required |
| `name` | required, localized |
| `mode` | `Individual` (allowlist) or `IndividualExclusion` (denylist). Defaults to `Individual`. **Permanent** |

**The mode is fixed at creation, and re-importing does not say so.** The
update actions are `setKey`, `changeName`, add/exclude/remove product and the
variant setters — there is no `changeMode`. Importing a different mode onto
an existing key reports **`imported`** and leaves the mode untouched: nothing
fails, nothing warns, and the assortment means the opposite of the plan. The
API does not document this, so treat it as observed behaviour rather than a
guarantee — but do not design around the import fixing a mode. It belongs in
the same class as `attributeConstraint`:
`preflight` reports a conflict with an existing selection as an error, `verify`
reports drift as "delete and recreate", and `plan` records the choice as
irreversible. Choose by which list is shorter to *maintain*, not which is
shorter today.

Membership is authored **on the product**, not on the selection:

```jsonc
{"_type":"product","code":"TEE","selections":[{"code":"uk-assortment"}]}
{"_type":"product","code":"DRESS","selections":[{"code":"uk-assortment","includeSkus":["D-S","D-M"]}]}
```

| `selections[]` field | Notes |
| :--- | :--- |
| `code` | required — a declared `productSelection` |
| `includeSkus` | only these variants |
| `excludeSkus` | all variants except these. **Mutually exclusive with `includeSkus`** |

With neither, every variant is in. A SKU that is not a variant of *that*
product selects nothing and the platform prunes it silently, so `validate`
makes it an error.

Two things follow from the Import API's shape, and they are the reason the feed
is authored this way round:

- **Assignments cannot be split.** The API replaces omitted fields, so all of a
  selection's assignments travel in **one** resource. `plan` inverts the
  product-side authoring and assembles the complete list per selection; there
  is no batching to fall back on, and an assortment of twenty thousand products
  is one large request. `plan` flags anything above a thousand for review.
- **One line per record stays true.** A selection carrying its assignments in
  the feed would be a single twenty-thousand-element line.

#### Stores decide where it all applies

| `store` field | Notes |
| :--- | :--- |
| `code` | required — the store's key in the project, **verbatim** |
| `name` | optional, localized |
| `languages`, `countries` | optional; must be a **subset of the project's**, checked by `preflight` |
| `distributionChannels` | codes of declared channels, each needing `ProductDistribution` |
| `supplyChannels` | codes of declared channels, each needing `InventorySupply` |
| `productSelections` | at most 100, each `{code, active}`; `active` defaults to true |

Deliberately unsupported: `storefront` URLs and `custom`. Neither is catalog
data, and neither can be validated or verified here.

**The activation rule reads backwards, so read it twice:**

| Store's `productSelections` | Products offered |
| :--- | :--- |
| empty | **all of them** |
| at least one active | only the active ones' contents |
| all inactive, ≥1 `Individual` | **none at all** |
| all inactive, only `IndividualExclusion` | all of them |

An *empty* list is permissive; a list that is switched off is not.
`validate` makes the third row an error (`store-exposes-no-products`), because
it is the one an author reaches by accident while trying to stage a rollout.

#### Loading, and why the order inverts

A store references selections that the **Import API creates asynchronously**,
and a store cannot be created pointing at one that does not exist yet. So
`store` is a platform stage that runs **last**, after every import — not
alongside `channel`, `customer-group` and `tax-category`, which must run first.

`load` **refuses without `--wait`** when a store references selections. Without
waiting there is no moment at which the store stage is safe, and refusing up
front is cheaper than a catalog whose stores were never wired.

An existing store is **never modified**. `setDistributionChannels` and
`setProductSelections` replace the whole array, so applying a plan over a store
the project already configured would discard wiring this migration knows
nothing about. `preflight` and `load` both report the difference and stop.

### `category`

| Field | Notes |
| :--- | :--- |
| `code` | required |
| `name` | required, localized |
| `parent` | code of the parent; omit for a root. Forward references allowed. |
| `slug` | optional; derived from `name` when absent, then disambiguated |
| `sourceOrder` | integer sibling order — prefer this over `orderHint` |
| `orderHint` | only if the source genuinely has a valid (0,1) string |
| `description` | optional |
| `externalId` | optional — **the only externalId that reaches commercetools**; `CategoryImport` has the field |

Supply `sourceOrder` and let the pipeline encode a legal order hint. See
[categories-and-slugs.md](categories-and-slugs.md).

### `attributeDefinition`

Emit these when the source declares a type system. When the feed carries none,
the pipeline infers definitions from observed values and forces an explicit
review — inference is a fallback, not the happy path.

| Field | Notes |
| :--- | :--- |
| `name` | required, language-independent |
| `type` | `text`, `ltext`, `enum`, `lenum`, `number`, `boolean`, `date`, `datetime`, `time`, `money`, `reference` |
| `level` | `product` (invariant across variants) or `variant` |
| `axis` | true when part of variant identity; only valid at variant level |
| `set` | true to wrap the type in a set |
| `values` | required for `enum`/`lenum` |
| `searchable` | optional; overrides `productTypes.searchableByDefault` for this attribute |
| `required`, `label`, `unit` | optional |

**`searchable` is per attribute**, and the config value is only the fallback.
A source that declares searchability itself — `items.xml`'s
`search="true|false"`, for instance — should pass it through rather than let
every attribute inherit one project-wide default. Fixture:
`declared-searchable`.

Whatever is set has to agree across every ProductType that shares the
attribute name, or the attribute becomes unavailable for search, filters and
facets *everywhere* — see [product-model.md](product-model.md).

`unit` has no commercetools equivalent and is carried into the label, which
loses machine-readability — recorded as information loss. It applies to any
type, not only `number`.

### `product`

| Field | Notes |
| :--- | :--- |
| `code`, `name` | required |
| `productType` | groups products sharing an attribute set; omit to take the configured default |
| `axes` | ordered attribute names distinguishing this product's variants; absent or empty means a single-variant product |
| `attributes` | product-level values, invariant across variants |
| `categories` | category codes |
| `taxCategory` | code of a declared [`taxCategory`](#taxcategory--how-products-are-taxed-per-country). Product-level in both catalog models. **Absent means the product cannot be taxed under `Platform` tax mode** |
| `slug`, `description` | optional |
| `externalId` | optional, **feed-only — dropped at map time** (see below) |

### `variant`

| Field | Notes |
| :--- | :--- |
| `sku` | required, unique across the whole feed |
| `product` | owning product code; forward references allowed |
| `axisValues` | code per axis; every axis the product declares must be present |
| `axisLabels` | display text per axis; never used for identity |
| `attributes` | variant-level values |
| `prices` | every price explicit — see below |
| `images` | `url` required — **relative or absolute, as the source stores it**. `width`/`height` are optional but **default to `0x0`**, recorded as information loss: a storefront that reserves layout space from the declared size cannot, so supply them whenever the source has them |
| `assets` | media assets — prefer these over `images` when the source has several renditions per shot |
| `isMaster` | optional hint; at most one per product. Absent ⇒ **lowest SKU by sort order** — deterministic, but arbitrary as merchandising. See below |
| `key` | optional |
| `externalId` | optional, **feed-only — dropped at map time** (see below) |

### Relative image URLs

`image.url` accepts a relative path. Emit what the source holds rather than
resolving it: the host is usually not in the export, and the contract used to
require an absolute URI, which forced adapter authors to invent one.

A feed with any relative URL needs `media.baseUrl` in the config. `validate`
refuses the pair without it — naming the count, an example and the decision —
and `plan` resolves against it via RFC 3986, so a root-relative `/medias/x.jpg`
ignores any path on the base. Absolute URLs are untouched, and mixing is fine.

Assets follow the same rule — see `asset` below. Both are media, and a second
media path with its own resolution is how one of them ends up wrong.

### `asset`

On a **variant** or a **category**. An asset holds *several* sources, which is
the reason to prefer it over `images`: an image carries exactly one URL, so a
source with thumbnail, product and zoom renditions has to discard two of them.
A hybris MediaContainer, or any format table, is one asset with one source per
format.

| Field | Notes |
| :--- | :--- |
| `code` | required, stable — becomes `<prefix>-<code>`, because `Asset.key` is required by the API. **Unique per variant or per category, not per project** — see below |
| `sources` | required, **at least one** |
| `name` | optional, localized — derived from `code` when absent, and recorded as information loss |
| `description` | optional, localized |
| `tags` | optional strings |

Each source:

| Field | Notes |
| :--- | :--- |
| `uri` | required; relative or absolute, resolved exactly as an image URL is |
| `key` | optional — what tells renditions apart, e.g. `zoom`. Unique within the asset |
| `contentType` | optional |
| `width`, `height` | optional; both or neither, emitted as `dimensions`. Absent means `0x0`, with the same cost as an image's — see the `images` row |

**The uniqueness scope is the owner, not the project.** The API is explicit:
`Asset.key` "is unique per Category or ProductVariant". So one source asset
reused across the sizes of a colour is **one code on several variants**, which
is legal and usually what you want — the source's own container code can go
straight through. Only two assets on the *same* variant may not share a code
(`duplicate-asset-key`).

This is worth stating because the opposite assumption — asset keys unique
project-wide — makes the natural mapping look illegal and pushes an author
into inventing per-SKU codes to satisfy a rule that does not exist. An
over-strict reading here does not merely add noise; it changes the shape of
the data.

The audit gate checks the asset key like any other key — charset, and no two
assets on one owner claiming one — plus at least one source, a name in some locale, and
no duplicate source keys inside an asset. `verify` compares assets by key and
source URI, because an asset pointing at the wrong file renders a broken image
and nothing else reports it.

### `inventoryEntry` — stock per SKU and supply channel

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

## Resolve in the adapter what commercetools cannot express

**Price inheritance.** commercetools does not inherit prices between variants.
If the source inherits down a hierarchy, resolve it in the adapter so every SKU
carries an explicit price. Most target prices usually exist *because* inheritance
was resolved rather than skipped.

**Variant hierarchies deeper than one level.** commercetools has exactly one
variant level. Collapse an N-level source hierarchy in the adapter and emit a
flat SKU list with explicit axis values. Because the contract carries variants
flat, the pipeline's own types never encode a hierarchy shape — which is what
lets a 2-level and a 4-level source share the same pipeline.

**Anything that needs a different commercetools concept.** A quantity break is a
Cart Discount; a net/gross decision is a tax mode; a category that is really a
facet is an attribute. This pipeline's job is to *detect and report* that the
source needs one, not to invent it.

## Choosing a code

The code becomes part of a key, so:

- Prefer a stable machine identifier over anything a merchandiser can edit.
- Never use a localized or display value.
- Preserve the raw source identifier in `externalId` as well — but read the
  next section first, because only a *category* `externalId` survives.

### `externalId` only maps on a category

commercetools has `externalId` on `Category` and nowhere else in this
pipeline's reach: `CategoryImport` has the field, `ProductDraftImport` and
`VariantImport` do not. So a product or variant `externalId` is accepted by the
schema, carried through the feed, and **dropped at map time**.

`validate` reports it as `external-id-not-mapped` rather than letting it go
quiet. The field is still worth setting as feed provenance — it records what
the source called this record — but it will not reach the project.

**If a downstream system has to join on it, declare it as an attribute and
emit it as one.** An ERP article number or PIM id belongs in
`attributes: { articleNumber: "..." }` with an `attributeDefinition` to match;
that is the only form that lands.

This one is worth double-checking rather than assuming: setting `externalId`
on a product or variant looks like it works at every stage — the schema
accepts it, the feed carries it, and nothing warns until `validate` reports
`external-id-not-mapped`. It survives casual review for exactly that reason.

## Validation

`validate` runs in two phases. Schema conformance first; catalog-wide integrity
only once every record parses, because a rejected record drops a product from
the index and makes the integrity pass invent orphans that are really just
consequences.

Integrity covers: duplicate codes and SKUs, missing category parents, category
cycles, orphan variants, products without variants, missing category
references, axis coverage and uniqueness, localized axes, attributes written but
not declared, level mismatches, and multiple master-variant claims.

Every diagnostic names a file and a line. Fix the adapter, not the feed.
