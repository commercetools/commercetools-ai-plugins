---
name: running-the-pipeline
description: "The pipeline's seven stages in order with their common options and progress output, the configuration file that drives them, and which file holds each stage."
metadata:
  contentType: REFERENCE
---

# Running the pipeline

Seven stages, each gating the next. The first four need no credentials at all:
a defect is reported at the earliest stage that can see it, so a broken feed or
an unloadable plan says so on a laptop with no `.env`.

Each stage has its own file. Read the one for the stage in front of you; this
file holds what they share.

| Read | When |
| :--- | :--- |
| [getting-the-pipeline.md](getting-the-pipeline.md) | before the first stage: fetching the latest release (with the user's yes), the install and test gate, the version line for `DECISIONS.md`, and upgrading |
| [offline-stages.md](offline-stages.md) | `validate`, `derive`, `plan` or `audit` reports a diagnostic, or you need to know what each gates, or the freshness digest fails |
| [preflight.md](preflight.md) | before `preflight`, or when it reports a locale, currency, catalog-model or ProductType-key finding, or before `--apply` or `--switch-catalog-model` |
| [load.md](load.md) | before `load`: dependency order, prerequisites outside the Import API, batching, failure states, SDKs, credentials and scopes |
| [verify.md](verify.md) | after `load`: what `verify` reconciles, the stall window, and what a clean result does and does not show |
| [teardown.md](teardown.md) | removing what a run created from a trial project |

On this page: [the stages](#the-stages) and [progress while one runs](#progress-while-a-stage-runs),
[what is built](#what-is-built), [Configuration](#configuration),
[what shapes the load](#what-shapes-the-load) and [Fixtures](#fixtures).

## The stages

**Before the first stage runs, record the pipeline release in `DECISIONS.md` —
however the copy arrived.** If you fetched it a moment ago, the line under
[Recording the release](getting-the-pipeline.md#recording-the-release) is the one
to write. If the copy was already there (a second engagement, a shared directory, a
colleague's copy, one placed for a change that is not merged), the line matters
more, not less, because nothing says the copy is current or unchanged. In it, read
the version from `package.json` and `CHANGELOG.md`, check whether the copy differs
from its release ([how](getting-the-pipeline.md#upgrading-and-changes-to-the-copy)),
and write the line, in its changed-copy form if it does, before `validate`.
`DECISIONS.md` is opened at the end of step 0 with this line first; if it does
not exist yet, open it now rather than after the stages. Skipping it leaves a
decision log that describes a tool nobody can identify, and the instruction is
easy to miss when it only sits beside the fetch.

```bash
npm run pipeline -- validate --config ../migration/migration.config.json
npm run pipeline -- derive   --config ../migration/migration.config.json
npm run pipeline -- plan     --config ../migration/migration.config.json --payloads
npm run pipeline -- audit    --config ../migration/migration.config.json
```

Common options: `--config <path>`, `--out <dir>`, `--json` for machine-readable
diagnostics, `--quiet` to suppress warnings, and `--payloads` on `plan`.

`--out` defaults to `out` **resolved relative to the config file**, the same
rule `feed.dir` follows — so running from the pipeline directory with
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

Read `unchanged for` against the stall window under [verify](verify.md#verify): a count that
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

## teardown

`teardown` is the way back out, not one of the seven stages: it removes what a
run created from a trial project, scoped to `keys.prefix`. It has its own file,
[teardown.md](teardown.md).

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
  `keys.prefix` — the [teardown](teardown.md#teardown) command does exactly that. Channels,
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
