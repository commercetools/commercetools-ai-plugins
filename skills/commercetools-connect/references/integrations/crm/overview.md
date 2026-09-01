---
name: crm-integration-overview
description: Integrate an external CRM (Salesforce, HubSpot, Dynamics 365, Zoho, …) into commercetools via a Connect connector — the sync workflow (requirements → is-a-public-connector-enough → config → build the sync apps). The CRM sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - customers
    - crm
    - connect
---

# CRM connector — integrate an external CRM (customer-sync-focused)

This is the **CRM integration sub-area** of [commercetools-connect](../../../SKILL.md): you need to keep customer (and often order) data in sync between commercetools and an external CRM, and you'll do it with a Connect connector. For the deep, type-agnostic build/publish/certify lifecycle and the production-readiness gate, that's the parent connect skill; this sub-area owns the CRM-specific shape end to end — from "is there a connector already?" through configuring, forking, or building one for a CRM you define.

A CRM integration is **not a fixed set of apps** the way tax or payment is. Its shape falls out of **two decisions you must make first** — direction and source of truth — and it is fundamentally **asynchronous**: syncing a customer profile must never block or fail a registration or checkout. Unlike a tax calculator, **nothing here runs synchronously on the cart hot path.**

> **The mistake to internalize first: pick direction and source of truth before anything else.** Almost every CRM-integration failure — duplicated contacts, overwritten edits, infinite sync loops — traces back to not having decided *who masters customer data* and *which way it flows*. commercetools' own [integration guidance](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md) is explicit: pick a single source of truth per data domain, and **avoid bi-directional syncs** — they carry real conflict and loop risk.

## The three shapes (by direction)

| Direction | Source of truth | Connect app(s) | Trigger |
|---|---|---|---|
| **commercetools → CRM** (push customers/orders out) | commercetools masters | **`event`** app(s) — the *broadcasting events* pattern | a **ChangeSubscription** on `customer` (all changes) or specific Customer **messages**; `OrderCreated`; … |
| **CRM → commercetools** (pull profiles/segments in) | CRM masters | **`service`** inbound webhook *or* **`job`** poll | CRM pushes a webhook, or a schedule polls the CRM for deltas |
| **Initial migration** (one-time bulk load) | either | **`job`** | On-demand / scheduled; separate from the ongoing sync |

Most real integrations combine an **ongoing** shape (event or webhook/poll) with a **one-time migration** job — the docs [recommend separating them](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md), because bulk backfill and delta sync need different tools. When the CRM is the master, the canonical setup is **one-way CRM → commercetools**, with a Customer created in commercetools anyway (it owns permissions, Cart/Order ownership, and promotions) and linked back to the CRM record. See [config-from-requirements.md](./config-from-requirements.md).

## Workflow

When integrating a CRM, follow these steps in order. The heart is **Step 1 → Step 1.5 → Step 2 → Step 4** (requirements → is a public connector enough? → config → build the sync apps).

### Step 0 — Gather context (required, run first)

The mandatory grounding step: pull the latest verified documentation as context for you (the agent). Use the parent connect skill's docs-search script with CRM-focused terms. **Do not skip it, and do not replace it with another tool**:

```bash
node scripts/docs-search.mjs \
  --query "<CRM terms from the user's request, e.g. 'CRM customer sync subscription CustomerCreated externalId integration patterns'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-connect" \
  --limit 10
```

(Run it from the `commercetools-connect` skill root.) Use its output as primary grounding. You *may additionally* use the commercetools Knowledge MCP or the [integration planning and patterns](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md) guide for deeper follow-up.

### Step 1 — Extract requirements (before any config or code)

