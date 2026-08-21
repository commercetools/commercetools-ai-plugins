---
name: event-applications
description: Build production-ready event (subscription handler) Connect applications. Covers envelope validation, acknowledgement semantics and redelivery, stateless idempotency, re-fetch by ID, payloadNotIncluded, message-type and self-change filtering, and registering the Google Cloud Pub/Sub subscription destination.
when_to_use:
  - "Writing a handler for commercetools Subscription messages"
  - "Reacting asynchronously to order, cart, customer, or product changes"
  - "Deciding which HTTP status to return so a message is or isn't redelivered"
  - "Making an event handler idempotent and safe under at-least-once delivery"
  - "Registering a Google Cloud Pub/Sub subscription destination"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - event
    - subscriptions
---

# Event Applications (Subscription Handlers)

**Impact: CRITICAL — Event apps run under at-least-once delivery with no ordering. The default failure modes are an infinite redelivery loop (non-2xx on an unprocessable message) and silent message loss (swallowing errors). Both are production incidents.**

An `event` application receives commercetools [Subscription](https://docs.commercetools.com/api/projects/subscriptions.md) notifications through a Connect-provisioned message broker. The connector registers the Subscription in `postDeploy` (see [lifecycle-scripts.md](./lifecycle-scripts.md)) and exposes an HTTP endpoint (`endpoint: /event`) that the broker pushes to.

> The **transactional email** sub-area ([integrations/email/overview.md](./integrations/email/overview.md)) is a worked, end-to-end `event` app built on the patterns below — including the at-most-once vs at-least-once decision for a non-idempotent ESP send.

## Table of Contents
- [Contract facts (verified)](#contract-facts-verified)
- [Pattern 1: Validate the envelope before processing](#pattern-1-validate-the-envelope-before-processing)
- [Pattern 2: Acknowledge correctly — redelivery is driven by your status code](#pattern-2-acknowledge-correctly--redelivery-is-driven-by-your-status-code)
- [Pattern 3: Filter message types and ignore the rest](#pattern-3-filter-message-types-and-ignore-the-rest)
- [Pattern 4: Idempotency under at-least-once delivery](#pattern-4-idempotency-under-at-least-once-delivery)
- [Pattern 5: Re-fetch by ID, never trust the payload](#pattern-5-re-fetch-by-id-never-trust-the-payload)
- [Pattern 6: Self-change filtering](#pattern-6-self-change-filtering)
- [Pattern 7: Register the subscription destination](#pattern-7-register-the-subscription-destination)
- [Pattern 8: Reconciliation sweep for SLA-bound consumers](#pattern-8-reconciliation-sweep-for-sla-bound-consumers)
- [Checklist](#checklist)

---

## Contract facts (verified)

From [Connect — deployment information](https://docs.commercetools.com/connect/overview.md) and [Subscriptions — Delivery](https://docs.commercetools.com/api/projects/subscriptions.md):

- **At-least-once delivery, no ordering guarantee, no delivery-time guarantee.**
- **The payload arrives wrapped in a push envelope whose `message.data` is base64-encoded** (verified: [Connect — locally test an event app](https://docs.commercetools.com/connect/test-applications-locally.md#test-an-event-application), which documents this envelope for event applications without qualifying it per broker) — the wrapper is `{ "message": { "data": "<base64>" } }`. The base64 is the transport's, not something commercetools adds; the commercetools notification underneath is plain JSON. Decode it before processing (Pattern 1).
- **Ack by status code (Connect event apps):** the broker retries unless the app responds `102`, `200`, `201`, `202`, or `204`. Too many negative acks trigger push backoff.
- **Event acknowledgement timeout: 10 seconds.** Application request times out after 5 minutes; the broker retains unacknowledged messages for **7 days**.
- **Delivery identity (for dedup comparisons and logging, not storage):** for `notificationType: "Message"` the `resource.id` + `sequenceNumber`; for Change payloads (`ResourceCreated/Updated/Deleted`) the `resource.id` + `version`.
- **`payloadNotIncluded`:** if the message exceeds the queue's size limit (often 256 KB) the payload is omitted — you must re-fetch the resource by ID.

## Pattern 1: Validate the envelope before processing

Connect delivers events over Google Cloud Pub/Sub: the broker pushes the notification wrapped as `{ "message": { "data": "<base64>" } }`. **All GCP event payload `message.data` is base64-encoded** — decode and structurally validate it before touching business logic.

**INCORRECT — assume the shape and parse blindly:**
```typescript
const msg = JSON.parse(Buffer.from(req.body.message.data, 'base64').toString());
await process(msg.resource.id);   // throws on any malformed/empty envelope → 500 → redelivered forever
```
*Why this fails:* a malformed or unexpected envelope throws, returns 500, and is redelivered indefinitely.

**CORRECT — decode the Pub/Sub wrapper, validate each layer, reject malformed with a clear error:**
```typescript
function decodeEnvelope(body: unknown): SubscriptionMessage {
  const message = (body as any)?.message;
  if (!message || typeof message.data !== 'string') {
    throw new BadEnvelope('missing Pub/Sub message data');
  }
  let parsed: SubscriptionMessage;
  try {
    parsed = JSON.parse(Buffer.from(message.data, 'base64').toString().trim());   // base64 → JSON
  } catch {
    throw new BadEnvelope('cannot parse message data');
  }
  if (!parsed.resource?.typeId || !parsed.resource?.id || !parsed.notificationType) {
    throw new BadEnvelope('missing resource reference or notificationType');
  }
  return parsed;
}
```

> Decide deliberately what a malformed envelope returns. A truly un-parseable envelope will never become valid on retry, so returning a 2xx (ack-and-drop, logged) avoids a redelivery loop; some teams prefer a 4xx plus monitoring. Either is defensible — an *un-acked 5xx loop is not*.

## Pattern 2: Acknowledge correctly — redelivery is driven by your status code

This is the single most important event-app decision. The broker redelivers on any non-ack response.

| Situation | Return | Why |
|---|---|---|
| Processed successfully | `200`/`201`/`204` | Ack — don't redeliver |
| Irrelevant message (wrong type, feature off, not applicable) | `200` | Ack — there is nothing to retry |
| Platform test/subscription message | `200` | Ack |
| Transient failure (external API 503, lock contention) | non-2xx (e.g. `500`/`503`) | Retryable — *do* redeliver |
| Permanently unprocessable (bad data that won't fix itself) | `200` + log/alert (or route to DLQ) | Redelivery can't help; don't loop |

**INCORRECT — 4xx on an unsupported-but-subscribed message type:**
```typescript
if (!isSupported(message)) {
  throw new CustomError(400, `Resource type ${message.resource.typeId} not supported`);
}
```
*Why this fails:* with at-least-once push delivery, a non-2xx means the broker keeps redelivering the same message forever. Subscribe to fewer types, or ack-and-ignore.

**INCORRECT — swallow every error and always return 200:**
```typescript
try { await handle(message); } catch (e) { logger.error(e); }   // always falls through to 200
res.status(200).send();
```
*Why this fails:* a *transient* failure (external API momentarily down) gets acked and the message is gone — silent data loss with no retry and no DLQ.

**CORRECT — distinguish retryable from terminal:**
```typescript
try {
  await handle(message);
  res.status(204).send();                 // handled (or intentionally ignored)
} catch (err) {
  if (isTransient(err)) { res.status(503).send(); return; }   // let the broker retry
  logger.error({ correlationId, err }, 'permanently unprocessable message');
  res.status(200).send();                 // ack; alert/DLQ instead of looping
}
```

## Pattern 3: Filter message types and ignore the rest

Subscribe narrowly, then branch on type and ack anything you don't handle.

```typescript
switch (message.resource.typeId) {
  case 'order':
    if (isOrderConfirmed(message)) await syncOrder(message.resource.id);
    break;                                  // anything else about orders: ack, do nothing
  default:
    break;                                  // includes the platform's subscription test message
}
res.status(204).send();
```
Register only the message types you act on in the Subscription (`messages: [{ resourceTypeId: 'order', types: ['OrderStateChanged', 'OrderCreated'] }]`) so the broker doesn't deliver noise in the first place — see [lifecycle-scripts.md](./lifecycle-scripts.md).

## Pattern 4: Idempotency under at-least-once delivery

The same message *will* arrive twice. Make reprocessing a no-op.

**INCORRECT — in-process dedup:**
```typescript
const seen = new Set<string>();             // lost on restart; not shared across instances
if (seen.has(message.id)) return;
seen.add(message.id);
```
*Why this fails:* event apps autoscale to multiple instances and restart freely; an in-memory set dedups nothing in practice.

**CORRECT — make the work self-deduplicating, no local state:**
```typescript
// Let the target system's own idempotency decide: does it already have this resource?
const existing = await external.findByOrderId(orderId);
if (existing) { logger.info({ orderId }, 'already synced; skip'); return; }
await external.create(/* ... */);   // or upsert by a stable key, so a re-run is a no-op
```
Connect apps are stateless and run in isolated containers that **cannot share state via the filesystem** (verified: [Connect overview](https://docs.commercetools.com/connect/overview.md)) — so achieve idempotency *without* a local store: check the target's current state (above), re-fetch the commercetools resource and re-check it (Pattern 5), or upsert by a stable key. The `resource.id` + `sequenceNumber` (Message) / `resource.id` + `version` (Change) pair identifies the delivery for logging and for comparing against live state.

## Pattern 5: Re-fetch by ID, never trust the payload

The payload can be stale (no ordering) or absent (`payloadNotIncluded`). Fetch current state.

**INCORRECT:** `const order = message.order; if (order.orderState === 'Confirmed') ...`
*Why this fails:* an out-of-order or size-truncated message gives you the wrong or missing state.

**CORRECT:**
```typescript
const order = await getOrderById(message.resource.id);   // current truth
if (order.orderState !== 'Confirmed') return;            // re-check against live state
```

## Pattern 6: Self-change filtering

If your handler writes back to commercetools (e.g. sets a custom field on the order), that write can emit a message your subscription receives — a loop.

Guard against it: subscribe to only the message types that represent *external* changes; check whether the change is the one you just made (compare a marker custom field or the modifying client); or short-circuit when the resource is already in the target state. Without this, a connector that "stamps processed orders" can re-trigger itself indefinitely.

## Pattern 7: Register the subscription destination

Connect provisions the broker and injects its details into `postDeploy` as environment variables. **Never hardcode a topic, project, or ARN — read them from the injected vars** (verified: [automation scripts](https://docs.commercetools.com/connect/automation-scripts.md)):

| Injected var (`event` apps) | Purpose |
|---|---|
| `CONNECT_SUBSCRIPTION_DESTINATION` | Which broker this deployment got — `GoogleCloudPubSub` or `SNS`. Branch on this first. |
| `CONNECT_GCP_TOPIC_NAME`, `CONNECT_GCP_PROJECT_ID` | Pub/Sub topic + project → `{ type: 'GoogleCloudPubSub', topic, projectId }` |
| `CONNECT_AWS_TOPIC_ARN` | SNS topic ARN → `{ type: 'SNS', topicArn, authenticationMode: 'IAM' }` |

**Branch on `CONNECT_SUBSCRIPTION_DESTINATION`, don't assume Pub/Sub.** Connect deploys to [both GCP and AWS regions](https://docs.commercetools.com/connect/hosts-and-authorization.md), and the broker follows the region. A `postDeploy` that builds a `GoogleCloudPubSub` destination unconditionally registers the wrong destination type on an AWS deployment — so the same connector source works in one region and silently delivers nothing in another:

```typescript
const destinationType = process.env.CONNECT_SUBSCRIPTION_DESTINATION;

let destination;
if (destinationType === 'SNS') {
  destination = {
    type: 'SNS',
    topicArn: process.env.CONNECT_AWS_TOPIC_ARN,
    authenticationMode: 'IAM',
  };
} else if (destinationType === 'GoogleCloudPubSub' || destinationType == null) {
  // null/absent means Pub/Sub, per the docs' own example
  destination = {
    type: 'GoogleCloudPubSub',
    topic: process.env.CONNECT_GCP_TOPIC_NAME,
    projectId: process.env.CONNECT_GCP_PROJECT_ID,
  };
} else {
  // Fail loudly rather than silently registering the wrong destination type.
  throw new Error(`Unknown subscription destination type: ${destinationType}`);
}
```

This is the destination whose envelope your handler decodes in Pattern 1. Public docs describe **one** event-app envelope (base64 `message.data`) without qualifying it per broker, so don't assume an SNS deployment needs different unwrapping — but don't assume it doesn't either: the documented example's `subscription` field is Pub/Sub-shaped, and no page states what an SNS-backed event app receives. **Verify the envelope against a real delivery before deploying an `event` app to an AWS region**, rather than trusting either reading.

## Pattern 8: Reconciliation sweep for SLA-bound consumers

Subscriptions promise at-least-once delivery with **no ordering and no delivery-time guarantee** — a multi-minute delay is normal platform behavior, not a defect. Patterns 2–5 make a handler *correct*; they don't make it *timely*. If a downstream system has an SLA ("every order reaches the OMS within 5 minutes"), the design is **hybrid, not either/or**:

1. Keep the Subscription as the fast path.
2. Add a `job` app ([job-applications.md](./job-applications.md)) that periodically polls `GET /{projectKey}/messages` for the same message types and processes anything the event path missed.
3. Share one idempotent handler between both paths — the sweep must be able to re-process a message the Subscription already delivered (Pattern 4).

**Prerequisites:**

- Messages are *not persisted by default* — enable querying via Merchant Center *Settings → Developer Settings* or the [Change Messages Configuration](https://docs.commercetools.com/api/projects/project.md#change-messages-configuration) update action ([Messages](https://docs.commercetools.com/api/projects/messages.md#enable-querying-messages-via-the-api)).
- The job's API client needs the read scope for the messages it sweeps (`view_messages` alongside the domain read scopes) — declare it in `inheritAs.apiClient.scopes` like any other.
- Mind `deleteDaysAfterCreation`: a sweep stalled longer than the retention window can no longer see those messages, so alert on **sweep lag**, not only on sweep errors.

**Page with a keyset cursor on `(createdAt, id)`, never `offset`** — `offset` maxes out at 10,000 and re-paginates unstably while new messages arrive. The predicate must be the compound form; a `createdAt >= X and id > Y` conjunction silently drops any message with a later timestamp but a lower `id`:

```typescript
const PAGE = 500;
const TYPES = '"OrderCreated", "OrderStateChanged"';        // the same types the Subscription registers

// Safety lag: `createdAt` is millisecond-granular and ids are not monotonic, so a
// message can become queryable just after the cursor passed its timestamp. Never
// sweep right up to now — trail behind and let idempotency absorb the overlap.
const until = new Date(Date.now() - 60_000).toISOString();

const buildWhere = (cursor) => [
  cursor
    ? `(createdAt > "${cursor.createdAt}" or (createdAt = "${cursor.createdAt}" and id > "${cursor.id}"))`
    : null,
  `createdAt <= "${until}"`,
  `type in (${TYPES})`,
].filter(Boolean).join(' and ');

// `cursor` MUST be reassigned each page. Hoisting the predicate out of the loop
// re-issues the same query forever — the sweep spins until the job's 30-minute
// timeout, re-handling the same first page and never draining the backlog.
let cursor = await loadCursor('message-sweep');             // e.g. a CustomObject

for (;;) {
  const { body: { results } } = await apiRoot.messages().get({ queryArgs: {
    where: buildWhere(cursor),                             // rebuilt from the advancing cursor
    sort: ['createdAt asc', 'id asc'],                     // must match the predicate's ordering
    withTotal: false,                                      // cheaper; you don't need the count
    limit: PAGE,
  }}).execute();
  if (!results.length) break;

  for (const message of results) {
    await handleMessage(message);                           // the same idempotent handler the event path uses
  }
  const last = results[results.length - 1];
  cursor = { createdAt: last.createdAt, id: last.id };      // advance in memory…
  await saveCursor('message-sweep', cursor);                // …and checkpoint per page
  if (results.length < PAGE) break;
}
```

Checkpoint *after* each page is fully handled, not per message — a mid-page crash then replays a few already-handled messages, which idempotency absorbs, rather than skipping them. Compute `until` once per run, not per page, so the upper bound can't drift forward while you drain.

One caveat on sharing the handler: this works cleanly for a **MessageSubscription**, where both paths see the same Message types. A `ChangeSubscription` has no corresponding Message to sweep, and API-fetched Messages carry no delivery envelope — so the shared handler must key off `resource.id` and re-fetch (Pattern 5) rather than reading envelope fields.

---

## Checklist
- [ ] Pub/Sub envelope decoded (base64 `message.data`) and structurally validated (→ JSON → resource ref → notificationType) before processing
- [ ] Status codes follow the ack table: 2xx for handled/irrelevant, non-2xx only for retryable failures
- [ ] No 4xx/5xx on unsupported-but-subscribed types (no redelivery loop); no blanket error-swallowing (no silent loss)
- [ ] Reprocessing is a no-op via stateless means (target's own idempotency, re-fetch-and-re-check, or upsert by stable key) — no local dedup store
- [ ] Handler re-fetches the resource by ID; handles `payloadNotIncluded`
- [ ] Self-change filtering prevents write-back loops
- [ ] Subscription registers only the needed message types; destination built from the injected vars, branching on `CONNECT_SUBSCRIPTION_DESTINATION` rather than assuming Pub/Sub
- [ ] Processing stays within the 10 s ack timeout (offload long work; ack fast)
- [ ] For SLA-bound flows: a `job` reconciliation sweep polls `GET /messages` with a keyset `(createdAt, id)` cursor (never `offset`), sharing the event path's idempotent handler; Messages querying enabled and sweep lag alerted on

**Next:** [lifecycle-scripts.md](./lifecycle-scripts.md) · [observability-operations.md](./observability-operations.md) · [testing.md](./testing.md)
