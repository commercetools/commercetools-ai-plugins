---
name: analytics-pipeline-architecture
description: The analytics egress pipeline — an event streamer (subscribe → decode → re-fetch → transform → deliver) and a batch/backfill job (lastModifiedAt window + cursor pagination + checkpoint), plus the event→row transform, warehouse-side dedup keys, PII/GDPR, and the platform limits. Full pitfall catalog. The analytics sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - analytics
    - data
    - connect
    - integration
---

# The analytics egress pipeline

Everything each app must do, and the pitfalls that silently break an analytics feed. Which apps you build follows from **latency** ([overview.md](./overview.md)); the destination mechanism is in [destinations.md](./destinations.md). These build on the commercetools-connect skill's contracts — [event-applications.md](../../../commercetools-connect/references/event-applications.md), [job-applications.md](../../../commercetools-connect/references/job-applications.md), [security.md](../../../commercetools-connect/references/security.md) — and add only the analytics-specific substance. **Don't re-teach envelope/ack/idempotency, job scheduling/checkpointing, or scopes here — link to those.**

## The one rule that spans the pipeline: dedup on the destination side

Subscription delivery is **at-least-once with no ordering** ([delivery guarantees](https://docs.commercetools.com/api/projects/subscriptions.md#no-guarantee-on-order)) and a batch backfill window can overlap the stream — so the *same* change reaches the destination more than once. You cannot dedup inside a stateless Connect app; make the **destination** absorb duplicates with a **stable dedup/merge key**:

- **For `notificationType: "Message"`** → `resource.id` + **`sequenceNumber`** (monotonic per resource; higher wins).
- **For Change payloads** (`ResourceCreated/Updated/Deleted`) → `resource.id` + **`version`** (note `version` is *not* sequential, but is comparable per resource).

Land raw event rows into a staging table keyed on this pair (an append is naturally idempotent if the key is unique), or `MERGE`/upsert current-state on `resource.id` keeping the row with the highest `sequenceNumber`/`version`. This is the analytics analogue of CRM's upsert-by-`externalId` and OMS's `orderNumber` idempotency — same principle, warehouse side.

## App 1 — the event streamer (`event`, near-real-time)

Build on [event-applications.md](../../../commercetools-connect/references/event-applications.md) — it owns the envelope/ack/idempotency/Pub-Sub contract. The streamer's job is the classic five steps:

**subscribe → decode the Pub/Sub envelope → re-fetch by id → transform to the destination schema → deliver (with the dedup key).**

- **Subscribe** to the minimum Messages for the domains you export — register in idempotent `postDeploy` ([lifecycle-scripts.md](../../../commercetools-connect/references/lifecycle-scripts.md)). A **MessageSubscription** for specific message types (`OrderCreated`, `OrderStateChanged`, `CustomerCreated`, …) when you want typed, targeted events; a **ChangeSubscription** on a resource to capture *all* changes in one Subscription (spends less of the 50-Subscription budget). Message catalogs: [Cart & Order](https://docs.commercetools.com/api/projects/messages/cart-order-messages.md), [Customer](https://docs.commercetools.com/api/projects/messages/customer-messages.md), [all Messages](https://docs.commercetools.com/api/projects/messages.md). On Connect the broker is injected and follows the deployment region — branch on `CONNECT_SUBSCRIPTION_DESTINATION` and build the destination from the matching injected vars (`CONNECT_GCP_*` or `CONNECT_AWS_TOPIC_ARN`); don't hardcode a broker ([event-applications.md](../../../commercetools-connect/references/event-applications.md), Pattern 7).
- **Decode + validate the envelope** (base64 `message.data` → JSON → resource ref → notificationType), and **ack correctly** (`2xx` for handled/irrelevant; non-2xx only for a *transient* delivery/destination failure you want redelivered). Don't 4xx a subscribed-but-unhandled type into a redelivery loop; don't swallow a transient destination outage into silent data loss. → [event-applications.md](../../../commercetools-connect/references/event-applications.md), Patterns 1–3.
- **Re-fetch the resource by `resource.id`** — never transform from the Message payload. It can be stale (no ordering) or **absent**: if a Message exceeds the queue size limit it is delivered with **`payloadNotIncluded`** set and *no* resource data, so re-fetch is mandatory, not optional ([event-applications.md](../../../commercetools-connect/references/event-applications.md), Pattern 5). Fetch current state, then transform.
- **Transform** to the destination schema (see below) — a **pure function**, no network, unit-tested without a deployment.
- **Deliver + emit the dedup key.** Send to the destination's ingestion API with `resource.id` + `sequenceNumber` (or `version`) attached so the destination deduplicates.

## App 2 — the batch / backfill job (`job`, scheduled + one-time history)

Build on [job-applications.md](../../../commercetools-connect/references/job-applications.md) — it owns the schedule, the 30-min timeout, overlap locking, and checkpointing. The analytics-specific part is **how you window the query**, because there is **no Export API** ([Import and export](https://docs.commercetools.com/api/getting-started/import-and-export.md)) — you page the normal HTTP/GraphQL API:

- **Window on `lastModifiedAt`.** Query only resources changed since the last checkpoint: a `where` predicate like `lastModifiedAt >= :cursor` (the documented [integration best practice](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-options.md) for "query for changes using timestamps"). Far cheaper than re-scanning the whole dataset.
- **Cursor-based pagination**, not `offset`. Offset degrades with depth and is [capped at 10,000 records](https://docs.commercetools.com/api/limits.md#queries); cursor pagination (a stable sort + `lastId`/timestamp cursor) is consistent at any depth. Place the most restrictive predicate first ([performance considerations](https://docs.commercetools.com/api/predicates/query.md#performance-considerations)).
- **Checkpoint the window** (e.g. the last processed `lastModifiedAt` + id in a Custom Object) so a restart resumes and a re-run loads only the delta. Each unit idempotent via the same destination dedup key as the stream.
- **Two jobs, one shape:** a one-time **historical backfill** (wide window, from the beginning) and an ongoing **gap-repair** run (narrow window since the last checkpoint). Keep the backfill separate from the stream.
- **Not for heavy bulk.** Job containers are capped (2 CPU / 4 GB) and the docs advise against jobs for memory-intensive bulk work ([job-applications.md](../../../commercetools-connect/references/job-applications.md)). For a large one-time history load, stream page-by-page to the destination (don't buffer the whole dataset), or orchestrate an external batch loader from the job rather than doing the heavy lift in-container.

## The event→row transform (the real work)

Mapping a commercetools resource onto a destination schema is where the value is; keep it pure and tested:

- **Localized strings, money, nested arrays.** commercetools localized strings (`{ "en": … }`), `centAmount`/`currencyCode` money, and nested line-item/address arrays rarely map 1:1 to a flat warehouse column. Decide per field: flatten to columns, keep as a JSON/VARIANT column, or explode line items into a child table.
- **Grain.** One row per **event** (append-only fact table, dedup on the key) or one **current-state** row per resource (`MERGE`/upsert on `resource.id`)? This is a destination-schema decision — pin it in Step 1.
- **Carry the dedup key as columns** (`resource_id`, `sequence_number` / `version`, `last_modified_at`) so warehouse-side dedup/merge and late-arrival handling are possible.

## PII / GDPR (customer data)

Orders and customers carry **PII**. Treat the destination as a data processor:

- **Minimize** — export only the fields analytics needs; don't ship full customer profiles by default.
- **Never log PII** or destination credentials; structured logs carry only identifiers/correlation keys ([security.md](../../../commercetools-connect/references/security.md)).
- **Propagate erasure.** If a `CustomerDeleted` / anonymization must reach the warehouse (right-to-be-forgotten), subscribe to it and delete/anonymize the destination rows — an analytics warehouse is a common place orphaned PII hides.
- Destination creds in `securedConfiguration`; least-privilege **read** scopes only ([config-from-requirements.md](./config-from-requirements.md)).

## Platform limits & realities to design around

- **No Export API** — you build the pipeline from Subscriptions + API queries; there is no bulk "dump" endpoint ([Import and export](https://docs.commercetools.com/api/getting-started/import-and-export.md)).
- **~50 Subscriptions per Project** — a [soft limit](https://docs.commercetools.com/api/limits.md#subscriptions), increasable on request. Prefer a ChangeSubscription per resource over many per-message-type Subscriptions to stay within budget.
- **`payloadNotIncluded` (payload omitted above the queue size limit, often around 256 KB)** — re-fetch by id always; never rely on the payload being present ([event-applications.md](../../../commercetools-connect/references/event-applications.md)).
- **Messages query API is off by default** — Messages are *not persisted for querying* unless you enable the feature in Merchant Center Developer Settings ([enable querying Messages](https://docs.commercetools.com/api/projects/messages.md#enable-querying-messages-via-the-api)). Subscriptions deliver regardless; don't design a poller against the Messages API assuming it's queryable.
- **Change History is not the source** — separate host, token-rate-limited (429), explicitly *not* for event-driven/high-throughput use (see [overview.md](./overview.md), and [Audit Log overview](https://docs.commercetools.com/api/history/overview.md)).

## Pitfall catalog

| Pitfall | Symptom | Fix |
|---|---|---|
| No destination dedup key | Duplicate rows after redelivery / batch-stream overlap | Emit `resource.id` + `sequenceNumber` (or `version`); dedup/`MERGE` on the warehouse side |
| Transforming from the payload | Wrong/missing data; empty rows on `payloadNotIncluded` | Re-fetch the resource by `resource.id`; transform from current state |
| 4xx/5xx on an unhandled type | Redelivery loop flooding the destination | Ack (`2xx`) irrelevant messages; subscribe narrowly |
| Swallowing a destination outage | Silent gaps (events acked but never landed) | Non-2xx on transient destination failure so it redelivers; DLQ terminal failures |
| `offset` pagination for backfill | Batch stalls / caps at 10,000 records | Cursor pagination + `lastModifiedAt` window |
| No checkpoint on the batch window | Re-run reloads everything / restart loses progress | Checkpoint the window; resume from it |
| One Subscription per message type | Burns the ~50-Subscription budget | ChangeSubscription per resource where you need all changes |
| Polling the Messages API | Empty results — querying is off by default | Use Subscriptions; only query Messages if the feature is enabled |
| Building off Change History | 429s; not event-driven; missing API-origin changes on Basic | Use Subscriptions + API queries, not the Audit Log |
| PII in the warehouse / logs | Compliance exposure; erasure gaps | Minimize fields; never log PII; propagate deletion/anonymization |
| Route ≠ `connect.yaml` `endpoint` | Platform traffic 404s | Mount the router at the app's `endpoint` base path |
| Legacy SDK | Fails the commercetools-connect skill's pinned-version gate | `@commercetools/platform-sdk@^8` + `@commercetools/ts-client@^4` |

## Test-first checklist (mirror in the suite)

Event streamer
- [ ] Decodes the base64 envelope; validates type; acks irrelevant messages (no loop)
- [ ] Re-fetches the resource by id (never transforms from the payload); handles `payloadNotIncluded`
- [ ] Transform is a pure, unit-tested function (localized strings / money / arrays handled)
- [ ] Emits the dedup key (`resource.id` + `sequenceNumber` / `version`); duplicate delivery lands one row
- [ ] Transient destination failure → non-2xx (redelivered); terminal → ack + DLQ/alert
- [ ] No PII in logged output; least-privilege read scopes

Batch / backfill job
- [ ] Windows on `lastModifiedAt`; cursor pagination (not `offset`)
- [ ] Checkpoints the window; a re-run loads only the delta and is idempotent (same dedup key)
- [ ] Streams pages to the destination (no whole-dataset buffering); overlap lock + timeout headroom
- [ ] Boundary mocked (commercetools API + destination); suite runs with no deployment/secrets
