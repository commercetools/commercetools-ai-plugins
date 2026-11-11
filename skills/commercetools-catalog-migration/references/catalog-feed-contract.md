---
name: catalog-feed-contract
description: "The canonical NDJSON catalog feed: its shape, the variant axes and the two load-bearing rules, the core records, and which file holds the rest."
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

Each record type is in the file named below; this file holds what applies to all of
them.

| Read | When |
| :--- | :--- |
| this file | the shape, the variant axes and the two load-bearing rules; the `category`, `attributeDefinition`, `product` and `variant` records; what to resolve in the adapter; choosing a code; validation |
| [feed-prerequisites.md](feed-prerequisites.md) | writing the `channel`, `customerGroup`, `taxCategory` or `inventoryEntry` records, or a `validate` finding about a missing channel, tax category or stock |
| [feed-assortments.md](feed-assortments.md) | `productSelection` and `store`: assortments, which products a store offers, and the load order |
| [feed-prices-assets.md](feed-prices-assets.md) | quantity-break price tiers and `asset` records |
| [feed-customers.md](feed-customers.md) | the opt-in `customer` record, only after the user has said yes to migrating customers |
| [feed-orders.md](feed-orders.md) | the opt-in `order` record, only after the user has said yes to migrating the order history |

On this page: [Shape](#shape), [Variant axes](#variant-axes),
[the two load-bearing rules](#two-rules-that-are-load-bearing),
[Record types](#record-types),
[what to resolve in the adapter](#resolve-in-the-adapter-what-commercetools-cannot-express),
[Choosing a code](#choosing-a-code) and [Validation](#validation).

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

**A `money` attribute's value is `{currency, amount}`**, the two fields a price
has, with the amount a decimal string; a set of money is an array of them. A
list price kept for display is the usual case. `plan` converts the value to the
Import API's cent-precision money the way it converts a price, so an amount
with more decimal places than the currency allows is refused rather than
rounded, and the currency needs a `market.currencyFractionDigits` entry.
Declare the attribute as `money`: `derive` does not infer a type from
money-shaped values, because a type cannot be changed once loaded, and stops
with `money-attribute-undeclared`. The target shape is the Import API's
[`MoneyAttribute`](https://docs.commercetools.com/api/import-export/import-resources.md#moneyattribute).

A `reference` attribute is refused by `derive`
(`reference-attribute-unsupported`), because the feed has no field for the type
it points at. Carry the target's key as `text` and record that in the decision
log.

### `product`

| Field | Notes |
| :--- | :--- |
| `code`, `name` | required |
| `productType` | groups products sharing an attribute set; omit to take the configured default |
| `axes` | ordered attribute names distinguishing this product's variants; absent or empty means a single-variant product |
| `attributes` | product-level values, invariant across variants |
| `categories` | category codes |
| `taxCategory` | code of a declared [`taxCategory`](feed-prerequisites.md#taxcategory--how-products-are-taxed-per-country). Product-level in both catalog models. **Absent means the product cannot be taxed under `Platform` tax mode** |
| `slug`, `description` | optional |
| `externalId` | optional, **feed-only — dropped at map time** (see below) |

### `variant`

| Field | Notes |
| :--- | :--- |
| `sku` | required, unique across the whole feed. It is the variant's only identity: the variant's key is always `<keys.prefix>-<sku>`, made key-safe, so there is no `key` field and a feed that sends one is refused |
| `product` | owning product code; forward references allowed |
| `axisValues` | code per axis; every axis the product declares must be present |
| `axisLabels` | display text per axis; never used for identity |
| `attributes` | variant-level values |
| `prices` | every price explicit — see below |
| `images` | `url` required — **relative or absolute, as the source stores it**. `width`/`height` are optional but **default to `0x0`**, recorded as information loss: a storefront that reserves layout space from the declared size cannot, so supply them whenever the source has them |
| `assets` | media assets — prefer these over `images` when the source has several renditions per shot |
| `isMaster` | optional hint; at most one per product. Absent ⇒ **lowest SKU by sort order** — deterministic, but arbitrary as merchandising. See below |
| `externalId` | optional, **feed-only — dropped at map time** (see below) |

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

**Anything that needs a different commercetools concept.** A quantity break
priced per band rather than for the whole quantity is a Cart Discount (a price
tier prices the whole quantity); a net/gross decision is a tax mode; a category
that is really a facet is an attribute. This pipeline's job is to *detect and report* that the
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
