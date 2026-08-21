---
name: crm-connector-contract
description: The CRM sync contract — outbound event syncer, inbound webhook/poll, migration job; idempotent upsert by externalId, re-fetch by id, ack semantics, self-change/loop filtering, deletion/PII. Full pitfall catalog. The CRM sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - crm
    - connect
---

# The CRM sync contract

Everything each app must do, and the pitfalls that silently break it. Which apps you build follows from **direction** ([overview.md](./overview.md)); the rules below are per app. These build on the parent skill's async contracts — [event-applications.md](../../event-applications.md), [service-applications.md](../../service-applications.md), [job-applications.md](../../job-applications.md), [security.md](../../security.md) — and add the CRM-specific rules.

## The one rule that spans every app: upsert by `externalId`, never blind-create

Every sync write, in either direction, is an **upsert keyed on a stable external reference** — the commercetools Customer's `externalId` holds the CRM record id (and/or the CRM holds the commercetools id). At-least-once delivery means every message can arrive twice; a create-on-every-message design produces duplicate contacts and duplicate Customers. Look up by the key, update if present, create (and write the key back) if absent. This is the CRM analogue of tax's stable `transaction_id`.

## App 1 — the outbound syncer (commercetools → CRM, `event`)

### What triggers it

A Connect **`event` application**: Connect provisions the queue/destination and delivers each message as an HTTP `POST` to the app's endpoint (port 8080). Register the Subscription in `postDeploy` (idempotent get-then-create):

- **ChangeSubscription on `customer`** — fires on `ResourceCreated`/`ResourceUpdated`/`ResourceDeleted` for *any* customer change. Simplest way to keep a full profile in sync.
- **MessageSubscriptions** to specific Customer messages (`CustomerCreated`, `CustomerEmailChanged`, `CustomerAddressAdded`, `CustomerDeleted`, …) when only certain changes should sync, or when you need the message's typed fields.
- Add `OrderCreated` (a MessageSubscription) if orders map to CRM deals/sales.

