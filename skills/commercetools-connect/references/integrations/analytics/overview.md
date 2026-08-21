---
name: analytics-integration-overview
description: Stream or batch-export commercetools commerce data (orders, customers, catalog, inventory) to an analytics destination — data warehouse, CDP, or product-analytics tool — via a Connect connector; the egress-pipeline workflow (requirements → is-a-connector-enough → pipeline design → build). The analytics sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - analytics
    - data
    - connect
    - integration
---

# Analytics connector — export commercetools data to an analytics destination

This is the **analytics integration sub-area** of [commercetools-connect](../../../SKILL.md): you need to get commercetools commerce data — orders, carts, customers, payments, inventory, catalog — into an analytics destination (a **data warehouse**, **CDP**, or **product/behavioral-analytics** tool) so it can be reported on and modeled. The type-agnostic build/publish/certify lifecycle and the production-readiness gate are the parent skill's; this sub-area owns the analytics-specific shape end to end.

Analytics is a **directional egress pipeline with no fixed connector contract**: commercetools is always the source, the destination is downstream, and nothing runs synchronously on the cart hot path. commercetools has **no dedicated analytics connector and no Export API** ([Import and export](https://docs.commercetools.com/api/getting-started/import-and-export.md): *"commercetools does not provide a dedicated Export API. To export resources, use the Merchant Center or query resources with the HTTP API."*), so an analytics integration is a **build-it-yourself** pipeline assembled from two primitives:

- **Streaming (near-real-time):** a Connect `event` app on **[Subscriptions](https://docs.commercetools.com/api/projects/subscriptions.md) / [Messages](https://docs.commercetools.com/api/projects/messages.md)** — the resource changes, a Message is delivered, you transform and deliver a row.
- **Batch (scheduled backfill / periodic load):** a Connect `job` app that **queries the HTTP/GraphQL API** with a `lastModifiedAt` window + cursor pagination and loads the delta.

The closest first-party precedent is the [Connect Product export template](https://docs.commercetools.com/connect/templates/product-export.md) — a full-export service app plus an incremental event app on Messages — which is exactly this two-primitive shape and your **build base** (rung 4). Structurally this reads like the [order-management](../order-management/overview.md) sub-area (directional data-sync, no contract); the file layout mirrors [CRM](../crm/overview.md).

> **The mistake to internalize first: delivery is at-least-once, so dedup on the destination side — and never build analytics off Change History.** A `Subscription` delivers each Message *at least once with no ordering* ([delivery guarantees](https://docs.commercetools.com/api/projects/subscriptions.md#no-guarantee-on-order)); without a **dedup key on the warehouse side** (`resource.id` + `sequenceNumber`) you get duplicate rows. And the **[Change History / Audit Log](https://docs.commercetools.com/api/history/overview.md)** is *not* an analytics feed: it lives on a [separate host](https://docs.commercetools.com/api/history/change-history.md#hosts), is token-rate-limited (429 + `Retry-After`), and the docs explicitly say to *"avoid making API calls in response to an event stream or message subscription"* — it is a governance/compliance log, not a high-throughput data source.

## Disambiguate "analytics" before designing (three different things)

Fix which one the user means — they route completely differently:

1. **Commerce/business analytics (this sub-area).** Transactional/state truth (orders, customers, inventory, catalog) flowing *out* to a warehouse/CDP/analytics tool, server-side. This is what you build here.
2. **[Platform Insights](https://docs.commercetools.com/api/platform-insights.md)** — an Add-On that forwards commercetools *API metrics and server-side logs* to an APM (New Relic, Datadog, OpenTelemetry, Dynatrace). This is **operational/APM telemetry, not commerce data** — if the user wants request latency / error rates, route them here, not to a connector.
3. **[Change History / Audit Log](https://docs.commercetools.com/api/history/overview.md)** — a governance/compliance change log (who changed what). Separate host, rate-limited — **not** an analytics feed (see the blockquote).

## Server-side egress only — client-side tracking is out of scope

This sub-area covers **server-side export of transactional/state truth**. **Client-side behavioral/pixel tracking** (GA4 via gtag, Google Tag Manager, Segment.js, …) is a **storefront** concern — implement it in the storefront (e.g. commercetools Frontend) with a tag manager, **not** in a Connect connector. A connector can feed *server-side* ingestion of the same tools, but it is not where page-view/click tracking belongs. Keep the boundary explicit with the user.

## Workflow

Follow these steps in order. The heart is **Step 1 → Step 1.5 → Step 2 → Step 3** (requirements → is a connector enough? → pipeline design → build test-first).

### Step 0 — Gather context (required, run first)

The mandatory grounding step: pull the latest verified documentation as context for you (the agent). Use the parent connect skill's docs-search script with analytics-focused terms. **Do not skip it, and do not replace it with another tool**:

```bash
node scripts/docs-search.mjs \
  --query "<analytics terms from the user's request, e.g. 'export orders data warehouse subscription messages product export template lastModifiedAt query pagination'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-connect" \
  --limit 10
```

(Run it from the `commercetools-connect` skill root, where `scripts/docs-search.mjs` lives.) Use its output as primary grounding. You *may additionally* use the commercetools Knowledge MCP or `https://docs.commercetools.com` for deeper follow-up.

### Step 1 — Extract requirements (before any config or code)

The pipeline design is downstream of these; the wrong default silently produces duplicate rows, missing events, or leaked PII. Ask the user (don't assume) — each maps to a config key in Step 2 or a rule in [pipeline-architecture.md](./pipeline-architecture.md):

1. **Which destination, and what kind?** A **data warehouse** (BigQuery, Snowflake, Redshift, Databricks), a **CDP** (Segment, mParticle, RudderStack, Tealium), a **product/behavioral-analytics** tool (Amplitude, Mixpanel, GA4, Snowplow), or a **BI** tool (Looker/Tableau/Power BI — which sits *on the warehouse*, not on commercetools). The category decides the mechanism — see [destinations.md](./destinations.md).
2. **Which data domains?** Orders, carts, customers, payments, inventory, catalog (products/prices) — and which fields. Customer data is **PII**: name it explicitly so GDPR handling is designed in, not bolted on.
3. **Latency — streaming, batch, or both?** Near-real-time (event app on Messages) vs periodic load (job querying the API). Most real pipelines need **both**: a stream for freshness + a batch backfill for history and gap-repair.
4. **Historical backfill needed?** A one-time (or periodic full) load of existing data is a separate `job` from the ongoing stream — like a migration.
5. **Destination schema / grain.** One row per event, or an upserted current-state table? This decides the transform and the dedup/merge key.
6. **Volume & throughput.** Order/event volume shapes batch page size, backoff, and whether the ~50-Subscription budget is a constraint.
7. **Anything special or non-standard? (always ask — open-ended)** Multi-project/multi-region consolidation, data residency, real-time personalization needs, existing warehouse loader/ELT tooling (Fivetran/Airbyte-style) the user already runs, retention/erasure policy. Capture each as its own line; **don't force it into a slot above.**

Write these as a short requirements block and **confirm with the user** before deriving config. Sane default if nothing special surfaces: an **`event` streamer** on the relevant Messages for freshness **plus** a **`job` backfill** for history, delivering to a warehouse, deduped on `resource.id` + `sequenceNumber`, read-only least-privilege scopes, destination creds in `securedConfiguration` — and say so explicitly.

### Step 1.5 — Is a public connector enough? (a hard, ordered gate — do the live check anyway)

We already expect the answer to be **build** — there is no turnkey analytics connector. **That is not a licence to skip the live check.** Run this gate in order:

1. **Check live data.** Search the [Connect marketplace](https://marketplace.commercetools.com/connectors) and the integration docs (via `docs-search` / Knowledge MCP) for anything targeting the user's destination. Don't answer from memory — the marketplace changes.
2. **Apply the marketplace-listing rule.** A listing may be a partner/iPaaS/SaaS product, **not** a deployable Connect connector — see [Marketplace listings are not all Connect connectors](../../../SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending).
3. **Confirm with the user**, and only then conclude the rung.

Then walk the **ladder** (details + how a CDP/ELT tool changes the answer: [connector-selection.md](./connector-selection.md)):

1. **A public connector / native destination integration covers it** → install + configure. Installation is the parent skill's [deployment-installation.md](../../deployment-installation.md).
2. **A gap looks like config** → prove it (which Messages, field mapping, destination table) before forking → back to rung 1.
3. **An open-source connector with a real gap** → **fork/extend** it; hand off to [commercetools-connect](../../../SKILL.md) for the lifecycle.
4. **No connector for the destination (the common case)** → **build from the [Product export template](https://docs.commercetools.com/connect/templates/product-export.md)** and adapt it to your destination. This is the default landing rung. → [connector-selection.md](./connector-selection.md), [pipeline-architecture.md](./pipeline-architecture.md).

**Ask the user to choose the rung explicitly** even here — "install a destination connector if one exists", "fork one", and "build from the product-export template" are materially different amounts of work; present the (likely empty) landscape, recommend the build, and let them confirm rather than assuming it. Record the decision, rung, and connector name + version (or "none exists") in the requirements block.

### Step 2 — Design the pipeline (the core deliverable)

Whichever rung, pin the **pipeline design**: which apps exist (event streamer / batch job / optional full-export service), which Messages the streamer subscribes to, the **event→row transform**, the **dedup/merge key**, and PII handling. This is where the analytics value and the expensive mistakes (duplicate rows, missing events, re-fetch-on-`payloadNotIncluded`) live. Read [pipeline-architecture.md](./pipeline-architecture.md) and pick the destination mechanism from [destinations.md](./destinations.md); produce, for the user: the app list, the message-subscription list, the transform/schema mapping, and the dedup strategy.

### Step 3 — Build (rungs 3–4), test-first

Analytics maps directly onto the parent skill's application types — **there is no analytics-specific runtime contract to learn** — so build on those references and their checklists:

- **Event streamer** = an `event` app subscribing to the relevant Messages → [event-applications.md](../../event-applications.md). At-least-once, no ordering: decode the Pub/Sub envelope, re-fetch by id (required on `payloadNotIncluded`), ack correctly, and emit a stable dedup key.
- **Batch/backfill** = a `job` querying the API with `lastModifiedAt` + cursor pagination → [job-applications.md](../../job-applications.md). Checkpoint the window; each unit idempotent.
- **Optional full-export service** (like the template's full export, or an in-Merchant-Center dashboard via a [custom application](../../merchant-center-customizations.md)) = a `service` app → [service-applications.md](../../service-applications.md). Mentioned as an extension, not required.
- **Registration** of Subscriptions in idempotent `postDeploy` / `preUndeploy` → [lifecycle-scripts.md](../../lifecycle-scripts.md).

Build **test-first** (parent skill's Quality gate): the rules that make analytics correct — dedup key emitted, re-fetch on `payloadNotIncluded`, idempotent batch window — are invisible at the call site. Mock the destination and the commercetools API and assert on what your code *decided* to write. → [testing.md](../../testing.md).

### Step 4 — Deploy

Deploy is **type-agnostic** — use the parent skill's [deployment-installation.md](../../deployment-installation.md). Destination credentials go in `securedConfiguration`, never in code.

### Step 5 — Verify the round trip

Don't declare done until data flows end to end **and** proves idempotent: a resource change produces exactly **one** row in the destination (no duplicate on redelivery), and a batch run over a window loads it **idempotently** (a re-run doesn't double-load). See [verification.md](./verification.md), which also covers the analytics traps (Subscription not registered → no data; duplicate rows from missing dedup key; re-fetch needed on `payloadNotIncluded`; Messages query API off by default).

## References

| Need | Reference |
|---|---|
| **Is a connector enough?**: the live registry/marketplace check even though we expect build; CDP/ELT-changes-the-answer; the configure/fork/build-from-template ladder | [connector-selection.md](./connector-selection.md) |
| **Requirements → config**: which Messages / job schedule, least-privilege read scopes, destination creds in `securedConfiguration`, worked example | [config-from-requirements.md](./config-from-requirements.md) |
| **Pipeline architecture** (the substance): event streamer + batch/backfill job, event→row transform, warehouse-side dedup keys, `payloadNotIncluded` re-fetch, PII/GDPR, the limits; full pitfall catalog | [pipeline-architecture.md](./pipeline-architecture.md) |
| **Destinations**: warehouse vs CDP vs product-analytics vs BI — the stream-vs-batch decision, what data flows, PII implication, the client-side honesty caveat | [destinations.md](./destinations.md) |
| **Verify the round trip**: one change → one row, idempotent batch window; the no-subscription / duplicate-row / re-fetch / query-off-by-default traps | [verification.md](./verification.md) |
| Build/publish/certify lifecycle, deploy, scopes, production-readiness gate (type-agnostic) | [commercetools-connect](../../../SKILL.md) |

Adding another destination later reuses this same tree — the two primitives, the dedup model, and the flow don't change; only the destination's delivery API does.

## Checklist

Requirements
- [ ] Destination named + categorized (warehouse / CDP / product-analytics / BI); data domains + fields listed
- [ ] "analytics" disambiguated (commerce data vs Platform Insights vs Change History); client-side tracking flagged out of scope
- [ ] Latency decided (stream / batch / both); historical backfill in or out of scope
- [ ] Destination schema/grain (event rows vs upserted current-state) and dedup/merge key decided
- [ ] PII data domains flagged; retention/erasure policy captured
- [ ] Open-ended "anything special?" asked; each special requirement its own line
- [ ] Requirements block written and confirmed

Connector fit (decide before building)
- [ ] Ran the **live** marketplace/registry check even though build is expected; applied the listing-isn't-a-connector rule; confirmed with the user
- [ ] Ladder rung **presented to the user and chosen by them**, and recorded: configure (1) · config-closes-gap (2) · fork (3) · build-from-template (4, the default)

Pipeline design (the deliverable)
- [ ] Apps chosen: event streamer (`event`) and/or batch job (`job`); optional full-export service noted
- [ ] Streamer subscribes to only the needed Messages; transform is a pure, tested function
- [ ] Dedup key on the destination side (`resource.id` + `sequenceNumber`); `payloadNotIncluded` re-fetch handled
- [ ] Batch job windows on `lastModifiedAt` + cursor pagination + checkpoint
- [ ] PII minimized; not logged; least-privilege read scopes; destination creds in `securedConfiguration`

Build & verify (test-first)
- [ ] Built test-first on the parent event/job/service references and their checklists
- [ ] Subscriptions registered idempotently in postDeploy; cleaned up in preUndeploy
- [ ] Round trip verified: one change → one row (no duplicate); batch window loads idempotently
