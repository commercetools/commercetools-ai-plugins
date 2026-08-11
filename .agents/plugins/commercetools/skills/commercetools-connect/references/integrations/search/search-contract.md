---
name: search-connector-contract
description: The two-app search-sync contract — full ingestion (cursor pagination, bulk index, atomic/blue-green reindex, count check) and incremental updater (idempotent upsert, deletion propagation, staleness guard); full pitfall catalog. The search sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - search
    - connect
---

# The two-app search-sync contract

Everything each app must do, and the pitfalls that silently break the index. Which apps you build follows from cadence and trigger ([config-from-requirements.md](./config-from-requirements.md)); what each record contains is [data-mapping.md](./data-mapping.md). These rules sit on top of the parent skill's contracts — [service-applications.md](../../service-applications.md), [event-applications.md](../../event-applications.md), [job-applications.md](../../job-applications.md), [security.md](../../security.md) — and add what is search-specific. The official scaffold is the [Product export template](https://docs.commercetools.com/connect/templates/product-export.md) (`full-export` + `incremental-updater`).

## The rule that spans both apps: the index is a projection, keyed and idempotent

Every write is an **upsert keyed on `objectID`** (a stable commercetools id — [data-mapping.md](./data-mapping.md)) and every removal targets that same id. The index is a *derived copy* of the published catalog: any record must be reproducible from the current [Product Projection](https://docs.commercetools.com/api/projects/productProjections.md), and running either app twice must converge, not duplicate or double-delete. Both full loads and subscription messages are **at-least-once**, so idempotency is not optional.

## App 1 — full ingestion (`service` on-demand trigger, or `job` on a schedule)

Rebuilds the entire index from commercetools. It is the initial load, the disaster-recovery path, and the nightly backstop that repairs whatever the incremental path missed.

- **Authenticate the trigger.** A `service` with a public `/fullSync` endpoint must validate the caller (shared secret / signature) before kicking off a rebuild — an open reindex endpoint is a denial-of-wallet and data-exposure risk ([security.md](../../security.md)). (`AuthorizationHeaderAuthentication` is the *reverse* mechanism, for commercetools calling an Extension — irrelevant here; there is no Extension in this sub-area.)
- **Page with a cursor, not offset.** Read `/product-projections?staged=false&withTotal=false`, `sort=id asc`, `limit=100` (or up to 500), and page with `where=id > "<lastId>"` ([Integrate external search](https://docs.commercetools.com/tutorials/search-integration.md)). Offset pagination breaks past a few thousand products; the `id`-cursor is stable and resumable. For the **Store-specific** pattern, iterate the Store's Product Selection assignments and read `/in-store/key={storeKey}/product-projections` instead ([Populate a Store-specific external search](https://docs.commercetools.com/tutorials/store-specific-external-search.md)).
- **Map with the pure function** ([data-mapping.md](./data-mapping.md)) and **bulk/batch** writes to the engine — never one HTTP call per record.
- **Reindex atomically — build-and-swap, never wipe-then-fill a live index.** Build the new index into a temporary/secondary index (or tag every record with a build/generation id), then atomically swap it in and drop the stale set (Algolia's "replace all objects" / a blue-green index alias). Clearing the live index and refilling it leaves a **half-empty index serving zero results** for the length of the rebuild — the most visible search outage there is.
- **Verify counts.** After the swap, confirm the engine's record count matches the number of published products (± your granularity multiplier); a large mismatch means the map dropped or duplicated records — fail loudly, don't leave a bad index live.
- **Respect the runtime.** A `job` has a 30-min timeout and needs overlap locking and checkpointing ([job-applications.md](../../job-applications.md)); a very large catalog may need the full load chunked or moved to the `job` shape. Keep the initial migration and the ongoing rebuild the same code path.

## App 2 — incremental updater (`event` on Subscriptions, or a polling `job`)

Keeps the index in step with catalog changes between full loads.

- **Subscribe once per message type and fan out in the handler** — never one Subscription per index or per Store (the Project allows [50 Subscriptions](https://docs.commercetools.com/api/limits.md)). Register them idempotently in `postDeploy` (get-then-create, never delete-then-recreate). The relevant [Product Catalog Messages](https://docs.commercetools.com/api/projects/messages/product-catalog-messages.md):
  - **`ProductPublished`** → **upsert** the record. Its payload carries the `productProjection` (the just-published `current` data), so you can map it directly without a re-fetch.
  - **`ProductUnpublished`** → **remove** the record by `objectID`. An unpublished product must leave the index or it becomes a **ghost result** linking to a dead PDP.
  - **`ProductDeleted`** → **remove** the record. (Design augmentation — not in the tutorial's set. Its payload field is `currentProjection`, *not* `productProjection`; in practice a delete is usually preceded by an unpublish that already removed the record, so treat this as a belt-and-braces removal.)
  - **Store / Product Selection messages** (Store-specific): `StoreProductSelectionsChanged`, `ProductSelectionProductAdded` → add to that Store's index; `ProductSelectionProductRemoved` → remove from it; `ProductSelectionVariantSelectionChanged` → re-index; `StoreCreated`/`StoreDeleted` → provision/tear down the Store's index.
- **Decode the envelope, then ack correctly.** The GCP transport wrapper is `{ "message": { "data": "<base64>" } }`; decode `message.data` (base64 → JSON), validate the message `type`, and **ack-and-ignore** anything you don't handle (including the platform's test message). Return `2xx` for handled *and* deliberately-ignored messages; non-`2xx` only for transient failures you want redelivered.
- **Upsert is idempotent under redelivery** — writing the same record twice is a no-op by construction (keyed on `objectID`).
- **Deletion propagation is a first-class path, not an afterthought.** Every removal trigger (unpublish, delete, removed-from-selection, and — if `inStock` filtering matters — dropping to zero stock) needs a defined action; a missing one leaves ghost records.
- **Guard against stale writes.** With no ordering guarantee, an older message can arrive after a newer one. Except for `ProductPublished` (whose payload *is* current), **re-fetch the projection by `resource.id`** so the index converges on current state; where the engine supports it, additionally guard on a version / `lastModifiedAt` so an out-of-order write can't overwrite newer data.
- **The polling `job` alternative:** query `/product-projections?where=lastModifiedAt > "<checkpoint>"` on a schedule, upsert the page, advance the checkpoint. Simpler ops, but it **cannot see deletions** (a deleted product no longer appears in the query) — pair it with the nightly full rebuild to purge ghosts, or subscribe to `ProductUnpublished`/`ProductDeleted` for removals.

## Pitfall catalog

| Pitfall | Symptom | Fix |
|---|---|---|
| No deletion propagation on unpublish/delete | Unpublished products still appear in search; hits link to dead PDPs (ghost records) | Handle `ProductUnpublished`/`ProductDeleted` → remove by `objectID` |
| Wipe-then-fill a live index | Search returns zero/partial results for the whole rebuild window | Build-and-swap / replace-all-objects (atomic); drop the old set after the swap |
| Indexing staged / unpublished data | Draft content and unpublished products surface in search | Read the `current` projection (`staged=false`) only |
| Trusting a stale message payload | Older delta overwrites newer state; out-of-order writes | Re-fetch by `resource.id` (except `ProductPublished`); guard on version/`lastModifiedAt` |
| Price context mismatch | Wrong price in search results / facets | Select one context at map time; index per-context fields/records ([data-mapping.md](./data-mapping.md)) |
| Category rename not fanned out | Stale category names/breadcrumbs on products | Reindex affected products on category messages; nightly rebuild as backstop |
| Per-unit inventory wired into the index | Write volume overwhelms the engine; cost spikes | Coarse `inStock` flag refreshed on cadence; live stock from the Inventory API |
| Offset pagination on the full load | Full load misses/duplicates products past a few thousand | Cursor on `sort=id asc` + `where=id > "<lastId>"` |
| One call per record | Full load times out / hits engine rate limits | Batch/bulk writes |
| No count check after reindex | A silently truncated index goes live | Assert engine count ≈ published-product count; fail loudly on mismatch |
| Envelope not decoded | Handler sees base64 garbage / crashes | Decode `message.data` (base64 → JSON), then validate `type` |
| Wrong ack | Handled message redelivered forever, or failures silently dropped | `2xx` for handled/ignored; non-`2xx` only for retryable |
| One Subscription per index/Store | Hits the 50-Subscription Project limit | One Subscription per message type; fan out in the handler |
| Unauthenticated `/fullSync` trigger | Anyone can trigger a full reindex (denial-of-wallet) | Validate a shared secret/signature before starting |
| Engine key over-scoped or in logs | Admin key leaked; compliance incident | Key in `securedConfiguration`; generic error responses; no payload dumps |
| Route ≠ `connect.yaml` `endpoint` | Platform traffic / trigger 404s | Mount the router at the app's `endpoint` base path |
| Legacy SDK | Fails the parent skill's pinned-version gate | `@commercetools/platform-sdk@^8` + `@commercetools/ts-client@^4` |

## Test-first checklist (mirror in the suite)

Full ingestion
- [ ] Rejects unauthenticated / bad-signature trigger calls
- [ ] Pages with the `id` cursor (asserts `where=id > "<lastId>"`), not offset; maps via the pure function
- [ ] Reindex is atomic (build-and-swap) — a rebuild never leaves the live index empty/partial
- [ ] Count check asserts engine count ≈ published-product count; mismatch fails the run
- [ ] Store-specific: iterates the Store's Product Selection and reads in-store projections

Incremental updater
- [ ] `ProductPublished` upserts from the payload projection; second delivery is a no-op
- [ ] `ProductUnpublished` / `ProductDeleted` **remove** the record by `objectID`
- [ ] Store/Selection add/remove messages add/remove from the right Store index
- [ ] Stale/out-of-order message doesn't overwrite newer state (re-fetch by id / version guard asserted)
- [ ] Envelope decode + ack matrix covered (handled, ignored, retryable)
- [ ] Polling-`job` variant (if used): advances checkpoint; deletions covered by rebuild/removal messages
- [ ] Boundary mocked (engine + commercetools APIs); suite runs with no deployment and no secrets
