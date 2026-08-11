---
name: search-verification
description: Verify a search connector round trip — publish appears, unpublish/delete disappears, full ingestion counts match, re-run is idempotent, per-Store scope holds — and the traps that look like bugs but aren't (eventual-consistency lag, availability drift, a non-atomic rebuild). The search sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - search
    - connect
---

# Verify the search sync

Don't declare done until a change **appears**, a removal **disappears**, and a **full rebuild** matches the catalog — in the engine's index, not just in your logs. Locally, without a real queue, POST the base64 message envelope straight to the incremental app's endpoint ([test an event application locally](https://docs.commercetools.com/connect/test-applications-locally.md#test-an-event-application)) and hit the `/fullSync` trigger directly. Two of the checks below regularly look broken when they're actually correct — read the traps.

## Check 1 — a publish appears in the index (delta path)

Publish a Product (or change and re-publish one), then confirm:

- A record with the expected `objectID` exists in the engine, with the mapped fields — name/description in the in-scope locales, the selected-context price, denormalized categories, and image.
- Searching for a term in the product's name returns it, and its facets (brand/color/size) are populated.
- **Only the `current`, published data is present** — no staged edits, no unpublished siblings. If staged content shows up, the connector is reading the wrong projection ([data-mapping.md](./data-mapping.md)).
- Re-deliver the same `ProductPublished` message: **nothing duplicates** (idempotent upsert on `objectID`).

A record that appears but is missing the price or a locale is the tell that the price-context or `localeProjection` mapping is wrong — not that indexing failed.

## Check 2 — an unpublish/delete disappears (deletion propagation)

Unpublish the Product (and separately, delete one), then confirm the record is **gone** from the index and no longer returned by search. This is the check people skip, and its failure is the **ghost-record** bug: a hit that still shows in results and links to a dead PDP. If the polling-`job` variant is in use, confirm removals are covered by the removal messages or the nightly rebuild — a `lastModifiedAt` poll alone can't see deletions.

## Check 3 — a full ingestion matches the published catalog, atomically

Trigger `/fullSync` (or run the `job`) against a known catalog, then confirm:

- The engine's **record count equals the published-product count** (× your granularity multiplier for variant-level). A mismatch means the map dropped or duplicated records.
- **The index never went empty or partial during the rebuild.** Query it *while* a rebuild runs (or inspect that the connector built into a temporary index and swapped) — a live index that returns zero/partial results mid-rebuild is the non-atomic-reindex bug (Trap 3), not a timing quirk.
- Re-run the full ingestion: the resulting index is **identical** (same count, same records) — the load is idempotent.

## Check 4 — per-Store scope holds (Store-specific pattern)

If the index is Store-scoped: add a Product to a Store's Product Selection and confirm it appears in **that** Store's index only; remove it and confirm it disappears from that index while remaining in others that still list it. Confirm the in-store projection resolved the Store's locales/prices, not the Project defaults.

## The traps (behavior that looks like a bug — or hides one)

### Trap 1 — the lag is eventual consistency, not a dropped update

commercetools' own projections and native search are [eventually consistent](https://docs.commercetools.com/api/general-concepts.md#eventual-consistency) — an update takes time to be queryable — and the engine adds its own indexing delay on top. So "I published and it's not in search yet" is usually **expected lag**, not a lost message. Confirm by waiting and re-querying, or by checking the record landed via a direct get before concluding the pipeline dropped it. Only treat it as a bug if it never converges.

### Trap 2 — availability in the index drifts, and that's by design

If you indexed an `inStock` flag, it is a **cadence-refreshed snapshot**, not live stock — `ProductVariant.availability` itself lags and is [eventually consistent (up to ~10 s)](https://docs.commercetools.com/api/inventory-overview.md#inventory-checks-and-consistency). A search result showing "in stock" for something that just sold out is expected; the storefront must confirm live quantity from the [Inventory API](https://docs.commercetools.com/api/projects/inventory.md) / native search at render or add-to-cart. Verify the flag refreshes on its cadence — don't expect it to track real-time stock.

### Trap 3 — a "flaky, half-empty" index during rebuilds is a non-atomic reindex

If search returns fewer results (or none) for a stretch and then recovers, the full ingestion is **wiping the live index and refilling it** instead of building-and-swapping. That's not load flakiness — it's the rebuild window exposed to shoppers. Fix it in the connector (build into a temporary index, then swap / replace-all-objects atomically — [search-contract.md](./search-contract.md)), then re-verify Check 3.

### Trap 4 — sandbox catalog vs production

A sandbox project has a small, static catalog: counts, locales, and Store assortments won't match production, and volume/throttling behavior won't surface. Verify the **contract** (upsert, deletion propagation, atomic rebuild, count check, idempotency, trigger auth) against the sandbox; verify **real volume, pagination depth, and engine rate-limit behavior** against a production-sized catalog, and clean up test records afterward.

## Verification checklist

- [ ] Publish → record present with mapped fields (locales, selected-context price, categories, image); `current` data only; redelivery doesn't duplicate
- [ ] Unpublish **and** delete → record gone from the index (no ghost results)
- [ ] Full ingestion → engine count ≈ published-product count; index never empty/partial mid-rebuild; re-run identical (idempotent)
- [ ] Store-specific: add/remove from a Product Selection scopes to the right Store index; in-store projection resolved Store locales/prices
- [ ] Confirmed eventual-consistency lag converges (not a dropped update)
- [ ] `inStock`/availability treated as a cadence snapshot, not live stock; live quantity read from Inventory/native search
- [ ] Contract verified on sandbox; volume + rate-limit behavior verified on a production-sized catalog; test records cleaned up
- [ ] No engine key or payload dumps in logs; the `/fullSync` trigger rejects unauthenticated calls