Message catalogs: [Customer messages](https://docs.commercetools.com/api/projects/messages/customer-messages.md), [Subscriptions](https://docs.commercetools.com/api/projects/subscriptions.md). Don't manage the transport — Connect abstracts Pub/Sub vs SNS.

### The delivery envelope

The payload shape depends on config, so don't hardcode one form (same as any event app):
- **Transport wrapper (GCP):** `{ "message": { "data": "<base64>", ... } }` — `message.data` is **base64-encoded JSON**; decode first.
- **Message format:** **PlatformFormat** (`{ notificationType, type, resource: { typeId, id }, ... }`) or **CloudEventsFormat** (`{ type: "com.commercetools.…", data: { … } }`). Read `type` and `resource.id` from whichever you get, and **validate the type** before acting (ack-and-ignore the platform's test/probe messages). See [Test an event application locally](https://docs.commercetools.com/connect/test-applications-locally.md#test-an-event-application).

### What it must do

- **Re-fetch the Customer/Order by id** from `resource.id` — don't trust the payload. At-least-once delivery with **no ordering** means an older `ResourceUpdated` can arrive after a newer one; re-fetching the current resource makes the sync converge to the latest state instead of replaying stale deltas.
- **Map** the resource to the CRM's object model (Customer→Contact/Lead, Order→Deal). Keep the mapping a **pure function** — no network — so it's unit-testable without a deployment or token.
- **Upsert by `externalId`.** If the Customer has no CRM id yet, create the CRM record and **write its id back** to the Customer's `externalId` (or Custom Field) with `setExternalId`/`setCustomField`. If it has one, update that CRM record. Idempotent on redelivery.
- **Ack correctly.** Reply with a positive ack (`200`/`2xx`; the Connect event contract treats `102/200/201/202/204` as "don't redeliver") for handled *and* irrelevant-but-acked messages. Return non-2xx only for transient failures you *want* redelivered.

### Self-change filtering (only if bi-directional)

If an inbound app also writes Customers, an inbound write raises a `ResourceUpdated` that this syncer would push straight back to the CRM — an infinite loop. Break it: mark connector-originated writes (e.g. a `syncSource` Custom Field, or compare against the last-synced hash/version) and **skip re-syncing your own changes**. This is the single nastiest CRM bug; a one-way design avoids it entirely, which is why the [integration-patterns guidance](https://docs.commercetools.com/learning-integrate-with-composable-commerce/integration-patterns/integration-planning-and-patterns.md) discourages bi-directional sync.

### Deletion & PII (GDPR)

- If deletion is in scope, handle `CustomerDeleted` / `ResourceDeleted` by **deleting or anonymizing** the CRM record — an erasure request must propagate, not leave orphaned PII downstream.
- Customer data is **PII**: sync only the fields you need, keep credentials in `securedConfiguration`, and **never log PII or the CRM token** (parent [security.md](../../security.md)). Carry marketing-consent flags through the mapping so a "do not contact" preference isn't lost.

## App 2 — the inbound app (CRM → commercetools)

Two forms; pick per the CRM's capability and your latency need.

### Form A — `service` inbound webhook (CRM pushes)

- **Not an API Extension** — no Extension is registered; the CRM calls your endpoint directly. The **5-min service timeout** applies (not the 2 s extension limit).
- **Authenticate the caller** — the CRM calls you, so validate *its* proof (webhook signature / shared secret / JWT) in-app before writing (parent [security.md](../../security.md)). Never trust an unauthenticated inbound write to Customers. (`AuthorizationHeader` authentication on an Extension's `HTTP` destination is the separate mechanism for the reverse direction — commercetools calling *your* endpoint as an Extension destination — not inbound-caller auth.)
- **Upsert the Customer by `externalId`** — look up by the CRM id, update or create. Use `manage_customers` scope.
- **Idempotent** — the same webhook may arrive twice; the upsert must be a no-op the second time.
- **Read-only mapped fields** — when the CRM masters these fields, store them in Custom Fields you treat as read-only elsewhere, so storefront/MC edits don't fight the master.

### Form B — `job` poll (you pull deltas)

- A scheduled `job` (`properties.schedule`) that queries the CRM for records changed since the last run, pages through them, and upserts each by `externalId`.
- **Checkpoint** the last-synced timestamp/cursor (e.g. in a CustomObject) so a restart resumes and you fetch only deltas, not the whole CRM each run.
- Owns its own overlap locking and 30-min timeout headroom (parent [job-applications.md](../../job-applications.md)).

## App 3 — the migration job (one-time backfill)

Keep the initial bulk load **separate** from ongoing sync (the [integration-patterns guidance](https://docs.commercetools.com/learning-integrate-with-composable-commerce/integration-patterns/integration-planning-and-patterns.md) recommends separating migration from ongoing integration — different throughput/pagination needs). A `job` that pages the source (CRM or commercetools) in batches, upserts by `externalId`, and **checkpoints** progress so a failure resumes mid-run rather than restarting. Cleanse/validate records on the way (the migration guidance calls out cleansing Customer data). Respect CRM **rate limits** — batch and back off; a naive tight loop will get throttled or banned.

## Cross-cutting: mapping and rate limits

- **Mapping is the real work.** commercetools localized strings, addresses (array), customer groups, and Custom Fields rarely map 1:1 to a CRM's flat contact schema. Decide per field; keep it pure and tested.
- **Rate limits & backoff.** CRMs rate-limit hard. Give outbound calls a timeout, retry transient `429`/`5xx` with exponential backoff, and prefer the CRM's **batch** endpoints for migration.

## Pitfall catalog

| Pitfall | Symptom | Fix |
|---|---|---|
| Create-on-every-message | Duplicate contacts / duplicate Customers after redelivery | Upsert by `externalId`; write the id back on first sync |
| Trusting the payload | Stale/missing data synced; deltas replayed out of order | Re-fetch the resource by `resource.id` |
| No self-change filter (bi-directional) | Infinite sync loop, runaway API calls | Mark connector writes; skip your own changes — or go one-way |
| Envelope not decoded | Handler sees base64 garbage / crashes | Decode `message.data` (base64→JSON) before use |
| No message-type filter | Acting on unrelated/test messages | Validate `type`; ack-and-ignore the rest |
| Wrong ack | Handled message redelivered forever, or failures silently dropped | `2xx` for handled/irrelevant; non-2xx only for retryable failures |
| Deletion not propagated | Orphaned PII in the CRM after erasure | Handle `CustomerDeleted`/`ResourceDeleted` → delete/anonymize |
| PII / token in logs | Compliance incident | Structured logs without PII; token in `securedConfiguration` |
| Unauthenticated inbound webhook | Anyone can write Customers | Validate signature/secret/JWT; least-privilege `manage_customers` |
| Migration mixed into ongoing sync | Throttling, restarts reload everything | Separate migration `job`; checkpoint; batch + backoff |
| Route ≠ `connect.yaml` `endpoint` | Platform traffic 404s | Mount the router at the app's `endpoint` base path |
| Legacy SDK | Fails the parent skill's pinned-version gate | `@commercetools/platform-sdk@^8` + `@commercetools/ts-client@^4` |

## Test-first checklist (mirror in the suite)

Outbound syncer
- [ ] Decodes the base64 envelope; validates type; acks irrelevant messages
- [ ] Re-fetches the resource by id (doesn't map from the payload)
- [ ] **Upserts by `externalId`**; creates-then-writes-back when absent; update when present
- [ ] Duplicate delivery is a no-op (idempotent)
- [ ] Self-change filtering asserted if bi-directional
- [ ] Deletion → delete/anonymize (if in scope); no PII in logged output

Inbound (webhook or job)
- [ ] Webhook: rejects unauthenticated/invalid-signature calls (auth matrix)
- [ ] Upserts the Customer by `externalId`; idempotent on repeat
- [ ] CRM-mastered fields written as read-only Custom Fields
- [ ] Job: checkpoint advances; a re-run fetches only deltas

Migration job
- [ ] Pages + checkpoints; resumes mid-run after a simulated failure
- [ ] Upsert (not create) so a re-run doesn't duplicate
- [ ] Boundary mocked; suite runs with no deployment/secrets
