---
name: decision-log
description: "The append-only engagement decision log: how it differs from the pipeline's regenerated one, where it lives in the engagement layout, its format, and what to record at each step."
metadata:
  contentType: REFERENCE
---

# The engagement decision log

This skill's stated deliverable is **a reviewed set of decisions, not a loaded
dataset**. That needs somewhere durable to live.

## Two logs, and why they cannot be one

The pipeline already writes a decision log: `out/decisions.json` and
`out/MODEL-REVIEW.md`, produced by `derive` and `plan` from their own mapping
choices. That one is **derived** — regenerated from the feed on every run,
byte-identical for the same input, and gitignored along with the rest of
`out/`. A three-product fixture emits fifteen entries; a real catalog emits
thousands.

The log this page describes is **accumulated** — it records what happened, in
order, and must never be regenerated or it loses the only thing it has.

| | `out/decisions.json` | `DECISIONS.md` |
| :--- | :--- | :--- |
| Author | the pipeline | you, with the user |
| Nature | derived, regenerated each run | append-only, never rewritten |
| Answers | what the mapping *is* | what was decided, by whom, and why |
| Scale | thousands of entries | tens |
| Lifetime | overwritten by the next `plan` | the engagement's record |

Mixing them fails both ways: a regenerated file cannot hold history, and an
accumulated file cannot be trusted to describe the current plan.

**Do not copy pipeline decisions into `DECISIONS.md`.** Reference them. One
entry recording "reviewed and accepted the 4 irreversible attribute
constraints in MODEL-REVIEW.md, plan of 2026-09-22" is worth more than four
hundred copied rows that will disagree with the next run.

## Where it lives — and the layout it belongs to

"Next to `migration.config.json`" was ambiguous, because the only config that
ships is inside the pipeline, which is the *tool* — and the tool is now its own
repository, cloned rather than authored. Putting an engagement's record there
files it inside somebody else's checkout. So be explicit: **the engagement is a
sibling of the pipeline, never inside it.**

```
<engagement-root>/
  .gitignore                    must ignore the pipeline checkout — see below
  ct-catalog-migration-pipeline/  the tool, cloned and gitignored. Never write
                                  engagement files here, and never edit it — local
                                  changes are lost on the next pull and are
                                  invisible to everyone else.
  source-export/                what the customer handed over
  migration/                    the engagement
    migration.config.json         written from the step-0 interview
    DECISIONS.md                  this log — append-only, committed
    MAPPING-PROPOSAL.md           the step-0b artefact
    adapter/                      the only code written per engagement
      package.json                  {"type":"module"} — see below
    feed/                         generated NDJSON; regenerated, disposable
    out/                          pipeline artefacts; regenerated, gitignored
```

The adapter needs **its own `package.json`** containing at least
`{"type":"module"}`. It sits outside the pipeline checkout, so it does not
inherit the pipeline's module type, and an ESM adapter without it fails on the first
`import` with `Cannot use import statement outside a module`. Thirty seconds
to fix and the very first thing an adapter author hits:

```json
{ "type": "module", "private": true }
```

Commit `migration.config.json`, `DECISIONS.md`, `MAPPING-PROPOSAL.md` and
`adapter/`. Do not commit `feed/` or `out/` — both are regenerated, and `out/`
is gitignored by the pipeline already.

**The pipeline checkout has to be ignored, and before it is cloned.** The
engagement is usually a git repository, and a clone inside one becomes an
embedded repository that `git add -A` records as a gitlink — pinned in your
index, unexplained by any `.gitmodules`, and empty for anyone who clones the
engagement later. So the engagement's own `.gitignore` starts as:

```text
/ct-catalog-migration-pipeline/
feed/
out/
```

The last two are regenerated on every run. The first is somebody else's
repository, and its version belongs in `DECISIONS.md` as a line a human can
read rather than as a gitlink nobody can resolve. `references/running-the-pipeline.md`
has the recovery if it was already staged — `.gitignore` alone does not undo
that.

Run the commands from the pipeline checkout and point `--config` at the
engagement:

```bash
cd ct-catalog-migration-pipeline
npm run pipeline -- plan --config ../migration/migration.config.json
```

`--out` defaults to `out` **relative to the config**, the same rule `feed.dir`
follows, so that writes `../migration/out`. Do not assume it is relative to
the current directory — that reading silently files the artefacts inside the
tool's own `out/`, where the next reader will not look for them.

## Format

