---
name: preflight
description: "The preflight stage: what it asks the project, the diagnostics it reports, and the project-wide attribute constraint only it can see."
metadata:
  contentType: REFERENCE
---

# The preflight stage

`preflight` is the first stage that needs credentials. It reads the project and asks whether it will accept the plan. Stage order and options are in [running-the-pipeline.md](running-the-pipeline.md).

## preflight

A handful of GETs that answer one question: will this project accept this plan?
Four always — project settings, and counts of product types, categories and
products — plus one each for channels, customer groups and tax categories when the feed
declares any, and a paginated read of every ProductType with its attributes.
Every failure it catches would otherwise surface as a wall of rejected Import
Operations, hours into a load, one error per record.

```bash
cp .env.example .env
npm run pipeline -- preflight --config ../migration/migration.config.json
npm run pipeline -- preflight --config ../migration/migration.config.json --apply
```

It prints the project it is about to write to first, with existing resource
counts, because loading into the wrong project is a real hazard.

Blocking: the project is unreachable or the credentials fail; `productCatalogModel`
disagrees with `target.catalogModel` — `catalog-model-mismatch`, which for a
Classic project asked to become Modular becomes `catalog-model-needs-copy` when the
project holds products, and `catalog-model-in-migration` is reported while a staged
migration is under way (what to do for each is in
[switching-to-modular.md](switching-to-modular.md)); the project does not accept a locale or
currency the plan needs; the default locale is not accepted; a price country the
project does not list, which the API rejects outright; a declared channel that
exists **without a role the plan needs**, since that is the one thing `load`
will not fix for itself; an attribute name the plan defines with a **different
type** from the one the project already has for that name; a tax category the
project lacks by key while **another already holds its name**
(`tax-category-name-taken`) — names are unique per project, so `load` could not
create it. Advisory: a non-empty project, counts that could not be
read (a client with project-settings scope but no product scope still gets a
useful preflight), a channel or customer group that is simply missing — that one
is a warning because `load` creates it — an attribute name whose type matches
but whose `isSearchable` does not, a project that still holds ProductTypes
under the plan's key *without* `keys.prefix`, a product selection or store that
is simply missing (both get created), and — as errors — a product selection
whose **mode** already differs, or a store whose wiring already differs, or a
store declaring a language or country the project does not accept.
A tax category that is missing is advance notice (`tax-category-will-be-created`,
with its rate count — confirm the rates with whoever owns tax); one that exists
with **other rates** is a warning (`tax-category-rates-differ`), because `load`
will not change them and the products will be taxed at the project's rates.

A selection's mode is the sharpest of those: there is no `changeMode` action,
so importing over an existing selection cannot apply the plan, and the
assortment ends up meaning the opposite of what was intended.

It checks what the **plan** needs, not only what the config declares — a plan can
carry a locale nobody remembered to list.

`--apply` adds missing locales and currencies, and nothing else. It does not
create channels or customer groups: `--apply` changes project *settings*, and
creating resources is `load`'s job, where it is reported alongside everything
else that run wrote. The update
sends the **union** of existing and needed values, because `changeLanguages` and
`changeCurrencies` replace the whole array: sending only the missing entries
would delete every locale and currency already configured. A 409 refetches and
retries with the fresh version.

`--apply` never changes `productCatalogModel`, and it will not change `countries`,
which also drives shipping and tax. The one way `preflight` changes the catalog
model is its own flag, `--switch-catalog-model`: it switches a project that holds
**no products** to `target.catalogModel` with one `setProductCatalogModel` action,
reading the product count again immediately before the write. It is a write to
the customer's project, so ask first and wait for the yes; a project with
products is refused (`catalog-model-switch-refused`), as is one whose product
count could not be read. The steps, and the log line to write, are in
[switching-to-modular.md](switching-to-modular.md#greenfield-project-switch-it).

### A project loaded before ProductType keys were prefixed

ProductType keys used to be emitted verbatim from the feed's `productType` code
(or `productTypes.defaultKey`), so a `mig` engagement created `mig-` everything
except its ProductTypes. They are prefixed now, which means a project loaded
before the fix holds `apparel-basic` where the plan says `mig-apparel-basic`.

`preflight` reports that as `product-type-keys-unprefixed`. It is a warning,
because on an empty project or one loaded since the change this is simply the
normal case — but the consequence when it does apply is sharp: the load creates
the prefixed ProductType and then **cannot move the existing products onto it**,
because a Product's ProductType cannot be changed after creation and there is no
update action for it.

On a throwaway project, delete the products and re-load. On one holding data
worth keeping, this is a migration decision: log it and decide deliberately.

The ProductType's *name* is unaffected — it still comes from the unprefixed
code, so it reads "Apparel (basic)" rather than "Mig Apparel Basic".

### The one project-wide constraint only preflight can see

An attribute **name** may hold exactly one type across the whole Project. Two
ProductTypes with nothing else to do with each other must agree, so a plan can
be internally consistent and still be refused by what the project already
holds.

This is the third project-wide constraint here, after SKU uniqueness and slug
uniqueness, and it is the only one that needs the project to be checked at all:
`audit` is offline, so it cannot see it, and the feed cannot either.

The cascade is worth recognising. A project whose `apparel-basic` holds
`material` as `ltext`, against a plan declaring it `text`, returns
`AttributeDefinitionTypeConflict` on the ProductType — and then
`AttributeNameDoesNotExist` on every product that references it. Two rejected
operations for one avoidable mismatch, and the second error names a symptom
rather than the cause.

- **A differing type is an error.** There is no update action that changes an
  attribute's type: on an existing ProductType it would have to be removed and
  re-added, deleting the values on every product using it. Preflight says so
  explicitly when the clash is on a ProductType the plan itself loads, because
  the remedy is different — a migration decision, not an edit.
- **Enum *values* may differ freely.** The documentation's own example gives
  `Color` a different value set on Jeans than on T-Shirt. Only the type is
  constrained, so preflight compares type names — and, for a `set`, its element
  type; for a `reference`, its target.
- **A matching type with a differing `isSearchable` is a warning.** The load
  succeeds, and the attribute then becomes unavailable for search, filters and
  facets across *every* ProductType — including ones working today. Nothing
  errors; the facet simply stops existing.

`derive` enforces the same rule *within* a plan
(`type-mismatch-across-product-types`), and as an **error**, not a warning:
the API refuses the clash outright. It is not the milder "legal, but a
storefront has to handle both shapes" that the two-shapes reading suggests.
