---
name: step-0-interview
description: "The step-0 interview: the catalog-model question that can end an engagement, the judgements that cannot be defaulted, the two conditional questions, and the project facts that become migration.config.json."
metadata:
  contentType: REFERENCE
---

# The step-0 interview

Do not hand over a template to fill in. Ask the questions here, then **write
`migration.config.json` from the answers** — the config is the record of a
conversation, not a form.

- [Order of work](#order-of-work)
- [0a. Can this pipeline serve the catalog at all?](#0a-can-this-pipeline-serve-the-catalog-at-all)
- [0b. Discover the source](#0b-discover-the-source)
- [0c. The remaining judgements](#0c-the-remaining-judgements)
- [0c-conditional. If the source carries stock, ask whether it is in scope](#0c-conditional-if-the-source-carries-stock-ask-whether-it-is-in-scope)
- [0c-conditional. If slugs collide, ask who owns the URLs](#0c-conditional-if-slugs-collide-ask-who-owns-the-urls)
- [0c-conditional. If 0b found relative media URLs, ask about the host](#0c-conditional-if-0b-found-relative-media-urls-ask-about-the-host)
- [0d. The project facts](#0d-the-project-facts)
- [Then open the decision log](#then-open-the-decision-log)

## Order of work

**Size the export, then ask 0a, then discover properly** — three steps, not
two, because 0a needs a number only the source has:

1. **Size it** (minutes): file list, line counts, largest variant count.
   Structural only — no mapping, no types, no decisions. Sizing is not the
   source work 0a means; writing an adapter is.
2. **Ask 0a** with that number in hand. Both its answers can end the
   engagement, and both are cheaper to learn now than after an adapter exists.
3. **Discover the source (0b)**, then ask the rest (0c), because the data
   answers some of them.

## 0a. Can this pipeline serve the catalog at all?

Two questions, and they interact.

Both models are supported; the question is which this catalog *needs*. Ask it
early — the answer fixes the import shape at map time, so changing it later
means re-running `plan`:

| Ask | Why |
| :--- | :--- |
| Which catalog model is the project on, or intended to be — `Classic` or `Modular`? | It decides which Import API resources are legal, and it is not inferable from data. A greenfield project can be switched either way with one `setProductCatalogModel` action, so it is a genuine project decision. |
| Roughly how many variants does the largest product have? | Classic caps at **100 per product**, Modular at 10,000. It is the one constraint that can make a catalog unloadable under Classic, and it costs one question to find out. 0b answers it from data if they do not know. |

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
| How does the storefront read prices? | `target.priceMode`: `embedded` / `standalone` | a product whose `priceMode` disagrees with where its prices are imports cleanly, reports `imported`, and shows no price at all |
| Which search API does the storefront use? | `productTypes.productLevelStrategy`: `sameForAll` / `native` | `native` Product-level attributes are invisible to Product Projection Search |
| Should attributes be searchable unless stated otherwise? | `productTypes.searchableByDefault`: `true` / `false` | ProductTypes that disagree on a shared attribute name make it unavailable for search, filters and facets everywhere — and the import still succeeds |
| How are carts taxed — by the platform from tax categories, or by an external service? And does the project already hold its tax categories? | nothing in the config — the adapter's `taxCategory` records and each product's `taxCategory` | under the default `Platform` tax mode a product with no tax category loads, verifies, and **cannot be taxed at checkout**. An existing category is never modified, so the project's keys become the codes |
| Will this catalog be **re-exported and re-loaded**, or is this one-shot? | nothing — `DECISIONS.md` only | every derived code becomes a key on the first load and cannot move afterwards. One-shot permits deriving from whatever is readable; repeatable requires deriving only from fields the source guarantees are stable, which is usually a smaller set |
| Which variant should be the **shop window**, if the source does not say? | nothing — the adapter's `isMaster` | absent `isMaster` falls back to the lowest SKU by sort order. Deterministic, and arbitrary as merchandising: it decides what a category listing shows. Most sources have no master-variant concept, so this is the normal case, not an edge case |

`productTypes.onMissingDefinitions` is **not** in that table: whether the
source declares its own attribute types is a fact 0b established, not a
preference. Set `require` when the adapter can emit `attributeDefinition`
records, `infer` only when the source genuinely cannot describe its own type
system — and then expect every inferred type to need review, because each
one becomes an attribute constraint that cannot be changed afterwards.

The first two are storefront decisions with no evidence in the source, so they
stay questions for whoever owns the implementation. The tax row is a question
for whoever owns **tax**, which is often someone else: they decide the mode,
confirm the rates and each rate's net/gross setting, and know whether the
project's tax categories already exist — a new one needs a name no existing
category holds. Record "External, no tax categories" as deliberately as a set
of rates; `validate` will otherwise keep warning, correctly. The last two are the ones
most often skipped — they feel like project management rather than modelling,
and get discovered while writing the adapter, once the derivation is chosen.

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
- **Per warehouse, or one number?** Stock scoped to a supply channel only
  counts for shoppers in a store that lists it; project-wide stock counts
  everywhere. Getting this backwards makes stock either invisible or
  oversold, and neither shows up as an error.

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

Lookups rather than judgements: `keys.prefix` (name this engagement — it goes
into every key created, and bounds a teardown to its own work),
`market.defaultLocale`, `requiredLocales`, `requiredCurrencies`, and a
`currencyFractionDigits` entry per currency. `preflight` checks the market
values against the real project later; approximate is fine now.

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
decision from 0a and 0c, plus any question that could not be answered — an
open question with an owner is a plan, an unasked one is a surprise. Format
and placement: [decision-log.md](decision-log.md).

**Keep writing it at every step from here**, not at the end: a log
reconstructed afterwards records what someone remembers deciding, reliably the
subset that turned out well, while the entries that matter are the
irreversible ones taken under uncertainty.
