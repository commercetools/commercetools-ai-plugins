---
name: marketplace-connector-selection
description: Decide with the user whether to use a public marketplace connector as-is, customise (fork) one, or build a new one for a marketplace service they define — from live marketplace data, with the "a listing is not necessarily a Connect connector" verification step.
when_to_use:
  - "Deciding between installing a public marketplace connector, forking one, and building a custom one"
  - "Checking whether a marketplace platform (Marketplacer, Mirakl, Convictional, a channel manager) is already supported before building"
metadata:
  contentType: REFERENCE
  area:
    - marketplace
    - connect
---

# Which path: use as-is, customise, or build?

This answers Step 1.5 of [overview.md](./overview.md). It is a **question you put to the user** with live evidence attached — not a decision you make silently. Getting it wrong is expensive both ways: building from scratch when a connector already covers the service wastes weeks; assuming a listing is installable when it is a partner SaaS integration wastes the whole design.

## Check live data first — don't answer from memory

The marketplace changes. Before recommending anything:

1. Browse the live **[Marketplaces category](https://marketplace.commercetools.com/integrations/marketplaces)** and the **[connector list](https://marketplace.commercetools.com/connectors)**; run this skill's `docs-search` script / the Knowledge MCP for the service name.
2. For each candidate, capture: name, vendor, **is it a Connect connector**, direction, and what it syncs (sellers / offers / inventory / prices / orders / shipments).
3. **Name the connector and version** you checked — or record that none exists — in the requirements block. Don't quote a listing's badge wording as a capability; badges describe the listing relationship, not what the code does.

## The marketplace landscape (verify live — this is only the shape)

Marketplace platforms that appear in the category include **Marketplacer**, **Mirakl** (including partner-built Mirakl connectors), **Convictional**, and generic integration middleware such as **Patchworks**. Treat that as a starting point to verify, **not** a current list, and **not** a claim that each is deployable through Connect.

Two structural facts shape almost every marketplace engagement:

- **Most marketplace listings are partner integrations, not Connect connectors.** A vendor-operated integration, an iPaaS pipeline, or a cloud-function accelerator can be an excellent functional match and still have nothing Connect can deploy.
- **There is no marketplace Connect template.** The [templates](https://docs.commercetools.com/connect/templates/templates-overview.md) are `payment-integration`, `product-export`, `tax-integration`, and `transactional-emails`. A build therefore starts from plain apps — though for the **seller role** (pushing your catalog out to a marketplace) the [`product-export` template](https://docs.commercetools.com/connect/templates/product-export.md) is a genuinely close starting shape: it already does Store-scoped full export plus an incremental updater driven by Product/Product Selection/Store messages.

So the realistic outcome for marketplace work is usually **path 2 (customise/fork)** or **path 3 (build)**. Say so early — it changes the effort estimate.

## Verify it's an actual Connect connector — then ask the user

This is the commercetools-connect skill's general rule ([SKILL.md → Marketplace listings are not all Connect connectors](../../../commercetools-connect/SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending)) — read it there and apply it here; it bites harder in this sub-area than anywhere else, because the Marketplaces category is mostly partner-operated platforms and iPaaS middleware.

Marketplace-specific checks before treating any listing as path 1 or 2:

- Look for a **connector repo with a root `connect.yaml`** and `deployAs` apps. No `connect.yaml`, no Connect deployment.
- A "connector" that deploys as the vendor's own cloud function, iPaaS flow, or hosted service is **not** a Connect application, whatever the listing or repo name says — a common shape for marketplace accelerators specifically.
- The marketplace platform's own commercetools integration may be operated **by the platform**, with nothing for you to deploy at all; that's a vendor onboarding task, not a connector build.

## Present the three paths and let the user choose

Show the live findings, then ask. Don't skip straight to building.

### Path 1 — Use a public connector directly (configure, no code)

Valid when a **Connect-deployable** connector exists for the service and covers the requirements. Install and configure it: commercetools-connect skill's [deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md) (a public connector is `deployment create` against the published connector — *not* the `connectorstaged` flow). Hand it the config you derive in [config-from-requirements.md](./config-from-requirements.md).

Before concluding a gap needs code, **prove it isn't config**: which entities sync, field/attribute mapping, which channel or store the offers land in, and feed cadence are configuration on most connectors.

### Path 2 — Customise it (fork an open-source connector)

The common marketplace case: a connector exists for the service but is one-directional, reference-implementation grade, or maps a different data model than the user's. If it is **open source**, fork it, add only the delta, and deploy as an Organization connector — you keep its payload handling and mapping skeleton, which is the fork's real value.

A partner-private connector can't be forked: a genuine gap there means working with the vendor or going to path 3. The fork's build/stage/publish lifecycle is the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill.

#### Assess the candidate before you fork — from the repo, not from memory

**Read the actual repository at its current state.** Marketplace connectors range from production-grade to demo scaffolding, and any specific finding ages out with the next upstream commit, so derive the gap list live rather than trusting a remembered one:

1. **`connect.yaml` at the repo root** — the `deployAs` apps and their `applicationType` tell you which **directions** it covers (inbound `service`, outbound `event`, batch `job`) and therefore which of the user's requirements it can't meet at all. Also read whether it uses `inheritAs.apiClient.scopes` or hand-supplies `CTP_CLIENT_ID`/`CTP_CLIENT_SECRET`, and what its config keys are.
2. **The handler entry points** — how it identifies resources (upsert by key vs blind create), whether it authenticates inbound callers, and whether it re-fetches by id.
3. **The mapping code** — what it maps sellers and offers onto, which is what you'll be rewriting per [config-from-requirements.md](./config-from-requirements.md).
4. **Language and framework** — Java/Spring and TS/Node connectors both exist. Don't port; the commercetools-connect skill's contracts are language-agnostic, and a rewrite discards the mapping you forked for.
5. **README and repo framing** — many marketplace connectors are published as *accelerators* or reference implementations, documented in the same spirit as the [Connect templates](https://docs.commercetools.com/connect/templates/templates-overview.md): starting points that require customization before production use. Tell the user which grade they're forking.

Then score it against two lists you already have — this *is* the fork backlog, and it holds for any vendor:

- the commercetools-connect skill's [production-readiness checklist](../../../commercetools-connect/SKILL.md#production-readiness-checklist-the-gate) — inbound authentication, native client provisioning, secrets in `securedConfiguration`, no stack traces in responses, idempotent lifecycle scripts, structured logs, health endpoint, tests that assert behavior, README;
- this sub-area's [contract and pitfall catalog](./marketplace-contract.md) — upsert by marketplace id, seller Channel actually created, offers linked to a seller, one Product for a shared SKU, channel on every seller price, supply channel on every InventoryEntry, integer minor-unit money conversion, no hardcoded currency/locale/region, delisting handled, `syncInfo` before order export, and the directions the original omits.

Report the findings to the user as a backlog with effort, and **work it test-first, one item at a time**.

#### Known landmarks (verify live — these change)

Pointers so you know a fork is even possible, not a substitute for reading the repo:

- **Marketplacer** has publicly available, open-source Connect connector code under the [commercetools GitHub organization](https://github.com/commercetools/marketplacer-connector) — inbound seller/listing sync, Java/Spring, published as an accelerator. It's the concrete path-2 candidate today.
- A separately branded Marketplacer accelerator also exists that deploys as a **cloud function, not a Connect application** — the [listing-is-not-a-connector](#verify-its-an-actual-connect-connector--then-ask-the-user) trap in its purest form.
- **Mirakl** appears in the category through vendor and partner listings; check live whether any is Connect-deployable before assuming path 1 or 2.

### Path 3 — Build a new connector for the marketplace service they define

No listing fits, the service is bespoke, or the user explicitly wants their own. Scaffold with the Connect CLI (`commercetools connect init`, then `connect application add --type service|event|job`) — or start from `product-export` for the seller-role outbound direction and adapt. What you write is the marketplace API client, the mapping, and the keying; Connect scaffolds the plumbing.

The apps to build follow from **role and direction** ([overview.md](./overview.md)), and their contracts are in [marketplace-contract.md](./marketplace-contract.md):

- **Operator:** inbound seller sync + inbound offer/inventory/price sync (`service` webhook and/or `job` poll), outbound order routing (`event` on `OrderCreated`), fulfilment status sync, reconciliation `job`.
- **Seller role:** outbound catalog/price/stock export (`event`, or `job` for batch feeds), inbound marketplace order import (`service` webhook or `job`), outbound shipment/tracking.

## The ladder (stop at the first rung that fits)

0. **Is the listing a deployable Connect connector at all?** If not → outside this skill: surface it with the not-a-Connect-solution warning, then offer forking an open-source alternative or building.
1. **Connect-deployable connector covers the requirements** → install + configure (path 1).
2. **Right service, gap looks like a capability** → prove it isn't **config/mapping** first → back to rung 1.
3. **Right service, genuine gap config can't close, and it's open source** → **fork** (path 2). Don't rebuild a working sync engine.
4. **No usable connector for the service** → **build** (path 3). No marketplace template; `product-export` is the closest shape for outbound.

Only rungs 3–4 leave this sub-area (hand off to the commercetools-connect skill for build/publish); the flow resumes here once the connector is deployed.

## Recording the decision

Note in the requirements block: **service · role · path/rung · connector name + version checked (or "none exists") · Connect-deployable? · why**. Example:

> *Marketplacer · operator role · path 2 (fork) · checked the Marketplaces category and the open-source Marketplacer connector repo — Connect-deployable (root `connect.yaml`, two `service` apps) but inbound catalog/seller only, accelerator-grade · forking to add order routing, native client provisioning, webhook auth, and idempotent seller upserts (backlog scored against the production gate + contract).*

## Checklist
- [ ] Checked the **live** Marketplaces category + connector list (not memory); cited each candidate + version
- [ ] **Verified Connect-deployability** per candidate (root `connect.yaml` / CLI registry — not the listing page)
- [ ] A good-match listing that isn't a Connect connector was surfaced **with the not-a-Connect-solution warning**, not treated as path 1
- [ ] **Presented all three paths to the user** (use as-is · customise/fork · build for their service) and let them choose
- [ ] Apparent gaps re-checked as **config/mapping** before proposing code
- [ ] Fork chosen over from-scratch whenever an open-source connector for the service exists
- [ ] Told the user there is no marketplace template (and that `product-export` is the closest shape for outbound)
- [ ] Decision + rung + version recorded in the requirements block
