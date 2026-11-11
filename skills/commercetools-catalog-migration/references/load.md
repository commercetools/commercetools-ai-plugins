---
name: load
description: "The load stage: dependency order, prerequisites outside the Import API, batching, failure states, the SDKs, and the credentials and scopes it needs."
metadata:
  contentType: REFERENCE
---

# The load stage

`load` writes to the project. It is a dry run unless `--execute` is passed. Stage order and options are in [running-the-pipeline.md](running-the-pipeline.md).

- [load](#load)
- [Platform stages, at opposite ends of the run](#platform-stages-at-opposite-ends-of-the-run)
- [Prerequisites run first, and not through the Import API](#prerequisites-run-first-and-not-through-the-import-api)
- [How large a catalog this handles](#how-large-a-catalog-this-handles)
- [Batching](#batching)
- [Do not serialise on polling](#do-not-serialise-on-polling)
- [Which states are failures](#which-states-are-failures)
- [The official SDKs](#the-official-sdks)
- [Credentials](#credentials)

## load

**Dry run by default.** `--execute` is the only thing that writes catalog data.

```bash
npm run pipeline -- load --config ../migration/migration.config.json              # dry run
npm run pipeline -- load --config ../migration/migration.config.json --execute
npm run pipeline -- load --config ../migration/migration.config.json --execute --wait
```

A dry run writes `out/load-requests.json` with the exact request bodies, and
the prerequisites it would create. Read that before executing — it is what
will be sent, not a summary.

Then ask before executing, as `SKILL.md` step 5 sets out: consent has to come
after the user has seen what `load-requests.json` holds — the project key, the
counts, the prerequisites — so a request made before the dry run does not
cover it.

The audit gate runs again inside `load` rather than trusting it was run. It is
free, and the alternative is finding a rejected invariant one request at a time
after part of the catalog has landed.

### Platform stages, at opposite ends of the run

Four stages do not go through the Import API at all, and they do not all run
at the same time:

| Stage | When | Why |
| :--- | :--- | :--- |
| `channel` | **first** | prices reference them, and an unresolved price expires after 48 hours |
| `customer-group` | **first** | same |
| `tax-category` | **first** | a product draft references it, and an unresolved one holds up the **whole product** — variants and prices — until it expires |
| `store` | **last** | it references product selections, which the Import API creates *asynchronously* |

Inventory is **not** one of them — it has an Import API resource, and runs as
a stage after the variants whose SKUs it names. That ordering is soft, like
`standalone-price`: the Import API does not check the SKU, so it prevents an
orphan nobody notices rather than an error. Its dependency on `channel` is
not soft — an entry naming a supply channel that does not exist yet expires
unresolved after 48 hours.

`platformStages(order, phase)` takes the phase explicitly rather than
defaulting, because a caller that forgot it would create stores before the
selections they point at exist.

**`load` refuses without `--wait`** when a store references product selections
(`stores-require-wait`). Without waiting there is no moment at which the store
stage is safe to run, and stopping before the import is cheaper than a catalog
whose stores were never wired.

**An existing store is never modified.** `setDistributionChannels` and
`setProductSelections` replace the whole array, so applying the plan over a
store the project already configured would discard wiring this migration knows
nothing about. Both `preflight` and `load` report the difference
(`store-wiring-differs`) and stop.

### Prerequisites run first, and not through the Import API

The Import API has no channel, customer-group or tax-category resource, so
`load` creates those three through the **platform API**, before the first
import request. A
price whose channel does not exist yet becomes an operation that expires
unresolved after 48 hours, so the ordering is load-bearing rather than tidy.

The rule is read first, then create only what is missing:

- an absent channel, group or tax category is **created** — a tax category
  with the feed's rates;
- an existing one is **left untouched** — not patched to match the plan. For a
  tax category that includes its rates, which also tax shipping and belong to
  whoever owns tax;
- an existing channel lacking a role the plan needs is an **error**: roles
  govern stores and inventory as well as prices, so widening them is a project
  decision, not something a catalog load does in passing;
- a failed read creates **nothing**, because creating without knowing what
  exists is how duplicates happen.

They are reported separately from the containers, because they have no
container, no operation states and no 48-hour window — the call either
succeeded or it did not.

**An unmet prerequisite stops the import before it starts.** If one is
unusable, could not be created, or could not even be read, `load` reports
`prerequisites-unmet` and sends no import request and creates no container.
Proceeding would import prices scoped to something absent, and those operations
expire unresolved — a run reporting every request accepted, over a partly
priced catalog, with no signal left by the time anyone looks. Stopping costs
nothing a re-run does not recover, because every key is deterministic and a
second load updates rather than duplicates.

A dry run performs the reads too, which costs only GETs and is what lets it
name the exact keys it would create instead of guessing. If that read fails the
dry run still completes, with a warning and those keys reported as *existence
unknown* — an unreachable project should not cost you the request bodies.

Two asymmetries worth knowing: these are the only resources keyed **verbatim**
rather than `<prefix>-<key>`, and therefore the only ones a prefix-scoped
teardown leaves behind. What `load` created of them can be removed by
[teardown](teardown.md#teardown) with `--include-created-prerequisites`, unless
something still uses it; one the project held before is never removed.

### How large a catalog this handles

Not a memory question, and more RAM does not move it. Every artefact is written
with `JSON.stringify`, which builds the whole document as one string, and V8
caps strings at about **537 MB** whatever the heap size. Measured on this
pipeline:

| Catalog | `plan.json` per variant | Ceiling |
| :--- | ---: | ---: |
| 2 product-level attributes | 0.9 KB | ~575,000 variants |
| 25 product-level attributes | 4.2 KB | **~125,000 variants** |

The spread is `productLevelStrategy: sameForAll`, the default: a product-level
attribute is stated **once** in the feed and written onto **every** variant in
the plan. Measured amplification, feed to plan: **15×** (2.8 MB → 42.6 MB for
10,000 variants). So the more attributes a catalog carries, the sooner it
arrives — which is the opposite of the intuition that variant count is what
matters.

The feed held in memory is the lesser cost: ~14 KB of RSS per variant, so a
125,000-variant run peaks near 1.8 GB against a 4.3 GB default heap.

Past the ceiling the pipeline says so — naming the artefact, the resource
counts, and that RAM is not the problem — rather than emitting V8's bare
`Invalid string length`. The same limit applies on the way **in**: `audit`,
`load` and `verify` each read `plan.json` as one string, so a plan can be
written and then be too large to read back.

**The way through is to split the engagement**: several configs with
different `keys.prefix` values, each covering part of the catalog. Each plan is
then its own document and the loads stay additive.

### Batching

- At most **20 resources per Import Request**, clamped in code.
- Containers named **by resource type** (`mig-category`, `mig-product-draft`)
  and reused across runs; a run-scoped name would exhaust the 1000-container
  limit and hide the previous run's work. Each is restricted to its
  `resourceType`, so a mis-routed batch is rejected.
- A stage beyond the per-container operation limit splits into numbered
  containers, and no request straddles two.

**Reuse has a clock on it.** A container created without a `retentionPolicy`
is deleted **72 hours after creation** — not 72 hours after last use, so the
window does not extend as a migration continues. A `TimeToLiveRetentionPolicy`
set at create time takes a custom duration instead. This bites on any
engagement that spans more than three days: the deterministic name resolves to
a container that no longer exists, and with it goes the operation history the
name was reused to preserve. Keys are deterministic and a re-created container
takes the same name, so nothing is lost that a re-run cannot redo — but plan
the retention rather than discovering the gap.

Note the two clocks are different and neither resets: operations are deleted
at **48 hours**, containers at **72**. So a container can outlive the
operations it holds, and a summary read late in that window reports fewer
operations than the run submitted.

**What `--wait` covers.** It waits for this run's operations to appear in the
Import Summary, then for them to leave `processing` — i.e. for the API to finish
validating what was sent. The first part matters because the API creates the
operations a moment after it accepts a request, so a summary read straight away
can show nothing processing simply because nothing is registered yet. The
summary counts every operation the container still holds, earlier runs
included, so `--wait` reads the container's total before it posts and waits for
the total to rise by the number of resources in the requests the API accepted.
It does not wait for
`unresolved` operations to find their KeyReference targets, because that can
legitimately take up to 48 hours and depends on data this run may not be
sending. Expect `unresolved` counts after a `--wait` load of a deep category
tree, and expect them to fall on their own.

### Do not serialise on polling

Stages are pushed in dependency order but **not awaited**. An `unresolved`
operation completes on its own when its KeyReference target arrives, any time
inside 48 hours, so waiting per stage serialises a pipelined design — and
frequent summary polling actively slows the import.

`--wait` polls with doubling backoff until this run's operations are registered
and nothing is processing, and says plainly when it times out, naming whether
operations were still processing or had not registered at all. While it waits it
reports where it is on every tick ([progress](running-the-pipeline.md#progress-while-a-stage-runs)).

### Which states are failures

| State | Treated as | Why |
| :--- | :--- | :--- |
| `unresolved` | warning | completes on its own inside 48h |
| `waitForMasterVariant` | warning | resolves when the master variant lands |
| `processing` | warning | asynchronous; re-read the summary |
| `rejected` | error | the only resubmittable state; others retry internally up to 5 times |
| `validationFailed` | error | the gate should have caught it |
| `partiallyImported` | error | the resource is half-written |

A refused request prints the `errors` of the API's response after its generic
message (`InvalidField: defaultShippingAddress must be a valid index …`), and when
the summary shows failing operations the load reads a sample of them, the first 20
per state, and prints the reasons grouped with a count and one example record
(`operation-errors`). Neither needs a record sent by hand to find the field. The
sample explains the count and does not replace it: a failed read adds nothing and
hides no count.

A failed request records the keys it carried instead of aborting the stage, and
keys are deterministic — so resubmitting is running `load --execute` again, or
`--only <stage>` to resend one stage ([load-recovery.md](load-recovery.md#resending-one-stage)).
The first record of a customer or order stage goes alone, and a refusal stops the
load: [load-recovery.md](load-recovery.md#the-first-record-of-a-customer-or-order-stage-goes-alone).
That is a new write, so dry-run it first. A new yes from the user covers it only
if that dry run matches the one they saw; if anything differs, show the
difference and ask.

### The official SDKs

The pipeline depends on three first-party packages, and the split is worth
knowing when reading the code:

- **`@commercetools/importapi-sdk`** supplies every draft type in the plan.
  These are generated from the API's own specification, so a field that moves
  becomes a compile error rather than a rejected operation. Do not hand-write
  import resource types alongside them.
- **`@commercetools/platform-sdk`** supplies the `Project` type and preflight's
  request builders.
- **`@commercetools/ts-client`** owns transport: the client-credentials flow,
  token lifecycle, retry with backoff, a concurrency queue, and correlation IDs.

Three shapes are easy to get wrong by hand and impossible to get wrong with the
generated types:

| Shape | The trap |
| :--- | :--- |
| `PriceDraftImport.key` | required — a price without one is rejected |
| `Attribute` | a discriminated union carrying `type`, e.g. `{type: 'text', name, value}` |
| a set attribute's `type` | `'text-set'`, not `'set'` |

The attribute discriminator is **not** derivable from the value: a string could
be `text`, `enum`, `lenum`, `date`, `datetime` or `time`, and only the
ProductType's declaration says which. That is why the mapper threads the
ProductType's attribute definitions into variant mapping.

Two more fields are set deliberately rather than left to default:
`ProductDraftImport.priceMode` (unset is assumed to mean `Embedded`) and
`sku`, which the type marks optional — legal, but a migrated catalog needs one,
so the gate reports a variant without it.

What the SDK does **not** own, and this pipeline still must: chunking into
Import Requests of at most 20, container strategy, and deciding which Import
Operation states to resubmit. That last one cannot live in transport at all —
`rejected` and `unresolved` both arrive as HTTP 200 with the state in the body.

### Credentials

From the environment or `.env`, never from the committed config. See
`.env.example`.

| Variable | Notes |
| :--- | :--- |
| `CTP_PROJECT_KEY`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET` | required |
| `CTP_REGION` | derives all three hosts |
| `CTP_AUTH_URL`, `CTP_API_URL`, `CTP_IMPORT_URL` | override individually |
| `CTP_SCOPES` | optional; omitting it grants every scope the API Client has |

The Import API is on a **different host** from the HTTP API
(`https://import.{region}…`). The conventional commercetools variable set has no
import host, so it is derived from `CTP_API_URL` when absent.

**Which project a run targets is refused rather than resolved, twice over.**
Exported variables otherwise win over the file, but not for project identity:

- The file and the environment naming **different** projects is refused. The
  environment would win, so `--env` would silently not do what it looks like.
- **No file at all, while the environment names a project**, is also refused.
  That is the case a disagreement check cannot catch — there is nothing to
  disagree with — and it is how a run in a directory with no credentials of its
  own borrows a project nobody chose for it. The only thing that catches it
  otherwise is `preflight` printing the project name, which is luck rather
  than a check.

  Set `CTP_AMBIENT_OK=1` when the ambient environment is deliberate. CI and
  containers should; a working directory generally should not.

**Preflight degrades rather than stopping.** Without `view_project_settings`
it cannot read the catalog model, locales, currencies or price countries — so
it reports `project-settings-unreadable` (not `project-unreachable`, which
means something else) and still runs what it can, which is the resource-count
check that catches a load aimed at the wrong project. That needs only
`view_products`.

Do not read a degraded pass as a pass. *Everything preflight exists to verify*
depends on project settings, so a load in that state is going in blind on all
of it — recoverable, because keys are deterministic and a re-run updates, but
the recovery is manual. Add the scope and re-run. If you cannot, say so in the
decision log with what was unverified, and prefer the dry run: it writes the
exact request bodies to `out/load-requests.json` for review without sending
anything.

Scopes: `view_project_settings` for preflight, `manage_project_settings` for
`--apply`, `manage_products` plus `manage_import_containers` for the load.
`manage_products` also grants the Import Requests for categories, product types,
products, variants, embedded prices and **inventory**, and it covers reading and
creating channels and — for backward compatibility — tax categories. So stock
and tax need no scope of their own, in either direction: `view_products` covers
reading InventoryEntries and tax categories back. Two more are conditional
on the feed:

| Scope | Needed when |
| :--- | :--- |
| `manage_standalone_prices` | `priceMode: standalone` |
| `view_customer_groups` + `manage_customer_groups` | the feed declares any `customerGroup` |
| `view_product_selections` + `manage_product_selections` | the feed declares any `productSelection` |
| `view_stores` + `manage_stores` | the feed declares any `store` |

Neither is granted by `manage_products`. A missing customer-group scope fails
the load at its first stage, before anything is imported — which is the cheap
place to find out, but only if the scope list was not guessed.
