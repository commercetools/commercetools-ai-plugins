---
name: commercetools-extensibility
description: Platform extension primitives — Subscriptions (Message and Change subscriptions to SQS, Pub/Sub, EventGrid, EventBridge), API Extensions (sync/async, timeout constraints), Import API mechanics, and event consumption architecture patterns. Use when the question is about how to extend or react to the platform via its built-in mechanisms.
when_to_use:
  - "Subscriptions: SQS, Pub/Sub, EventGrid, EventBridge — at-least-once delivery, idempotency"
  - "Message subscriptions vs Change subscriptions — when to use each"
  - "API Extensions: sync vs async, 2s/10s timeout limits, extension lifecycle"
  - "Event consumption architecture: DMZ Pattern, Polling Pattern, ChangeSubscription Pattern"
  - "Import API: operation types, batch size, status polling, ordering guarantees"
  - "Triggering side-effects on cart/order/customer events"
  - "Subscription-based sync pipelines for external search, OMS, ERP"
metadata:
  contentType: SKILL
  area:
    - platform
    - integration
---

# commercetools Extensibility

Platform extension primitives for reacting to and extending commercetools. Covers the three core mechanisms — Subscriptions, API Extensions, and Import API — plus the architectural patterns for consuming events at scale.

## Key Takeaways

**Three architectural patterns for event consumption: DMZ, Polling, and ChangeSubscription.** The DMZ Pattern sends push subscriptions to a public-facing queue into your VPC. The Polling Pattern queries Messages or Orders API on a schedule — production-proven at 10k–100k+ orders/day. The ChangeSubscription Pattern pushes minimal payloads (no PII/PHI) and the listener fetches full resource details on demand.

**Subscriptions are at-least-once delivery — build idempotent handlers.** Use `sequenceNumber` or `resourceVersion` to detect and skip duplicates. Never assume a message is delivered exactly once.

**Message subscriptions deliver rich payloads; Change subscriptions deliver minimal change notifications.** Message subscriptions (e.g., `OrderCreated`, `ProductPublished`) include the full resource snapshot. Change subscriptions push a minimal payload indicating a resource changed — the listener must fetch the current state. Use Change subscriptions when you don't need PII/PHI in the queue.

**API Extension timeout limits are hard: 2 seconds for synchronous, 10 seconds for asynchronous.** If your extension exceeds the timeout, the entire originating API call fails and the customer sees an error. Design synchronous extensions to respond within 1 second. For anything that might be slow, use a pre-call cache or move logic to a subscription-based async flow.

**The Import API is async by design — design for eventual consistency.** Import operations are placed into a container and processed asynchronously. There is no ordering guarantee even within a single container. For sequential updates, poll for completion before sending the next batch.

**`productDraftImport` replaces the whole product.** Any field not included in the draft (attributes, variants, prices, images) is deleted. Use `productVariantPatch` for targeted attribute updates on existing products.

**For 15M customer records: 5 containers × 200K records, batches of 20, 60s interval.** The proven Import API pattern for massive initial loads. Each container processes 200K records in ~30–40 min → ~1M customers/hour → 15M in 7–9 hours. Validate in Dev first and notify CS/support before production runs.

**GraphQL does not support Import API or Subscriptions.** These capabilities are REST-only. Use the REST API or the TypeScript SDK's Import API client for these operations.

---

## Reference Index

| Topic | Reference | Source |
|-------|-----------|--------|
| API Extensions — timeout limits, sync vs async, Extension design, retry behavior | [references/api-extensions.md](references/api-extensions.md) | CSEA: "API Extensions" |
| Subscriptions — Message vs Change subscription, SQS/Pub-Sub/EventBridge targets, idempotency | [references/subscriptions.md](references/subscriptions.md) | CSEA: "Change Subscription vs Message subscription" |
| Subscription implementation patterns — DMZ Pattern, Polling Pattern, ChangeSubscription Pattern | [references/subscription-patterns.md](references/subscription-patterns.md) | ES: Additional Subscription Implementation Patterns deck |
| Import API — containers, batching, async processing, ordering guarantee, delta imports | [references/import-api.md](references/import-api.md) | CSEA: "Import API" |
| Import API performance — 15M record pattern, container count, batch size, timing | [references/import-performance.md](references/import-performance.md) | CSEA: "Import API" |
| Data flows — subscriptions overview, API Extensions, Import API vs REST, PIM/OMS/ERP integration patterns, version conflict handling, delta sync | [references/data-flows.md](references/data-flows.md) | ES: "Data Flows" deck |

---

## Priority Tiers

### CRITICAL

- **API Extension timeouts are fatal.** A 2-second (sync) or 10-second (async) breach causes the originating API call to fail. Design extensions to respond within 1 second for synchronous flows.
- **Subscriptions are at-least-once delivery — build idempotent handlers.** Use `sequenceNumber` or `resourceVersion` to detect and skip duplicates.
- **Import API has no ordering guarantee.** If you must update a resource twice, poll the first operation's status before submitting the second.
- **`productDraftImport` is destructive.** Any field not included in the draft is deleted. Use `productVariantPatch` for targeted updates.
- **Version conflicts (409 ConcurrentModification) require retry with the latest version.** Do NOT use the version from the failed request.

### HIGH

- **Batch size for Import API is max 20 operations per request.** Sending more than 20 in a single `importOperations` array will be rejected or silently truncated. Always chunk.
- **For external search, subscribe to both product and standalone price messages.** `ProductPublished` does not include standalone price changes — subscribe separately to `StandalonePriceCreated/Changed/Deleted`.
- **Change subscriptions push minimal payloads — the listener must fetch full resource state.** Never assume the change subscription payload contains current field values.
- **For anything that might be slow in an API Extension, move it out of the sync path.** Use a pre-call cache or a subscription-based async flow for operations that risk exceeding the 2s timeout.

### MEDIUM

- **For the DMZ Pattern, ensure your public-facing queue endpoint is secured.** Use HMAC signatures or IP allowlisting on the queue endpoint that receives CT push subscriptions.
- **The Polling Pattern is production-proven for high-volume order processing.** Use `where=lastModifiedAt > "<timestamp>"` + `sort=lastModifiedAt asc` for efficient incremental polling.
- **For large imports (>1M records), notify CS/support in advance.** CT support needs visibility on large load events to proactively monitor platform health.
- **For peak events, test Import API throughput in staging before production load.** The 5-container pattern (see Import API performance reference) is the validated approach for massive initial loads.
