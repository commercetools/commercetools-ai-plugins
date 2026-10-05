---
name: step-0-interview
description: "The step-0 interview: the catalog-model question that can end an engagement, the judgements that cannot be defaulted, the two conditional questions, and the project facts that become migration.config.json."
metadata:
  contentType: REFERENCE
---

# The step-0 interview

Do not hand over a template to fill in, and do not ask the questions in chat.
Put the questions here into a file the user edits, then **write
`migration.config.json` from the answers** — the config is the record of a
conversation, not a form.

- [Order of work](#order-of-work)
- [The interview file](#the-interview-file)
- [Questions that arise later](#questions-that-arise-later)
- [0a. Can this pipeline serve the catalog at all?](#0a-can-this-pipeline-serve-the-catalog-at-all)
- [0b. Discover the source](#0b-discover-the-source)
- [0c. The remaining judgements](#0c-the-remaining-judgements)
- [0c-conditional. If the source carries stock, ask whether it is in scope](#0c-conditional-if-the-source-carries-stock-ask-whether-it-is-in-scope)
- [0c-conditional. If slugs collide, ask who owns the URLs](#0c-conditional-if-slugs-collide-ask-who-owns-the-urls)
- [0c-conditional. If 0b found relative media URLs, ask about the host](#0c-conditional-if-0b-found-relative-media-urls-ask-about-the-host)
- [0d. The project facts](#0d-the-project-facts)
- [Then open the decision log](#then-open-the-decision-log)

## Order of work

**Size the export, discover the source, write the interview file, stop** —
because 0a needs a number only the source has, and 0c is informed by what
discovery found:

1. **Size it** (minutes): file list, line counts, largest variant count.
   Structural only — no mapping, no types, no decisions. Sizing is not the
   source work 0a means; writing an adapter is.
2. **Discover the source (0b)**, which the data needs before the rest can be
   asked well.
3. **Write [`migration/INTERVIEW.md`](#the-interview-file)** with every
   question from 0a, 0c, each applicable conditional and 0d, then stop. 0a's
   answers can end the engagement, so they come first in the file, and nothing
   after it — above all the adapter — starts until they are answered.
4. **When every question is answered**, write the config and open the
   decision log.

## The interview file

Questions go in a file rather than in chat for two reasons. A question tool
holds only a few questions per call, so the rest are easy to drop and then
default without anyone noticing. And the answers are
rarely one person's: the storefront owner, whoever owns tax and whoever owns
the URLs each need time, and a file can be forwarded, edited by each of them
and kept as the record.

One block per topic. The block holds a table, and each row is one question with
the one fact that prompts it, a recommendation and its own answer cell:

```markdown
## Q3 · How does the storefront read prices?

**Owner:** whoever owns the storefront implementation

**Why it matters:** a product whose price mode disagrees with where its
prices are imports cleanly and shows no price at all.

**Writes:** 3.1 → `target.priceMode`; 3.2 → the hoodie's price records

| # | Question | Found in the source | Recommendation | Answer |
| :-- | :-- | :-- | :-- | :-- |
| 3.1 | Are prices inside the product (`embedded`) or separate records (`standalone`)? | One price per SKU per website, no tiers | `embedded`: nothing in the source needs separate records | |
| 3.2 | Carry the sale over as a dated price (a), or drop it (b)? | Zip Hoodie has a £36 price from 1 to 31 October, live today | (a) if the October promotion should continue | |
```

- **One row, one question, one fact.** A row's fact is what prompted its
  question; if a fact prompts no question it belongs under **Why it matters**,
  and a question the source says nothing about gets "nothing in the source" in
  the fact cell. Never fold two questions into one row: they would share one
  answer cell, and the second would go unanswered unnoticed.
- **A section's "Why it matters" explains every row in it.** A section is one
  topic with one reason. If a row's reason is not the one the section states,
  the row belongs in another section, and a heading that bundles topics with
  different reasons ("Project facts", "Stores, locales and categories") is
  several sections. Topics that share one reason stay together: locales and
  currencies are one section, because both say what the project can carry. A
  catch-all hides rows whose reason the owner never reads, so they look
  disconnected and get skimmed.
- **Number the rows** (`3.1`, `3.2`) so a follow-up, a **Writes** entry and a
  reply to the user can name exactly one cell. Keep each cell to a sentence or
  two, and write a literal `|` as `\|`.
- **Put a blank line between every field and before the table.** Markdown
  joins consecutive lines into one paragraph, and a table that is not
  separated from the line above it does not render.
- **Copy the ask and the why from the tables in this page**; add what the
  source showed, a recommendation with its trade-off per row, and which config
  field or decision each answer writes. The recommendation helps the owner
  choose; it is never an answer.
- **Never fill in an answer cell yourself**, and do not treat a
  recommendation as accepted. If the data settles a question, say so in the
  fact cell and still leave the answer to a person: a wrong-but-consistent
  choice passes every offline stage.
- **List the conditional questions you left out** under a final heading, each
  with its reason ("no relative media URLs found"), and carry them into
  `DECISIONS.md` as not asked. A question left out without a line is the
  silent default this file exists to prevent.
- **Say how to hand it back:** tell the user to edit the file and say when
  every question is answered, and that the file can be passed to the people
  who own the tax, URL and storefront answers.

**On resume, re-read the file before doing anything else.** Count the rows
whose answer cell is empty. If any, name them by row number and stop: no config, no
adapter. If the user answered in chat instead, write that answer into the file
first, so the file stays the record.

Two kinds of answer need handling:

- **"I don't know."** For a question whose answer writes no config field
  (re-export or one-shot, shop window, stock freshness), accept `unknown,
  owner: <name>` and log it as an open question with that owner. For one that
  writes a config field, it is not an answer: the pipeline cannot run without
  a value, so name it as still unanswered.
- **An answer that opens a follow-up**, such as per-warehouse stock leading to
  which stores sell from each warehouse. Add it as the next row of the section
  it belongs to (`2.2` after `2.1`), with "Follows 2.1" in its fact cell, and
  stop again. A second round is expected. An answer that contradicts the
  evidence (`Classic`, with a product over 100 variants) gets a follow-up row
  that says so, not a quiet override.

A round adds only what is new. A row whose answer cell is still empty stays
where it is and is not repeated, in the same section or in a new one: the next
resume names it by number, and copying it would leave two cells for one
question.

Keep the answered file unedited and commit it with `DECISIONS.md`: the log
records the decisions, the file records what was asked and by whom it was
answered.

## Questions that arise later

The file stays open for the whole engagement, not only step 0. `plan`, `audit`,
`preflight`, `load` or `verify` can each surface something only a person can
settle: a store whose country the project does not accept, a warning that is
right or wrong depending on how the business sells, a mismatch with no
technical cause. Do not settle it yourself and do not ask it in chat. Add it
to the file as a row of the section it belongs to, in the same shape: the next
number in that section (`3.3` after `3.2`), and an entry in its **Writes**
field. Open a new section, numbered after the last, only when no existing one
fits, and say why in its **Why it matters** field.

Search the file first. A question that is already in it, answered or not, is
not asked again: point the user to its row. If what you found overturns an
answered row, add a new row that names the one it supersedes, as the decision
log supersedes rather than rewrites.

Under the section's table, add one line per late row, naming the row:

```markdown
**Raised later:** 3.3 — during `preflight`, `store-countries-not-accepted` for
`IE`. Affects the feed's `store` records, so `plan` and everything after it.
Already loaded: nothing.
```

- **during** names the stage and the diagnostic, so the owner can see what
  prompted it.
- **Affects** names the earliest stage whose output the answer can change.
  When the answers arrive, **start again from that stage**, not from where you
  stopped: everything after it was derived from the old assumption. Once the
  feed changes, the freshness digest (`plan-stale`) stops `audit` and `load` on
  the old plan anyway.
- **Already loaded** says whether the question touches resources that are
  already in the project, because that changes what a different answer costs.

Then stop work that depends on the answer, say which question is open, and
carry on with anything that does not. Never renumber, never insert a row
between existing ones, and never edit an answered cell. Tell the user which
sections gained rows, by row number: they may have filled those sections in
already and will not look at them again.

The file settles *what* to do, not whether to write to the project. The
question before `load --execute` is still asked live, naming the project and
the counts, immediately before the write: an answer recorded in the file
yesterday is not consent to a write today.

## 0a. Can this pipeline serve the catalog at all?

Two questions, and they interact.

Both models are supported; the question is which this catalog *needs*. Ask it
early — the answer fixes the import shape at map time, so changing it later
means re-running `plan`:

| Ask | Why |
| :--- | :--- |
| Which catalog model is the project on, or intended to be — `Classic` or `Modular`? | It decides which Import API resources are legal, and it is not inferable from data. A greenfield project can be switched either way with one `setProductCatalogModel` action, so it is a genuine project decision. |
| Roughly how many variants does the largest product have? | Classic caps at **100 per product**, Modular at 10,000. It is the one constraint that can make a catalog unloadable under Classic, and it costs one question to find out. 0b answers it from data if they do not know. |

The catalog-model answer writes `target.catalogModel`; the variant count writes
nothing and decides the outcome below.

Resolve the two together, and say the outcome plainly:

| Model | Largest product | Outcome |
| :--- | :--- | :--- |
| `Classic` | ≤ 100 | Proceed. |
| `Classic` | > 100 | **The project has to move to Modular**, or the catalog cannot be loaded. Say that before an adapter is written, not after. |
| `Modular` | any | Proceed. Over 100 is what Modular is for; at or under it Classic would also fit, so ask whether Modular is wanted for its own sake — it forces standalone pricing and has the `defaultVariant` caveat below. |

An existing project already holding embedded variants is a different exercise:
switching it is the staged
[Modular Catalog migration](https://docs.commercetools.com/guides/migration-guides/modular-catalog-migration.md)
— dual-write, the `InMigration` state, a Variant copy job and a cleanup job —
not one update action, and not this pipeline's job. Settle it before the
catalog load rather than during it.

Two things to state whenever `Modular` is chosen, because neither is
visible until late:

- **Pricing is Standalone only.** Modular has no embedded prices at all, so
  `target.priceMode` must be `standalone` and the config refuses anything
  else. That also means the API Client needs `manage_standalone_prices`,
  which `manage_products` does not grant.
- **`defaultVariant` cannot be imported.** Modular replaces the master variant
  with `Product.defaultVariant`, which appears nowhere in the Import API. The
  pipeline still chooses and logs it deterministically, then cannot write it:
  products load with no default variant, the plan records the loss, and
  setting them needs an HTTP API pass this pipeline does not do.

When a catalog cannot be served, say what is missing rather than implying the
catalog is wrong. Do **not** suggest splitting products to fit Classic — that
reshapes a catalog to suit a tool.

## 0b. Discover the source

Profile the export *before* the remaining questions, because the data answers
some of them. Work through [source-discovery.md](source-discovery.md) — **all
of it, whichever path you take below.**

**Ask how large the export is first.** If it is small enough to read whole — a
few thousand lines — skip **the probe feed, not the page**: there is nothing
to extrapolate to, and under `onMissingDefinitions: require` the inference it
exercises never runs. Read all of it and take the thin vertical slice from
[writing-an-adapter.md](writing-an-adapter.md) instead.

Otherwise, for an export you only get a sample of: profile it, write a
**throwaway probe adapter** over the sample, emit a probe feed, and run
`validate` and `derive` on that. Type, `enum`/`lenum` and
attribute-constraint recommendations then come from the code that will run in
production rather than from an agent's reading, `mixed-value-types` fires
where inference would be wrong rather than merely uncertain, and every
irreversible choice arrives already flagged in `MODEL-REVIEW.md`.

Discovery ends in a **mapping proposal** — a named artefact, because it is what
a human signs off. Its section-by-section template is
[in source-discovery.md](source-discovery.md#the-mapping-proposal);
write it from there, not from this paragraph. It settles two things that would
otherwise be guessed: the largest product's variant count for 0a, which a
customer may genuinely not know, and whether the source declares its own
attribute types — the `onMissingDefinitions` answer below.

Say which path you took, and if it was a sample, present the proposal as
**hypotheses, not conclusions** — a sample under-reports exactly what hurts:
worst-case variant counts, attribute cardinality, mixed value kinds, rare
sentinels. "Read the complete export, 8 products, 90 SKUs" and "profiled 500
rows of ~40,000" support very different confidence, and a later reader cannot
tell them apart.

## 0c. The remaining judgements

Now informed by 0b. Each is irreversible or fails silently, and a
wrong-but-consistent choice passes every offline stage:

| Ask | Writes | Why it cannot be defaulted |
| :--- | :--- | :--- |
| How does the storefront read prices? The catalog model decides this only for Modular; Classic allows either | `target.priceMode`: `embedded` / `standalone` | a product whose `priceMode` disagrees with where its prices are imports cleanly, reports `imported`, and shows no price at all |
| Should attributes be searchable unless stated otherwise? | `productTypes.searchableByDefault`: `true` / `false` | ProductTypes that disagree on a shared attribute name make it unavailable for search, filters and facets everywhere — and the import still succeeds |
| How are carts taxed — by the platform from tax categories, or by an external service? And does the project already hold its tax categories? If external: do the source's tax classes stay as tax categories without rates, or are they dropped? | `target.taxMode`: `External` / `ExternalAmount`, or left out for `Platform` — plus the adapter's `taxCategory` records and each product's `taxCategory` | under the default `Platform` tax mode a product with no tax category loads, verifies, and **cannot be taxed at checkout**. An existing category is never modified, so the project's keys become the codes. Under an external mode the category no longer sets the cart's tax, so keeping or dropping the source's classes changes reporting, not checkout |
| Will this catalog be **re-exported and re-loaded**, or is this one-shot? | nothing — `DECISIONS.md` only | every derived code becomes a key on the first load and cannot move afterwards. One-shot permits deriving from whatever is readable; repeatable requires deriving only from fields the source guarantees are stable, which is usually a smaller set |
| Which variant should be the **shop window**, if the source does not say? Show, per product, the variant the fallback would pick | nothing — the adapter's `isMaster` | absent `isMaster` falls back to the lowest SKU by plain string order, per product. Deterministic, and arbitrary as merchandising: it decides what a category listing shows, and digits sort before letters, so a product with sizes `S` to `2XL` is fronted by its `2XL`. Most sources have no master-variant concept, so this is the normal case, not an edge case |

`productTypes.onMissingDefinitions` is **not** in that table: whether the
source declares its own attribute types is a fact 0b established, not a
preference. Set `require` when the adapter can emit `attributeDefinition`
records, `infer` only when the source genuinely cannot describe its own type
system — and then expect every inferred type to need review, because each
one becomes an attribute type and constraint. No update action changes an
attribute's type, and the
[constraint update action](https://docs.commercetools.com/api/projects/productTypes.md#change-attributedefinition-attributeconstraint)
takes only `None`, so a wrong guess cannot be corrected in place.

**`productTypes.productLevelStrategy` is not asked.** `derive` accepts `native`,
but `plan` refuses it (`native-product-level-not-mapped`), so offering it in the
interview sends a question the business already answered back to them at
`plan`. Leave it at `sameForAll` and list it under the conditionals left out
with that reason.

The first two are storefront decisions with no evidence in the source, so they
stay questions for whoever owns the implementation. The tax row is a question
for whoever owns **tax**, which is often someone else: they decide the mode,
confirm the rates and each rate's net/gross setting, and know whether the
project's tax categories already exist — a new one needs a name no existing
category holds. Under `External` or `ExternalAmount` the outside service, not a product's
tax category, sets the cart's tax
([tax modes](https://docs.commercetools.com/api/carts-orders-overview.md#tax-modes)),
so the source's classes are either dropped or kept as tax categories
**without rates**; the feed allows that, and `validate` stops warning about
rate gaps once `target.taxMode` is set. Put the keep-or-drop question in the
same rows as the mode, to be answered only when the mode is external: the file
is written before the mode is known, and a follow-up round costs the owner
another wait. Keeping a class costs a category in the project that teardown
does not remove and whose name nobody else may hold; dropping it loses the
grouping a report or the tax service may rely on. Record "External, no tax
categories" and "External, classes kept" as deliberately as a set of rates,
by setting `target.taxMode`; `validate` will otherwise keep warning,
correctly. The last two are the ones
most often skipped — they feel like project management rather than modelling,
and get discovered while writing the adapter, once the derivation is chosen.

For the shop-window row, compute the fallback from the data before writing
the file and give each product its own row, with the result in its fact cell: "with the
fallback, Zip Hoodie is fronted by `HOOD-2XL`". The mechanism is string order,
not sizes: a pack sold as `PACK-6` and `PACK-12` is fronted by `PACK-12`, because
`1` sorts before `6`. Asked
in the abstract, the question is taken as "use the default" and the owner
first sees the result in the dry run's `load-requests.json`, after the choice
is made. Shown per product, it is a question about their own catalog, the
recommendation can be a named variant, and each product has its own answer.

## 0c-conditional. If the source carries stock, ask whether it is in scope

Most catalog exports carry a stock column, and its presence is not consent to
load it. Ask, and record the answer either way:

- **Who owns inventory after cutover?** If an ERP or OMS writes stock within
  the hour, the migrated figure is an opening balance and nothing more. That
  is still worth loading — a catalog that opens showing everything
  out-of-stock sells nothing on day one — but it changes how hard anyone
  should work to make it exact.
- **Is the export's stock current?** A figure taken from a nightly extract two
  weeks before cutover is worse than no figure, because a wrong number reads
  as authoritative while an absent one reads as unknown.
- **Per warehouse, or one number?** A store that lists supply channels sees
  stock only on those channels, plus project-wide stock; a store that lists
  none, or no store at all, sees everything. Getting this backwards makes
  stock either invisible or oversold, and neither shows up as an error.
- **If per warehouse: which store(s) sell from each warehouse?** The answer
  becomes `store` records whose `supplyChannels` list those warehouses. A
  warehouse no store lists, in a feed where some store lists others, is stock
  the storefront cannot see — `validate` warns
  (`inventory-supply-channel-not-in-store`). "No stores yet" is a valid
  answer; record it.

Write each question above as its own row in the interview file, not one
stock row: the freshness row is the one a person other than the answerer can
take, as `unknown, owner: <name>`, while "load it at all?" writes
`inventoryEntry` records and cannot be left open.

Skip it when the export carries no stock at all. Do **not** skip it because
stock looks like an implementation detail — it is the one field that decides
whether a loaded catalog can take an order.

## 0c-conditional. If slugs collide, ask who owns the URLs

Slugs are unique per locale across the Project, so a retail taxonomy that
reuses names forces suffixes — and a forced suffix is a **changed URL**, which
is an SEO decision and someone else's to make. `derive` and `plan` report the
count; what they cannot do is find the owner. Ask while the mapping is still
cheap to change, not after the load.

**Two questions, not one:** the policy, *and* the name. Asking only the
policy logs every changed URL against nobody, which reads as a decision and
is not one. The name is what makes the entry a decision rather than a guess.

Do not raise it when nothing collides.

## 0c-conditional. If 0b found relative media URLs, ask about the host

Do not raise this otherwise — it is not a standing question.

Sources commonly store `/medias/...` and keep the host in a CDN setting, a
storefront config, or an operations runbook. It is **not in the export**, so
it can only be supplied. Put it to the user plainly, with the cost: a wrong
base loads a catalog whose every image 404s, and neither the pipeline nor
the project can detect that — the only way to find out is to open one.

Ask what host or prefix these image paths resolve against; it writes
`media.baseUrl`. Two acceptable answers. **A confirmed prefix** — set
`media.baseUrl`, and the mapper resolves every relative URL against it,
recording the count and the base as a reviewable decision. **No host
available** — drop the images in the adapter and report them as not migrated.
An absent image is recoverable; a wrong URL on every product is not, because
it looks like success. Do not guess: `validate` refuses relative URLs with no
`media.baseUrl` for exactly this reason. Absolute URLs need none of it, and a
feed may mix the two.

## 0d. The project facts

Lookups rather than judgements, asked as two sections because each has its own
reason:

| Section | Rows | Why it matters |
| :--- | :--- | :--- |
| Key prefix | `keys.prefix`: name this engagement | It goes into every key created, and bounds a teardown to its own work. |
| Locales and currencies | `market.defaultLocale`, `requiredLocales`, `requiredCurrencies`, and a `currencyFractionDigits` entry per currency | The project's languages and currencies decide which locales a localized string, and which currencies a price, can carry ([Project configuration overview](https://docs.commercetools.com/api/project-configuration-overview.md)). The default locale is where plain strings and omitted labels land. A currency whose digits are guessed loads without an error: a 0-digit price at 2 digits is multiplied by 100. |

`preflight` checks the market values against the real project later;
approximate is fine now.

Then write the config. The field-by-field shape is in
[running-the-pipeline.md](running-the-pipeline.md); the pipeline repository's
root `migration.config.json` is a filled example, a fallback rather than the
intended path — it ships `keys.prefix: "REPLACE-ME"`, which the loader
refuses, so a copy taken by mistake cannot run.

Much of this is **intent, or a hypothesis from a sample — not fact**, and the
later stages confirm all of it: `validate` recomputes the largest product's
variant count from the whole feed and reports which model it actually
requires, `derive` re-runs inference over every record rather than 0b's
sample, `preflight` reads the project's real `productCatalogModel`. Where
intent and evidence disagree the evidence wins, and the disagreement is the
finding — it says how representative the sample was, before cutover instead
of after. The loader still refuses an absent or misspelled value with the
consequence spelled out: a generated config is not a trusted config.

## Then open the decision log

The config records *what* was chosen, not who chose it, what the alternative
would have cost, or that a question was asked at all. Write one entry per
decision from 0a and 0c, plus any question the file lists as not asked or
answered "unknown" — an
open question with an owner is a plan, an unasked one is a surprise. Format
and placement: [decision-log.md](decision-log.md).

**Keep writing it at every step from here**, not at the end: a log
reconstructed afterwards records what someone remembers deciding, reliably the
subset that turned out well, while the entries that matter are the
irreversible ones taken under uncertainty.
