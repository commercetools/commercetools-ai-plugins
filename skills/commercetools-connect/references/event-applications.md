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

## Table of Contents
- [Contract facts (verified)](#contract-facts-verified)
- [Pattern 1: Validate the envelope before processing](#pattern-1-validate-the-envelope-before-processing)
- [Pattern 2: Acknowledge correctly — redelivery is driven by your status code](#pattern-2-acknowledge-correctly--redelivery-is-driven-by-your-status-code)
- [Pattern 3: Filter message types and ignore the rest](#pattern-3-filter-message-types-and-ignore-the-rest)
- [Pattern 4: Idempotency under at-least-once delivery](#pattern-4-idempotency-under-at-least-once-delivery)
- [Pattern 5: Re-fetch by ID, never trust the payload](#pattern-5-re-fetch-by-id-never-trust-the-payload)
- [Pattern 6: Self-change filtering](#pattern-6-self-change-filtering)
- [Pattern 7: Register the Pub/Sub subscription destination](#pattern-7-register-the-pubsub-subscription-destination)
- [Checklist](#checklist)

---

## Contract facts (verified)

From [Connect — deployment information](https://docs.commercetools.com/connect/overview.md) and [Subscriptions — Delivery](https://docs.commercetools.com/api/projects/subscriptions.md):

- **At-least-once delivery, no ordering guarantee, no delivery-time guarantee.**
- **The payload arrives wrapped in the Google Cloud Pub/Sub push envelope, and `message.data` is base64-encoded.** **All Google Cloud Platform event payload `message.data` is base64-encoded** (verified: [Connect — locally test an event app](https://docs.commercetools.com/connect/steps-locally-test-event)) — the wrapper is `{ "message": { "data": "<base64>" } }`. The base64 is the Pub/Sub transport, not something commercetools adds; the commercetools notification underneath is plain JSON. Decode it before processing (Pattern 1).
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

## Pattern 7: Register the Pub/Sub subscription destination

Connect provisions the Google Cloud Pub/Sub broker and injects its details into `postDeploy`. Build the destination from the injected vars (verified: [automation scripts](https://docs.commercetools.com/connect/automation-scripts.md)):

| Injected vars | Destination object |
|---|---|
| `CONNECT_GCP_TOPIC_NAME`, `CONNECT_GCP_PROJECT_ID` | `{ type: 'GoogleCloudPubSub', topic, projectId }` |

```typescript
const destination = {
  type: 'GoogleCloudPubSub',
  topic: process.env.CONNECT_GCP_TOPIC_NAME,
  projectId: process.env.CONNECT_GCP_PROJECT_ID,
};
```

This is the destination whose push envelope your handler decodes in Pattern 1 (base64 `message.data`). Keep the two in sync.

> This skill targets **GCP-hosted Connect deployments**, where the injected destination is Google Cloud Pub/Sub. Don't hardcode a connection string for another broker — always build the destination from the injected `CONNECT_GCP_*` vars.

---

## Checklist
- [ ] Pub/Sub envelope decoded (base64 `message.data`) and structurally validated (→ JSON → resource ref → notificationType) before processing
- [ ] Status codes follow the ack table: 2xx for handled/irrelevant, non-2xx only for retryable failures
- [ ] No 4xx/5xx on unsupported-but-subscribed types (no redelivery loop); no blanket error-swallowing (no silent loss)
- [ ] Reprocessing is a no-op via stateless means (target's own idempotency, re-fetch-and-re-check, or upsert by stable key) — no local dedup store
- [ ] Handler re-fetches the resource by ID; handles `payloadNotIncluded`
- [ ] Self-change filtering prevents write-back loops
- [ ] Subscription registers only the needed message types; destination built from the injected `CONNECT_GCP_*` vars
- [ ] Processing stays within the 10 s ack timeout (offload long work; ack fast)

**Next:** [lifecycle-scripts.md](./lifecycle-scripts.md) · [observability-operations.md](./observability-operations.md) · [testing.md](./testing.md)
