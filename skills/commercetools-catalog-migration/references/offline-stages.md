---
name: offline-stages
description: "The four stages that need no credentials: validate, derive, plan and audit, with the diagnostics each reports, what the freshness digest checks, and what each gates."
metadata:
  contentType: REFERENCE
---

# The offline stages: validate, derive, plan, audit

These four stages need no credentials and no network, and run in this order, each gating the next. Stage order, options and progress output are in [running-the-pipeline.md](running-the-pipeline.md).

## validate

Schema conformance, then catalog-wide integrity — and integrity only runs once
every record parses, because a rejected record drops a product from the index
and makes the integrity pass invent orphans that are really just consequences of
the earlier failure.

Catches: malformed JSON, schema violations, unknown record types, duplicate
codes and SKUs, missing category parents, category cycles, orphan variants,
products without variants, missing category references, axis coverage and
uniqueness, localized axes, axes declared at product level, attributes written
but not declared, level mismatches, multiple master-variant claims.

It also checks the feed against the **config**, which is not a contract concern
but is something only this stage can see early:

- **A price scoped to an undeclared channel or customer group.** An error:
  `load` creates the ones the feed declares, so an undeclared reference is one
  nothing will create, and it expires unresolved after 48 hours taking the
  price with it. A price channel also needs the `ProductDistribution` role —
  an error under standalone pricing, which the API rejects outright, a warning
  under embedded.
- **Tax.** A product referencing an undeclared `taxCategory` is an error: the
  whole product draft would wait on it and expire. Two rates for one
  `(country, state)` in a category are an error too, as are sub-rates that do not
  sum to the rate's `amount` (`tax-subrates-sum-mismatch`). The rest are warnings,
  because the feed cannot know the cart tax mode:
  `products-without-tax-category` (once, with a count — under `Platform` those
  products cannot be taxed), `tax-category-without-rates`,
  `tax-rate-country-missing` (a country the category's products are priced in,
  or a store trades in, with no rate), and `tax-category-never-referenced`.
  A feed with no tax categories at all gets the first one on every run; under
  `External` or `ExternalAmount` tax mode, set `target.taxMode` to say so and it
  stops, and record why in `DECISIONS.md`. The same setting silences
  `tax-category-without-rates` and `tax-rate-country-missing`, because an outside
  service supplies the rate. It does not touch the checks that are wrong in every
  mode: a duplicated rate scope, a product naming an undeclared category, and a
  category no product references.

  On a slice of the catalog, `tax-category-never-referenced` and
  `channel-never-referenced` are expected: the products that use those
  prerequisites sit outside it. Set `feed.subset: true` in the config for that
  run and `validate` reports them as one line, `subset-unreferenced-declarations`,
  naming each. It holds them back rather than dropping them, so remove the flag
  for the full load, where an unreferenced prerequisite is a real finding.
- **A dangling or self-defeating assortment.** A product assigned to an
  undeclared selection (the assignment is silently dropped — nothing fails, the
  assortment is just wrong); a store listing an undeclared channel, or one
  whose roles do not match the list it is in; an empty `Individual` selection,
  which offers nothing; and a store whose selections are all inactive with at
  least one `Individual`, which offers **no products at all** where an *empty*
  list would have offered everything.
- **Relative image or asset-source URLs with no `media.baseUrl`.** An error,
  not a warning:
  the host is not in the export, a wrong one 404s every image undetectably,
  and the contract previously forced authors to invent one by rejecting
  relative paths outright.
- A price in a currency `market.requiredCurrencies` does not list, reported
  once per currency with the first price that uses it. Left to `plan` it would
  surface once per affected variant, two stages later.
- **Which catalog model the catalog requires.** Classic caps at 100 variants
  per product, Modular at 10,000, and that is purely a function of variant
  counts — so the feed can settle it with no credentials and no plan. The
  report states the largest product and the model it needs even when Classic
  fits, because "Classic is enough" is the answer someone is looking for.

A catalog needing Modular while the config says `Classic` is a hard error,
because the import shape is fixed at map time: the remedy is to set
`target.catalogModel` and re-run `plan`, not to edit the config and load
anyway. The stage footer drops its usual "fix it in the adapter" advice when
the catalog model is the only error — the feed is correct, and splitting
products to fit Classic would be reshaping a catalog to suit the tool.

