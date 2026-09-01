---
name: tax-connector-selection
description: Decide whether to configure a certified tax connector, fork one, or build from the tax template — per engine (Avalara/Vertex certified; TaxJar build-from-template), using live marketplace data. The tax sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - tax
    - connect
---

# Is a certified tax connector enough?

This answers Step 1.5 of [overview.md](./overview.md): given the requirements, do you **configure** an existing connector, **fork** one, or **build** from the template? The answer is **engine-specific** — unlike a generic build, the right rung depends entirely on whether *that engine* has a certified connector.

## Check live data first — don't answer from memory

Supported engines and their capabilities change. Before deciding:

1. Search the **Connect marketplace** (`marketplace.commercetools.com/connectors`) and the tax docs via the `docs-search` script or the Knowledge MCP.
2. Compare the requirements engine-by-capability (calculation, recording/filing, void/refund, exemptions, address validation, regions).
3. **Name the connector and version** you checked, and record it in the requirements block.

## The tax landscape (verify, but this is the shape)

| Engine | Public certified connector? | Source available? | Default rung |
|---|---|---|---|
| **Avalara (AvaTax)** | ✅ Yes (marketplace) | ✅ **Open source** ([`mediaopt/avalara-commercetools-connector`](https://github.com/mediaopt/avalara-commercetools-connector)) | **1 (configure)** — or **3 (fork)** since the source is open |
| **Vertex** (O Series) | ✅ Yes (marketplace) | ❌ Partner-private | **1 (configure)** — fork not possible without source |
| **TaxJar** | ❌ **No public connector** | — (only the generic template) | **4 (build from template)** |
| Other (Sovos, ONESOURCE, …) | Check the marketplace | Varies | Likely **4** unless a listing exists |

The practical consequence: **"just use the certified connector" is the right answer for Avalara and Vertex, and impossible for TaxJar.** A request to "integrate TaxJar" is a build-from-template job, not a marketplace install — there is nothing to install. This is worth stating plainly to the user early, because it changes the effort estimate.

## The ladder (stop at the first rung that fits)

### Rung 1 — Configure a certified connector (Avalara, Vertex)

If a certified connector exists and covers the requirements, **install and configure it**. This is the cheapest, most maintainable path — the vendor/partner keeps it certified and updated. Installation (CLI auth, scopes, `deployment create --connector-key`, or Merchant Center install) is the commercetools-connect skill's [deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md). Hand the connector the config you derive in [config-from-requirements.md](./config-from-requirements.md).

Most tax "customization" isn't code — it's configuration. The certified Avalara connector, for example, exposes commit/void order states, tax-code mapping, exemptions, and address validation as **Merchant Center settings stored in custom objects**, not as forks. So before concluding a requirement forces a fork, check whether it's a setting (rung 2).

### Rung 2 — A gap that config can close

A "missing" behavior is usually a config value or MC setting: *which* order states trigger a commit vs a void, *where* the product tax code is read from, whether returns file refunds, whether addresses are validated. Re-check the apparent gap against the connector's configuration surface before forking. Details and the mapping are in [config-from-requirements.md](./config-from-requirements.md).

### Rung 3 — Fork/extend the public connector (Avalara)

If there's a genuine gap config can't close **and the connector is open source** (Avalara's is), fork it, add only the delta, and deploy as an **Organization connector**. Don't rebuild — you'd throw away a working, certified-quality codebase (its tax-code mapping, exemption handling, commit/void lifecycle, and MC config app are substantial; see [avalara.md](./avalara.md)). Hand off to [commercetools-connect](../../../commercetools-connect/SKILL.md) for the fork's build/stage/publish lifecycle. Vertex can't be forked (no public source) — a genuine Vertex gap means working with the partner or, as a last resort, building custom.

### Rung 4 — Build from the tax template (TaxJar, or any engine with no connector)

No public connector for the engine → build from the [tax integration template](https://docs.commercetools.com/connect/templates/tax-integration.md). The template ships the **two apps** (tax-calculator service + order-syncer event) with the Connect plumbing done — lifecycle scripts, extension/subscription registration, envelope handling — but the engine calls and mapping are **stubs you implement**. This is the TaxJar path.

What you actually write on rung 4:
- The **calculator**: cart → engine calculate-request, response → the four `ExternalAmount` update actions (see [tax-contract.md](./tax-contract.md)).
- The **syncer**: order → engine record-transaction call, idempotent on order id; optionally void/refund on lifecycle.
- Config + scopes ([config-from-requirements.md](./config-from-requirements.md)).

Because rung 4 is the most work, it's also where the template's own gotchas bite (the extension must return `200` not `202`; shipping and custom line items must be taxed or the Order won't create in `ExternalAmount` mode; legacy SDK versions). Those are catalogued in [tax-contract.md](./tax-contract.md) and grounded, with a real engine, in [avalara.md](./avalara.md) (which contrasts the certified Avalara approach with a from-template TaxJar build).

The full build/stage/publish/certify lifecycle for rungs 3–4 is the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill; return to this tax flow once the connector is deployed.

## Recording the decision

In the requirements block, note: **engine · rung · connector name + version checked · why**. Example:

> *Tax: TaxJar · rung 4 (build) · checked marketplace 2026-07 — no public TaxJar connector, Avalara/Vertex exist but engine is fixed to TaxJar by an existing account · building both apps from the tax template.*
