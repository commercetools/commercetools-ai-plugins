---
name: oms-connector-selection
description: Decide whether the user's order-management use case is already covered by a public/partner commercetools OMS connector, needs one forked/customized, or needs a new connector built — checked against live marketplace/docs data, not a hardcoded matrix. Includes the installable-Connect-connector vs vendor-hosted-integration distinction.
when_to_use:
  - "Deciding between a public OMS connector, customizing/forking one, and building a new one"
  - "Checking whether an OMS (Fluent Commerce, kbrw, OneStock, NewStore, Pipe17, …) already has a connector before building"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - order-management
    - oms
    - integration
---

# Is a public OMS connector enough?

Before wiring or building anything, answer one question: **does a connector that already does what the user needs exist?** Getting this wrong is expensive both ways — building from scratch when a public connector covers you wastes weeks; assuming a listing is a one-click Connect connector when it's a vendor-hosted product surfaces only at deploy time.

## Two things that are easy to get wrong

**1. The marketplace listing type.** The [order-management marketplace](https://marketplace.commercetools.com/integrations/order-management) lists many integrations (Fluent Commerce, kbrw, OneStock, NewStore, Pipe17, NEKOM, OC fulfillment, ConnectPOS, and more — verify the current set live). But a marketplace listing is **not automatically an installable Connect connector**. There are two shapes:

- **Installable Connect connector** — published to Connect, deployed into your project via the Connect CLI / UI. This is the "install + configure" case.
- **Vendor-hosted / partner integration** — the OMS vendor operates the integration on their side (their connector calls the commercetools API, or you configure it in the vendor's console). You don't deploy anything in Connect; setup follows the vendor's docs.

Confirm which shape a given OMS uses **before** promising a Connect deployment. When in doubt, the vendor's own docs/repo are the source of truth for how their integration installs and what it covers.

**2. "Order management" is not one connector.** OMS integrations differ widely in scope — some do full bidirectional order + inventory + fulfillment sync, some only export orders, some only push inventory. Match the *specific* flows the user needs (Step 1 requirements), not the vendor's headline.

## Discover public connectors programmatically — don't hardcode a list

The set of connectors and versions **changes over time**, so don't rely on a memorized matrix. The authoritative, agent-friendly source is the **Connect API `Search Connectors` endpoint**, which filters published connectors by integration type:

```
GET {connect-host}/connectors/search?integrationTypes=oms
# add &integrationTypes=shipping for fulfillment/shipping connectors; &text=<keyword> to narrow
```

- **Filter by the right type(s).** `IntegrationType` values (verified against the Connect API): `tax`, `marketplace`, `oms`, `psp`, `pim`, `promotion`, `search`, `erp`, `crm`, `email`, `analytics`, `shipping`, `giftcard`. There is **no separate `fulfillment` value** — fulfillment/OMS connectors are tagged `oms` and/or `shipping`, so query **both** for an order-management use case. → schema: `openApi-schemata.mjs --resource-name connect-Connector`; host/auth: [Connect hosts & authorization](https://docs.commercetools.com/connect/hosts-and-authorization.md).
- **Read the result.** Each returned `Connector` carries `name`, `key`, `integrationTypes`, `creator`, `repository`, `configurations`, `supportedRegions`, `certified`, `private`, and `documentationUrl`. Use `certified: true` / `private: false` to identify public certified connectors; `repository` tells you whether the source is available to fork; `configurations` is the config surface you'd fill at install. **Name the version** you found.
- Equivalent surfaces: the same search is available in the **Merchant Center** (Connect) and the **Connect CLI**; the [marketplace](https://marketplace.commercetools.com/connectors) is the human-browse view (note connectors span both the *order-management* and *fulfillment* marketplace categories — the API `oms`+`shipping` query covers both).
- For a specific candidate, its **`repository`/`documentationUrl`** is authoritative for capabilities, install shape, and config keys.

A concrete public, **certified installable Connect connector** example for this space is **fulfillmenttools** ([fulfillmenttools/commercetools-connector](https://github.com/fulfillmenttools/commercetools-connector)) — an `event` order-export app (on Order `Confirmed`) + a `service` app for fulfillment status back to CT + Channel↔Facility inventory sync; deployable via the Merchant Center or Connect API. Others surface under the `oms`/`shipping` search (e.g. Fluent Commerce, kbrw, OneStock, NewStore, Pipe17) — verify each live rather than trusting this list.

## Turn the search result into the decision

Run the search first, then branch on what it returns — this is how the ladder below is driven:

- **A published connector matches the OMS and covers the flows** → **install it** (rung 1) — `deployment create` with the connector's `configurations`.
- **A published connector matches but a behavior is missing** → try **config** first (rung 2); if genuinely missing and its `repository` is available → **modify/fork it** (rung 3).
- **No published connector matches the OMS** → **build one** (rung 4): from scratch or, preferably, the `fulfilment-integration` template → [build-oms-connector.md](./build-oms-connector.md).

State explicitly that you're checking current data, and cite the connector key + version you found.

## The fit check

Compare the Step 1 requirements against what a candidate connector actually supports. Check each dimension:

| Dimension | Question | If not covered → which rung |
|---|---|---|
| **OMS coverage** | Is the user's OMS available as a connector at all? | No connector → rung 4 (build new). |
| **Install shape** | Installable Connect connector or vendor-hosted integration? | Vendor-hosted → follow vendor docs (still rung 1, but not a Connect deploy). |
| **Flows** | Does it cover the flows needed — order export, status/shipment inbound, fulfillment, inventory, returns? | Missing flow → config first (rung 2), else fork/customize (rung 3). |
| **Direction / source of truth** | Does its direction model match yours (who masters status, inventory)? | Mismatch → fork (rung 3) or build (rung 4). |
| **Data mapping** | Can statuses, SKUs, locations/channels, and OMS ids be mapped as needed? | Fixed/unsuitable mapping → config (rung 2) then fork (rung 3). |
| **Split/partial fulfillment, BOPIS, returns** | Does it handle split shipments, partial fulfillment, store pickup, RMA? | Missing → fork (rung 3) or build (rung 4). |
| **Region/compliance** | Available + supported for the region, volume, and data-residency needs? | Not available → different connector or build. |
| **Special requirements** | Each open-ended requirement from Step 1 (B2B/approvals, marketplace split, subscriptions, custom workflow states, existing OMS account/tenant) | Config (rung 2); bespoke logic → fork (rung 3); no connector at all → rung 4. |

Most gaps on an *existing* connector are **config**, not missing features (which Messages, mappings, and which flows are enabled are often configurable). So before concluding anything needs building, confirm the gap can't be closed by configuration.

## The decision ladder

Walk these in order and **stop at the first that fits** — each later rung is more work and more to maintain.

1. **A connector covers everything** → install + configure (Connect connector) or follow the vendor's setup (vendor-hosted). Don't build. The common, recommended case.
2. **A connector exists, gap looks like a capability** → prove it isn't **config** first (mappings, message selection, enabled flows). If config closes the gap, back to rung 1.
3. **A connector exists, genuine gap config can't close** → **fork/customize** it if its source is available: add only the delta and deploy as an Organization connector. You keep the working sync scaffolding and only change what's different. A [commercetools-connect](../../../commercetools-connect/SKILL.md) build-side task; the sync design is [sync-architecture.md](./sync-architecture.md).
4. **No connector fits, or the OMS is bespoke/home-grown** → **build a new connector** connecting to the OMS the user defines. → [build-oms-connector.md](./build-oms-connector.md), then the [commercetools-connect](../../../commercetools-connect/SKILL.md) build-side workflow.

Only rungs 3–4 leave this sub-area for the commercetools-connect build-side; the sync design ([sync-architecture.md](./sync-architecture.md)) applies to all four rungs. Record the decision, the rung, and the connector version checked in the requirements block.

## Checklist
- [ ] Ran `GET /connectors/search?integrationTypes=oms` (and `shipping`) — not memory; cited the connector key + version, and its `certified`/`private` flags
- [ ] Confirmed install shape: **installable Connect connector** vs **vendor-hosted integration**
- [ ] Flows, direction, mapping, split/partial fulfillment, region, and each special requirement compared to the requirements
- [ ] Apparent gaps re-checked as **config** (rung 2) before considering any build
- [ ] When a connector exists but has a real gap, chose **fork/customize** (rung 3) over building from scratch
- [ ] Decision + rung + version recorded: use (1), config (2), fork (3 → commercetools-connect), or build (4 → build-oms-connector)