Diagnostics name a file and a line. Fix the adapter, not the feed.

## derive

Builds ProductTypes from declarations, or infers them from observed values. See
[product-model.md](product-model.md).

`out/MODEL-REVIEW.md` is first written here. It groups what needs a human into
irreversible choices, information loss needing sign-off, and guesses, but only
those of the product model: sign off on the version `plan` writes, below.

Fatal here: an attribute that is an axis for some products in a ProductType and
a plain attribute for others; one at product level on some records and variant
level on others; one holding mixed value kinds; and `isSearchable` disagreeing
across ProductTypes for a shared name.

## plan

Constructs the drafts. It does not verify — that is `audit`'s job, and keeping
them apart is what makes the audit trustworthy.

Four things are *resolved* here, each covered in its own reference: minor-unit
money conversion, slug allocation and disambiguation, order-hint encoding, and
deterministic master-variant selection.

`plan` rewrites `out/MODEL-REVIEW.md` with the decisions it records as well:
each tax category's rates (what shoppers are charged, and whether prices read as
gross or net), a key that fell back, stock and price handling. Those are the
entries a reader of the `derive` version never sees, so this is the file to read
and sign off before `audit`. Running `derive` again afterwards shrinks it back to
the product model, so run `plan` last.

Two structural points worth knowing when reading a plan:

- Product-level attributes appear on **every** variant, because `SameForAll`
  enforces that variants agree rather than distributing a value.
- Axis values appear as ordinary attribute values holding the enum **key**.
  `axisLabels` never reach a variant.

Output:

| File | Purpose |
| :--- | :--- |
| `out/plan.json` | what the load stage consumes |
| `out/key-map.json` | source identifier → key, for delta runs and rollback |
| `out/decisions.json` | the full decision log |
| `out/sample-payloads.md` | with `--payloads`: one product per variant shape as it will be sent — with its `VariantImport` resources under `Modular`, and a `StandalonePriceImport` body under `standalone` — and every price of its SKUs decoded back to decimal, marked embedded or standalone |

Products are always planned with `publish: false`. Import staged, review in the
Merchant Center, publish deliberately.

