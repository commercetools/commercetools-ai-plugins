---
name: analytics-verification
description: Verify an analytics egress round trip — one change produces exactly one row, a batch job loads a window idempotently — and the analytics traps (Subscription not registered, duplicate rows without a dedup key, payloadNotIncluded re-fetch, Messages query API off by default). The analytics sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - analytics
    - data
    - connect
    - integration
---

# Verify the analytics round trip

Don't declare done until data flows end to end **and** proves idempotent. The two checks below are the minimum; the traps after them regularly look like bugs when they're correct, or look fine while silently dropping/duplicating data.

## Check 1 — one change produces exactly one row (the stream)

Change one resource on the source side (place an Order, edit a Customer), let the stream run — or, locally without Pub/Sub, POST the base64 message envelope to the streamer directly ([Test an event application locally](https://docs.commercetools.com/connect/test-applications-locally.md#test-an-event-application)) — then:

- The row appears in the destination with the mapped fields correct (localized strings, money, addresses).
- **The dedup key is present** (`resource.id` + `sequenceNumber`, or `version`) on the row — this is what makes redelivery a no-op.
- **Redeliver the same envelope** (or force a redelivery) and confirm the destination still has **one** row, not two. A second row is the tell that the warehouse-side dedup/merge key is missing ([pipeline-architecture.md](./pipeline-architecture.md)).

## Check 2 — a batch window loads idempotently

Run the backfill/gap-repair `job` over a known `lastModifiedAt` window, then **run it again over the same window**:

- The first run loads the delta; the second run **adds no new rows** (same dedup key → upsert/no-op).
- The checkpoint advanced, and a run started from the checkpoint fetches only changes since it — not the whole dataset.
- Cursor pagination reached the end of the window (no silent truncation at 10,000 rows — the sign someone used `offset`).

## The traps (behavior that looks like a bug — or hides one)

### Trap 1 — no data at all → the Subscription isn't registered
The most common "nothing is arriving": the `postDeploy` Subscription registration didn't run or failed, so no Messages are delivered. Confirm the Subscription exists (query Subscriptions), that it targets the right resource/message types, and that its destination matches the injected broker (Pub/Sub or SNS). A Subscription change takes up to a minute to take effect ([Subscriptions](https://docs.commercetools.com/api/projects/subscriptions.md)).

### Trap 2 — duplicate rows are expected without a dedup key
At-least-once delivery **and** a batch window overlapping the stream both produce the same change twice. Duplicates are not a delivery bug — they're the absence of a destination dedup/merge key. Verify by asserting the dedup key and re-running Check 1's redelivery.

### Trap 3 — empty/partial rows → `payloadNotIncluded`, re-fetch missing
Rows that arrive with missing fields (or only for small resources) mean the handler transformed from the Message payload, which is **omitted when the Message exceeds the queue size limit** (`payloadNotIncluded`). Fix: always re-fetch by `resource.id` and transform from current state ([event-applications.md](../../event-applications.md)).

### Trap 4 — the Messages query API returns nothing → it's off by default
If a batch design polls the **Messages API** and gets empty results, that's because **Messages are not persisted for querying unless the feature is enabled** in Merchant Center Developer Settings ([enable querying Messages](https://docs.commercetools.com/api/projects/messages.md#enable-querying-messages-via-the-api)). Subscriptions deliver regardless — prefer the stream, or window on the resources' `lastModifiedAt`, rather than polling Messages.

### Trap 5 — acked but never landed → silent gap
A handler that returns `2xx` even when the destination delivery failed acks the Message away with no retry — events vanish. Confirm transient destination failures return non-2xx (redelivered) and terminal ones go to a DLQ/alert, not a blanket `200` ([event-applications.md](../../event-applications.md)).

## Verification checklist

- [ ] One source change → exactly **one** destination row; dedup key present
- [ ] Redelivering the same envelope adds no second row (idempotent)
- [ ] Batch job over a window is idempotent on re-run; checkpoint advances; cursor pagination (no 10,000 cap)
- [ ] Subscription confirmed registered (right resource/types, destination matching the injected broker) when nothing arrives
- [ ] `payloadNotIncluded` handled by re-fetch (no empty/partial rows)
- [ ] Transient destination failure redelivers; terminal failure DLQ'd — not acked into a gap
- [ ] No PII or destination credentials in logs; erasure propagates to the destination (if in scope)