CRM behavior is downstream of business facts, and the wrong default silently produces duplicated contacts, stale data, or a sync loop. Extract these first; each maps to a config key in Step 2, a rung in Step 1.5, or a rule in the [contract](./crm-contract.md). Ask the user (don't assume):

1. **Which CRM, and do they have API access?** Salesforce, HubSpot, Dynamics 365, Zoho, or another. Account, API credentials/OAuth app, sandbox vs production, and its rate limits.
2. **Direction and source of truth?** commercetools → CRM, CRM → commercetools, or (discouraged) both. **Who masters customer data?** This is the single most consequential answer — it decides the app shape and which side's write wins on conflict.
3. **Which entities, and mapped to which CRM objects?** commercetools **Customer** → CRM Contact/Lead/Person; **Order** → CRM Deal/Opportunity/Sales record; Cart → (rarely). Which fields on each side, and how localized names/addresses map.
4. **Ongoing sync, initial migration, or both?** A one-time backfill of existing customers is a `job`; ongoing delta sync is an `event` or webhook/poll — usually both, built separately.
5. **Which events trigger an outbound sync?** Creation only, or every customer change and `OrderCreated` too? This maps to the two Subscription flavors: a **ChangeSubscription** on the `customer` resource fires on *all* changes (`ResourceCreated`/`ResourceUpdated`/`ResourceDeleted`); **MessageSubscriptions** target specific Customer messages (`CustomerCreated`, `CustomerEmailChanged`, `CustomerAddressAdded`, `CustomerFirstNameSet`, `CustomerDeleted`, …) when only certain changes matter. → decides which Subscriptions the connector registers.
6. **Deletion / GDPR / consent?** Must a `CustomerDeleted` (or anonymize/erasure request) propagate to delete or anonymize the CRM record? Are there marketing-consent flags to carry? Customer data is **PII** — this is not optional to think about.
7. **Volume and latency?** Near-real-time (event/webhook) vs batch (nightly job); expected record counts (drives rate-limit and pagination handling). The docs frame the [batch-vs-broadcast choice](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md) on exactly these axes.
8. **Anything special or non-standard? (always ask — open-ended)** Multi-brand/multi-store contact separation, B2B accounts/company hierarchies, loyalty tiers or segments flowing *in*, double-opt-in, region/data-residency. Capture each as its own requirement line; **don't force it into a slot above.**

Write these as a short requirements block and **confirm with the user** before deriving config. If the user surfaces nothing special, a sane default is: CRM as master where it exists, **one-way** sync, Customer↔CRM-record linked by **`externalId`**, ongoing delta via events (or webhook), a separate migration job, deletion propagated — and say so explicitly.

### Step 1.5 — Is a public connector enough? (decide before wiring or building)

With the requirements in hand, answer the question the rest of the flow assumes: **does a connector that already does this exist for this CRM?** Don't answer from memory — the marketplace changes. Check **live** data (the Connect marketplace + the integration docs, via the `docs-search` script / Knowledge MCP), and **name the connector + version** you checked.

The CRM landscape differs sharply from tax: **classic CRMs (Salesforce, HubSpot, Dynamics, Zoho) generally have no certified commercetools connector** — the marketplace leans toward marketing/CDP/personalization platforms (Klaviyo, Bloomreach, Mailchimp, …). So a request to "integrate Salesforce/HubSpot" is usually a **build** job, not a marketplace install. There is also **no `crm-integration` template** — you scaffold plain apps and adapt. See [connector-selection.md](./connector-selection.md).

Then walk the **ladder** — stop at the first rung that fits, because each later one is more to build and maintain:

1. **Public connector covers everything** → install + configure (Step 2). Don't build. Installing it (CLI auth, scopes, `deployment create`) is the parent skill's [deployment-installation.md](../../deployment-installation.md); it is **not** the `connectorstaged` flow.
2. **A public connector exists, gap looks like a capability** → prove it isn't **config** first. Field mapping, which events sync, and consent handling are often connector settings → back to rung 1. See [config-from-requirements.md](./config-from-requirements.md).
3. **A public connector exists with a genuine gap config can't close, and it's open source** → **fork/extend it**; add only the delta and deploy as an Organization connector. Don't rebuild a working connector. Hand off to [commercetools-connect](../../../SKILL.md) for the build/publish lifecycle.
4. **No public connector for the CRM (the common case — Salesforce, HubSpot, Dynamics, Zoho, or any CRM the user defines)** → **build it.** There is no CRM template, so scaffold plain `event`/`service`/`job` apps (or start from the closest outbound template — `transactional-emails` or `product-export` — and adapt; there is no inbound template). You implement the CRM API calls and the mapping. The exact contract and gotchas are in [crm-contract.md](./crm-contract.md).

**Ask the user to choose the rung explicitly** once you have the live landscape — "install the public connector as-is", "fork it", and "build the sync apps for our CRM" are materially different amounts of work, so give your recommendation and its reasoning, then let them decide. Record the decision, the rung, and the version in the requirements block.

### Step 2 — Derive the config from the requirements

Translate the Step 1 answers into concrete `connect.yaml` values (for the chosen connector or your own), with a one-line **why** for each. The full mapping is in [config-from-requirements.md](./config-from-requirements.md). Key decisions that live here:

- **App composition from direction** — which `event`/`service`/`job` apps you deploy, per the table above.
- **Least-privilege API-client scopes** via `inheritAs.apiClient.scopes` — outbound needs read scopes (`view_customers`, `view_orders`) + `manage_subscriptions`; inbound needs `manage_customers`. Don't hand-supply a `manage_project` admin client.
- **Secrets in `securedConfiguration`** — the CRM API token / OAuth client secret is `securedConfiguration`, never `standardConfiguration`, never hardcoded. This is customer-PII-adjacent; treat it accordingly.
- **The linking model** — store the CRM record id in the Customer's **`externalId`** (or a Custom Field), and hold CRM-only attributes in **Custom Fields marked read-only** when the CRM is master.

### Step 3 — Price the async contract (reference)

CRM sync inherits the parent skill's async contracts. Restate them in one sentence each before coding: **idempotency** (upsert by a stable `externalId`, never blind-create), **at-least-once with no ordering** (re-fetch the resource by id; don't apply deltas from a possibly-stale payload), and **loop avoidance** if bi-directional (a CRM-originated write must not re-trigger an outbound sync). Full contract: [crm-contract.md](./crm-contract.md).

### Step 4 — Build/verify the sync apps (the main body of work), test-first

