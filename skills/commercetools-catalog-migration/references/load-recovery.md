---
name: load-recovery
description: "When a load stops or part of it fails: the one-record first request of a customer or order stage and what each result does, resending one stage with --only, and orders the project already holds."
metadata:
  contentType: REFERENCE
---

# When a load stops or fails

Read this when `load --execute` reports `canary-stopped` or `import-request-failed`, when one stage
failed and the rest landed, or before a resend. The stage itself is in [load.md](load.md).

- [The first record of a customer or order stage goes alone](#the-first-record-of-a-customer-or-order-stage-goes-alone)
- [Resending one stage](#resending-one-stage)

## The first record of a customer or order stage goes alone

The Import API has no dry run, so nothing before `--execute` can show that it
accepts the shape the pipeline sends. For customers and orders that is the
expensive place to find out: orders are create-only and every accepted one wakes
each subscription listening for `OrderImported`
([feed-orders.md](feed-orders.md#ask-about-subscriptions-before-the-first-load)),
and customers are personal data. So the first request of each of these stages
goes alone: it holds **the record that shows the most**, usually one, and `load`
reads that record's operation before it sends the rest. A refused shape then costs
one failed operation, not one per record. The dry run's request bodies show it,
flagged `canary` in `load-requests.json`.

**The record is chosen, not the plan's first.** A record with none of the optional
fields proves none of them: a customer with no address passes a rule about default
addresses that every customer with one must meet. `load` picks the record that carries the most fields and nestings (a
customer with an address, an order with a custom line item). When no single record
shows every structure, as with a guest order and an order that names a customer,
it takes the few that together do, at most five. It compares which fields a record
has, never their values, so a record that is odd only in its data is not preferred.

| The first record's state | What `load` does |
| :--- | :--- |
| `imported` | sends the rest of the stage |
| `unresolved` | sends the rest, with the warning `canary-unresolved`: the API took the shape and waits for a reference that arrives on its own, such as a customer imported a moment ago |
| `validationFailed`, `rejected`, `partiallyImported`, `canceled` | stops: `canary-stopped` names the record and the API's errors; the rest of the stage is not sent, no later stage runs and no store is created |
| still `processing` after two minutes, or unreadable | stops the same way, because sending the rest without knowing is what this exists to prevent |

With several records in the first request the verdict is the worst of them: one
refusal stops the load and `canary-stopped` names that record and how many were
refused; otherwise one `unresolved` sends the rest with the warning.

After a stop, read the errors and fix the cause: usually the mapper or the feed,
so open the feed reference for that entity. Rebuild the plan if anything changed,
then dry-run and resend the stage with `--only` (below). The one refused record
stays in its container as a failed operation for 48 hours and does not describe
the project.

## Resending one stage

When one stage failed and the others landed (orders refused after the catalog
loaded, say), resend just that stage:

```bash
npm run pipeline -- load --config ../migration/migration.config.json --only order            # dry run
npm run pipeline -- load --config ../migration/migration.config.json --only order --execute
```

`--only <stage>[,<stage>]` takes stage names from the dependency order in [load.md](load.md#platform-stages-at-opposite-ends-of-the-run) and
runs those, in plan order, and nothing else. A full re-run is the wrong tool
here: it resends every product draft with `publish: false`, which unpublishes
products published since, by hand or by a later step. A script of your own that
posts the saved request bodies skips the batching, the containers and the
read-back, and has no check on what the project already holds.

- **The other stages are not touched.** The platform stages (`channel`,
  `customer-group`, `tax-category`, `store`) run only when named. The
  `only-stages` warning lists what was left out: the run assumes the project
  already holds what those stages create, so read it back with `verify` afterwards.
- **Orders already in the project are skipped.** Orders are create-only, and a
  number the project holds is rejected, never updated. Before any write `load`
  reads which of the planned numbers exist and leaves them out of the sends
  (`orders-already-in-project`), on a full load too. A rejected resend then
  never repeats an order that landed. The read needs `manage_orders` or
  `view_orders` ([scopes](https://docs.commercetools.com/api/scopes.md)); an
  unreadable project stops `--execute` before anything is created
  (`orders-unreadable`) and only warns on a dry run.
- **The record of the full run is kept.** A restricted run writes
  `out/load-result-only-<stages>.json` (`load-requests-only-<stages>.json` for a dry
  run) beside `load-result.json`, so the file that says what the whole load did is
  not overwritten.
- **It is a new write.** Dry-run it, show the counts, and ask again as for any
  `--execute`: a yes for the first load does not cover it, unless the dry run
  matches the one the user saw.

