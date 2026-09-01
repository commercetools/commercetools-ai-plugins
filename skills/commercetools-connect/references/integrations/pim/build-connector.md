---
name: pim-build-connector
description: Build or fork a custom commercetools PIM connector — choose the ingestion API (Import API for bulk/async vs HTTP API for real-time), the Connect application shape (service inbound webhook, job, or both), full vs incremental sync, idempotent upsert, dependency resolution, and delete handling. Hands the type-agnostic build contracts back to commercetools-connect.
when_to_use:
  - "Building a PIM → commercetools connector from scratch, or forking a public one to extend it"
  - "Choosing between the Import API and the HTTP API, and between a service webhook and a job, for a product sync"
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - pim
    - connect
---

# Build or fork a PIM connector

Reached here from rung 3 (fork) or rung 4 (build) of the [selection ladder](./connector-selection.md), or because there's no public connector for the PIM. Your [data mapping](./data-mapping.md) is the *what*; this is the *how it moves*. Two decisions define the connector; everything else is the parent [commercetools-connect](../../../SKILL.md) build contracts (service/event/job semantics, security, testing, lifecycle, deploy) — this reference only covers what's PIM-specific and routes the rest back.

If forking, change only the delta (a new resource type, a transform, a direction) and keep the working sync engine, keying, and dependency handling — don't rebuild.

## Decision 1 — Which ingestion API?

