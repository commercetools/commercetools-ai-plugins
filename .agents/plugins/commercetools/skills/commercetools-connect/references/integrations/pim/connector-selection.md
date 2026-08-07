---
name: pim-connector-selection
description: List the public commercetools PIM connectors available for a user's PIM (Akeneo, Bluestone, Contentserv, inriver, Pimcore, Syndigo, …) and offer install-as-is or modify/fork before considering a build — decided against live marketplace data, not a hardcoded matrix.
when_to_use:
  - "Deciding between a public PIM connector and building a custom one"
  - "Checking whether a PIM system or sync capability is already supported before wiring or building"
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - pim
    - connect
---

# Is a public PIM connector enough?

Before wiring or building anything, answer one question: **does a connector that already syncs this PIM into commercetools exist?** Getting it wrong is expensive both ways — building from scratch when a public connector covers you wastes weeks; assuming a public connector maps an attribute or supports a direction it doesn't surfaces only at integration time.

There are two kinds of connector:

- **Public connectors** — listed in the [Connect marketplace](https://marketplace.commercetools.com/integrations/product-information-management) **and actually deployable as a commercetools Connect application** (they have a connector repo / `connect.yaml` and install via the Connect CLI). Some are built by commercetools, most PIM connectors by partners. If one covers the use case, this is almost always the right choice: install + configure, don't build.
- **Organization (custom/private) connectors** — deployed for your organization only, either a **fork** of an open-source connector you extend, or one **built from scratch** using the connect skill's `service`/`job` patterns. Both are [commercetools-connect](../../../SKILL.md) tasks → [build-connector.md](./build-connector.md).

**First trap — a marketplace listing is not automatically a Connect connector.** The marketplace PIM category also lists **partner-operated / SaaS integrations that are _not_ commercetools Connect applications** (nothing to deploy via Connect; you engage the vendor instead). A listing being a great functional match does **not** make it installable through Connect. Verify Connect-deployability before treating any listing as rung 1 — see [Not every marketplace listing is a Connect connector](#not-every-marketplace-listing-is-a-connect-connector--verify-it) below.

The common-but-tricky case (once you've confirmed it *is* a Connect connector): **a connector exists for the PIM, but the user's specific mapping or direction isn't covered by the public version.** Don't jump to "build custom" — that throws away a working, maintained sync engine. Walk the ladder below.

## Don't hardcode "what's supported" — check it live

The set of PIM connectors, their versions, and their capabilities **changes over time**. Do not rely on a memorized matrix. Determine fit from current sources, in order:

1. Run the skill's `docs-search` step and/or query the commercetools Knowledge MCP for "PIM connector product data integration".
2. Browse the live **Connect marketplace — Product Information Management** category for listings and versions: [marketplace PIM integrations](https://marketplace.commercetools.com/integrations/product-information-management).
3. For a partner listing, its own marketplace page / repo / docs is the source of truth for what it maps and how it's configured (e.g. the [Akeneo listing](https://marketplace.commercetools.com/integration/akeneo)).
4. **Confirm it's a Connect connector, not just an integration** — the category mixes both. See [the verification step below](#not-every-marketplace-listing-is-a-connect-connector--verify-it) before counting a listing as a rung-1/2 option.

PIM-to-commercetools listings that have appeared in the marketplace category include **Akeneo (a Vaimo partner integration)**, **Bluestone PIM**, **Contentserv**, **inriver**, **Pimcore**, **Syndigo**, **ATAMYA (eggheads)**, **Chioro (eCube)**, and **Vaimo** — so Akeneo is **not** the only option. Treat this as a starting point to verify live, **not** a definitive or current list, and **not** a claim that each is a deployable Connect connector. State explicitly to the user that you're checking current data, and cite each listing + version + whether it's Connect-deployable — capabilities differ by version.

> Beware the **direction trap.** The same PIM category also lists **adjacent** entries that are not PIM ingestion — search/recommendations (e.g. GroupBy), 3D/AR (e.g. Threekit), generic iPaaS middleware — and some push commercetools → external (syndication, the [product-export template](https://docs.commercetools.com/connect/templates/product-export.md)). A PIM *ingestion* connector must sync **PIM → commercetools**. Confirm the direction before counting a listing as a fit.

## Not every marketplace listing is a Connect connector — verify it

This is the parent skill's general rule ([SKILL.md → Marketplace listings are not all Connect connectors](../../../SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending)), applied to PIM. A PIM listing can be an excellent functional match and still be a partner-operated / SaaS integration that is **not** deployable through Connect — and the marketplace can be out of sync with what's actually installable. So: verify a candidate is a real Connect connector (Connect affordance / repo / `connect.yaml`; the **Connect CLI registry is authoritative** over the listing — see [`deployment-installation.md`](../../deployment-installation.md)), then **ask the user what to do**.

### If it's a good match but is *not* a Connect connector

Surface it — a strong match is worth mentioning — but warn per the parent rule: it's a partner/SaaS integration, **not** a commercetools Connect solution, so **this skill does not cover using it** (its `connect.yaml` / Connect CLI / lifecycle / deploy patterns don't apply). Point to the vendor's own onboarding, and offer the in-skill alternative: build a Connect connector for this PIM, or fork an open-source one if it exists (rungs 3–4 → [build-connector.md](./build-connector.md)).

Only a listing that passes this check counts as a rung-1/2 (configure) option below.

## Present the options first: install or modify (before considering build)

Lead with what already exists. Before any fit analysis, **enumerate the live marketplace PIM connectors and show them to the user** — don't silently pick one, and don't jump to building. For each candidate, give: name, vendor, sync direction, and a one-line "what it syncs."

Then, **when the user's PIM matches a listed connector, offer the two low-effort paths explicitly and let the user choose** — building is the last resort, not the opener:

- **Install it as-is** → deploy the public connector and close any gaps with **configuration / attribute mapping** (ladder rungs 1–2). This is the default recommendation whenever a listed connector matches the PIM. → [`deployment-installation.md`](../../deployment-installation.md).
- **Modify it (fork)** → the connector's a fit but has a genuine gap config can't close (e.g. bi-directional write-back, a missing resource type). Fork the open-source connector, add only the delta, deploy as an Organization connector (rung 3). → [build-connector.md](./build-connector.md).

Only if **no listed connector matches the PIM at all** do you fall through to **build from scratch** (rung 4). Present install-or-modify as the primary choice; reach for build only when the list has nothing for this PIM. The fit check and ladder below are how you decide *which* of these two the matched connector needs.

## The fit check

Compare the requirements gathered in Step 1 against what a candidate public connector actually does. Check each dimension:

| Dimension | Question | If not covered → which rung |
|---|---|---|
| **PIM system** | Is the user's PIM available as a public connector? | No connector for this PIM → rung 4 (build). |
| **Direction** | One-way (PIM → CT) vs bi-directional — does the connector match? | Most public PIM connectors are one-way; bi-directional need → fork (rung 3) or build (rung 4). |
| **Sync scope** | Does it sync what's needed — Product Types, products/variants, categories, attributes, media, prices? | Missing resource type → re-check as config; if genuinely absent → fork (rung 3). |
| **Attribute mapping** | Can it map the user's PIM attributes onto their Product Types, including localization and channels? | Almost always **config/attribute-mapping**, not code → rung 2. See [data-mapping.md](./data-mapping.md). |
| **Cadence** | Event-driven, scheduled delta, full re-sync — does it offer what's needed? | Missing cadence → fork (rung 3). |
| **Special requirements** | Reference entities, measurement conversion, Product Selections/Tailoring per store, variant/family quirks, approval workflow | Judge each: config (rung 2), small fork (rung 3), or build (rung 4). |

Most gaps for a *supported* PIM are **configuration / attribute mapping**, not missing features — the field-to-attribute mapping, locale and channel selection, and category mapping are what public PIM connectors externalize as config. So before concluding anything needs building, confirm the gap can't be closed by configuration and mapping — that's [data-mapping.md](./data-mapping.md) (the vendor-neutral method) plus the connector's own config docs, looked up live.

## The decision ladder

Walk these in order and **stop at the first that fits** — each later rung is more work and more to maintain.

0. **Is the listing a deployable Connect connector at all?** → if not (a partner/SaaS integration), it's **outside this skill**: surface it with the not-a-Connect-solution warning above and offer the build/fork rungs instead. Only Connect-deployable listings reach rung 1. → [Not every marketplace listing is a Connect connector](#not-every-marketplace-listing-is-a-connect-connector--verify-it).
1. **Public connector covers everything** → install + configure. Don't build. The common, recommended case. Deploying it: [`deployment-installation.md`](../../deployment-installation.md).
2. **Right PIM, gap looks like a capability** → first prove it's not **config / attribute mapping**. Field mapping, locale/channel selection, category mapping, and which attributes sync are configuration on most PIM connectors → back to rung 1. See [data-mapping.md](./data-mapping.md) and the connector's own config docs (looked up live).
3. **Right PIM, genuine gap config can't close** → **fork/extend the public connector**. Add only the delta (a new resource type, a transform, bi-directional write-back) and deploy as an Organization connector — you keep the working sync engine, keying, and dependency handling. → [build-connector.md](./build-connector.md), a [commercetools-connect](../../../SKILL.md) task.
4. **No public connector for the PIM at all** → **build** using the connect skill's `service` (inbound webhook) and/or `job` patterns, ingesting via the Import API or HTTP API. The from-scratch path, justified only when there's nothing to fork. → [build-connector.md](./build-connector.md).

Only rungs 3–4 leave this sub-area (hand off to build/fork); the flow resumes once the connector is deployed. Record the decision, the rung, and the connector version checked in the requirements block — so the rest of the work is grounded in a real, confirmed connector, not an assumed one.

## Checklist
- [ ] Checked the **live** marketplace PIM category (not memory); cited the connector + version
- [ ] **Verified each candidate is a deployable Connect connector**, not a partner/SaaS integration listing (Connect affordance / repo / CLI registry — not the marketing page)
- [ ] A good-match listing that is **not** a Connect connector was surfaced **with the not-a-Connect-solution warning** and the build/fork alternative, not treated as rung 1
- [ ] **Listed the available public PIM connectors to the user** (name, vendor, direction, what it syncs) before any build discussion
- [ ] For a matching connector, **offered install-as-is vs modify/fork** explicitly; build proposed only when no listed connector matches the PIM
- [ ] Confirmed the candidate syncs **PIM → commercetools** (direction trap avoided)
- [ ] PIM, direction, sync scope, cadence, and special requirements each compared to the requirements
- [ ] Apparent capability gaps re-checked as **config / attribute mapping** (rung 2) before considering any build
- [ ] When a public connector exists but has a real gap, chose **fork/extend** (rung 3) over build-from-scratch
- [ ] Decision + rung + connector version recorded: configure (1), config/mapping (2), fork (3 → build-connector.md), or build (4 → build-connector.md)
