---
name: observability-operations
description: Operate a Connect application in production — structured JSON logs with correlation IDs, a health endpoint, runtime feature flags, accessing deployment logs, and a poison-message / replay runbook (what happens to a repeatedly-failing message and how to recover).
when_to_use:
  - "Adding structured logging with correlation IDs to a connector"
  - "Adding a health/status endpoint"
  - "Gating connector behavior behind runtime feature flags"
  - "Writing the poison-message / dead-letter / replay runbook"
  - "Accessing or filtering Connect deployment logs"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - observability
    - operations
---

# Observability & Operations

**Impact: HIGH — Without correlation IDs and a documented poison-message runbook, a redelivery loop or a stuck message is invisible until it becomes an outage, and on-call has no recovery procedure.**

## Table of Contents
- [Pattern 1: Structured logs with correlation IDs](#pattern-1-structured-logs-with-correlation-ids)
- [Pattern 2: Health endpoint](#pattern-2-health-endpoint)
- [Pattern 3: Runtime feature flags](#pattern-3-runtime-feature-flags)
- [Pattern 4: Accessing deployment logs](#pattern-4-accessing-deployment-logs)
- [Pattern 5: Poison-message / replay runbook](#pattern-5-poison-message--replay-runbook)
- [Checklist](#checklist)

---

## Pattern 1: Structured logs with correlation IDs

JSON logs are searchable; a correlation key ties every line of one request together and back to the originating commercetools call.

```typescript
import { createApplicationLogger } from '@commercetools-backend/loggers';
export const logger = createApplicationLogger({ json: true });
```

The correlation key depends on the app type:
- **Service (extension):** the `X-Correlation-ID` request header — commercetools sets it and returns the same value to the original API caller, so logging it links your logs to the caller's. (verified: [API Extensions — Headers](https://docs.commercetools.com/api/projects/api-extensions.md))
- **Event:** `resource.id` + `sequenceNumber` (Message) or `resource.id` + `version` (Change) — the same fields used for idempotency, so a duplicate is recognizable in logs.

**INCORRECT:** `logger.info('processing')` with no identifiers, and `logger.info('Payload: ' + JSON.stringify(body))`.
*Why this fails:* you can't trace one request across lines, and dumping the full payload leaks PII.

**CORRECT — bind the correlation key, log identifiers not bodies:**
```typescript
const correlationId = req.get('x-correlation-id') ?? `${msg.resource.id}:${msg.sequenceNumber}`;
const log = logger.child({ correlationId, resourceId: msg.resource.id });
log.info({ type: msg.type }, 'processing message');     // identifiers, not the payload body
```


## Pattern 2: Health endpoint

Expose a cheap liveness route that touches no secrets and does no external work.

```typescript
router.get('/status', (_req, res) => res.status(200).json({ status: 'UP' }));
```
Keep it unauthenticated (it returns nothing sensitive) and fast. Both reference connectors expose `/status`. If you add a deeper readiness check (e.g. external dependency reachable), make it a separate route so liveness isn't coupled to a third party's uptime.

## Pattern 3: Runtime feature flags

Gate each independent behavior behind a config flag so an operator can disable one sync direction without redeploying code.

```typescript
if (readConfiguration().featOrderSyncActive !== 'true') {
  logger.info('order sync disabled by feature flag');
  return res.status(204).send();                  // still ack the message
}
```
 Note that disabling a path should still **ack** event messages (return 2xx), not drop them via non-2xx.

## Pattern 4: Accessing deployment logs

Connect surfaces application stdout/stderr; the structured JSON above makes it filterable. Retrieve logs via the Connect CLI `deployment logs` command (supports filtering by application and date range) or the Merchant Center (verified: [Connect overview](https://docs.commercetools.com/connect/overview.md) → deploy/monitor; [Connect CLI](https://docs.commercetools.com/connect/cli.md)). Because logs are your primary runtime window, log decisions ("skipped: unchanged hash", "already synced", "permanently unprocessable") explicitly, with the correlation key.

## Pattern 5: Poison-message / replay runbook

A message that always fails ("poison") must not loop forever, and operators need a recovery path. Decide and **document in the connector README**:

- **Detection:** what does a poison message look like in logs (repeated correlation key, rising delivery count)? Set an alert on the Subscription health and/or a retry-count threshold.
- **Containment:** on a terminal (non-retryable) error, ack (2xx) and route the message to a dead-letter store — a Custom Object, a DLQ on your queue, or a logged record — rather than returning non-2xx and looping. Recall the Subscription retries a `TemporaryError` for up to **48 hours** before dropping the message (verified: [Subscriptions — Delivery](https://docs.commercetools.com/api/projects/subscriptions.md)) — so a true poison message left un-acked wastes retries for 48 hours and then silently vanishes.
- **Replay:** how does an operator reprocess after a fix? Because handlers re-fetch by ID and are idempotent, replay is usually "re-emit the resource id" — e.g. a small `job` or admin route that re-runs processing for a given `resource.id` from the dead-letter store.

State the chosen DLQ mechanism, the alert, and the replay procedure explicitly; "we retry forever" is not a runbook.

---

## Checklist
- [ ] Logs are structured JSON and carry a correlation key on every line (`X-Correlation-ID` for service; `resource.id`+`sequenceNumber`/`version` for event)
- [ ] Request bodies/PII are not logged — identifiers only
- [ ] A fast, unauthenticated `/status` liveness endpoint exists
- [ ] Independent behaviors are gated behind runtime feature flags; disabling a path still acks messages
- [ ] Poison-message detection, containment (DLQ/ack), and replay procedure documented in the README
- [ ] Subscription health alerting recommended for production-critical connectors

**Next:** [testing.md](./testing.md) · [deployment-installation.md](./deployment-installation.md)
