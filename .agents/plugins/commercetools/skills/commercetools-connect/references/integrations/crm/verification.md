---
name: crm-verification
description: Verify a CRM connector round trip — counterpart record linked by externalId, a delta propagates exactly once, deletion propagates — and the traps that look like bugs but aren't (sync loops, rate-limit throttling, sandbox quirks). The CRM sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - crm
    - connect
---

# Verify the CRM round trip

Don't declare done until a customer flows end to end **and** you've proven it doesn't loop. The three checks below are the minimum; the traps after them regularly look broken when they're actually correct (or look fine when they're actually looping).

## Check 1 — the counterpart record appears, linked by `externalId`

Create a Customer in commercetools (outbound) or in the CRM (inbound), let the sync run (or, locally without Pub/Sub, POST the base64 message envelope to the syncer directly), then:

- The counterpart record exists in the destination (a Contact in the CRM, or a Customer in commercetools).
- **The link is set:** the commercetools Customer's `externalId` (or Custom Field) holds the CRM record id — this is what makes the *next* change an update, not a duplicate. A record that appears with **no `externalId` written back** is the tell that the upsert-and-link step is missing; the next sync will create a duplicate.
- The mapped fields match (localized names, address, consent flags).

## Check 2 — a delta propagates exactly once (no loop)

Update one field (e.g. last name) on the mastering side and watch the other side:

- The change appears on the counterpart — **once**.
- No **duplicate** record is created (proves upsert-by-`externalId`, not create).
- **Watch for a loop.** In a bi-directional setup, a missing self-change filter shows up as a burst of writes ping-ponging between the systems (rising API call counts, version numbers climbing on their own). One update should produce one write per direction and then stop. If it doesn't, the self-change filter is missing ([crm-contract.md](./crm-contract.md)).

## Check 3 — deletion / anonymization propagates (if in scope)

Delete or anonymize the Customer and confirm the CRM record is deleted or anonymized (no orphaned PII). Confirm the syncer acked the `CustomerDeleted`/`ResourceDeleted` event.

## The traps (behavior that looks like a bug — or hides one)

### Trap 1 — the sync loop (looks fine at first, then floods)

A bi-directional sync with no self-change filter passes Check 1 and *seems* to work, then floods both systems with writes because each side's write re-triggers the other. Verify by making **one** change and confirming the write count settles. The durable fix is one-way sync; if bi-directional is required, assert the self-change filter with a test, not just by eyeballing.

### Trap 2 — rate-limit throttling looks like "sync stopped"

CRMs rate-limit aggressively. A migration or a burst of events that suddenly stops landing records is usually `429` throttling, not a logic bug — check for backoff/retry and batch endpoints ([crm-contract.md](./crm-contract.md)), and confirm the job resumes from its checkpoint rather than restarting.

### Trap 3 — sandbox data quirks

CRM sandboxes may cap records, expire data, or return canned responses. Verify the **contract** (upsert, idempotency, mapping, ack) against the sandbox; verify **real persistence and visibility** against a controlled production/full-sandbox account, and clean up test records afterward so they don't pollute the CRM.

## Verification checklist

- [ ] Counterpart record created **and** `externalId` written back (link established)
- [ ] A field update propagates once; no duplicate record created
- [ ] One change settles to one write per direction (no loop) — asserted, not just observed
- [ ] Deletion/anonymization propagates; no orphaned PII (if in scope)
- [ ] No PII or CRM token in logs
- [ ] Migration resumes from checkpoint; respects rate limits (batch + backoff)