**Tests come before implementation.** The rules that make a CRM integration correct — upsert-not-create keyed on `externalId`, re-fetch by id, ack semantics on the event endpoint, self-change filtering, deletion propagation — are invisible at the call site and tedious to reproduce by hand. Each is one cheap assertion. Write the test first.

Read [crm-contract.md](./crm-contract.md) and build, in order — **test first for each** — only the apps your direction requires:

1. **Outbound syncer(s)** (`event`) — on a customer change (ChangeSubscription `ResourceUpdated`/`ResourceCreated`, or specific Customer messages) or `OrderCreated`, re-fetch the resource by id, map it to the CRM's object model, **upsert** by `externalId` (idempotent), write the CRM id back to the Customer, ack correctly.
2. **Inbound app** (`service` webhook or `job` poll) — authenticate the caller (webhook) or page the CRM (job); **upsert the Customer by `externalId`**; set CRM-mastered fields read-only; be idempotent.
3. **Migration job** (`job`) — page the source in bulk, upsert deltas, checkpoint so a restart resumes; keep each unit idempotent.

**Mock the outbound boundary** (the CRM API, the CT APIs) and assert on what your code *decided* — which CRM object, what body, upsert-vs-create, what it wrote back. The suite must run with zero deployment and zero secrets. What to assert/mock per app is in [crm-contract.md](./crm-contract.md).

### Step 5 — Verify the round trip

Don't declare done until a real customer flows end to end. Create a Customer in commercetools (or the CRM), confirm the counterpart record appears **linked by `externalId`**, update a field and confirm the delta propagates **once** (no loop), and — if in scope — delete/anonymize and confirm it propagates. See [verification.md](./verification.md), which also covers the traps that look like bugs but aren't (a sync loop from missing self-change filtering, CRM rate-limit throttling, sandbox data quirks).

## References

| Need | Reference |
|---|---|
| **Is a public connector enough?**: live-marketplace check; why classic CRMs are usually build-from-scratch; the ladder | [connector-selection.md](./connector-selection.md) |
| **Requirements → config mapping**: direction → app composition, source of truth, `externalId`/Custom Fields linking, scopes, secured config; the `connect.yaml` envelope; worked example | [config-from-requirements.md](./config-from-requirements.md) |
| **The sync contract**: outbound syncer, inbound webhook/poll, migration job; idempotent upsert by `externalId`, re-fetch by id, ack semantics, self-change/loop filtering, deletion/PII, mapping; full pitfall catalog | [crm-contract.md](./crm-contract.md) |
| **Verify the round trip**: record linked by `externalId`, delta propagates once, deletion propagates; the loop / rate-limit / sandbox traps | [verification.md](./verification.md) |
| Build/publish/certify lifecycle, deploy, scopes, production-readiness gate (type-agnostic) | [commercetools-connect](../../../SKILL.md) |

Adding another CRM later means reusing this same tree — the direction-driven app shapes, the linking model, and the flow do not change; only the CRM's object model and API calls do.

## Checklist

Requirements
- [ ] CRM chosen + API access/credentials (sandbox vs prod, rate limits) known
- [ ] **Direction and source of truth decided** (one-way preferred; bi-directional only with a stated reason)
- [ ] Entity → CRM-object mapping (Customer→Contact, Order→Deal) and field mapping identified
- [ ] Ongoing sync vs initial migration (usually both) decided; trigger events listed
- [ ] Deletion/GDPR/consent handling decided; PII scope minimized
- [ ] Asked the open-ended "anything special?" question; each special requirement its own line
- [ ] Requirements block written and confirmed; specials fed into the Step 1.5 fit-check

Connector fit (decide before wiring/building)
- [ ] Checked **live** marketplace + integration docs (not memory); named the connector + version (or confirmed none exists)
- [ ] Ladder rung **presented to the user and chosen by them**: configure (1) · config-closes-gap (2) · fork/extend (3) · build (4)
- [ ] For a classic CRM with no connector, recognized this is a build, not a marketplace install

Config (the deliverable)
- [ ] App composition matches the direction (event / webhook / poll / migration job)
- [ ] Only documented `connect.yaml` envelope fields; file at the repo root
- [ ] `inheritAs.apiClient.scopes` least-privilege (read + `manage_subscriptions` outbound; `manage_customers` inbound)
- [ ] CRM credentials in `securedConfiguration`; toggles/region in `standardConfiguration`
- [ ] Linking model chosen: `externalId` (or Custom Field) as the stable key; CRM-only fields read-only when CRM is master

The sync apps (build test-first — do not write a function body before its red test)
- [ ] Outbound syncer re-fetches by id, **upserts** by `externalId`, writes the CRM id back, acks with `200`/`2xx`
- [ ] Inbound app authenticates the caller (webhook) / pages the CRM (job); upserts the Customer by `externalId`; idempotent
- [ ] Self-change filtering in place if bi-directional (no loop)
- [ ] Deletion/anonymization propagated if in scope
- [ ] Boundary mocked; suite runs with no deployment/secrets

Verification
- [ ] Counterpart record appears, **linked by `externalId`**
- [ ] A field update propagates exactly **once** (no loop)
- [ ] Deletion/anonymization propagates (if in scope); no PII in logs
