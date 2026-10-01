---
name: source-discovery
description: "Profiling a real source export before any mapping is designed: what to observe and which decision it settles, the throwaway probe feed, and the mapping proposal that ends discovery."
metadata:
  contentType: REFERENCE
---

# Source discovery

Profiling the real export — a sample of it, or all of it — before any mapping
is designed, and turning it into a reviewable mapping proposal.

This is step 0b of [SKILL.md](../SKILL.md). It comes before the remaining
target decisions because it *answers* one of them and informs another: whether
the source declares its own attribute types is a property of the export, not a
question for the customer.

## The rule

**Profile the export, not the documentation about the source system.** No two
installations of the same platform agree on their own type system, and a
migration designed against an assumed source model gets rewritten. The
questions worth answering are in
[writing-an-adapter.md](writing-an-adapter.md); this page is about answering
them from data.

## Do not teach the pipeline to read sources

There is an obvious-looking shortcut here that must not be taken: adding a
`discover` command that parses CSV, XML, JDBC and whatever the customer
exported. That is the universal source parser the whole architecture exists to
avoid — see the source boundary in [SKILL.md](../SKILL.md). Profiling is agent
work. The pipeline's contribution is its existing inference, reached through a
probe feed.

## What to look for, and which decision it settles

Profiling produces a pile of observations unless it is organised by what the
observations are *for*. Each row below is a thing to measure and the
commercetools decision it decides:

| Observe in the sample | Settles |
| :--- | :--- |
| One row per sellable SKU, or a parent/child hierarchy? How many levels? | What is a product and what is a variant — the single largest modelling question. commercetools has exactly one level, so anything deeper collapses in the adapter |
| Which fields differ between rows sharing a parent | Candidate variant **axes** |
| Which fields are constant across a parent's children | Candidate `SameForAll` attributes |
| Whether each axis field has a stable code, or only display text | Whether the adapter must derive codes. A localized value can never be variant identity |
| Distinct value count per field | `enum`/`lenum` versus free `text`. A field with six distinct values across the whole sample is an enum; one with thousands is text |
| Whether labels accompany codes | `enum` versus `lenum` — `derive` chooses on exactly this |
| Value kinds per field: all numeric, boolean-ish, ISO dates, mixed | The attribute type, and whether inference is even possible. Mixed kinds are a hard error, not a guess |
| Locale-bearing fields and their tag format | Whether the adapter must re-key `en_GB` to `en-GB`, and which locales actually appear versus which are configured somewhere |
| Price rows: currency, country, customer group, channel, validity, quantity | Price scope, and whether `priceMode` can even be honoured. Quantity breaks cannot be expressed: the feed has no `tiers` field |
| Whether a price is inherited from a parent level | commercetools does not inherit between variants, so inheritance must resolve in the adapter |
| Decimal representation of money, and whether any amount has more places than its currency allows | Whether minor-unit conversion will refuse records |
| Category representation: path strings, parent references, adjacency list | How the adapter rebuilds the tree, and whether names repeat enough to force slug disambiguation |
| **Maximum variants per parent** | The catalog model. Classic caps at 100 per product — see 0a |
| Image paths: absolute or site-relative | Whether a CDN host has to be supplied from outside the export. Relative is fine in the feed — `media.baseUrl` resolves it, and `validate` refuses the pair without one |
| How many renditions per shot, and whether they are keyed by format | `images` (one URL each) versus `assets` (one source per rendition). More than one rendition means assets, or the extras are discarded |
| Sentinel and placeholder values (`N/A`, `-`, `0000-00-00`, empty strings that mean something) | What the adapter must report rather than silently clean |
| Whether attributes live in more than one place in the export | Many platforms split attributes between a type definition and a separate classification structure. Mapping only the first half is a common and expensive mistake |

Two of these deserve emphasis because getting them wrong is silent rather than
loud: **net versus gross prices** is usually a setting elsewhere in the source
rather than a property of a price row, and getting it backwards changes every
price by the tax rate with nothing in the data to contradict you. And **whether
the product identifier is stable between exports** — if it is not, keys derived
from it duplicate instead of updating, and that has to be solved before
anything else is designed.

## When the handover is the whole export

Ask how large the export is before asking for a sample. If the whole thing is
small enough to read — a few thousand lines, say — **there is no sample, and
the probe feed below is the wrong tool.** Two reasons, and the second is the
one that actually settles it:

- Nothing to extrapolate *to*. The probe exists to predict what the full export
  will do; with the full export in hand, that prediction is just the answer.
- **If `onMissingDefinitions` is `require`, the pipeline's inference never
  runs at all**, and inference is most of what the probe is for. A source that
  declares its own types — a hybris `items.xml`, a PIM schema export — takes
  that path, which is exactly the case where a complete small export is likely.

