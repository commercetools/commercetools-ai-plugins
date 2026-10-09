---
name: running-the-pipeline
description: "Each of the seven pipeline stages, what it gates, the diagnostics it reports, the scopes it needs, and the configuration file that drives them."
metadata:
  contentType: REFERENCE
---

# Running the pipeline

Seven stages, each gating the next. The first four need no credentials at all:
a defect is reported at the earliest stage that can see it, so a broken feed or
an unloadable plan says so on a laptop with no `.env`.

- [Getting the pipeline](#getting-the-pipeline)
- [The stages](#the-stages) — [progress while one runs](#progress-while-a-stage-runs)
- [What is built](#what-is-built)
- [validate](#validate)
- [derive](#derive)
- [plan](#plan)
- [audit](#audit) — including [the freshness digest](#reading-from-disk-has-one-cost-and-it-is-checked)
- [preflight](#preflight) — [unprefixed ProductType keys](#a-project-loaded-before-producttype-keys-were-prefixed), [the project-wide attribute constraint](#the-one-project-wide-constraint-only-preflight-can-see)
- [load](#load) — [platform stages](#platform-stages-at-opposite-ends-of-the-run), [prerequisites](#prerequisites-run-first-and-not-through-the-import-api), [catalog size ceiling](#how-large-a-catalog-this-handles), [batching](#batching), [failure states](#which-states-are-failures), [SDKs](#the-official-sdks), [credentials and scopes](#credentials)
- [verify](#verify)
- [teardown](#teardown) — the way back out, not one of the seven
- [Configuration](#configuration)
- [What shapes the load](#what-shapes-the-load)
- [Fixtures](#fixtures)

## Getting the pipeline

The pipeline is a separate repository, cloned **beside** the engagement rather
than into it. It is a tool, not engagement content: nothing in it is edited per
engagement, and a teardown scoped to `keys.prefix` has nothing to do with it.

**Ignore it before you clone it.** The engagement is usually itself a git
repository, and a clone inside one is an *embedded* repository: `git add -A`
stages it as a **gitlink** — mode `160000`, the pipeline's commit pinned in
your index, no `.gitmodules` to explain it. That looks tracked and is not.
Anyone who clones the engagement afterwards gets an empty directory and no way
to obtain the contents:

```
warning: adding embedded git repository: ct-catalog-migration-pipeline
hint: Clones of the outer repository will not contain the contents of
hint: the embedded repository and will not know how to obtain it.
```

So the order matters:

```bash
# from the engagement root, BEFORE cloning
echo '/ct-catalog-migration-pipeline/' >> .gitignore

git clone https://github.com/commercetools/ct-catalog-migration-pipeline
cd ct-catalog-migration-pipeline
npm install            # first time; Node 20+
npm test               # no network, no credentials — a few seconds
```

**If it is already staged, `.gitignore` will not undo it** — ignore rules do
not apply to anything already in the index, and `git rm --cached` refuses
without `-f` because the gitlink differs from both the worktree and `HEAD`:

```bash
git rm -r --cached -f ct-catalog-migration-pipeline
```

A submodule would be the other way to do this, and is the wrong one here: it
pins the version in the outer repository's history, which is what the
`DECISIONS.md` line below already does in a form a human can read — without
making every clone of the engagement fetch a second repository.

Run the tests even when cloning a known-good commit. "The four stages ran
clean on my feed" is the tempting substitute and a much weaker signal: a
pipeline that works on one feed says nothing about whether the checkout is
intact. A few seconds against a stage misbehaving later for a reason you
cannot localise.

**Record which commit you used in `DECISIONS.md`.** This matters more than it
looks: the pages here name exact diagnostic codes, field names and behaviours,
and the skill and the pipeline are versioned separately. A pairing that has
drifted produces documentation that describes a tool you are not running —
which is the single most common defect class this project has had.

These pages were checked against `main` on 2026-09-24. If a stage, flag,
diagnostic code or fixture named here is absent from your checkout, trust the
checkout and treat this page as the stale half of the pair.

One line is enough for a clean checkout:

```
Pipeline: ct-catalog-migration-pipeline @ <short sha> (git rev-parse --short HEAD)
```

**Check `git status --short` before writing it.** If the checkout carries local
changes — a patch applied to get past a defect, an unmerged branch, untracked
files — the sha names a commit that is not what ran, and anyone re-running from
that line gets different behaviour with no way to tell why. Record what makes
the tree differ, and the test result on that tree:

```
Pipeline: ct-catalog-migration-pipeline @ <short sha> + uncommitted changes
  (<n> files, +<added>/−<removed> from git diff --stat HEAD; untracked: <paths>);
  npm test: <n> passing
```

List untracked files by name: `git diff` and its stat leave them out, so a
new source file would otherwise vanish from the record. Keep the change itself
beside `DECISIONS.md` (`git diff HEAD > pipeline.patch`, plus copies of the
untracked files), since a stat says how much changed, not what.
If you can commit the change to a branch instead, record that sha and the line
goes back to one.

## The stages

**Before the first stage runs, record the pipeline version in `DECISIONS.md` —
however the checkout arrived.** If you cloned it a moment ago, the line under
[Getting the pipeline](#getting-the-pipeline) is the one to write. If the
checkout was already there (a second engagement, a shared directory, a
colleague's clone, a branch placed for a change that is not merged), the line
matters more, not less, because nothing says the checkout is current or clean.
In it, run `git rev-parse --short HEAD` and `git status --short`, and write the
line, in its uncommitted-changes form if the tree differs, before `validate`.
`DECISIONS.md` is opened at the end of step 0 with this line first; if it does
not exist yet, open it now rather than after the stages. Skipping it leaves a decision log that describes a tool nobody can identify,
and the instruction is easy to miss when it only sits beside the clone.

```bash
npm run pipeline -- validate --config ../migration/migration.config.json
npm run pipeline -- derive   --config ../migration/migration.config.json
npm run pipeline -- plan     --config ../migration/migration.config.json --payloads
npm run pipeline -- audit    --config ../migration/migration.config.json
```

Common options: `--config <path>`, `--out <dir>`, `--json` for machine-readable
diagnostics, `--quiet` to suppress warnings, and `--payloads` on `plan`.

`--out` defaults to `out` **resolved relative to the config file**, the same
rule `feed.dir` follows — so running from the pipeline checkout with
`--config ../migration/migration.config.json` writes to `../migration/out`, not
into the tool's own directory. An absolute `--out` is used as given. The
engagement layout this assumes is in
[decision-log.md](decision-log.md#where-it-lives--and-the-layout-it-belongs-to).

Every stage exits non-zero when it finds an error, so the sequence composes in a
shell or CI.

### Progress while a stage runs

A stage that takes minutes used to print nothing until it ended, which looks like
a hang. Now each command prints **one line per tick**, every 30 seconds by default
(`--progress-interval <seconds>`, `0` for none), on stderr, and ends with
`done in <time>`. It reports on the clock, not on every change, so lines that keep
arriving mean it is alive; a command shorter than one tick prints only the last
line, and `--quiet` prints none.

```text
5m10s  load: waiting on ah12-category (container 1/3) · 7/12 imported · 5 unresolved · 0 processing · unchanged for 1m30s
```

Read `unchanged for` against the stall window under [verify](#verify): a count that
has not moved for a few minutes is normal, and only about 15 minutes with no fall
at all means something the plan referenced never arrived. The other stages say what
they are reading or deleting and how far along (`deleting products: 340/1,200 · 3 retries`).
Expect several minutes of lines even for a small catalog: the unresolved cascade has
taken over ten minutes to clear.

**Run long stages so you can see the lines.** A caller that pipes the command
through `| tail -40` sees nothing until it exits, which is the silence the lines
exist to end. `derive`, `plan`, `load`, `verify` and `teardown --execute` also
append every line, timestamped, to `out/progress.log`: start the command in the
background, read the end of that file, and tell the user where it is ("11 of 12
categories in, unchanged for two minutes") rather than waiting without a word.
`validate`, `audit`, `preflight` and a teardown dry run write no other artefact,
so they write no log.

## What is built

| Stage | Network | Status |
| :--- | :--- | :--- |
| `validate` — feed against the contract, and against the config | no | built |
| `derive` — ProductTypes, declared or inferred | no | built |
| `plan` — map to drafts, write the decision log | no | built |
| `audit` — every write-time invariant | no | built |
| `preflight` — project catalog model, locales, currencies | yes | built |
| `load` — Import API | yes | built |
| `verify` — read back and reconcile (GET only) | yes | built |

Every stage is built and tested. `load` is a **dry run unless `--execute`** is
passed, so nothing writes catalog data by accident, and `verify` cannot write
at all.

Treat a green `audit`, `preflight` and `load` as "the plan is internally
consistent, the project accepts it, and the operations were submitted" — not as
"the catalog is right". Those are different claims, and `load` cannot make the
second one: the Import API validates asynchronously, so every request can come
back accepted while individual operations are rejected afterwards. `verify` is
what closes that gap. Run it.

The pipeline has no cutover sequence and no delta strategy; those are
engagement decisions rather than pipeline features. `verify` does not scan for
orphans across the key prefix — it checks what the plan names, not what the
project holds that the plan has forgotten. Say that out loud rather than
letting green stages imply readiness.

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
disagrees with `target.catalogModel`; the project does not accept a locale or
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

It will not change `productCatalogModel` — that is a decision about the whole
implementation — and it will not change `countries`, which also drives shipping
and tax.

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

## load

**Dry run by default.** `--execute` is the only thing that writes catalog data.

```bash
npm run pipeline -- load --config ../migration/migration.config.json              # dry run
npm run pipeline -- load --config ../migration/migration.config.json --execute
npm run pipeline -- load --config ../migration/migration.config.json --execute --wait
```

A dry run writes `out/load-requests.json` with the exact request bodies, and
the prerequisites it would create. Read that before executing — it is what
will be sent, not a summary.

Then ask before executing, as `SKILL.md` step 5 sets out: consent has to come
after the user has seen what `load-requests.json` holds — the project key, the
counts, the prerequisites — so a request made before the dry run does not
cover it.

The audit gate runs again inside `load` rather than trusting it was run. It is
free, and the alternative is finding a rejected invariant one request at a time
after part of the catalog has landed.

### Platform stages, at opposite ends of the run

Four stages do not go through the Import API at all, and they do not all run
at the same time:

| Stage | When | Why |
| :--- | :--- | :--- |
| `channel` | **first** | prices reference them, and an unresolved price expires after 48 hours |
| `customer-group` | **first** | same |
| `tax-category` | **first** | a product draft references it, and an unresolved one holds up the **whole product** — variants and prices — until it expires |
| `store` | **last** | it references product selections, which the Import API creates *asynchronously* |

Inventory is **not** one of them — it has an Import API resource, and runs as
a stage after the variants whose SKUs it names. That ordering is soft, like
`standalone-price`: the Import API does not check the SKU, so it prevents an
orphan nobody notices rather than an error. Its dependency on `channel` is
not soft — an entry naming a supply channel that does not exist yet expires
unresolved after 48 hours.

`platformStages(order, phase)` takes the phase explicitly rather than
defaulting, because a caller that forgot it would create stores before the
selections they point at exist.

**`load` refuses without `--wait`** when a store references product selections
(`stores-require-wait`). Without waiting there is no moment at which the store
stage is safe to run, and stopping before the import is cheaper than a catalog
whose stores were never wired.

**An existing store is never modified.** `setDistributionChannels` and
`setProductSelections` replace the whole array, so applying the plan over a
store the project already configured would discard wiring this migration knows
nothing about. Both `preflight` and `load` report the difference
(`store-wiring-differs`) and stop.

### Prerequisites run first, and not through the Import API

The Import API has no channel, customer-group or tax-category resource, so
`load` creates those three through the **platform API**, before the first
import request. A
price whose channel does not exist yet becomes an operation that expires
unresolved after 48 hours, so the ordering is load-bearing rather than tidy.

The rule is read first, then create only what is missing:

- an absent channel, group or tax category is **created** — a tax category
  with the feed's rates;
- an existing one is **left untouched** — not patched to match the plan. For a
  tax category that includes its rates, which also tax shipping and belong to
  whoever owns tax;
- an existing channel lacking a role the plan needs is an **error**: roles
  govern stores and inventory as well as prices, so widening them is a project
  decision, not something a catalog load does in passing;
- a failed read creates **nothing**, because creating without knowing what
  exists is how duplicates happen.

They are reported separately from the containers, because they have no
container, no operation states and no 48-hour window — the call either
succeeded or it did not.

**An unmet prerequisite stops the import before it starts.** If one is
unusable, could not be created, or could not even be read, `load` reports
`prerequisites-unmet` and sends no import request and creates no container.
Proceeding would import prices scoped to something absent, and those operations
expire unresolved — a run reporting every request accepted, over a partly
priced catalog, with no signal left by the time anyone looks. Stopping costs
nothing a re-run does not recover, because every key is deterministic and a
second load updates rather than duplicates.

A dry run performs the reads too, which costs only GETs and is what lets it
name the exact keys it would create instead of guessing. If that read fails the
dry run still completes, with a warning and those keys reported as *existence
unknown* — an unreachable project should not cost you the request bodies.

Two asymmetries worth knowing: these are the only resources keyed **verbatim**
rather than `<prefix>-<key>`, and therefore the only ones a prefix-scoped
teardown leaves behind. If `load` created a channel, removing it is manual. A tax
category it created can be removed by [teardown](#teardown) with
`--include-created-tax-categories`, unless a product or shipping method still
references it.

### How large a catalog this handles

Not a memory question, and more RAM does not move it. Every artefact is written
with `JSON.stringify`, which builds the whole document as one string, and V8
caps strings at about **537 MB** whatever the heap size. Measured on this
pipeline:

| Catalog | `plan.json` per variant | Ceiling |
| :--- | ---: | ---: |
| 2 product-level attributes | 0.9 KB | ~575,000 variants |
| 25 product-level attributes | 4.2 KB | **~125,000 variants** |

The spread is `productLevelStrategy: sameForAll`, the default: a product-level
attribute is stated **once** in the feed and written onto **every** variant in
the plan. Measured amplification, feed to plan: **15×** (2.8 MB → 42.6 MB for
10,000 variants). So the more attributes a catalog carries, the sooner it
arrives — which is the opposite of the intuition that variant count is what
matters.

The feed held in memory is the lesser cost: ~14 KB of RSS per variant, so a
125,000-variant run peaks near 1.8 GB against a 4.3 GB default heap.

Past the ceiling the pipeline says so — naming the artefact, the resource
counts, and that RAM is not the problem — rather than emitting V8's bare
`Invalid string length`. The same limit applies on the way **in**: `audit`,
`load` and `verify` each read `plan.json` as one string, so a plan can be
written and then be too large to read back.

**The way through is to split the engagement**: several configs with
different `keys.prefix` values, each covering part of the catalog. Each plan is
then its own document and the loads stay additive.

### Batching

- At most **20 resources per Import Request**, clamped in code.
- Containers named **by resource type** (`mig-category`, `mig-product-draft`)
  and reused across runs; a run-scoped name would exhaust the 1000-container
  limit and hide the previous run's work. Each is restricted to its
  `resourceType`, so a mis-routed batch is rejected.
- A stage beyond the per-container operation limit splits into numbered
  containers, and no request straddles two.

**Reuse has a clock on it.** A container created without a `retentionPolicy`
is deleted **72 hours after creation** — not 72 hours after last use, so the
window does not extend as a migration continues. A `TimeToLiveRetentionPolicy`
set at create time takes a custom duration instead. This bites on any
engagement that spans more than three days: the deterministic name resolves to
a container that no longer exists, and with it goes the operation history the
name was reused to preserve. Keys are deterministic and a re-created container
takes the same name, so nothing is lost that a re-run cannot redo — but plan
the retention rather than discovering the gap.

Note the two clocks are different and neither resets: operations are deleted
at **48 hours**, containers at **72**. So a container can outlive the
operations it holds, and a summary read late in that window reports fewer
operations than the run submitted.

**What `--wait` covers.** It waits for this run's operations to appear in the
Import Summary, then for them to leave `processing` — i.e. for the API to finish
validating what was sent. The first part matters because the API creates the
operations a moment after it accepts a request, so a summary read straight away
can show nothing processing simply because nothing is registered yet. The
summary counts every operation the container still holds, earlier runs
included, so `--wait` reads the container's total before it posts and waits for
the total to rise by the number of resources in the requests the API accepted.
It does not wait for
`unresolved` operations to find their KeyReference targets, because that can
legitimately take up to 48 hours and depends on data this run may not be
sending. Expect `unresolved` counts after a `--wait` load of a deep category
tree, and expect them to fall on their own.

### Do not serialise on polling

Stages are pushed in dependency order but **not awaited**. An `unresolved`
operation completes on its own when its KeyReference target arrives, any time
inside 48 hours, so waiting per stage serialises a pipelined design — and
frequent summary polling actively slows the import.

`--wait` polls with doubling backoff until this run's operations are registered
and nothing is processing, and says plainly when it times out, naming whether
operations were still processing or had not registered at all. While it waits it
reports where it is on every tick ([progress](#progress-while-a-stage-runs)).

### Which states are failures

| State | Treated as | Why |
| :--- | :--- | :--- |
| `unresolved` | warning | completes on its own inside 48h |
| `waitForMasterVariant` | warning | resolves when the master variant lands |
| `processing` | warning | asynchronous; re-read the summary |
| `rejected` | error | the only resubmittable state; others retry internally up to 5 times |
| `validationFailed` | error | the gate should have caught it |
| `partiallyImported` | error | the resource is half-written |

A failed request records the keys it carried instead of aborting the stage, and
keys are deterministic — so resubmitting is running `load --execute` again.
That is a new write, so dry-run it first. A new yes from the user covers it only
if that dry run matches the one they saw; if anything differs, show the
difference and ask.

### The official SDKs

The pipeline depends on three first-party packages, and the split is worth
knowing when reading the code:

- **`@commercetools/importapi-sdk`** supplies every draft type in the plan.
  These are generated from the API's own specification, so a field that moves
  becomes a compile error rather than a rejected operation. Do not hand-write
  import resource types alongside them.
- **`@commercetools/platform-sdk`** supplies the `Project` type and preflight's
  request builders.
- **`@commercetools/ts-client`** owns transport: the client-credentials flow,
  token lifecycle, retry with backoff, a concurrency queue, and correlation IDs.

Three shapes are easy to get wrong by hand and impossible to get wrong with the
generated types:

| Shape | The trap |
| :--- | :--- |
| `PriceDraftImport.key` | required — a price without one is rejected |
| `Attribute` | a discriminated union carrying `type`, e.g. `{type: 'text', name, value}` |
| a set attribute's `type` | `'text-set'`, not `'set'` |

The attribute discriminator is **not** derivable from the value: a string could
be `text`, `enum`, `lenum`, `date`, `datetime` or `time`, and only the
ProductType's declaration says which. That is why the mapper threads the
ProductType's attribute definitions into variant mapping.

Two more fields are set deliberately rather than left to default:
`ProductDraftImport.priceMode` (unset is assumed to mean `Embedded`) and
`sku`, which the type marks optional — legal, but a migrated catalog needs one,
so the gate reports a variant without it.

What the SDK does **not** own, and this pipeline still must: chunking into
Import Requests of at most 20, container strategy, and deciding which Import
Operation states to resubmit. That last one cannot live in transport at all —
`rejected` and `unresolved` both arrive as HTTP 200 with the state in the body.

### Credentials

From the environment or `.env`, never from the committed config. See
`.env.example`.

| Variable | Notes |
| :--- | :--- |
| `CTP_PROJECT_KEY`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET` | required |
| `CTP_REGION` | derives all three hosts |
| `CTP_AUTH_URL`, `CTP_API_URL`, `CTP_IMPORT_URL` | override individually |
| `CTP_SCOPES` | optional; omitting it grants every scope the API Client has |

The Import API is on a **different host** from the HTTP API
(`https://import.{region}…`). The conventional commercetools variable set has no
import host, so it is derived from `CTP_API_URL` when absent.

**Which project a run targets is refused rather than resolved, twice over.**
Exported variables otherwise win over the file, but not for project identity:

- The file and the environment naming **different** projects is refused. The
  environment would win, so `--env` would silently not do what it looks like.
- **No file at all, while the environment names a project**, is also refused.
  That is the case a disagreement check cannot catch — there is nothing to
  disagree with — and it is how a run in a directory with no credentials of its
  own borrows a project nobody chose for it. The only thing that catches it
  otherwise is `preflight` printing the project name, which is luck rather
  than a check.

  Set `CTP_AMBIENT_OK=1` when the ambient environment is deliberate. CI and
  containers should; a working directory generally should not.

**Preflight degrades rather than stopping.** Without `view_project_settings`
it cannot read the catalog model, locales, currencies or price countries — so
it reports `project-settings-unreadable` (not `project-unreachable`, which
means something else) and still runs what it can, which is the resource-count
check that catches a load aimed at the wrong project. That needs only
`view_products`.

Do not read a degraded pass as a pass. *Everything preflight exists to verify*
depends on project settings, so a load in that state is going in blind on all
of it — recoverable, because keys are deterministic and a re-run updates, but
the recovery is manual. Add the scope and re-run. If you cannot, say so in the
decision log with what was unverified, and prefer the dry run: it writes the
exact request bodies to `out/load-requests.json` for review without sending
anything.

Scopes: `view_project_settings` for preflight, `manage_project_settings` for
`--apply`, `manage_products` plus `manage_import_containers` for the load.
`manage_products` also grants the Import Requests for categories, product types,
products, variants, embedded prices and **inventory**, and it covers reading and
creating channels and — for backward compatibility — tax categories. So stock
and tax need no scope of their own, in either direction: `view_products` covers
reading InventoryEntries and tax categories back. Two more are conditional
on the feed:

| Scope | Needed when |
| :--- | :--- |
| `manage_standalone_prices` | `priceMode: standalone` |
| `view_customer_groups` + `manage_customer_groups` | the feed declares any `customerGroup` |
| `view_product_selections` + `manage_product_selections` | the feed declares any `productSelection` |
| `view_stores` + `manage_stores` | the feed declares any `store` |

Neither is granted by `manage_products`. A missing customer-group scope fails
the load at its first stage, before anything is imported — which is the cheap
place to find out, but only if the scope list was not guessed.

## verify

The last stage, and the only credentialed one that cannot change anything —
every call is a GET.

```bash
npm run pipeline -- verify --config ../migration/migration.config.json
```

It answers the question `load` cannot: **an accepted Import Request is not an
imported resource.** The Import API validates asynchronously, so a load can
report every request accepted while operations are rejected afterwards — and
because operations are retained 48 hours and counted per container, a
container summary keeps reporting an old failure after a later run fixed it.
Only reading the catalog settles it.

The 48-hour retention distorts the summary in **both** directions, and the
second one is the dangerous half:

- **A stale failure that is already fixed** still shows, because the old
  operation has not aged out yet. Reads as worse than reality.
- **A failure that has aged out is simply gone.** Query a container more than
  48 hours after the run and every surviving operation may well say
  `imported` — not because nothing failed, but because the ones that failed
  were deleted. Reads as *better* than reality, and it is indistinguishable
  from a clean run.

So a green summary is only evidence about a run you queried inside the window.
Past that, the summary cannot answer the question at all and `verify` is the
only thing that can, because it reads resources rather than operations and
resources do not expire.

`verify` reads back exactly the keys the plan names, with a `key in (...)`
predicate chunked at 100 keys per request, and reports:

- **missing** — planned and absent. The load did not land, whatever it said.
- **mismatched** — present but not what the plan says.
- **unexpected** — a variant or attribute the plan never mentioned, which is
  how a stale earlier run becomes visible.

Two things it gets right that are easy to get wrong:

- It compares **staged** data, not `current`. The pipeline imports unpublished
  on purpose, so `current` is empty on a first load.
- It **normalises read shapes** first. An `enum` is written as a key and read
  back as `{key, label}`; references are written as keys and read back as ids.
  Enum values are normalised, and reference attributes are skipped rather than
  guessed at — a verifier that flags every enum in a catalog is one that gets
  switched off.

A failed read marks that kind **unreadable** and compares nothing, because a
missing `view_products` scope and an empty project are otherwise the same
observation.

Severity follows recoverability: a differing `attributeConstraint` is an error
saying the attribute must be recreated (`changeAttributeConstraint` accepts
only `None`), a differing price scope is an error saying the price must be
deleted and remade (the Import API refuses to update `country`,
`customerGroup` or `channel`), and a leftover variant is a warning.

**`--wait` is not the same as resolved, and this is where that bites.** `load
--wait` drains `processing`; it does **not** wait out the 48-hour KeyReference
window. So a load can return having reported every request accepted, with
operations still `unresolved` — a category waiting for its parent, a product
waiting for its category — and a `verify` run straight afterwards reports every
one of those resources as **missing**, in wording written for a genuine
failure.

Expect this at scale: a deep category tree can leave a hundred or more
operations unresolved, and the resources they block absent, for **minutes**
after the load returns — not hours, and not permanently. The deeper the tree,
the longer the cascade.

`verify` now reads the operation states when it finds anything absent, and
leads with `operations-in-flight` — the count still pending, the time it was
read, and the instruction to wait and re-run before believing the absences.

The unresolved count plateaus. In a live load it sat at 96 for five minutes,
fell on its own, and sat flat for another five before reaching the full set, so
two `verify` runs a few minutes apart prove nothing either way. Judge a stall
over a window of about 15 minutes, not between two runs: if the unresolved count
has not fallen at all across that span, something the plan referenced was never
imported and the absences are real. Note the time of each run, so the window
can be read from the record.

**While the count is falling or inside the window, re-run `verify`, not `load --execute`.** Pending
operations are the Import API's to retry: its
[best practices](https://docs.commercetools.com/api/import-export/best-practices.md#handle-retries)
say to retry only `rejected` operations, and warn that duplicate import
requests sent concurrently can collide in a concurrent modification error. A
second load in the middle of a cascade is exactly that. Resubmit for `rejected`
operations, or once the count has not fallen across the window and the missing
reference is found and fixed — and either way it is a new write, so ask first.

It reads stores and product selections back too, but only when the plan
declares them — most engagements have neither, and an unconditional read costs
two requests and two scopes for nothing. Two findings there are worth knowing
in advance:

- **`selection-mode-differs` cannot be fixed by re-running.** With no
  `changeMode` action, the selection has to be deleted and recreated, and every
  store referencing it re-wired. Until then the assortment means the opposite
  of the plan.
- **Store drift is reported per list**, because the API replaces rather than
  merges each one. Supply-channel drift is only a *warning*: the entries are
  reconciled separately and by key, so a store's wiring is not the evidence
  that stock arrived.
- **Stock is compared on `quantityOnStock` and the channel scope, never on
  `availableQuantity`** — the platform computes that as stock minus
  reservations, so comparing it would report every cart in flight as a defect.
  An entry is also *eventually* consistent for up to 10 seconds after a write,
  so re-read a difference before believing it. `inventory-entry-missing` and
  `inventory-quantity-differs` are errors; `inventory-supply-channel-differs`
  catches the dangerous direction, an entry that lost its channel and now
  counts everywhere.

Tax categories are read back whenever the plan declares any, because a
product's `taxCategory` comes back as an id and the category read is what
turns it into a key. `tax-category-missing` is reported **first**: every
product referencing it was held up behind it, so the products reported missing
after it are missing because of it. `product-tax-category-differs` is an error
— it decides what a shopper is charged, or whether they can be — and
`tax-category-rates-differ` a warning, since `load` never changes an existing
category's rates.

A store's key is matched **verbatim**, not prefixed — asking for
`mig-northwind-uk` would find nothing and report the store missing.

`verify` does not detect orphans across the key prefix: it checks what the
plan names, not what the project holds that the plan has forgotten.

## teardown

The way back out, not one of the seven stages: for a rehearsal on a trial
project, or a load that has to be undone.

```bash
npm run pipeline -- teardown --config ../migration/migration.config.json                # dry run
npm run pipeline -- teardown --config ../migration/migration.config.json \
  --execute --confirm-project <project-key>             # add --include-created-tax-categories to remove the one load created
```

- **It removes what the plan names and nothing else.** The scope is every key in
  `plan.json`, not `key-map.json`, which holds only categories, products and
  variants. Before any delete it checks that each key starts with
  `<keys.prefix>-` and stops if one does not, because a key outside the prefix
  means the plan is not the one that was loaded. The API deletes a category's
  whole subtree with it, so before deleting anything teardown reads the
  categories directly below each planned one. A planned category with a category
  the plan does not name beneath it stays, together with its planned ancestors,
  and is named in the output, the dry run included; the planned categories below
  it are still deleted. Move or delete the others and run it again.
- **Deleting needs the project named.** `--execute` also needs
  `--confirm-project` equal to the credentials' project key. A delete cannot be
  undone, and a shell that still exports another project's `CTP_*` variables is
  how a wrong-project run happens. Ask the user before `--execute`, as for
  `load --execute`: reading the dry run is not consent to delete, and neither is
  a request to "remove everything you loaded". The request names an outcome; the
  dry run is the first time anyone sees which keys and how many, so show it, name
  the project and the counts, and wait for the yes.
- **Reverse of the load order:** standalone prices, stock, product selections,
  Modular variants, products, categories, ProductTypes, then the plan's import
  containers. Categories go deepest first, one at a time within a tree: the API
  [locks the part of a category tree a write touches](https://docs.commercetools.com/api/projects/categories.md#category-tree-locking)
  and fails a conflicting request with a 400; deletes of two sibling categories
  at once are refused the same way. A delete refused that way is retried briefly
  and read again, and a category that is gone by then counts as deleted, not
  failed. Selections
  go before the products they list because
  the API refuses to delete a product a selection still references. Deleting the
  selection clears that reference a moment later, so a product refused right
  after it is retried for up to a minute. A selection that cannot be deleted
  leaves its products refused, and teardown reports both. A product's
  version changes when its standalone prices are deleted, so a version read
  earlier is stale by then; teardown reads each product's version just before
  deleting it.
- **It leaves the verbatim-keyed prerequisites** — channels, customer groups,
  tax categories and stores — and lists them: they belong to the project. The
  one you can ask it to remove is a tax category this plan's `load` created.
  `load --execute` records those in `out/created-prerequisites.json`, which only
  grows, because `load-result.json` is rewritten by every execute and a second
  load reports the category as existing. `--include-created-tax-categories`
  deletes those keys that the plan also names, after the products, and the dry run
  says what it would delete. A tax category that was in the project before the
  load is never in that file, so it stays. A tax category cannot be deleted while
  a product or shipping method uses it; teardown reports that as a failure and the
  run is not complete. Anything else it leaves is removed by hand, by whoever
  owns it, so ask first; do not write a delete against the API with the
  engagement's credentials to empty the project.
- **One exception is an edit.** A product selection that a store listed in the
  plan still holds cannot be deleted, so it is taken off that store first. A
  selection held by a store the plan does not list is left in place and named,
  and the run exits non-zero.
- **It reads the project again afterwards** and reports what is left per kind,
  writes `teardown-result.json`, and exits non-zero if a delete failed,
  something was blocked or anything remains. A dry run writes nothing.

It works from the plan on disk, so keep the plan that was loaded: a plan
regenerated afterwards with different keys cannot name what the earlier one
created.

## Configuration

`migration.config.json`. The dividing line for what belongs in it: if a
different source or target project would need a different value, it is config;
if it follows from how commercetools works, it is code.

**Write it from the step-0 interview rather than copying a template** — see
[SKILL.md](../SKILL.md). Five values are decisions, not settings:
`target.priceMode`, `productTypes.productLevelStrategy`,
`productTypes.onMissingDefinitions`, `productTypes.searchableByDefault` and
`keys.prefix`. Each is irreversible or fails silently, so the loader refuses an
absent or misspelled value with the consequence stated rather than falling
through to one nobody chose — a generated config is not a trusted config.

A filled example ships at the package root as a reference and a fallback, not
as the intended path. It carries `keys.prefix: "REPLACE-ME"`, which the loader
refuses, so a copy taken by mistake cannot run.

The field-by-field shape:

| Section | Key fields |
| :--- | :--- |
| `feed` | `dir` — directory of `*.ndjson` files |
| `target` | `catalogModel` (`Classic`/`Modular`), `priceMode` (`embedded`/`standalone`; `Modular` allows only `standalone`) |
| `market` | `defaultLocale`, `requiredLocales`, `requiredCurrencies`, `currencyFractionDigits` |
| `keys` | `prefix` — every key becomes `<prefix>-<sourceCode>` |
| `media` | `baseUrl` — required only when the feed has relative image URLs |
| `productTypes` | `onMissingDefinitions`, `defaultKey`, `defaultName`, `productLevelStrategy`, `searchableByDefault` |
| `load` | `batchSize` (max 20), `maxOperationsPerContainer` |

The loader refuses, up front, four things that would otherwise fail deep into a
run — or, in the first case, not fail at all: `Modular` with `embedded` prices,
a currency with no `currencyFractionDigits` entry, a `batchSize` above the
Import API's limit of 20, and a `defaultLocale` absent from `requiredLocales`.

Both catalog models are supported. The `Modular`/`embedded` pair is refused
because Modular has no embedded prices at all, and a `VariantImport` has no
price field, so that pair cannot be honoured whatever the pipeline does.

The catalog model decides the import shape and is fixed at map time: Classic
emits a `ProductDraftImport` carrying its variants, Modular emits a container
product plus separate `VariantImport` resources. Changing `target.catalogModel`
therefore requires re-running `plan` — editing the config does not change a
plan already written.

## What shapes the load

Recorded here because it constrains the plan's shape, and verified against the
[Import API overview](https://docs.commercetools.com/api/import-export/overview.md)
and [best practices](https://docs.commercetools.com/api/import-export/best-practices.md).

- 20 resources per Import Request; fewer than 200,000 Import Operations per
  container; max 1000 containers per project (soft).
- A container with no `retentionPolicy` is deleted 72 hours after creation.
  Set a `TimeToLiveRetentionPolicy` on create for a longer engagement.
- Organise containers **by resource type**, not by temporal batch.
- Import Operations are deleted 48 hours after creation, and an `unresolved`
  KeyReference resolves automatically if its target arrives inside that window —
  so prices may be imported before their products. Do not serialise the stages
  on polling; frequent polling of the summary endpoint actively slows the
  import. Retry only `rejected`; other states are retried internally, up to five
  times.
- Import Resources accept only KeyReferences, never ids.
- `ProductVariantImport` and `StandalonePriceImport` delete omitted fields on
  update. `ProductVariantPatch` is the only partial update.
- Load in dependency order — channels, customer groups and tax categories,
  then product types, then categories, then products, then Standalone Prices if
  the price mode calls for them — and tear down in reverse, scoped to
  `keys.prefix` — the [teardown](#teardown) command does exactly that. Channels,
  customer groups and tax categories are outside that scope and outside the
  Import API entirely: created through the platform API. Teardown leaves them,
  except a tax category `load` created, which `--include-created-tax-categories`
  removes; the rest are removed by hand.
- Standalone Prices need `manage_standalone_prices` and customer groups need
  `manage_customer_groups`; `manage_products` covers every other request here.
- Containers, Operations and Summaries are generally available; the per-resource
  Import Requests are public beta.

## Fixtures

The pipeline's `fixtures/` doubles as documentation of intended behaviour. Each one is
runnable:

| Fixture | Demonstrates |
| :--- | :--- |
| `declared-types` | a clean catalog with a declared type system |
| `inferred-types` | the same catalog with declarations stripped |
| `derive-inference` | date, timestamp, set and multi-line inference |
| `derive-conflicts` | the three fatal ProductType clashes |
| `derive-searchable` | `isSearchable` disagreeing across ProductTypes |
| `derive-type-conflict` | one attribute name inferred as two types — refused, not warned |
| `stores` | a store, a distribution and a supply channel, and an `Individual` selection with a SKU-scoped assignment |
| `plan-edges` | slug collisions and mixed-precision currencies |
| `plan-money-error` | an amount too precise for its currency |
| `broken-schema`, `broken-integrity` | each validation phase |
| `audit-violations` | a hand-written plan tripping every gate check |
| `audit-truncated` | a half-written plan, to check the loader fails clearly |
| `invalid-config` | the four configuration combinations refused up front |

Run any of them to see what a finding looks like before writing an adapter:

```bash
npm run pipeline -- validate --config fixtures/broken-integrity/migration.config.json
npm run pipeline -- audit --config fixtures/audit-violations/migration.config.json \
  --out fixtures/audit-violations/out
```