commercetools offers two ways to write product data ([docs: choose your approach](https://docs.commercetools.com/tutorials/product-data-integrations.md#choose-your-integration-approach), [external product data patterns](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integrate-with-external-product-and-inventory-data.md)):

| | **Import API** | **HTTP (Products) API** |
|---|---|---|
| Shape | Asynchronous, bulk; submit then poll | Synchronous, transactional; immediate result |
| Best for | Initial catalog load, periodic full refresh, large scheduled batches | Real-time incremental updates, single-product fixes |
| Superpower | [Automatic reference resolution](https://docs.commercetools.com/api/import-export/overview.md#reference-resolution) — submit products/categories/types in any order within 48 h; up to 20 resources/request | Instant validation and errors; full update-action control |
| Watch out | Reference resolution ≠ data validity (SKU uniqueness etc. still checked by the commerce API); poll operations to a terminal state | You resolve references and ordering yourself; rate limits under high volume |
| Reference | [Import API overview](https://docs.commercetools.com/api/import-export/overview.md), [best practices](https://docs.commercetools.com/api/import-export/best-practices.md) | [Products API](https://docs.commercetools.com/api/projects/products.md), [product drafts / import endpoints](https://docs.commercetools.com/api/import-export/best-practices.md#choose-the-right-product-import-endpoint) |

Common answer: **Import API for the bulk/initial/nightly path, HTTP API for the real-time event path** — many connectors use both. Match the choice to volume and cadence, not habit.

## Decision 2 — Which Connect application shape?

Derive it from the cadence (Step 1), using the parent skill's [decision framework](../../../SKILL.md#step-1--decision-framework-which-application-type). For a PIM ingesting **into** commercetools:

- **Event-driven / near-real-time** → a **`service` as inbound webhook**: the PIM (or its middleware) calls your endpoint when a product changes; you transform and upsert. This is the parent skill's *inbound webhook* mode — **not** an API Extension. Contract: **5-min** service timeout (not the 2 s extension limit); you authenticate the caller and make the write idempotent. → [service-applications.md](../../service-applications.md), [security.md](../../security.md).
- **Scheduled / bulk** → a **`job`**: poll the PIM for deltas (or do a full pull), transform, and submit via the Import API. Contract: **30-min** request timeout, no built-in concurrency guard (you own overlap locking), restart-safe checkpointing so a re-run resumes cleanly. → [job-applications.md](../../job-applications.md).
- **Both** is common and recommended: a `service` webhook for live changes **plus** a `job` for nightly full reconciliation that heals anything the webhook missed. A single connector declares both applications in `connect.yaml`.
- **Bi-directional** only: if some commercetools attributes must flow *back* to the PIM, add an **`event`** app subscribing to product Messages (at-least-once, no ordering, idempotent). Keep it scoped to CT-owned attributes only, and add self-change filtering so your own inbound writes don't loop back out. → [event-applications.md](../../event-applications.md).

### Webhooks: which way they point

A common misread — the connector mostly **receives** a webhook, it doesn't call outbound ones:

- **Inbound (the one that matters): PIM → connector.** The event-driven path *is* the PIM calling your `service` endpoint when a product changes. Two setup obligations come with it: (a) **register your endpoint with the PIM's event system** (e.g. Akeneo's event subscriptions) so it will call you — do this in an idempotent `postDeploy` lifecycle script or via the PIM's own config; (b) **verify the PIM's signature** on every inbound event. Note the scheme is often **HMAC** (a shared secret in `securedConfiguration`), *not* the JWT the parent [security.md](../../security.md) describes for commercetools-issued destinations — check the PIM's current docs for the exact header and algorithm, don't assume JWT.
- **Outbound is the commercetools API, not a webhook.** The connector's outbound traffic is HTTP/Import API calls to commercetools — normal authenticated REST, not webhooks.
- **commercetools Subscriptions are queue deliveries, not webhooks you call** — relevant only on the bi-directional `event` path above.

## Full vs incremental

- **Full** sends the whole catalog — right for the initial load and periodic complete refreshes; slower and leaves the catalog partially updated mid-run. Best on the Import API.
- **Incremental** sends only what changed since the last run — faster and time-critical-friendly, but the PIM must support change tracking; if it doesn't, the connector needs its own change-detection (e.g. a stored hash/updatedAt per product) rather than reprocessing everything. ([docs](https://docs.commercetools.com/tutorials/product-data-integrations.md#full-versus-incremental-uploads))

A robust connector does **both**: incremental for freshness, a scheduled full reconciliation to catch missed events and drift.

## Idempotency (non-negotiable)

Every write is an **upsert by the stable `key`** from [data mapping Principle 7](./data-mapping.md) — create if absent, update if present. This is what makes the connector safe under the realities of both shapes: a webhook redelivered at-least-once, two job runs overlapping, a full re-import over existing data. Never blind-create (duplicates) and never full-overwrite another source's attributes (clobbering). On the HTTP API, upsert = get-by-key-then-update-actions or create; on the Import API, submitting the same `key` updates in place. State the idempotency strategy in one sentence before writing the handler — if you can't, you're not ready.

## Delete / unpublish handling

Decide what a "removed in the PIM" signal means in commercetools — usually **unpublish or deactivate**, rarely hard-delete (orders and history reference products). If the PIM emits delete events, map them explicitly; if it only emits upserts, the scheduled full reconciliation is what detects disappearances (present in CT, absent in the PIM feed → unpublish). Don't leave delete semantics implicit.

## Then follow the build-side contracts

The rest is type-agnostic and lives in the parent [commercetools-connect](../../../SKILL.md) skill — build to its production-readiness gate:

- Inbound webhook authentication + least-privilege scopes (`manage_products`, `manage_categories`, `manage_product_types`, and Import API scopes as needed — not `manage_project`) → [security.md](../../security.md)
- Idempotent `postDeploy`/`preUndeploy` lifecycle scripts (register the webhook/subscription, create Product Types & AttributeGroups as-code) → [lifecycle-scripts.md](../../lifecycle-scripts.md)
- Test-first: pure mapping unit tests, then a bounded **sandbox-only** live sync run with a pre-flight item count and catalog-size gate → [testing.md](./testing.md); router-level auth-rejection matrix, duplicate-delivery/idempotency, malformed-payload handling → [parent testing.md](../../testing.md)
- Structured logs with a correlation key (the PIM product id), health endpoint, poison-message/replay runbook → [observability-operations.md](../../observability-operations.md)
- `connect.yaml` at the repo root, documented envelope keys only; scaffold/validate with the Connect CLI → [connect-cli.md](../../connect-cli.md); deploy/stage/publish → [deployment-installation.md](../../deployment-installation.md)

## Checklist
- [ ] Ingestion API chosen per volume/cadence (Import API bulk, HTTP API real-time; often both)
- [ ] Application shape matches the cadence (`service` webhook, `job`, or both; `event` only for bi-directional write-back)
- [ ] Full and incremental strategy decided; incremental has real change detection (or a documented fallback)
- [ ] Every write is an upsert by stable key; idempotency strategy stated in one sentence
- [ ] Delete/unpublish semantics defined (not implicit); reconciliation detects disappearances
- [ ] Handed the type-agnostic contracts (auth, scopes, lifecycle, tests, observability, deploy) back to the parent connect skill and met its production-readiness gate