Do this instead: read all of it, then take the **thin vertical slice** from
[writing-an-adapter.md](writing-an-adapter.md) — one product, with its
variants, prices and categories, all the way through `audit`. It catches the
same class of problem the probe would, against real target invariants, and it
becomes the first increment of the real adapter rather than a throwaway.

The rest of this page still applies. Profiling, the observation table, the
mapping proposal and the sign-off are all independent of how much data you
have; only the probe step is conditional.

Say which path you took in the mapping proposal. "Read the complete export, 8
products, 90 SKUs" and "profiled a 500-row sample of ~40,000" support very
different amounts of confidence, and the reader cannot tell them apart
afterwards.

## The probe feed

For a large export, where a sample is all you will get up front. The part that
makes discovery evidence rather than opinion.

Rather than reasoning about what types the source implies, write a
**throwaway adapter over the sample only**, emit a probe feed, and run the
offline stages on it:

```bash
cd ct-catalog-migration-pipeline
npm run pipeline -- validate --config probe.config.json
npm run pipeline -- derive   --config probe.config.json --out out/probe
```

Then read `out/probe/MODEL-REVIEW.md`.

What this buys that an agent's analysis does not:

- The type, `enum`/`lenum` and attribute-constraint recommendations come from
  **the same code that will run in production**, so they cannot quietly
  disagree with it.
- `mixed-value-types` fires on any field holding more than one kind of value —
  the case where inference is not merely uncertain but wrong for some records.
- Every irreversible choice is already flagged: `changeAttributeConstraint`
  accepts only `None`, so a `SameForAll` or `CombinationUnique` proposed here
  is a one-way door, and `derive` marks it as such.
- `validate` failures on the probe feed are themselves findings. An axis with
  no stable code, a localized value used as identity, a duplicated axis
  combination from a collapsed hierarchy — each is a real property of the
  source, surfaced before the real adapter exists.
- It rehearses the adapter workflow at small scale, so the first real adapter
  is the second one written rather than the first.

Set `productTypes.onMissingDefinitions` to `infer` in the probe config even if
the real run will use `require`: the point of the probe is to see what the
pipeline would guess, and how confident it is entitled to be.

The probe adapter is **disposable**. It exists to produce evidence, not to
become the real adapter — it handles only the sample, skips whatever is
awkward, and should be deleted. Keeping it invites someone to grow it into the
real one, which means the real one was designed against a sample.

## The mapping proposal

Discovery ends in a named artefact, not a conversation, because it is the
thing a human signs off. Write it next to the config:

```markdown
# Mapping proposal — <engagement>

Sample: <what, how many records, from when>

## Source model as observed
<products vs variants, hierarchy depth, how categories are represented>

## Field mapping
| Source | commercetools | Type | Notes |
| :--- | :--- | :--- | :--- |
| ARTICLE_NO | variant sku | — | stable across exports; confirmed on two exports |
| COLOR_CODE / COLOR_NAME | attribute `colour`, axis | lenum | code + label present, so lenum |
| LONG_DESC_<locale> | product description | ltext | tags are `en_GB`; adapter re-keys to `en-GB` |

## Decisions needing sign-off
<each irreversible or lossy choice, with the cost of getting it wrong>

## Not migrating
<what is deliberately dropped, and why>

## Open questions
<what the sample could not answer>
```

The last two sections are the ones that get skipped and matter most. A
migration claiming zero information loss is not being honest, and "not
migrating" is where that honesty lives.

## A sample is not the catalog

Skip this section if you read the complete export — the limits below are
properties of sampling, not of discovery.

Otherwise everything above is a **hypothesis**. A sample under-reports exactly
the properties that hurt:

- **Maximum variants per product** — the constraint that can make a catalog
  unloadable is a long-tail property, and a 500-row sample will usually miss
  the worst case entirely.
- **Attribute cardinality** — a field with six values in the sample and four
  thousand in production is text, not an enum, and the enum choice is
  irreversible.
- **Mixed value kinds** — one bad record in fifty thousand is enough to make an
  inferred type wrong, and a sample is unlikely to contain it.
- **Sentinel values** — rare by nature.

So discovery findings are confirmed against the full export when `validate` and
`derive` run for real. `validate` recomputes the largest product's variant
count and reports which catalog model it requires; `derive` re-runs inference
over everything. Where the sample and the full export disagree, the full export
wins, and the disagreement is itself worth reporting — it says something about
how representative the sample was, which is worth knowing before cutover.

State this when presenting the proposal. A mapping proposal offered as
conclusions rather than hypotheses is how a migration commits to an
irreversible attribute constraint on the strength of 500 rows.
