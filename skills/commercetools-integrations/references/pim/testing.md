---
name: pim-testing
description: Test a PIM connector in two layers — pure mapping unit tests (no credentials), then a guarded live sync run against a sandbox project only. Includes a mandatory pre-flight item count that warns and gates on large catalogs, sandbox-only credential loading from .env (never production), and an idempotency re-run.
when_to_use:
  - "Testing a PIM connector's mapping and running a real sync safely"
  - "Running a first sync against a project without risking a large or production catalog"
  - "Counting how many items a sync will touch before running it"
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - pim
    - connect
    - testing
---

# Testing a PIM sync

Two layers, and the order matters. **Layer 1** — pure mapping unit tests — runs on every commit, needs no credentials, and owns the edge cases. **Layer 2** — a guarded live sync run — proves the wiring against a **sandbox** project and is where the catalog-size and credential guards live. Never run Layer 2 before Layer 1 is green: a live run over a broken mapping just writes broken products into a real project.

## Layer 1 — Mapping unit tests (no credentials, every commit)

The mapping from [data-mapping.md](./data-mapping.md) is pure input→output: a PIM record in, a commercetools draft out. Test it directly with fixtures — no network, no secrets. Cover the cases that silently corrupt a catalog:

- Locale mapping (`en_US` → `en-US`); an out-of-scope locale is dropped, not passed through.
- Enum keyed on the option **code**, not a localized label.
- Measurement units normalized to one unit.
- Keys derived from stable PIM ids (Principle 7) — the same input yields the same key every time (this is what makes the sync idempotent).
- Category/product references emitted **by key**.
- Attributes not in scope are omitted (Principle 1), not sent as `null`.

The connector's inbound webhook (the `service` app) is tested at the router level — auth-rejection matrix, malformed-payload handling, duplicate-delivery idempotency — using the commercetools-connect skill's [testing.md](../../../commercetools-connect/references/testing.md). This file adds only the PIM-specific live-run layer.

### Testing the inbound webhook locally (no live PIM needed)

