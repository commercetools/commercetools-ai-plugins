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
- [Record types](#record-types) — [`channel` / `customerGroup`](#channel-and-customergroup--prerequisites-not-imports), [`productSelection` / `store`](#productselection-and-store--assortments-and-where-they-apply), [`category`](#category), [`attributeDefinition`](#attributedefinition), [`product`](#product), [`variant`](#variant), [`asset`](#asset)
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
  store setup long before a catalog migration runs. These two are the only
  deliberate exception to `<prefix>-<sourceCode>`. ProductTypes used to be a
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
`InventorySupply` role. It is carried for fidelity and is the one field this
pipeline cannot follow through on: **no inventory is imported**, so the channels
are created and wired and every one of them holds zero stock. `validate` warns
(`store-inventory-not-migrated`) rather than letting a correct-looking store
imply migrated stock.

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
alongside `channel` and `customer-group`, which must run first.

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
