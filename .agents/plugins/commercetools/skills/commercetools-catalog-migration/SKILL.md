---
name: commercetools-catalog-migration
description: Migrates a product catalog from any source system into commercetools through a canonical NDJSON feed contract — the pipeline never parses the source, so each engagement writes only a small adapter. Covers the feed contract, writing an adapter, ProductType derivation and its irreversible attribute constraints, decimal-to-minor-unit money conversion, project-wide slug allocation, category order hints, and the offline audit gate. Use when migrating or bulk-loading a product catalog into commercetools, writing an adapter for a source export, deciding SameForAll versus CombinationUnique, converting prices to centAmount, or diagnosing rejected Import API operations. Covers loading a catalog from a source system into commercetools — not the Classic-to-Modular catalog model migration of an existing project, which is the staged Modular Catalog migration guide. Not for ongoing sync after cutover, and not for customers, orders, carts, inventory, or promotions.
when_to_use:
  - "Migrating or bulk-loading a product catalog from a source system into a commercetools project"
  - "Writing an adapter that turns a source export (hybris ImpEx, PIM extract, CSV) into a catalog feed"
  - "Deciding SameForAll versus CombinationUnique for a variant attribute, or any other irreversible ProductType choice"
  - "Diagnosing Import API operations that were accepted but came back rejected or unresolved"
metadata:
  contentType: SKILL
  area:
    - Integrations
  docsSearch:
    products:
      - Composable Commerce
---

# commercetools catalog migration

Migration is one-time and decision-heavy. The deliverable is **a reviewed set of
decisions**, not a loaded dataset: what was translated, what was approximated,
and what was lost, with a rationale per decision. A migration claiming zero
information loss is not being honest.

If the work is a recurring sync from a PIM, ERP or OMS, this is the wrong
approach: that is integration, contract-heavy rather than decision-heavy.

## The source boundary is a data contract, not a code module

```
any source  →  adapter  →  canonical catalog feed  →  pipeline  →  commercetools
               per          NDJSON, schema-checked    reusable
               engagement   THE CONTRACT
```