The PIM calls your `service` endpoint (see [build-connector.md](./build-connector.md#webhooks-which-way-they-point)); you can exercise that whole path locally without the PIM reaching you:

- **Replay a captured event.** Save a real PIM event payload as a fixture and POST it at the router with `supertest` (unit) or at a locally-running connector (`commercetools connect application dev` / the generated local server) with `curl`. This covers signature verification, mapping, and idempotency — mock the commercetools side with `msw`, or point at a **sandbox** for a real write.
- **Signature check with the sample secret.** Compute the PIM's HMAC over the fixture body using a test secret and send it in the expected header — assert a valid signature is accepted and a tampered/missing one is rejected (401/403). No PIM involved.
- **Duplicate delivery.** POST the same event twice and assert the second is a no-op (upsert by key).
- **Only for true end-to-end** — having a hosted SaaS PIM actually deliver to your machine — expose the local endpoint through a public tunnel so the PIM can reach a public URL, and register that URL as the PIM's webhook target. For everyday testing, replay is faster and needs no tunnel or PIM account.

The outbound side is not a webhook — it's commercetools API calls, covered by the guarded sync run below (sandbox only).

## Layer 2 — A guarded live sync run (SANDBOX ONLY)

A sync **writes** data — it creates and updates Products, Categories, and Product Types. So a live run is only ever pointed at a **throwaway sandbox project you own**, never production. Three guards make this safe; do not skip any.

### Guard 1 — Sandbox credentials only, from .env, never production

- Load credentials from a **`.env` that is gitignored** and holds **sandbox** values only. Never put production credentials in it, never commit it, never echo it to logs.
- Require an **explicit opt-in marker** (e.g. `CT_ENV=sandbox`) and **refuse to run without it** — an accidental run should fail closed, not touch a project. Optionally pin an allowlist of permitted sandbox project keys and refuse any key not on it.
- Use a **least-privilege** API client for the sandbox (`manage_products`, `manage_categories`, `manage_product_types` — not `manage_project`), so even a misfire is bounded → [security.md](../../../commercetools-connect/references/security.md).

```ts
// support/sandbox.ts — fail closed if this doesn't look like an explicit sandbox
import 'dotenv/config';

export function loadSandboxConfig() {
  const { CT_ENV, CTP_PROJECT_KEY, CTP_CLIENT_ID, CTP_CLIENT_SECRET, PIM_BASE_URL } = process.env;
  if (!CTP_PROJECT_KEY || !CTP_CLIENT_ID || !CTP_CLIENT_SECRET) return null;   // → skip loudly (unconfigured)
  if (CT_ENV !== 'sandbox') {
    throw new Error('Refusing to run a live sync: set CT_ENV=sandbox to confirm a throwaway project. Never use production credentials.');
  }
  const allow = (process.env.SANDBOX_PROJECT_ALLOWLIST ?? '').split(',').filter(Boolean);
  if (allow.length && !allow.includes(CTP_PROJECT_KEY)) {
    throw new Error(`Project '${CTP_PROJECT_KEY}' is not in SANDBOX_PROJECT_ALLOWLIST — aborting.`);
  }
  return { projectKey: CTP_PROJECT_KEY, clientId: CTP_CLIENT_ID, clientSecret: CTP_CLIENT_SECRET, pimBaseUrl: PIM_BASE_URL };
}
```

### Guard 2 — Pre-flight count, and gate on large catalogs

**Before syncing anything, find out how big the run is.** A first sync that blindly pulls a full PIM export can be tens or hundreds of thousands of products — slow, expensive, and hard to undo in a shared sandbox. So count first, warn, and require an explicit decision above a threshold. Count from the *source* (the PIM's total, or the delta set for an incremental run) — that's what the sync will actually touch:

```ts
const SYNC_WARN_AT = 500;          // warn + require confirmation above this
const SAMPLE_SIZE  = 25;           // default bounded first run

export async function preflight(cfg, { confirmedLarge = false, limit = SAMPLE_SIZE } = {}) {
  const total = await countSourceItems(cfg);                 // PIM total, or the incremental delta count
  console.warn(`[pim-sync] pre-flight: ${total} source items would be in scope.`);
  if (total > SYNC_WARN_AT && !confirmedLarge) {
    throw new Error(
      `Large catalog: ${total} items exceeds the ${SYNC_WARN_AT} warn threshold. ` +
      `Re-run with an explicit limit (e.g. --limit ${SAMPLE_SIZE}) for a sample, ` +
      `or pass confirmedLarge to sync the full set deliberately.`);
  }
  return Math.min(total, limit ?? total);                    // the count this run will actually process
}
```

Guidance to give the user with the count:
- **Default to a bounded sample** (a handful to a few dozen products) for the first run — enough to prove the mapping and wiring, cheap to inspect and clean up.
- **Only sync the full catalog deliberately**, and prefer the **Import API** for it (async, bulk, up to 20 resources/request, [reference resolution](https://docs.commercetools.com/api/import-export/overview.md#reference-resolution)) over per-item HTTP calls — see [build-connector.md](./build-connector.md). Mind [Import API best practices](https://docs.commercetools.com/api/import-export/best-practices.md) for batching and rate limits.
- If the source can't give an exact total cheaply, at least bound the run with a hard `limit` — never let a test run unbounded.

### Guard 3 — Assert the trace, then re-run to prove idempotency

Run the bounded sync, then assert commercetools received the mapped data — and run it **again** to prove a re-run is a no-op (the idempotency backbone from [data-mapping.md](./data-mapping.md) Principle 7). For a bulk (Import API) path, **poll the [Import Container](https://docs.commercetools.com/api/import-export/import-container.md) to a terminal state and inspect rejects** — reference resolution succeeding is *not* the same as the data being valid.

```ts
import { describe, it, expect } from 'vitest';
const cfg = loadSandboxConfig();
const itLive = cfg ? it : it.skip;          // skip LOUDLY when unconfigured — never a silent pass

async function until(fn, ok, { tries = 30, gapMs = 2000 } = {}) {
  for (let i = 0; i < tries; i++) { const v = await fn(); if (ok(v)) return v; await new Promise(r => setTimeout(r, gapMs)); }
  throw new Error('import did not reach a terminal state in time');
}

describe('PIM sync (sandbox, bounded)', () => {
  itLive('syncs a sample and is idempotent on re-run', async () => {
    const count = await preflight(cfg, { limit: 25 });        // Guard 2 gates large catalogs here
    const sample = await fetchSourceSample(cfg, count);

    const first = await runSync(cfg, sample);
    // bulk path: wait for a real terminal state — no operations still in flight.
    // include waitForMasterVariant, or a product awaiting its master variant lets the poll return early.
    const summary = await until(() => getImportSummary(cfg, first.containerKey),
      s => s.unresolved === 0 && s.processing === 0 && s.waitForMasterVariant === 0);
    expect(summary.rejected, JSON.stringify(summary.errors)).toBe(0);
    expect(summary.validationFailed).toBe(0);

    // assert the CT trace for a known sample product
    const p = await getProductByKey(cfg, sample[0].expectedKey);
    expect(p).toBeTruthy();
    expect(p.masterData.staged.name['en-US']).toBe(sample[0].expectedName);
    expect(p.masterData.staged.categories.length).toBeGreaterThan(0);

    // re-run the same sample → no new products, versions unchanged where content is unchanged
    const beforeCount = await countProducts(cfg);
    await runSync(cfg, sample);
    expect(await countProducts(cfg)).toBe(beforeCount);        // upsert, not duplicate-create
  }, 180_000);   // generous: bulk import + polling
});
```

### Clean up

A sandbox accumulates test products. Either run against a **disposable** sandbox you can reset, or delete the products/categories the test created (by their deterministic keys) in an `afterAll`. Never leave a shared sandbox full of half-synced fixtures.

## Checklist

> **Gate: Layer 1 (mapping unit tests) green before any live run.**

- [ ] Mapping unit tests cover locale mapping, enum-by-code, unit normalization, stable keys, by-key references, out-of-scope omission — no credentials needed
- [ ] Webhook `service` tested at the router level (auth matrix, malformed payload, duplicate delivery) → [testing.md](../../../commercetools-connect/references/testing.md)
- [ ] **Sandbox only**: credentials loaded from a gitignored `.env`; run **fails closed** without an explicit `CT_ENV=sandbox` marker; **no production credentials ever used**
- [ ] Least-privilege sandbox API client (not `manage_project`)
- [ ] **Pre-flight count runs first**; warns above a threshold and **refuses a large full sync without explicit confirmation**; every run is bounded by a `limit`
- [ ] First run is a small bounded sample; full-catalog runs are deliberate and use the Import API
- [ ] Live run asserts the CT trace (product by key, mapped localized name, category assignment); bulk imports polled to terminal state with `rejected`/`validationFailed` inspected
- [ ] **Idempotency re-run** proves a repeat sync is a no-op (no duplicate products)
- [ ] Skips **loudly** when unconfigured; runs in a dedicated job, not every commit
- [ ] Test fixtures cleaned up (disposable sandbox or delete-by-key in teardown)
