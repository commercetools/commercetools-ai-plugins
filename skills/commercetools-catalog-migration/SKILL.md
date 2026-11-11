---
name: commercetools-catalog-migration
description: Migrates a product catalog from any source system into commercetools through a canonical NDJSON feed contract — the pipeline never parses the source, so each engagement writes only a small adapter. Covers the feed contract, writing an adapter, ProductType derivation and its irreversible attribute constraints, decimal-to-minor-unit money conversion, project-wide slug allocation, category order hints, opening stock per SKU and supply channel, tax categories, and the offline audit gate. Use when migrating or bulk-loading a product catalog into commercetools, writing an adapter for a source export, deciding SameForAll versus CombinationUnique, converting prices to centAmount, or diagnosing rejected Import API operations. Customer accounts and order history only on the user's sign-off. Not the Classic-to-Modular migration of an existing project (the staged Modular Catalog migration guide), and not for ongoing sync after cutover, carts, or promotions.
when_to_use:
  - "Migrating or bulk-loading a product catalog from a source system into a commercetools project"
  - "Writing an adapter that turns a source export (hybris ImpEx, PIM extract, CSV) into a catalog feed"
  - "Deciding SameForAll versus CombinationUnique for a variant attribute, or any other irreversible ProductType choice"
  - "Diagnosing Import API operations that were accepted but came back rejected or unresolved"
metadata:
  contentType: SKILL
  area:
    - Migrations
  docsSearch:
    products:
      - Composable Commerce
---

# commercetools catalog migration

Migration is one-time and decision-heavy. The deliverable is **a reviewed set of
decisions**, not a loaded dataset: what was translated, what was approximated,
and what was lost, with a rationale per decision. A migration claiming zero
information loss is not being honest.

A recurring sync from a PIM, ERP or OMS is the wrong approach here: that is
integration, contract-heavy rather than decision-heavy.

## The source boundary is a data contract, not a code module

```
any source  →  adapter  →  canonical catalog feed  →  pipeline  →  commercetools
               per          NDJSON, schema-checked    reusable
               engagement   THE CONTRACT
```