The pipeline — [`commercetools/ct-catalog-migration-pipeline`](https://github.com/commercetools/ct-catalog-migration-pipeline),
cloned beside the engagement — **never parses a source system**. It defines a
feed contract and starts there. Everything source-specific lives in the adapter,
upstream of the contract.

This is not decoration. A universal parser for any source platform does not
exist — no two installations agree on their type system — so source knowledge
inside the pipeline is what destroys retargetability. A seam made of *data*
rather than *code* makes that coupling impossible rather than discouraged. The
contract is `schema/catalog-feed.schema.json` in that repository; treat it as
the API.

## Before you start

1. <!-- ct:docs-search:begin -->
   **Docs search (required, run first)** — The first time you use this skill in a session you must run this before answering. It gathers the latest verified documentation as your primary grounding, filtered to the products this skill covers. Use this script for documentation search while working with this skill; the Knowledge MCP covers everything else. Always confirm details against retrieved documentation rather than the skill text alone:

   ```bash
   node scripts/docs-search.mjs \
     --query "<extract key terms: Import API, ProductType attributes, catalog model, Standalone Prices, Category slug>" \
     --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
     --model "<current-model>" \
     --limit 10
   ```
   <!-- ct:docs-search:end -->

   The limits and constraints in [Critical](#critical) were verified in
   September 2026. Re-check any of them here before relying on one.

## Workflow

0. **Interview, then write the config.** Do not hand over a template to fill
   in. Ask the questions, then **write `migration.config.json` from the
   answers** — the config is the record of a conversation, not a form.

   Every question, what it writes, and why none of them can be defaulted:
   [references/step-0-interview.md](references/step-0-interview.md). Work
   through it in order — the order is load-bearing:

   1. **Size the export** (minutes): file list, line counts, largest variant
      count. Structural only — no mapping, no types, no decisions.
   2. **Ask 0a**, the catalog-model question, with that number in hand. Both
      its answers can end the engagement, and both are cheaper to learn now
      than after an adapter exists. A catalog over 100 variants per product
      cannot be loaded under `Classic` at all.
   3. **Discover the source (0b)** —
      [references/source-discovery.md](references/source-discovery.md) — then
      ask the rest (0c, 0d), because the data answers some of them.

   **Then open the decision log.** The config records *what* was chosen, not
   who chose it, what the alternative would have cost, or that a question was
   asked at all. Write one entry per decision from 0a and 0c, plus any
   question that could not be answered — an open question with an owner is a
   plan, an unasked one is a surprise. Format and placement:
   [references/decision-log.md](references/decision-log.md).

   **Keep writing it at every step from here**, not at the end: a log
   reconstructed afterwards records what someone remembers deciding, reliably
   the subset that turned out well, while the entries that matter are the
   irreversible ones taken under uncertainty.

1. **Write the adapter — one product first.** Read the source, emit NDJSON
   against the contract. This is the only code an engagement normally writes,
   and it is deliberately disposable. Work through
   [references/writing-an-adapter.md](references/writing-an-adapter.md) against a
   real export — one designed against an assumed source model gets rewritten —
   with the record types in
   [references/catalog-feed-contract.md](references/catalog-feed-contract.md).

   **Take the thin vertical slice before writing the rest**: one product, two
   or three variants, through `validate`, `derive`, `plan` and `audit`.
   Writing every SKU in one pass usually gets away with it, which is why this
   step keeps getting skipped — and is not a reason to skip it. The axis
   model, the money conversion and the attribute constraints are wrong in the
   same way across five records as across five thousand, and they are
   irreversible once loaded.

   **Log every point where the adapter decides rather than translates**: a code
   derived from a display name, a hierarchy level collapsed, an inherited price
   resolved, a locale tag normalised, a sentinel skipped or interpreted, a field
   dropped, and *every silent cap* — anything sampled, truncated or skipped.
   These are the decisions most often lost, because they are made while writing
   code and feel like implementation details. They are not: they are what the
   migration did to the customer's data.

2. **Run the offline stages in order.** Each gates the next, so a defect is
   reported at the earliest stage that can see it:

   ```bash
   cd ct-catalog-migration-pipeline
   npm run pipeline -- validate --config ../migration/migration.config.json
   npm run pipeline -- derive   --config ../migration/migration.config.json
   npm run pipeline -- plan     --config ../migration/migration.config.json --payloads
   npm run pipeline -- audit    --config ../migration/migration.config.json
   ```

   None of these need credentials, by design: a broken feed or an unloadable
   plan reports the real problem on a laptop with no `.env`.

   **Log the findings you accept rather than fix.** A diagnostic that changes the
   adapter leaves no decision behind — the feed is regenerated and the finding
   disappears. One *accepted* is a decision: 14 disambiguated slugs and the URLs
   that result, a products-in-no-category warning that is correct for this
   catalog, an `approaching-variant-limit` acknowledged with a plan to revisit.
   Record the count and the artefact, not every finding.

3. **Read `out/MODEL-REVIEW.md` before loading.** It is the sign-off artefact:
   irreversible choices, information loss, and anything guessed.

   Log the *review outcome*, not its contents — one entry naming what was
   accepted and against which plan. `MODEL-REVIEW.md` is regenerated on every
   run and can hold thousands of entries; copying them into an append-only log
   guarantees the two disagree by the next run.

4. **Check the target project** once credentials exist. `preflight` answers
   whether the project will accept the plan, in a handful of GETs, before
   anything is written:

   ```bash
   npm run pipeline -- preflight --config ../migration/migration.config.json
   ```

   **`--apply` writes to the customer's project, and so does any manual change
   made to get past preflight. Log every one**: project key, timestamp, exactly
   what changed, who authorised it. `--apply` reports `project-updated` to stdout
   and nowhere else, so an unlogged change is one nobody can account for. Manual
   changes count doubly — adding a country to make country-scoped prices load
   affects shipping and tax, which is why `preflight` refuses to do it.

5. **Load, dry run first.** `load` sends nothing without `--execute`, and writes
   the exact request bodies to `out/load-requests.json` for review:

   ```bash
   npm run pipeline -- load --config ../migration/migration.config.json
   npm run pipeline -- load --config ../migration/migration.config.json --execute
   ```

   Log one entry per `--execute`: project key, timestamp, what was sent, the
   outcome. `out/load-result.json` holds the detail but is regenerated and
   gitignored.

6. **Verify, and do not treat the load's own report as the answer.** An
   accepted Import Request is not an imported resource — the API validates
   asynchronously, so a load can report every request accepted while
   individual operations are rejected afterwards. `verify` reads the project
   back and reconciles it against the plan. Every call is a GET:

   ```bash
   npm run pipeline -- verify --config ../migration/migration.config.json
   ```

   It needs `view_products` and, under standalone pricing,
   `view_standalone_prices` — reading is a different scope set from writing.

   Log the result as the closing entry for the run, **including a clean one**.
   "Reconciled, no differences" is the sentence someone needs months later when
   asking whether the load was ever checked at all.

7. **Fix defects in the adapter, never in the feed by hand.** The feed is
   regenerated on every run.


## Critical

The failure modes that are silent or unrecoverable, each stated in full in the
reference beside it — this list exists so none is *missed*. Verified against
public documentation in September 2026; re-check any limit before relying on it.

**Irreversible, so decide before the first load**

- **Attribute constraints are a one-way door.** `changeAttributeConstraint`
  accepts only `None`: a constraint can be relaxed, never tightened or
  switched. A wrong `SameForAll` / `CombinationUnique` means recreating the
  attribute and rewriting its data. → [product-model.md](references/product-model.md)
- **A product selection's `mode` is fixed at creation** — there is no
  `changeMode` action, and re-importing the other mode reports `imported` and
  changes nothing. → [catalog-feed-contract.md](references/catalog-feed-contract.md)
- **A Product's ProductType cannot be changed after creation.** A project
  loaded before ProductType keys were prefixed trips
  `product-type-keys-unprefixed` and cannot be moved onto the new keys by
  re-running. → [running-the-pipeline.md](references/running-the-pipeline.md)
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
  → [running-the-pipeline.md](references/running-the-pipeline.md)
- **An unresolved KeyReference expires after 48 hours**, taking its price with
  it: a green load and a partly priced catalog.
  → [running-the-pipeline.md](references/running-the-pipeline.md)
- **`publish: false` unpublishes.** It is an instruction, not "leave
  publication alone", and the pipeline plans it on every product. Correct on a
  first load; on a re-load into a live project it takes every product it
  touches offline, with every operation still reporting `imported`.
  → [running-the-pipeline.md](references/running-the-pipeline.md)

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
  **nothing**. → [catalog-feed-contract.md](references/catalog-feed-contract.md)
- **Channels and customer groups cannot be imported — `load` creates them**
  through the platform API before any import, with keys used **verbatim**: the
  one exception to the prefix rule, and the one thing a prefix-scoped teardown
  leaves behind. A price channel needs `ProductDistribution` or the API refuses
  the price. `productSelection` *is* importable and prefixed; `store` is not,
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
| Running the pipeline: each stage, each gate, and what is still absent | [references/running-the-pipeline.md](references/running-the-pipeline.md) |

## Scope

In scope: ProductTypes, Categories, Products, Variants, and prices — the
irreducible core of a loadable, browsable catalog.

Out of scope, and deliberately so. **Ongoing sync after cutover** and delta
feeds as a running service are integration, not migration. **Customers, orders,
carts and payments** are a different migration with different invariants.
**Promotions and discounts** are usually a re-modelling exercise rather than a
translation, and **attribute modelling in the abstract**, tax modes and pricing
strategy are product data modelling, upstream of this. **Inventory and supply
channels**, and **cutover sequencing**, freeze windows and rollback, are planned
and not built.

Never migrate credentials, payment tokens or PSP references. They are not
portable, and re-keying them silently breaks reconciliation with the provider.
Passwords do not migrate either — commercetools cannot import a foreign hash.

## Checklist

Before running the pipeline:

- [ ] The catalog-model question was asked **before** any adapter work, and the
      largest product's variant count is known. A catalog over 100 variants per
      product cannot be loaded by this pipeline at all.
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
      resource carries it, ProductTypes included. Channels and customer groups
      are the only exception: `load` creates the missing ones with their keys
      **verbatim**, and teardown will not remove them.
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
- [ ] `DECISIONS.md` exists, is committed, and has an entry for every step 0
      decision — including the ones still open.

Before loading:

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
      source.
- [ ] Slug changes forced by project-wide uniqueness have been shown to whoever
      owns SEO.
- [ ] Attribute names shared across ProductTypes agree on `isSearchable`.
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
