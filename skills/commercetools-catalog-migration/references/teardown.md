---
name: teardown
description: "Teardown: removing what a plan created, scoped to keys.prefix, with the dry-run default and the confirmation it requires."
metadata:
  contentType: REFERENCE
---

# Undoing a run

`teardown` is the way back out and is not one of the seven stages. Stage order and options are in [running-the-pipeline.md](running-the-pipeline.md).

## teardown

The way back out, not one of the seven stages: for a rehearsal on a trial
project, or a load that has to be undone.

```bash
npm run pipeline -- teardown --config ../migration/migration.config.json                # dry run
npm run pipeline -- teardown --config ../migration/migration.config.json \
  --execute --confirm-project <project-key>             # add --include-created-prerequisites to remove what load created beyond the catalog
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
  [locks the part of a category tree a write touches](https://docs.commercetools.com/api/product-catalog-apis-overview.md#category-tree-locking)
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
  ones you can ask it to remove are those this plan's `load` created.
  `load --execute` records them in `out/created-prerequisites.json`, which only
  grows, because `load-result.json` is rewritten by every execute and a second
  load reports them as existing. `--include-created-prerequisites` deletes the
  keys in that file that the plan also names, and the dry run says what it would
  delete: stores first, because a store names channels, then channels and customer
  groups, then tax categories, all after the products, inventory and customers
  that use them. `--include-created-tax-categories` removes only the tax
  categories. One that was in the project before the load is never in the file, so
  it stays, and so does everything after a load run by an earlier pipeline
  release, which recorded tax categories only. A resource the API still refuses to
  delete is reported as a failure and the run is not complete: a channel cannot be
  deleted while an inventory entry, a store, a price or a standalone price
  references it ([Delete Channels](https://docs.commercetools.com/api/project-configuration-apis-overview.md#delete-channels)),
  and a tax category not while a product or shipping method uses it. Anything else
  it leaves is removed by hand, by whoever owns it, so ask first; do not write a
  delete against the API with the engagement's credentials to empty the project.
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