**On a first load that is what you want. On a re-load into a project whose
products are already published, it takes the catalog offline.** `publish` is
not "leave publication alone" — it is an instruction, and `false` is an
instruction to unpublish. Per the
[Import API best practices](https://docs.commercetools.com/api/import-export/best-practices.md#manage-published-state-of-products):

| `publish` | Import carries changes | Result on an existing Product |
| :--- | :--- | :--- |
| `false` | no | **the Product is unpublished** |
| `false` | yes | changes go to staged, **the Product is unpublished**, `hasStagedChanges` becomes true |
| `true` | yes | applied to current and staged. `ProductDraftImport` publishes an unpublished Product; `ProductImport` does not |
| `true` | no | staged changes are applied and the Product is published |

Nothing errors. Every operation reports `imported`, and the storefront — which
reads `current` — goes blank for every product the run touched. So before any
`--execute` against a project that is already live, establish whether its
products are published, and treat re-loading a live catalog as its own decision
with its own entry in `DECISIONS.md`. A first load into an empty project is the
case this default was designed for; it is not the only case a pipeline gets
pointed at.

Plans are deterministic: the same feed produces a byte-identical plan, which is
what makes a diff between runs meaningful.

## audit

The gate. It reads `plan.json` back **from disk** and re-derives every invariant
from the drafts as data — it never touches the feed or the mapper.

That independence is the point. A verifier sharing logic with the writer confirms
the writer's bugs rather than finding them, and reading the file means the gate
checks what will actually be sent. It also keeps working on a hand-edited or
replayed plan.

### Reading from disk has one cost, and it is checked

The plan and the feed can drift apart, and the shape is this: `plan` fails,
writes nothing, and leaves the **previous** run's `plan.json` in place.
`audit` then reports **zero errors** — against a plan that no longer describes
the feed, which by now contains a duplicate SKU. That is the exact invariant
the gate exists to catch, and the gate cannot see it: the stale plan is
internally consistent, just describing data nobody is going to load.

So `plan` stamps `plan.json` with `provenance.feedDigest`, a SHA-256 over the
feed's `*.ndjson` files, and both `audit` and `load` refuse a mismatch:

| State | Code | Severity |
| :--- | :--- | :--- |
| Digest matches the feed | — | nothing reported |
| Digest differs | `plan-stale` | **error** — nothing audited, nothing loaded |
| No digest at all | `plan-provenance-unknown` | warning — re-run `plan` to stamp it |

An absent digest is deliberately *not* an error: a hand-written plan has none,
and the gate is meant to work on those. But it cannot be called fresh either,
so it reports as unknown rather than passing quietly.

The digest covers file **names** as well as contents — a rename changes what
the plan claims provenance from — but not the directory path, so moving an
engagement or reading it through a different relative path keeps the plan valid.

Forty codes block the load. The count was stale here for a while, and a
list that has stopped matching the code is worse than no list — this one is
generated from `severity: 'error'` in `audit/gate.ts`:

| Area | Codes |
| :--- | :--- |
| Identity and content (10) | `duplicate-resource-key` (unique per resource type: a category and a product may share a key, variant keys are unique among variants project-wide), `duplicate-sku` (project-wide), `duplicate-slug` (per locale), `duplicate-price-key`, `variant-without-sku`, `invalid-key`, `invalid-slug`, `invalid-order-hint` (outside (0,1) or ending in `0`), `missing-name`, `dangling-product-type` |
| References (2) | `dangling-category-parent`, `dangling-category-reference` |
| Attributes (5) | `attribute-not-declared`, `attribute-type-mismatch` (including set element types), `enum-value-not-declared`, `duplicate-attribute`, `required-attribute-missing` |
| Constraints (2) | `same-for-all-violation` (values disagreeing, or present on only some variants), `combination-unique-violation` |
| Prices (4) | `duplicate-price-scope`, `overlapping-price-validity`, `currency-not-configured`, `fraction-digits-mismatch` |
| Price mode (5) | `product-price-mode-mismatch`, `embedded-prices-in-standalone-mode`, `standalone-prices-in-embedded-mode`, `duplicate-standalone-price-scope`, `standalone-price-orphan` |
| Inventory (3) | `inventory-sku-not-in-plan` (the Import API accepts stock for a SKU that does not exist), `inventory-quantity-invalid`, `duplicate-inventory-scope` (unique per `(sku, supplyChannel)`) |
| Tax (3) | `dangling-tax-category` (a product referencing a category the prerequisites do not declare), `tax-rate-invalid` (an amount outside [0, 1] — the message does the arithmetic on a percentage — a missing name, a country that is not ISO alpha-2, sub-rates that do not sum to the amount), `duplicate-tax-rate-scope` |
| Assets (4) | `asset-without-source`, `asset-without-name`, `duplicate-asset-key` (per variant or category, **not** per project), `duplicate-asset-source-key` (within one asset) |
| Limits (2) | `variant-limit-exceeded` (100 per Product under `Classic`, 10,000 under `Modular`), `price-limit-exceeded` (100 embedded per Variant, embedded mode only) |

Eight more are warnings — they describe a catalog that will load and may still
be wrong: `approaching-variant-limit`, `attribute-never-populated`,
`category-without-products`, `no-prices-planned`, `order-hint-absent`,
`overlapping-standalone-price-validity`, `product-without-category`,
`variant-without-price`.

`approaching-variant-limit` applies to `Classic` only: it fires for a product
past 80 variants, before the 100 cap bites, and never under `Modular`, whose cap
is 10,000. `attribute-never-populated` is more than a hint: `derive` leaves such
an attribute off the ProductType, so it will not exist in the project after the
load, however the definition was declared.

Findings are grouped by check and capped per code, because one broken assumption
in an adapter produces hundreds of instances of a single code and a flat list
buries every other finding. Use `--json` for the complete set.

Cascades are suppressed: a product whose ProductType does not exist is not also
reported for every missing required attribute.