Numbered, so entries can reference each other and be superseded rather than
edited:

```markdown
# Migration decision log — acme-eu

Append-only. Newest last. Never regenerate; supersede instead.

## D001 — Catalog model: Classic
2026-09-22 · step 0a · decided by Priya (commerce lead)

The largest product has 14 variants, well inside Classic's 100.

Rejected: Modular. It would force standalone pricing and cannot import
`defaultVariant`, and nothing about this catalog needs the higher ceiling.

Status: accepted

## D002 — Colour is an lenum, not free text
2026-09-22 · step 0b · proposed from sample, confirmed by Priya

The sample has 11 distinct colour codes with German and English labels, so
`derive` proposed `lenum`. See `out/probe/MODEL-REVIEW.md`.

**Irreversible.** `changeAttributeConstraint` accepts only `None`, so if the
full export turns out to hold hundreds of colours this becomes an attribute
that has to be recreated and its data rewritten.

Status: accepted, pending confirmation against the full export
```

Four fields carry the weight: the **date**, **who decided** (a decision with no
owner is a guess), **what was rejected and why** (the alternative is what a
later reader needs), and **status**. Mark `irreversible` and `lossy` explicitly
— they are the entries that will be read under pressure.

## What to log, per step

### Step 0 — the interview

The config records *what* was chosen. It cannot record who chose it, what the
alternative would have cost, or that a question was asked at all. Log one entry
per decision in 0a and 0c, plus the resolved catalog-model/variant-count pair.

If a question could not be answered, log that too, as `status: open`. An open
question with an owner is a plan; an unasked one is a surprise later.

### Step 0b — discovery

The mapping proposal is its own artefact. What belongs here is the decisions
arising from it: which inferred types were accepted, which were overridden and
on what evidence, which source fields are **deliberately not migrating**, and
which findings are hypotheses awaiting the full export.

### Steps 1–2 — implementing the adapter

The richest source, and the one most often lost, because these decisions are
made while writing code and feel like implementation details. They are not.
Log every point where the adapter **decides** rather than translates:

- a code derived from a display name, and the derivation rule
- a hierarchy level collapsed, and what happened to the intermediate
- an inherited price resolved, and from where
- a locale tag normalised (`en_GB` → `en-GB`)
- a sentinel or placeholder value skipped, passed through, or interpreted
- a field dropped, and why
- **every silent cap** — anything sampled, truncated or skipped

The adapter reference says a derived code "is a decision, not a detail" and to
"report every silent cap". This is where those reports go.

### `validate` and `audit`

Not every diagnostic is a decision. A finding that changes the adapter is a
**fix**, and fixes do not belong here — the adapter is regenerated and the
finding disappears.

What belongs here is a finding that is **accepted rather than fixed**: 14
category slugs disambiguated and the resulting URLs accepted; a warning about
products in no category acknowledged as correct for this catalog; an
`approaching-variant-limit` warning accepted with a plan to revisit. Record the
count and the artefact, not the individual findings.

### `preflight` — and this one is an obligation

`preflight --apply` **writes to the customer's project**. So does any manual
change made to get past it. Those need a durable record, because the next
person to look at that project will find settings nobody can account for.

Log, every time: the project key, the timestamp, exactly what changed, and who
authorised it. `--apply` reports `project-updated` to stdout and nowhere else,
so if it is not logged it did not happen as far as anyone later is concerned.

Manual project changes count doubly. Adding a country to make country-scoped
prices load is a commerce decision affecting shipping and tax — `preflight`
deliberately refuses to make it, which is exactly why the human who did make it
should be named.

### `load` and `verify`

One entry per `--execute`: project key, timestamp, what was sent, and the
outcome. `out/load-result.json` has the detail but is regenerated and
gitignored.

Log the `verify` result as the closing entry for a run — including a clean one.
"Reconciled, no differences, 2026-09-22" is the sentence someone needs when
asking months later whether the load was ever checked.

## What not to log

- **Pipeline mapping decisions, copied.** Reference the artefact.
- **Fixes.** A defect found and corrected leaves no decision behind.
- **Anything the config already states.** Log the *why*, not the value.
- **Conversation.** An entry is a decision with an owner and a rationale, not a
  transcript.

## The discipline that makes it worth keeping

Write the entry when the decision is made, not at the end. A log reconstructed
after the fact records what someone remembers deciding, which is reliably the
subset that turned out well — and the entries that matter are the irreversible
ones taken under uncertainty, which are the first to be forgotten.
