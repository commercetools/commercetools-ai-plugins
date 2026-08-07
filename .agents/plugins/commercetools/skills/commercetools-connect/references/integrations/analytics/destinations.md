---
name: analytics-destinations
description: The analytics destination landscape decision-gated by category — data warehouses, CDPs, product/behavioral analytics, and BI — the stream-vs-batch choice, what commerce data flows, and the PII implication, plus the Subscription brokers and the client-side honesty caveat. The analytics sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - analytics
    - data
    - connect
    - integration
---

# Analytics destinations — pick the mechanism, don't catalog vendors

This decides *how* data reaches the destination and *what* flows there, by **category**. It is not a vendor spec sheet — for any specific destination's ingestion API, field names, and limits, **read that vendor's own docs** (they evolve and are outside commercetools' docs). Use this to route the design; use [pipeline-architecture.md](./pipeline-architecture.md) to build it.

## The transport underneath (same for every destination)

A commercetools **[Subscription](https://docs.commercetools.com/api/projects/subscriptions.md)** delivers to one of a fixed set of **message brokers** ([Destination types](https://docs.commercetools.com/api/projects/subscriptions.md#destination)): AWS **SQS / SNS / EventBridge**, Azure **Service Bus / Event Grid**, **Google Cloud Pub/Sub**, and **Confluent Cloud** (Kafka). Your connector reads from the broker and delivers onward to the destination's ingestion API. **On Connect the injected broker is Google Cloud Pub/Sub** — you don't choose it; build the destination from the injected `CONNECT_GCP_*` vars ([event-applications.md](../../event-applications.md), Pattern 7). Batch loads bypass the broker entirely and query the HTTP/GraphQL API ([pipeline-architecture.md](./pipeline-architecture.md)).

## Categories (route by these, not by brand)

### Data warehouses — BigQuery, Snowflake, Redshift, Databricks
- **Decision:** the **default and best-fit** analytics destination. Both mechanisms apply — **stream** events for freshness, **batch** for history/gap-repair. Land raw event rows into staging keyed on `resource.id` + `sequenceNumber`, then model/`MERGE` downstream.
- **What flows:** all transactional/state truth — orders, line items, customers, payments, inventory, catalog.
- **PII:** the warehouse becomes a PII store — minimize columns, and propagate erasure ([pipeline-architecture.md → PII](./pipeline-architecture.md)).

### CDPs — Segment, mParticle, RudderStack, Tealium
- **Decision:** **stream** server-side commerce events into the CDP so it can unify profiles and fan out to downstream tools. **Check first whether the CDP has its own commercetools source / integration** — if it does and it fits, that may be a configure path (rung 1), *not* a Connect build ([connector-selection.md](./connector-selection.md)).
- **What flows:** customer + order events keyed to a stable user id; usually a curated event set, not the full catalog.
- **PII:** CDPs are identity-centric — consent and identifier mapping matter; carry only permitted fields.

### Product / behavioral analytics — Amplitude, Mixpanel, GA4, Snowplow
- **Decision:** **server-side ingestion of commerce events only** (e.g. purchase/refund from `OrderCreated`/order-state Messages). **Honesty caveat:** GA4 and Mixpanel are **client-side-first** — their server-side ingestion (e.g. GA4 Measurement Protocol) is *limited and event-shaped*, **not** a natural full-data-export target. Don't present them as a warehouse substitute; if the user wants complete history and modeling, route to a warehouse. Snowplow/Amplitude have more first-class server-side ingestion.
- **What flows:** a small, well-defined set of conversion/behavioral events — not orders-as-rows.
- **PII:** keep to hashed/consented identifiers per the tool's model.

### BI tools — Looker, Tableau, Power BI
- **Decision:** **do not integrate BI with commercetools directly.** BI sits **on the warehouse**, not on commercetools — point the connector at a warehouse (above) and let BI read from there. If the user asks to "connect Tableau to commercetools," redirect: build the warehouse egress, then BI reads the warehouse.
- **What flows:** nothing directly from commercetools — it reads modeled tables in the warehouse.

## Restating the boundaries (so the design doesn't drift)

- **Server-side egress only.** **Client-side behavioral/pixel tracking** (GA4 gtag, Google Tag Manager, Segment.js) belongs in the **storefront** (e.g. commercetools Frontend) with a tag manager — **not** a Connect connector. A connector can feed *server-side* ingestion of the same tools, but page-view/click tracking is a storefront concern.
- **Not Platform Insights.** If the "analytics" the user wants is API latency / error rates / request logs, that's **[Platform Insights](https://docs.commercetools.com/api/platform-insights.md)** (an Add-On forwarding telemetry to New Relic / Datadog / OpenTelemetry / Dynatrace) — operational APM, not commerce data. Route there, not to a connector.
- **Not Change History.** The [Audit Log / Change History](https://docs.commercetools.com/api/history/overview.md) is a governance change log on a separate, rate-limited host — never an analytics feed.

## Choosing, in one line

Warehouse for complete history + modeling (stream + batch); **CDP** for profile unification and downstream fan-out (stream, and check for a native source first); **product-analytics** for a curated server-side event set (stream, mind the client-side-first caveat); **BI** always via the warehouse, never direct.
