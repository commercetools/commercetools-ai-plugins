---
name: deployment-installation
description: Deploy and install a Connect connector — the connect.yaml configuration contract, the sandbox/preview/production deployment types, the draft→publish→install lifecycle, redeploy on config change, regions, certification for public connectors, the Connect CLI, the required connector README, and troubleshooting.
when_to_use:
  - "Deploying or installing a connector"
  - "Choosing a deployment type (sandbox, preview, production) or a region"
  - "Understanding the connector publish and certification process"
  - "Redeploying after a configuration change"
  - "Writing the connector's own README (config table, scopes, stance, runbook)"
  - "Troubleshooting a failed deployment"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - deployment
---

# Deployment & Installation

**Impact: HIGH — A connector that deploys but is mis-scoped, mis-configured, or undocumented fails at install time in someone else's project. The connect.yaml contract and a complete README are what make it installable by others.**

## Table of Contents
- [Pattern 1: The connect.yaml configuration contract](#pattern-1-the-connectyaml-configuration-contract)
- [Pattern 2: Deployment types and lifecycle](#pattern-2-deployment-types-and-lifecycle)
- [Pattern 3: Regions](#pattern-3-regions)
- [Pattern 4: Install and redeploy](#pattern-4-install-and-redeploy)
- [Pattern 5: Certification for public connectors](#pattern-5-certification-for-public-connectors)
- [Pattern 6: The required connector README](#pattern-6-the-required-connector-readme)
- [Pattern 7: Troubleshooting](#pattern-7-troubleshooting)
- [Checklist](#checklist)

---

## Pattern 1: The connect.yaml configuration contract

Every `configuration` key is part of the install contract: the installer supplies a value (or accepts the `default`) at deploy time. `required: true` means deployment fails without it (verified: [connect.yaml reference](https://docs.commercetools.com/connect/development.md)). So:

- Give every key a clear `description` — it's what the installer reads in the Merchant Center.
- Provide sensible `default`s for `standardConfiguration` where possible to reduce install friction.
- Put secrets in `securedConfiguration` ([security.md](./security.md)).
- Prefer `inheritAs.apiClient.scopes` so the platform auto-generates the API client at install — the installer doesn't have to create one.

## Pattern 2: Deployment types and lifecycle

A connector progresses from staged code to an installable, published connector (verified: [Connect overview](https://docs.commercetools.com/connect/overview.md), [Connect 2025 updates](https://docs.commercetools.com/certifications/composable-commerce-developer-refresher-2026/connect.md)):

| Deployment type | Purpose | Notes |
|---|---|---|
| `sandbox` | Default; dev/QA | Scales to zero when idle → ~15 s cold-start after inactivity. Cannot deploy a `ConnectorStaged` here. |
| `preview` | Test a `ConnectorStaged` during development | Requires `isPreviewable: true`. Delete when done; scales to zero. |
| `production` | Live | Only **published** connectors; project must not be a trial; warmed instances. |

The flow, end to end: `auth login` → `connect validate` → `connectorstaged create` (register the private connector from your git repo) → `connectorstaged preview` (test; needs `isPreviewable`) → `connectorstaged publish` (so it can run in production) → `deployment create` (install into a project). The exact CLI commands and flags are in [connect-cli.md Step 5](./connect-cli.md#step-5-stage-preview-publish-and-deploy) and the [Connect CLI docs](https://docs.commercetools.com/connect/cli).

After a successful deploy, Connect runs `postDeploy` ([lifecycle-scripts.md](./lifecycle-scripts.md)); deployment can take up to ~15 minutes. For a *public* marketplace listing, add `connectorstaged certify` (Pattern 5).

## Pattern 3: Regions

Deploy in the **same region as your project** to minimize latency (critical for the extension timeout budget). This skill targets **GCP-hosted** Connect deployments (event delivery is via Google Cloud Pub/Sub — see [event-applications.md](./event-applications.md), Pattern 7); deploy to a GCP region: `europe-west1`, `us-central1`, `australia-southeast1` (verified: [Connect — hosts and authorization](https://docs.commercetools.com/connect/hosts-and-authorization.md)). Connect also offers AWS regions, but the event-app guidance here assumes the Pub/Sub envelope.

## Pattern 4: Install and redeploy

Installing a connector into a project **is** creating a Deployment — via the Connect API, the Merchant Center, or the CLI (`deployment create`). You supply the connector reference (id/key), the region, and a value for each `configuration` key (verified: [Deployments](https://docs.commercetools.com/connect/deployments.md)). The `deployment create | describe | logs | redeploy | list | delete` commands are in [connect-cli.md Step 5](./connect-cli.md#step-5-stage-preview-publish-and-deploy).

When configuration values change, **redeploy** the existing deployment (`deployment redeploy`) rather than deleting and recreating — and because `postDeploy` re-runs, your registration must be idempotent ([lifecycle-scripts.md](./lifecycle-scripts.md)). Debug with `deployment logs` (filter by application and date range).

## Pattern 5: Certification for public connectors

Certification is **only** required to list a connector publicly on the Connect marketplace; a private connector needs none (verified: [Connect overview — certification](https://docs.commercetools.com/connect/overview.md)). Certification reviews functionality, security, and stability — the production-readiness checklist in `SKILL.md` is aligned with what such a review expects. For the full process see [Certification](https://docs.commercetools.com/connect/certification.md).

## Pattern 6: The required connector README

Every connector built with this skill ships a README. It is the install contract for a human operator and a certification artifact. It must state:

- **Fail-open vs fail-closed stance** per use case — what happens to carts/orders/messages when the external dependency is down ([service-applications.md](./service-applications.md), [event-applications.md](./event-applications.md)).
- **Required scopes** — the exact `inheritAs.apiClient.scopes` (or the minimal pre-created client scopes), never "admin" ([security.md](./security.md)).
- **Configuration table** — every `connect.yaml` key (standard and secured), its meaning, whether required, and its default.
- **Poison-message / replay runbook** — detection, DLQ/containment, and replay procedure ([observability-operations.md](./observability-operations.md)).

## Pattern 7: Troubleshooting

- **Deployment failed at `postDeploy`** → a non-zero exit rolls back. Check `deployment logs`; common causes: missing required config, invalid external credentials (validate them in `postDeploy` so this is explicit), or an Extension/Subscription key collision.
- **Carts/orders suddenly failing after deploy** → a fail-closed extension whose endpoint is erroring, or a dangling Extension after an undeploy that didn't clean up ([lifecycle-scripts.md](./lifecycle-scripts.md)). Check the extension destination and `/status`.
- **Messages redelivering forever** → a handler returning non-2xx on an unprocessable message ([event-applications.md](./event-applications.md), Pattern 2).
- **First request after idle is slow** → sandbox cold-start (~15 s); use `production` for warmed instances.
- **Changes not taking effect** → Extension/Subscription changes can take up to a minute (eventual consistency); deployment can take ~15 minutes.

---

## Checklist
- [ ] `commercetools connect validate` passes before staging; staged/previewed/published/deployed via the CLI
- [ ] Every `configuration` key has a clear `description`; sensible defaults on `standardConfiguration`; secrets in `securedConfiguration`
- [ ] Least-privilege scopes via `inheritAs.apiClient.scopes` (or documented minimal set)
- [ ] Deployed in the same region as the target project
- [ ] Redeploy (not delete/recreate) used for config changes; `postDeploy` is idempotent
- [ ] Connector README documents: fail-open/closed stance, required scopes, full configuration table, poison-message/replay runbook
- [ ] For public listing: certification requirements reviewed (private connectors skip this)

**Back to:** [SKILL.md](../SKILL.md)
