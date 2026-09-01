---
name: analytics-connector-selection
description: Decide whether to configure a destination integration, fork one, or build an analytics egress connector from the Product export template — while still forcing a live registry/marketplace check even though no turnkey analytics connector exists. The analytics sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - analytics
    - data
    - connect
    - integration
---

# Is a public connector enough? (analytics)

This answers Step 1.5 of [overview.md](./overview.md). Unlike tax (a certified connector usually exists), for analytics the answer is almost always **build** — there is **no turnkey commercetools "analytics connector"**, no Export API, and no analytics *template* other than the general-purpose [Product export template](https://docs.commercetools.com/connect/templates/product-export.md). **That expectation is not a licence to skip the live check.**

## Do the live check anyway — don't answer from memory

Even though we expect "build", run the check so you don't miss a destination-specific integration that *has* appeared:

1. Search the [Connect marketplace](https://marketplace.commercetools.com/connectors) and the integration docs (via `docs-search` / the Knowledge MCP) for the user's **destination** (e.g. "Segment", "Snowflake", "BigQuery") — not for "analytics".
2. **Apply the marketplace-listing rule.** Analytics/CDP listings are *especially* likely to be **partner services, SaaS products, or iPaaS/ELT middleware** (Fivetran/Airbyte-style loaders, a CDP's own commercetools source) rather than a deployable Connect connector. Confirm a Connect affordance (public repo / `connect.yaml` / a Connect deploy action) before calling anything install/configure — full rule: [Marketplace listings are not all Connect connectors](../../../commercetools-connect/SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending).
3. **Name what you checked** (connector/product + version) or record "none exists", and **confirm the path with the user** before building.

## The landscape (verify, but this is the shape)

| What you may find on/around the marketplace | What it actually is | Default rung |
|---|---|---|
| A **CDP's own commercetools source/integration** (Segment, mParticle, RudderStack, Tealium) | Often the CDP's product, configured on *their* side — may **not** be a Connect connector | Use it **if** it covers the domains — but verify it's Connect-deployable; else it's out of this skill's scope |
| An **ELT/data-loader** (Fivetran/Airbyte-style) reading the commercetools API | Third-party pipeline tooling, not a Connect connector | Valid alternative — but not built/deployed via Connect (say so) |
| A **warehouse** listing (BigQuery/Snowflake/Redshift) | Almost never a turnkey commercetools connector | **4 (build from template)** |
| Nothing for the destination | The common case | **4 (build from template)** |

The practical consequence: **"just install the analytics connector" is usually not available.** Say this plainly and early — it changes the effort estimate. If the user already runs a **CDP or an ELT loader** that can pull the commercetools API, that may be the cheapest path and *not* a Connect build at all — surface it, and warn that the Connect build/deploy patterns (`connect.yaml`, the Connect CLI, lifecycle scripts) apply only if they choose a Connect connector.

## The ladder (stop at the first rung that fits)

### Rung 1 — Configure a public connector / native destination integration
If a Connect-deployable connector or a destination-native integration exists and covers the domains, **configure it** — cheapest and most maintainable. Installation (CLI auth, scopes, `deployment create`) is the commercetools-connect skill's [deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md). Hand it the config from [config-from-requirements.md](./config-from-requirements.md).

### Rung 2 — A gap that config can close
Which Messages/domains flow, field-to-column mapping, and destination table/dataset are usually configuration, not code. Re-check the apparent gap against the connector's configuration surface before forking.

### Rung 3 — Fork/extend a public connector (only if open source)
A genuine gap config can't close **and** the connector is open source → fork it, add only the delta, deploy as an Organization connector. Hand off to [commercetools-connect](../../../commercetools-connect/SKILL.md) for the build/stage/publish lifecycle. A partner-hosted CDP integration can't be forked — that's a vendor conversation.

### Rung 4 — Build from the Product export template (the common case)
No connector for the destination → **build.** The right base is the **[Product export template](https://docs.commercetools.com/connect/templates/product-export.md)** ([repo](https://github.com/commercetools/connect-product-export-template)) — it is already the two-primitive analytics shape:

- a **full-export** application (an API endpoint that exports all resources of a Store to an external system) — your **backfill/full-load** base;
- an **incremental updater** — an `event` app that **subscribes to Messages** and pushes each change to the external system — your **streamer** base.

Scaffold it with the Connect CLI (`commercetools connect init`, template `product-export`), then **adapt**: change *which resources/Messages* you subscribe to (orders/customers/payments, not just products), rewrite the **transform** to your destination's schema, and replace the delivery call with your destination's ingestion API. What you write is the transform + the destination client + the dedup key; the Connect plumbing (envelope handling, subscription registration, lifecycle) is scaffolded. Contract and gotchas: [pipeline-architecture.md](./pipeline-architecture.md).

The full build/stage/publish/certify lifecycle for rungs 3–4 is the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill; return to this analytics flow once deployed.

## Recording the decision

In the requirements block, note: **destination · rung · what you checked live (or "none exists") · path**. Example:

> *Destination: Snowflake · rung 4 (build) · checked marketplace 2026-08 — no Connect-deployable Snowflake connector; found only ELT loaders (out of Connect scope) · building an event streamer + a nightly backfill job from the product-export template, deduped on resource.id+sequenceNumber.*