The pipeline — [`commercetools/ct-catalog-migration-pipeline`](https://github.com/commercetools/ct-catalog-migration-pipeline),
fetched as a release after the user's yes ([how](references/getting-the-pipeline.md)) —
**never parses a source system**. It defines a feed contract and starts there.
Everything source-specific lives in the adapter, upstream of the contract.

A universal parser for any source platform does not exist — no two
installations agree on their type system — so source knowledge inside the
pipeline is what destroys retargetability. A seam made of *data* rather than
*code* makes that coupling impossible rather than discouraged. The contract is
`schema/catalog-feed.schema.json` in that repository; treat it as the API.

## Before you start

1. <!-- ct:docs-search:begin -->
   **Docs search (required, run first)** — The first time you use this skill in a session you must run this before answering. It gathers the latest verified documentation as your primary grounding, filtered to the products this skill covers. Use this script for documentation search while working with this skill; the Knowledge MCP covers everything else. Always confirm details against retrieved documentation rather than the skill text alone:

   ```bash
   node "<this skill's directory>/scripts/docs-search.mjs" \
     --query "<extract key terms: Import API, ProductType attributes, catalog model, Standalone Prices, Category slug>" \
     --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
     --model "<current-model>" \
     --commercetools-project-key "<if known>" \
     --commercetools-region "<if known>" \
     --limit 10
   ```

   Pass the commercetools project key and region (as in `api.{region}.commercetools.com`) only if already in your context; otherwise omit both. Never search files or ask the user for them.
   <!-- ct:docs-search:end -->

   "No results found" is a failed lookup, not silent documentation. Retry once
   with one or two of the terms alone (`Import API`, `Standalone Prices`); if
   still empty, look the topics up through the Knowledge MCP. The references
   were checked once; this search shows what changed since, so do not rely on
   them alone.

   The [Critical](#critical) limits were verified in September 2026; re-check
   one here before relying on it.

2. **Lay out the engagement beside the pipeline copy, never inside it.**
   `migration/` holds the config, interview, decision log and adapter;
   `source-export/` holds what the customer handed over. Create `migration/`
   before step 0 writes `INTERVIEW.md` into it. The layout, and what to commit:
   [references/decision-log.md](references/decision-log.md#where-it-lives--and-the-layout-it-belongs-to).

## Workflow

0. **Interview in a file, then write the config.** Do not hand over a template
   to fill in, and do not ask the questions in chat. Write them to
   `migration/INTERVIEW.md` for the user to edit, stop, and **write
   `migration.config.json` from the answers** once every question has one —
   the config is the record of a conversation, not a form.

   Every question, what it writes, and why none of them can be defaulted:
   [references/step-0-interview.md](references/step-0-interview.md). Work
   through it in order — the order is load-bearing:

   1. **Size the export** (minutes): file list, line counts, largest variant
      count. Structural only — no mapping, no types, no decisions.
   2. **Discover the source (0b)** —
      [references/source-discovery.md](references/source-discovery.md) — because
      the data answers some of the questions.
   3. **Write `migration/INTERVIEW.md` and stop.** One block per topic, a table with a row per question: 0a,
      the catalog-model question, first, because its answers can end the
      engagement (over 100 variants per product cannot be loaded under
      `Classic`) and are cheaper to learn before an adapter exists; then
      0c, each conditional that applies, 0d, and a scope row per non-catalog
      entity 0b found: customers and orders stay out without a written yes. Tell the user to edit the file and say when it is done,
      and that you will re-read it then and name any empty row. The config and
      adapter wait because each answer is irreversible or fails silently.
   4. **Continue only when every answer cell is filled in.** Otherwise name the
      unanswered rows and stop. The file format and the rules for "I don't
      know" and follow-up questions are in the interview reference.

   The file stays open after step 0. A question that arises at any later stage
   is added to it as a row of the section it belongs to, not asked in chat; the work that depends on it waits, and
   when the answer arrives you start again from the stage it affects.

   **Then open the decision log.** The config records *what* was chosen, not
   who chose it, what the alternative would have cost, or that a question was
   asked at all. Write one entry per decision from 0a and 0c, plus any
   question that could not be answered — an open question with an owner is a
   plan, an unasked one is a surprise. Open it before the adapter, with the
   pipeline release tag as its first line, so the
   version is on record before any stage runs. Format and placement:
   [references/decision-log.md](references/decision-log.md).

   **Keep writing it at every step from here**, not at the end: a log
   reconstructed afterwards loses the irreversible decisions taken under
   uncertainty.

1. **Write the adapter — one product first.** Read the source, emit NDJSON
   against the contract. This is the only code an engagement normally writes,
   and it is deliberately disposable. Work through
   [references/writing-an-adapter.md](references/writing-an-adapter.md) against a
   real export — one designed against an assumed source model gets rewritten —
   with the record types in
   [references/catalog-feed-contract.md](references/catalog-feed-contract.md).

   **Take the thin vertical slice first**: one product, two or three
   variants, through `validate`, `derive`, `plan` and `audit`. Before
   the first of them runs, record which pipeline release it is (the tag, one
   line in `DECISIONS.md`), whether you fetched it or found it there:
   [getting-the-pipeline.md](references/getting-the-pipeline.md).
   Writing every SKU in one pass usually gets away with it, which is why this
   step gets skipped, and no reason to skip it. The axis
   model, the money conversion and the attribute constraints are wrong in the
   same way across five records as across five thousand, and they are
   irreversible once loaded.

   **Log every point where the adapter decides rather than translates**: a code
   derived from a display name, a hierarchy level collapsed, an inherited price
   resolved, a locale tag normalised, a sentinel skipped or interpreted, a field
   dropped, and *every silent cap* — anything sampled, truncated or skipped.
   These decisions are lost most often: made while writing code, they feel
   like implementation details, yet they are what the migration did to the
   customer's data.

2. **Run the offline stages in order.** Each gates the next, so a defect is
   reported at the earliest stage that can see it:

   ```bash
   cd ct-catalog-migration-pipeline
   npm run pipeline -- validate --config ../migration/migration.config.json
   npm run pipeline -- derive   --config ../migration/migration.config.json
   npm run pipeline -- plan     --config ../migration/migration.config.json --payloads
   npm run pipeline -- audit    --config ../migration/migration.config.json
   ```

   None needs credentials, by design: a broken feed or unloadable plan
   reports the real problem on a laptop with no `.env`.

   **Log the findings you accept rather than fix.** A diagnostic that changes the
   adapter leaves no decision behind — the feed is regenerated and the finding
   disappears. One *accepted* is a decision: 14 disambiguated slugs and the URLs
   that result, a products-in-no-category warning that is correct for this
   catalog, an `approaching-variant-limit` acknowledged with a plan to revisit.
   Record the count and the artefact, not every finding.

3. **Read `out/MODEL-REVIEW.md` before loading.** It is the sign-off artefact:
   irreversible choices, information loss, and anything guessed. Read the one
   `plan` writes: `derive` writes the product model only, and the tax rates and
   the other decisions recorded while mapping the feed are added by `plan`.

   Log the *review outcome*, not its contents: one entry naming what was
   accepted against which plan. `MODEL-REVIEW.md` is regenerated every run
   and can hold thousands of entries; copied into an append-only log, the two
   disagree by the next run.

4. **Check the target project** once credentials exist. `preflight` answers
   whether the project will accept the plan, in a handful of GETs, before
   anything is written:

   ```bash
   npm run pipeline -- preflight --config ../migration/migration.config.json
   ```

   **`--apply` and `--switch-catalog-model` write to the customer's project, and so does
   any manual change made to get past preflight. Log every one**: project key,
   timestamp, exactly what changed, who authorised it as the user said it, never from the
   account. They report `project-updated` and `catalog-model-switched` to stdout and
   nowhere else, so an unlogged change is unaccounted for. Manual changes count doubly:
   a country added for country-scoped prices affects shipping and tax, so `preflight`
   refuses it.

   **A `catalog-model-*` finding stops you:** read
   [switching-to-modular.md](references/switching-to-modular.md) first. An empty project
   is switched on the user's yes; one with products waits for a support-run copy job.

5. **Load, dry run first.** `load` sends nothing without `--execute`, and writes
   the exact request bodies to `out/load-requests.json` for review:

   ```bash
   npm run pipeline -- load --config ../migration/migration.config.json
   npm run pipeline -- load --config ../migration/migration.config.json --execute
   ```

   **Ask before every `--execute`.** Show the user what the dry run will send —
   the target project key, counts per stage, the prerequisites it will create —
   and wait for an explicit yes. A goal in the opening request ("get the catalog
   into the project", even "load it") is not consent for this write: the user
   has not yet seen what it sends. A yes covers one `--execute`. A later one,
   such as a resubmission, needs a new yes, and that counts only if a fresh dry
   run matches what the user saw; if anything differs, show it and ask again.
   `preflight --apply` and `--switch-catalog-model` each need their own yes.

   `load --wait`, `verify` and `teardown --execute` take minutes. They print a line
   every 30 seconds and append it to `out/progress.log`: run them so you can read
   it, not through `| tail`, and tell the user where they are
   ([progress](references/running-the-pipeline.md#progress-while-a-stage-runs)).

   Log one entry per `--execute`: project key, timestamp, what was sent, the
   outcome. `out/load-result.json` is regenerated and gitignored.

6. **Verify, and do not treat the load's own report as the answer.** An
   accepted Import Request is not an imported resource — the API validates
   asynchronously, so a load can report every request accepted while
   individual operations are rejected afterwards. `verify` reads the project
   back and reconciles it against the plan. Every call is a GET:

   ```bash
   npm run pipeline -- verify --config ../migration/migration.config.json
   ```

   It needs `view_products`, plus `view_standalone_prices` under standalone
   pricing and `view_customers` with customers: reading is not writing.

   On `operations-in-flight`, wait and re-run `verify`, not `load`: the Import
   API retries pending operations itself; only `rejected` ones need resubmitting.

   Log the result as the closing entry for the run, **including a clean one**.
   "Reconciled, no differences" is the sentence someone needs months later when
   asking whether the load was ever checked at all.

   To undo a run on a trial project, `teardown` removes what the plan created,
   scoped to `keys.prefix`: a dry run by default, and `--execute` needs
   `--confirm-project <key>` — see
   [teardown.md](references/teardown.md#teardown).
   **Ask before every `--execute`, as for the load.** A request to "remove
   everything you loaded" names an outcome, not which keys or how many: show the
   dry run, name the project and the counts, and wait for the yes. Prerequisites
   `load` created go with `--include-created-prerequisites`, never a
   hand-written delete.

7. **Fix defects in the adapter, never by hand in the regenerated feed.**

## Critical

The failure modes that are silent or unrecoverable, each stated in full in the
reference beside it — this list exists so none is *missed*.

**Irreversible, so decide before the first load**

- **Attribute constraints are a one-way door.** `changeAttributeConstraint`
  accepts only `None`: a constraint can be relaxed, never tightened or
  switched. A wrong `SameForAll` / `CombinationUnique` means recreating the
  attribute and rewriting its data. → [product-model.md](references/product-model.md)
- **A product selection's `mode` is fixed at creation** — there is no
  `changeMode` action, and re-importing the other mode reports `imported` and
  changes nothing. → [feed-assortments.md](references/feed-assortments.md)
- **A Product's ProductType cannot be changed after creation.** A project
  loaded before ProductType keys were prefixed trips
  `product-type-keys-unprefixed` and cannot be moved onto the new keys by
  re-running. → [preflight.md](references/preflight.md)
- **`productCatalogModel` is fixed at map time.** `Classic` embeds variants
  (1–100) and allows embedded prices. `Modular` makes them standalone
  `VariantImport` resources (to 10,000), allows **only** standalone prices, and
  cannot import `defaultVariant` at all. Changing it means re-running `plan`.
  → [product-model.md](references/product-model.md)

**Silent when wrong — no error, wrong catalog**

- **Money is minor units, and the digit count is not 2 everywhere.** JPY and
  KRW are 0; BHD, KWD, OMR and TND are 3. Defaulting to 2 multiplies prices by
  100 without erroring. Convert on the digit string, never through a float.
  → [pricing-and-money.md](references/pricing-and-money.md)
- **A localized value must never be a variant axis.** Identity would key
  differently per language and break the moment a second locale is added.
  `axisValues` takes codes; `axisLabels` takes display text.
  → [catalog-feed-contract.md](references/catalog-feed-contract.md)
- **`isSearchable` must agree across every ProductType sharing an attribute
  name**, or that attribute leaves search, filters and facets *everywhere* —
  and the import still succeeds. → [product-model.md](references/product-model.md)
- **Omitted fields are deleted on import.** `ProductVariantImport` and
  `StandalonePriceImport` drop whatever you leave out, so an update must resend
  everything worth keeping. `ProductVariantPatch` is the only partial update.
  → [running-the-pipeline.md](references/running-the-pipeline.md#what-shapes-the-load)
- **An unresolved KeyReference expires after 48 hours**, taking its price with
  it: a green load and a partly priced catalog. An inventory entry naming a
  missing supply channel goes the same way, taking the stock — and a product
  naming a missing tax category goes **whole**, variants and prices with it.
  → [load.md](references/load.md)
- **Stock for a SKU that does not exist imports successfully.** The Import API
  does not check `InventoryImport.sku` against anything, so a typo becomes
  stock nothing sells and no stage of the platform ever reports it. `validate`
  and the audit gate check it because nothing else will.
  → [feed-prerequisites.md](references/feed-prerequisites.md)
- **A product without a tax category loads, verifies, and cannot be taxed.**
  Under the default `Platform` tax mode a cart takes its rate from the
  product's tax category; with none, checkout cannot compute tax and nothing
  earlier says so. `validate` warns rather than refuses, because `External`
  tax mode needs no category — which mode applies is a step-0 question, and
  the answer goes in the config as `target.taxMode`.
  → [feed-prerequisites.md](references/feed-prerequisites.md)
- **`publish: false` unpublishes.** It is an instruction, not "leave
  publication alone", and the pipeline plans it on every product. Correct on a
  first load; on a re-load into a live project it takes every product it
  touches offline, with every operation still reporting `imported`.
  → [offline-stages.md](references/offline-stages.md#plan)

**Project-wide, not per resource**

- **An attribute name holds exactly one type per Project**, not per ProductType,
  so a self-consistent plan can still be refused by what the project already
  holds — `AttributeDefinitionTypeConflict`, then `AttributeNameDoesNotExist` on
  every product using it. **No update action changes a type**: the fix removes
  and re-adds the attribute, deleting its values on every product that has one.
  Enum *values* may differ freely. `preflight` is the only stage that can see
  it. → [product-model.md](references/product-model.md)
- **Slugs are unique per locale across the Project.** Retail taxonomies reuse
  names, so collisions are normal — and resolving one changes a URL, which is
  information loss and somebody else's decision.
  → [categories-and-slugs.md](references/categories-and-slugs.md)

**Shape of the model**

- **Prices are scoped by channel; a store only chooses which channels apply.**
  There is no `store` field on a price. Two distribution channels on one store,
  both priced, is legal and ambiguous — the storefront has to call
  `setLineItemDistributionChannel`. → [pricing-and-money.md](references/pricing-and-money.md)
- **A store with no product selections offers everything**; one whose
  selections are all inactive, with an `Individual` among them, offers
  **nothing**. → [feed-assortments.md](references/feed-assortments.md)
- **Channels, customer groups and tax categories cannot be imported — `load`
  creates them** through the platform API before any import, with keys used
  **verbatim**: the one exception to the prefix rule, and what a prefix-scoped
  teardown leaves behind (a tax category `load` created can be removed with a flag). An existing one is **never modified** —
  a tax category keeps the project's rates, whatever the feed says. A price
  channel needs `ProductDistribution` or the API refuses the price. `productSelection` *is* importable and prefixed; `store` is not,
  and runs last. → [catalog-feed-contract.md](references/catalog-feed-contract.md)
- **Import Resources accept only KeyReferences, never ids.** Key everything
  `<prefix>-<sourceCode>`, ProductTypes included — though a ProductType's
  *name* comes from the unprefixed code, or the Merchant Center reads "Mig
  Apparel Basic". → [catalog-feed-contract.md](references/catalog-feed-contract.md)
- **An order hint is a string strictly between 0 and 1 and must not end in
  `0`** — a zero-padded scheme emits `0.10` and is rejected.
  → [categories-and-slugs.md](references/categories-and-slugs.md)

**Method**

- **Do not serialise the Import API on polling.** Operations are retained 48
  hours precisely so an unresolved reference resolves when its target arrives;
  polling each stage to completion serialises a pipelined design, and frequent
  summary polling slows the import. Retry only `rejected` — other states are
  retried internally.
- **Verify on a separate code path.** A verifier sharing logic with the writer
  confirms the writer's bugs. The audit gate reads the written plan back from
  disk and re-derives every invariant from the drafts as data.
- **Refuse to write data you cannot express correctly.** Skipping is
  recoverable; wrong data in production is not. Report it as loss instead.

## Reference index

| Topic | Reference |
| :--- | :--- |
| Profiling a source sample and producing a mapping proposal (step 0b) | [references/source-discovery.md](references/source-discovery.md) |
| The engagement decision log: what to record at each step, and what not to | [references/decision-log.md](references/decision-log.md) |
| The feed contract: every record type, with the two load-bearing design rules | [references/catalog-feed-contract.md](references/catalog-feed-contract.md) |
| Writing an adapter for an arbitrary source, and what to establish first | [references/writing-an-adapter.md](references/writing-an-adapter.md) |
| ProductTypes: declared vs inferred, constraints, levels, searchability | [references/product-model.md](references/product-model.md) |
| Money, price scopes, validity windows, embedded vs standalone | [references/pricing-and-money.md](references/pricing-and-money.md) |
| Categories: tree, slug allocation, order hints | [references/categories-and-slugs.md](references/categories-and-slugs.md) |
| Running the pipeline: the stage order, options and config; it routes to one file per stage | [references/running-the-pipeline.md](references/running-the-pipeline.md) |

## Scope

In scope: ProductTypes, Categories, Products, Variants, and prices — the
irreducible core of a loadable, browsable catalog.

Out of scope, deliberately. **Ongoing sync after cutover** and delta
feeds as a running service are integration, not migration. **Carts and payments**
are a different migration with different invariants; **customers** and **orders**
need the user's written yes ([customers](references/feed-customers.md), [orders](references/feed-orders.md)).
**Promotions and discounts** are usually a re-modelling exercise rather than a
translation, and **attribute modelling in the abstract**, the choice of tax mode
and pricing strategy are product data modelling, upstream of this — though the
tax categories a `Platform` mode needs are loaded, as prerequisites. **Cutover sequencing**,
freeze windows and rollback are out of scope too. Resources the pipeline
loads: [entity-coverage.md](references/entity-coverage.md).

**Opening stock is in scope; inventory as a running concern is not.** An
`inventoryEntry` record loads the figure a project opens on, and whatever owns
inventory afterwards will move it within the hour. Migrating stock does not
make this a sync tool, and a catalog loaded without stock is a perfectly
normal outcome.

Never migrate credentials, payment tokens or PSP references. They are not
portable, and re-keying them silently breaks reconciliation with the provider.
Passwords do not migrate: no foreign hash imports, so customers load under ExternalAuth.

## Checklist

Before running the pipeline:

- [ ] The catalog-model question, and whether the project holds products, were
      asked **before** any adapter work, and the largest product's variant count
      is known (over 100 needs `Modular`).
- [ ] The config was written from answers, not copied and guessed at. Nothing
      in it still reads `REPLACE-ME`.
- [ ] The source has been inspected, not assumed — the adapter is written
      against a real export.
- [ ] Every axis value is a language-independent code, with display text in
      `axisLabels`.
- [ ] `market.currencyFractionDigits` has an explicit entry per currency.
- [ ] `target.priceMode` matches how the implementation prices. Standalone
      pricing also needs `manage_standalone_prices` on the API Client, which
      `manage_products` does not grant.
- [ ] `keys.prefix` names this engagement, so teardown can scope itself. Every
      resource carries it, ProductTypes included. Channels, customer groups and
      tax categories are the only exception: `load` creates the missing ones
      with their keys **verbatim**, and teardown leaves them unless told to remove
      the tax categories `load` created.
- [ ] Every non-catalog entity in the source was asked about; customers and orders
      load only on a written yes (`entities.*: true`), else `false` and logged.
- [ ] Whether opening stock is in scope was **asked**, not assumed either way.
      A catalog loaded without it is normal; a catalog loaded with stock nobody
      agreed to is a figure the business did not sign off. If it is in scope,
      every `inventoryEntry` names a SKU the feed declares, and a deliberate
      zero is emitted rather than omitted.
- [ ] The tax mode was asked of whoever owns tax. Under `Platform`, every
      product has a `taxCategory`, every category has a rate for each country
      it sells into, and each rate's `includedInPrice` was confirmed, not
      inferred. Under `External` or `ExternalAmount`, `target.taxMode` is set,
      so `products-without-tax-category` stops, and the choice is in
      `DECISIONS.md`.
- [ ] `preflight` reports no `product-type-keys-unprefixed`. If it does, the
      project was loaded before ProductType keys were prefixed, and a Product's
      ProductType cannot be changed after creation.
- [ ] If the feed declares any `customerGroup`, the API Client has
      `view_customer_groups` and `manage_customer_groups` — `manage_products`
      grants neither, and `load` needs both to create one. Channels are covered
      by `manage_products`.
- [ ] If the feed declares any `productSelection`, the API Client has
      `view_product_selections` and `manage_product_selections`; if it declares
      any `store`, `view_stores` and `manage_stores`. `manage_products` grants
      none of these.
- [ ] Every `productSelection` `mode` has been confirmed with whoever owns the
      assortment. It is permanent, and the two modes are opposites.
- [ ] No store's selections are all inactive — that offers no products, where
      an empty list would have offered every product.
- [ ] `INTERVIEW.md` has an answer in every row, including any
      added after step 0, and is committed with `DECISIONS.md`.
- [ ] `DECISIONS.md` exists, is committed, and has an entry for every step 0
      decision — including the ones still open and the questions the interview
      file lists as not asked.

Before loading:

- [ ] `DECISIONS.md` names the pipeline release that ran the stages (the tag,
      with what differs if the copy was changed), including when the copy was
      already there.
- [ ] `validate`, `derive`, `plan` and `audit` all pass — in that order, in one
      sitting. If `plan` fails it writes nothing and the previous `plan.json`
      survives; `audit` refuses a plan whose feed digest no longer matches
      (`plan-stale`), but a plan with no digest at all can only report
      *unknown*, so do not rely on the check to catch a replay.
- [ ] `out/MODEL-REVIEW.md` has been read and its irreversible choices accepted.
- [ ] `SameForAll` and `CombinationUnique` are right — they cannot be tightened
      later.
- [ ] Each recorded information loss is accepted, or the adapter is fixed.
- [ ] Sample payloads have been eyeballed, money values checked against the
      source — in either price mode; standalone prices are listed per SKU.
- [ ] Slug changes forced by project-wide uniqueness have been shown to whoever
      owns SEO.
- [ ] Attribute names shared across ProductTypes agree on `isSearchable`.
- [ ] `preflight` reports no `tax-category-name-taken`, and any
      `tax-category-rates-differ` has been shown to whoever owns tax — the
      project's rates are the ones that will apply.
- [ ] `preflight` reports no `attribute-type-conflict`. An attribute name may
      hold one type per Project, and the conflict can come from a ProductType
      the migration never touches.

After loading:

- [ ] Counts and structural properties verified through a separate code path.
- [ ] Products published deliberately, as a separate step — the pipeline always
      plans `publish: false`. If the target project already holds **published**
      products, confirm before `--execute` that unpublishing the ones this run
      touches is intended: `publish: false` unpublishes, silently.
- [ ] The container summary was read **inside 48 hours** of the run. Past that,
      failed operations are deleted and a summary of survivors reads clean.
      `verify` reads resources, which do not expire.
