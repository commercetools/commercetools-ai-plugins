---
name: crm-connector-selection
description: Decide whether to configure a public CRM/CDP connector, fork one, or build for a CRM you define — using live marketplace data; why classic CRMs (Salesforce/HubSpot/Dynamics/Zoho) are usually build-from-scratch. The CRM sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - crm
    - connect
---

# Is a public CRM connector enough?

This answers Step 1.5 of [overview.md](./overview.md): given the requirements, do you **configure** an existing connector, **fork** one, or **build** for the CRM the user defines? Unlike tax — where the answer is engine-specific but a certified connector usually exists — for CRM the answer is most often **build**, because classic CRMs generally have no certified commercetools connector.

## Check live data first — don't answer from memory

The marketplace changes. Before deciding:

1. Search the **Connect marketplace** (`marketplace.commercetools.com/connectors`) and the integration docs via the `docs-search` script or the Knowledge MCP.
2. Compare the requirements CRM-by-capability (which entities/objects, direction, field mapping, deletion/consent, real-time vs batch).
3. **Name the connector and version** you checked — or record that none exists — in the requirements block.

## The CRM landscape (verify, but this is the shape)

The marketplace skews toward **marketing / customer-data-platform / personalization** tools, not classic sales CRMs:

| Category | Examples on the marketplace | Typical default rung |
|---|---|---|
| **Marketing / CDP / personalization** | Klaviyo, Bloomreach, Mailchimp, Dynamic Yield, Relewise (verify live) | **1 (configure)** if it covers the use case |
| **Classic CRM** (Salesforce, HubSpot, Dynamics 365, Zoho) | Typically **no certified connector** | **4 (build)** |
| Anything else the user defines | Check the marketplace | Likely **4** unless a listing exists |

The practical consequence: **"just use the certified connector" is often not available for a classic CRM.** A request to "integrate Salesforce/HubSpot with commercetools" is usually a build job — say this plainly to the user early, because it changes the effort estimate. If the real need is *marketing automation* or a *CDP* (segments, campaigns, personalization) rather than a system-of-record CRM, a public connector may well fit rung 1 — clarify which they actually mean.

There is also **no `crm-integration` Connect template** ([templates list](https://docs.commercetools.com/connect/templates/templates-overview.md): `payment-integration`, `product-export`, `tax-integration`, `transactional-emails`). So a build starts from plain apps, not a CRM-specific scaffold — see rung 4.

## The ladder (stop at the first rung that fits)

### Rung 1 — Configure a public connector

If a public connector exists and covers the requirements, **install and configure it** — cheapest and most maintainable. Installation (CLI auth, scopes, `deployment create --connector-key`, or Merchant Center install) is the commercetools-connect skill's [deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md). Hand it the config you derive in [config-from-requirements.md](./config-from-requirements.md). Most CRM/CDP "customization" is field mapping and event selection — configuration, not code.

### Rung 2 — A gap that config can close

A "missing" behavior is often a setting: which events sync, how fields map, whether consent flags carry, list/segment targeting. Re-check the apparent gap against the connector's configuration surface before forking. Details in [config-from-requirements.md](./config-from-requirements.md).

### Rung 3 — Fork/extend a public connector (only if open source)

If there's a genuine gap config can't close **and the connector is open source**, fork it, add only the delta, and deploy as an **Organization connector**. Don't rebuild a working connector. Hand off to [commercetools-connect](../../../commercetools-connect/SKILL.md) for the fork's build/stage/publish lifecycle. A partner-private connector can't be forked — a genuine gap there means working with the vendor or building custom.

### Rung 4 — Build for the CRM the user defines (the common case)

No public connector for the CRM → **build it.** Because there is no CRM template, scaffold plain apps with the Connect CLI (`commercetools connect init` then `connect application add --type event|service|job`), or start from the closest template and adapt. The nearest *outbound* shapes (react to a commercetools event → call an external API) are the **`transactional-emails`** and **`product-export`** templates; there is **no inbound template**, so build the CRM → commercetools direction as a plain `service` (webhook) or `job` (poll). Either way the Connect plumbing (lifecycle scripts, subscription/extension registration, envelope handling) is scaffolded; the **CRM API calls and the mapping are what you write.**

What you actually build on rung 4 (only the apps your direction needs — see [overview.md](./overview.md)):
- **Outbound syncer** (`event`): commercetools message → CRM object upsert, idempotent by `externalId` (see [crm-contract.md](./crm-contract.md)).
- **Inbound app** (`service` webhook or `job` poll): CRM record → Customer upsert by `externalId`, read-only mapped fields.
- **Migration job** (`job`): one-time bulk backfill, checkpointed.
- Config + scopes ([config-from-requirements.md](./config-from-requirements.md)).

The full build/stage/publish/certify lifecycle for rungs 3–4 is the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill; return to this CRM flow once the connector is deployed. The CRM-specific correctness rules and gotchas (upsert-not-create, loop avoidance, ack semantics, deletion/PII) are in [crm-contract.md](./crm-contract.md).

## Recording the decision

In the requirements block, note: **CRM · rung · connector name + version checked (or "none exists") · why**. Example:

> *CRM: HubSpot · rung 4 (build) · checked marketplace 2026-07 — no public HubSpot connector; marketplace has marketing/CDP tools only · building an outbound event syncer + a migration job, CRM-as-master one-way, linked by externalId.*
