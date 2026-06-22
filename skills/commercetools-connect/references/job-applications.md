---
name: job-applications
description: Build production-ready job (scheduled / on-demand batch) Connect applications. Covers the cron schedule, the 30-minute timeout, self-managed concurrency and locking, checkpointing for restart-safety, and stateless idempotency.
when_to_use:
  - "Building a scheduled or on-demand batch Connect application"
  - "Setting or overriding a job's cron schedule"
  - "Preventing overlapping job runs (concurrency / locking)"
  - "Making a long batch job restart-safe with checkpoints"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - job
---

# Job Applications (Scheduled / On-Demand Batch)

**Impact: HIGH — Jobs have a hard 30-minute timeout and no concurrency guard. A job that ignores either silently truncates work or double-processes when a slow run overlaps the next schedule.**

A `job` application runs on a cron schedule (or on-demand) against a Connect-provisioned scheduler. Use it for lightweight reconciliation and cleanup — work that isn't triggered by a single event or API call.

**Not for heavy bulk/batch processing.** A job container is capped at **2 CPU / 4 GB** ([Connect best practices](https://docs.commercetools.com/connect/best-practices)), and commercetools explicitly advises against using job applications for "bulk or batch operations that demand more extensive processing or high memory." Bulk import/export is fine only when it's small and low-complexity (modest record counts, streaming rather than buffering, no large in-memory aggregation). For memory- or CPU-intensive bulk work, offload to a dedicated pipeline or external batch service and have the job orchestrate or trigger it instead of doing the heavy processing in-container.

## Table of Contents
- [Contract facts (verified)](#contract-facts-verified)
- [Pattern 1: Schedule](#pattern-1-schedule)
- [Pattern 2: Self-managed concurrency](#pattern-2-self-managed-concurrency)
- [Pattern 3: Restart-safe checkpointing within the timeout](#pattern-3-restart-safe-checkpointing-within-the-timeout)
- [Pattern 4: Stateless idempotency per unit of work](#pattern-4-stateless-idempotency-per-unit-of-work)
- [Checklist](#checklist)

---

## Contract facts (verified)

From [Connect — deployment information](https://docs.commercetools.com/connect/overview.md) and the [connect.yaml reference](https://docs.commercetools.com/connect/development.md):

- **Cron-scheduled.** `properties.schedule` in `connect.yaml` sets the default cron expression; it can be overridden per deployment via the `schedule` field of the deployment configuration.
- **Application request times out after 30 minutes.** Work that can't finish in one run must checkpoint and resume.
- **No concurrency guard.** Connect does not prevent a new scheduled run from starting while a previous one is still going. You own mutual exclusion.
- **Isolated container, no shared filesystem.** Persist any cross-run state externally (Custom Object / DB / cache).

## Pattern 1: Schedule

```yaml
deployAs:
  - name: nightly-reconcile
    applicationType: job
    endpoint: /job
    properties:
      schedule: '0 1 * * *'      # 01:00 daily; standard 5-field cron
```
Pick a cadence with headroom: if a run can take 20 minutes, don't schedule it every 15. The schedule is a *default* — an installer can override it per deployment, so document the assumed cadence in the README.

## Pattern 2: Self-managed concurrency

Because Connect won't stop overlapping runs, a long run colliding with the next tick can double-process.

**INCORRECT:** assume runs never overlap and mutate shared resources directly.
*Why this fails:* a run that exceeds its interval (or a manual trigger during a scheduled run) processes the same records twice.

**CORRECT — take a durable lock with a TTL:**
```typescript
// lock stored in a commercetools Custom Object (or your DB)
async function withJobLock(run: () => Promise<void>) {
  const lock = await tryAcquireLock('nightly-reconcile', { ttlMinutes: 35 }); // > job timeout
  if (!lock) { logger.warn('previous run still active; skipping'); return; }
  try { await run(); } finally { await releaseLock(lock); }
}
```
Set the TTL longer than the 30-minute timeout so a crashed run's lock eventually expires instead of wedging the job forever.

## Pattern 3: Restart-safe checkpointing within the timeout

A batch larger than 30 minutes of work must persist progress and resume next run.

```typescript
let cursor = await loadCursor('nightly-reconcile');      // e.g. lastProcessedId / page token
const deadline = Date.now() + 25 * 60_000;               // stop with margin before the 30-min limit
while (cursor && Date.now() < deadline) {
  const batch = await fetchPage(cursor);
  await processBatch(batch);                              // idempotent per item (Pattern 4)
  cursor = batch.nextCursor;
  await saveCursor('nightly-reconcile', cursor);          // checkpoint after each page
}
```
Checkpoint frequently so a timeout or crash loses at most one page, and resume from the saved cursor on the next run.

## Pattern 4: Stateless idempotency per unit of work

Re-running (after a timeout, retry, or overlap-skip) must not corrupt data. Make each unit of work idempotent **without a dedup store** — upsert by a stable key, check-before-create, or compare-and-set against live state — exactly as for event handlers ([event-applications.md](./event-applications.md), Pattern 4).

---

## Checklist
- [ ] `properties.schedule` set with headroom over the expected run time; assumed cadence documented in the README
- [ ] Overlap protection via a durable lock with a TTL longer than the 30-minute timeout
- [ ] Long batches checkpoint a cursor and stop before the 30-minute deadline, resuming next run
- [ ] Each unit of work is idempotent statelessly (upsert / check-before-create / compare-and-set) — no dedup store
- [ ] Structured logs include a per-run id → [observability-operations.md](./observability-operations.md)

**Next:** [lifecycle-scripts.md](./lifecycle-scripts.md) · [observability-operations.md](./observability-operations.md)
