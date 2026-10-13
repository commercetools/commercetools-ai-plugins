---
name: product-model
description: "Deriving ProductTypes from declared or inferred attribute definitions, the irreversible attribute constraints, product versus variant level, and the Project-wide attribute-name rules."
metadata:
  contentType: REFERENCE
---

# The product model

How ProductTypes and their attributes are derived, and which of those choices
cannot be undone.

Reference: [Product Types](https://docs.commercetools.com/api/projects/productTypes.md),
[attribute types](https://docs.commercetools.com/learning-model-your-product-catalog/attribute-types-and-attribute-groups/attribute-types.md).
Fetch the `api-ProductType` schema from the commercetools Knowledge MCP when you
need exact field shapes.

## Declared or inferred

**Declared** — the feed carries `attributeDefinition` records because the source
has a type system. Derivation is a translation, and every choice has a
defensible origin.

**Inferred** — the feed carries none, so definitions are reconstructed from
observed values. Every guess is recorded with `review: true` and has to be
signed off. Inference is a fallback; emitting declarations from the adapter is
the reliable fix.

Inference reads **values, never field names**, and refuses to guess rather than
guessing wrongly: an attribute holding both strings and numbers is an error, not
a coerced `text`.

What inference can and cannot recover, on the same catalog:

| | Declared | Inferred |
| :--- | :--- | :--- |
| Types, levels, constraints | from the declaration | reproduced from values |
| A localized enum | `lenum` with labels | degrades to `enum`, code as label |
| Labels | as supplied **if the source has any** — many type systems have only a description field, and then declared attributes get humanized names too | humanized attribute name, default locale only |
| Units | carried into the label | lost — nothing to carry |
| `isRequired` | honoured when fully populated | never inferred |

Set `productTypes.onMissingDefinitions` to `require` to refuse to guess at all.

**Declaring types does not guarantee labels.** The table above reads as though
declaration buys readable labels; it buys them only where the source carries
them. A hybris `items.xml` has `<description>` — developer documentation, not a
merchandiser-facing label — and no label field at all, so a fully declared
type system can still see the large majority of its attributes fall back to
humanized names. Check
whether the source has a real label field during discovery, and if it does not,
say so in the mapping proposal: the Merchant Center will show
`Fabric composition` derived from `fabricComposition`, which is usually
acceptable and occasionally not.

## Attribute constraints are irreversible

`changeAttributeConstraint` accepts only `None` — `AttributeConstraintEnumDraft`
has exactly that one value. A constraint can therefore be **relaxed** later, but
never tightened or switched.

Getting it wrong means recreating the attribute and rewriting its data. This is
the single most consequential decision in the whole migration, which is why
`derive` records every non-`None` constraint as `irreversible` and
`MODEL-REVIEW.md` leads with them.

| Source situation | Constraint | Why |
| :--- | :--- | :--- |
| Part of variant identity | `CombinationUnique` | the platform then enforces one variant per combination |
| Invariant across a product's variants | `SameForAll` | variants cannot disagree |
| Varies freely per variant | `None` | no constraint to enforce |
| Must differ on every variant | `Unique` | rarely what a migration wants |

`SameForAll` enforces that variants *agree*; it does not distribute a value. A
product-level value therefore has to be written onto **every** variant, and an
attribute present on some variants but not others is refused.

## Product level versus variant level

`AttributeLevelEnum` is `Product` or `Variant`, and the trade-off is real:

- **`Product`** — a native product-level attribute. Supported by
  [Product Search](https://docs.commercetools.com/api/projects/product-search.md)
  but **not** by
  [Product Projection Search](https://docs.commercetools.com/api/projects/product-projection-search.md).
- **`Variant` + `SameForAll`** — readable from both search APIs.

Product Projection Search is deprecated and cannot be activated on Projects
created after 31 August 2026; Product Search replaces it, and the
[migration guide](https://docs.commercetools.com/guides/migration-guides/product-search-migration-guide.md)
covers the move. So on a new Project Product Search is the only search API
there is, and the case against `native` is not the other API's gap: `derive`
accepts `native`, but `plan` refuses it (`native-product-level-not-mapped`)
because it writes Product-level attributes in a different shape.
`productTypes.productLevelStrategy` defaults to `sameForAll` for that reason,
and `sameForAll` is the value to use.

**Do not repeat `keys.prefix` in `defaultKey`.** Every resource key is
prefixed, ProductTypes included, so `keys.prefix: "acme"` with
`defaultKey: "acme-apparel"` produces `acme-acme-apparel`. `validate` warns
(`product-type-key-doubles-prefix`); the key cannot be changed once products
reference the ProductType.

**The names read backwards, so read them twice.** `sameForAll` is the safe
default and `native` is the one that makes attributes invisible to Product
Projection Search, which an existing Project may still use — so the
cautious-sounding option is the risky one, and the option that sounds like a
workaround is the one to pick. The values name *what
the pipeline does* (write a variant attribute constrained `SameForAll`, or use
the platform's native Product level), not how safe they are.

## An attribute name is a Project-wide declaration

Two invariants hang on this, and neither is scoped to a ProductType.

**The type must be identical.** An attribute name may hold exactly one type
across the whole Project. Two ProductTypes that share a name must agree, and
the API enforces it with `AttributeDefinitionTypeConflict` — after which every
product referencing that attribute fails `AttributeNameDoesNotExist`. So a plan
that is internally consistent can still be refused by a ProductType the
migration never touches:

> A load declared `material` as `text`. An unrelated existing ProductType had
> it as `ltext`. Both operations were rejected.

`derive` catches the clash within a plan; `preflight` is the only stage that can
catch it against the project, because it is the only one that reads the project.
**Enum `values` may differ freely** — the documentation's own example gives
`Color` a different value set on Jeans than on T-Shirt. Only the type is
constrained, along with a `set`'s element type and a `reference`'s target.

There is no update action that changes an attribute's type. On a ProductType
that already exists, the fix is to remove and re-add the attribute, which
deletes its values on every product using it. Treat it as a migration decision.

**`isSearchable` must agree too.** To use one attribute name across several
ProductTypes for search, filters or facets, `isSearchable` must be `true` on
**all** of them. If the values differ, the attribute becomes unavailable for
search, filters and facets everywhere.

That one fails silently: the import succeeds and the facet is simply missing.
`derive` treats a mismatch within the plan as an error, and `preflight` warns
when the plan disagrees with the project — which can break a facet that works
today.

Axes are always searchable. Everything else follows
`productTypes.searchableByDefault`.

## Grouping products into ProductTypes

Products group by their declared `productType`, falling back to the configured
default. A ProductType's attribute set is the **union** across its members,
since any member may set any of them.

One ProductType per product is a modelling mistake — it defeats the point of a
shared blueprint and burns through the project limit of 1000 ProductTypes — so
the grouping never invents keys.

Three clashes are fatal, because a ProductType cannot express them:

- **An attribute that is an axis for some products in the group and a plain
  attribute for others.** Constraints belong to the ProductType, not the
  product. Split the ProductType, or make the axis consistent.
- **An attribute at product level on some records and variant level on others.**
  One attribute cannot be both `SameForAll` and free-varying.
- **An attribute holding more than one kind of value.** Declare it explicitly or
  fix the adapter.

## Choosing types

| Source shape | Type | Note |
| :--- | :--- | :--- |
| Plain string | `text` | |
| Per-locale text | `ltext` | |
| Fixed value set with stable codes | `enum` / `lenum` | keys must be codes, not display text |
| Number | `number` | no unit concept — see below |
| Boolean | `boolean` | |
| Calendar date, timestamp, time | `date`, `datetime`, `time` | ISO form; inferred only on full agreement |
| Multiple values | `set` of the element type | |

**A unit is appended to the label, whatever the type.** commercetools
attributes have no unit concept anywhere, so `unit` on an `attributeDefinition`
is carried into the label and is no longer machine-readable — a consumer cannot
convert or compare across units. Recorded as information loss.

This is **not** limited to `number`. A measurement the source expresses as a
range ("18–24 °C") has no single numeric type to go in, and there are two
honest mappings rather than one right answer:

| | Keeps | Loses |
| :--- | :--- | :--- |
| One `text` / `ltext` attribute | the source's exact wording, including any "up to" or "approx." | comparability — and **facetability**: with `searchableByDefault: true` a value like `"20 - 30"` becomes a filter nobody can use |
| Two `number` attributes (`…Min`, `…Max`) | filtering, sorting and range queries | the original phrasing, and any range that is not two plain numbers |

Pick on whether the attribute has to be **searchable**. That is the deciding
factor and it is easy to miss: a faithful text range is the safer-looking
choice and quietly produces a useless facet. Splitting is a decision worth
logging either way — the source said one thing and the project now holds two.

`unit` behaves the same in both: it reaches the label and no further.

**Date, time and datetime have exact accepted forms**, checked by the audit
gate and used by inference:

| Type | Form | Example |
| :--- | :--- | :--- |
| `date` | `YYYY-MM-DD` | `2026-09-30` |
| `time` | `HH:MM`, optionally `:SS` or `:SS.sss` | `14:30`, `14:30:00.000` |
| `datetime` | `YYYY-MM-DDTHH:MM` plus seconds, **and an offset or `Z`** | `2026-09-30T00:00:00Z` |

A `datetime` with no zone is rejected. That matters when the source has bare
dates: `30/09/2026` becomes `2026-09-30T00:00:00Z`, which is **midnight at the
start of the day**, so a window ending on it excludes that day. Whether the
source meant inclusive is a question for the customer, not a coercion rule —
decide it, log it, do not silently add a day.

**A bare date also has no timezone, and `Z` quietly makes it UTC.** Which
timezone the source's dates are in is a second question for the customer,
usually the store's. Midnight on `30/09/2026` in a UK store (BST, +01:00) is
`2026-09-30T00:00:00+01:00`, the instant `2026-09-29T23:00:00Z`; written as
`2026-09-30T00:00:00Z` it starts an hour late, and a sale window ending on it
ends an hour late too. The offset follows the date, not the store: a UK window
that starts on `01/10/2026` (`+01:00`) and ends on `31/10/2026` ends in GMT
(`+00:00`), because the clocks go back on 25 October, so the two ends convert
differently. The API's
[DateTime](https://docs.commercetools.com/api/types.md#datetime) is a UTC
string, so have the adapter write the UTC instant. Log the timezone you
assumed, and who confirmed it.

**A value's own label is separate from the attribute's.** The fallback rules
above are about the *attribute* label. Each `enum` / `lenum` **value** carries
its own, and an omitted one falls back to the key in the default locale:

| Declared as | Value label supplied | Result |
| :--- | :--- | :--- |
| `lenum` | `{"en-GB": "Warm"}` | used as given |
| `lenum` | `"Warm"` (plain string) | `{"<defaultLocale>": "Warm"}` |
| `lenum` | omitted | `{"<defaultLocale>": "<key>"}`, recorded as lossy |
| `enum` | `"Warm"` | used as given |
| `enum` | `{"en-GB": "Warm", "de-DE": "Warm"}` | the default locale's value; others dropped, recorded |
| `enum` | omitted | the key, recorded as lossy |

Two consequences worth planning around. A plain `enum` holds **one** label per
value, so a source with per-locale display text needs `lenum` or the other
locales are lost. And a derived label means merchandisers see the raw code in
the Merchant Center — small, but it is loss, so it appears in
`MODEL-REVIEW.md` rather than happening quietly.

**Low-cardinality strings are not automatically enums.** Enum keys must be
stable codes, and source strings are usually display text. Inference maps them
as `text` and raises the enum question rather than minting unstable keys.

**Nested and set-of-nested attributes are not searchable and cannot target
discount predicates.** Do not choose them for anything that must facet or drive
a promotion. A `set` chain terminating in `nested` is limited to 5 steps.

## Review the source model; do not just translate it

The most valuable output of a migration is often a defect found in the source.
Worth raising rather than silently carrying across:

- A variant axis with no stable code, only a localized name.
- Categories that are really facets.
- Attributes that encode business rules.
- Attributes declared but never populated — usually a field the adapter dropped,
  and reported as such. The pipeline leaves them off the ProductType, so a source
  model that must be mirrored exactly needs that said up front.
- A 300-attribute ProductType serving eight facets.

## Output

`derive` writes:

- `out/product-types.json` — the drafts, for the load stage and for diffing.
- `out/decisions.json` — the machine-readable decision log.
- `out/MODEL-REVIEW.md` — the sign-off artefact, grouped into irreversible
  choices, information loss, and guesses. Nobody reviews a JSON file.

Every decision carries a rationale. The rationale is not a comment; it is the
deliverable. A mapping added without one is an incomplete change, because the
next reader cannot tell whether the choice was considered or accidental.
