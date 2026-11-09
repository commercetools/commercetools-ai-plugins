---
name: verify
description: "The verify stage: what it reads back, what it reconciles against the plan, the stall window, and what a clean result does and does not show."
metadata:
  contentType: REFERENCE
---

# The verify stage

`verify` reads the project back and reconciles it against the plan, with GET requests only. Stage order and options are in [running-the-pipeline.md](running-the-pipeline.md).

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
