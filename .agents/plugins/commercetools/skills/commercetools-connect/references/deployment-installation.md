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

| Deployment type | Purpose                                     | Notes                                                                                                 |
| --------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `sandbox`       | Default; dev/QA                             | Scales to zero when idle → ~15 s cold-start after inactivity. Cannot deploy a `ConnectorStaged` here. |
| `preview`       | Test a `ConnectorStaged` during development | Requires `isPreviewable: true`. Delete when done; scales to zero.                                     |
| `production`    | Live                                        | Only **published** connectors; project must not be a trial; warmed instances.                         |

The flow, end to end: `auth login` → `connect validate` → `connectorstaged create` (register the private connector from your git repo) → `connectorstaged preview` (test; needs `isPreviewable`) → `connectorstaged publish` (so it can run in production) → `deployment create` (install into a project). The exact CLI commands and flags are in [connect-cli.md Step 5](./connect-cli.md#step-5-stage-preview-publish-and-deploy) and the [Connect CLI docs](https://docs.commercetools.com/connect/cli).

After a successful deploy, Connect runs `postDeploy` ([lifecycle-scripts.md](./lifecycle-scripts.md)); deployment can take up to ~15 minutes. For a _public_ marketplace listing, add `connectorstaged certify` (Pattern 5).

## Pattern 3: Regions

Deploy in the **same region as your project** to minimize latency (critical for the extension timeout budget). Connect offers GCP and AWS regions — `europe-west1.gcp`, `us-central1.gcp`, `australia-southeast1.gcp`, `us-east-2.aws`, `eu-central-1.aws` (verified: [Connect — hosts and authorization](https://docs.commercetools.com/connect/hosts-and-authorization.md)).

**The region determines an `event` app's message broker**, which the platform injects into `postDeploy` as `CONNECT_SUBSCRIPTION_DESTINATION` — `GoogleCloudPubSub` on GCP regions, `SNS` on AWS. This file's sibling guidance is written against the GCP case; if you deploy an `event` app to an AWS region, branch the destination and re-check the envelope shape ([event-applications.md](./event-applications.md), Pattern 7).

## Pattern 4: Install and redeploy

Installing a connector into a project **is** creating a Deployment — via the Connect API, the Merchant Center, or the CLI (`deployment create`). You supply the connector reference (`id` or `key` **plus `version`**), the region, and a value for each `configuration` key (verified: [Deployments](https://docs.commercetools.com/connect/deployments.md)). The `deployment create | describe | logs | redeploy | list | delete` commands are in [connect-cli.md Step 5](./connect-cli.md#step-5-stage-preview-publish-and-deploy).

When configuration values change, **redeploy** the existing deployment (`deployment redeploy`) rather than deleting and recreating — and because `postDeploy` re-runs by default (`skipScripts: false`), your registration must be idempotent ([lifecycle-scripts.md](./lifecycle-scripts.md)). Debug with `deployment logs` (filter by application and date range).

**`configurationValues` on a `redeploy` is a partial merge, not a full replace.** A key you omit keeps its currently-deployed value — it is not cleared and not reset to the `default` declared in `connect.yaml`. Two consequences: never pass a throwaway placeholder for a secured key whose real value you can't recover, and never assume omitting a key resets it.

**Updating connector _code_ needs `updateConnector: true` — and `redeploy` is only the last step of the chain.** Without the flag, `redeploy` keeps the currently-deployed connector version and only refreshes config and restarts. With it, the deployment moves to the **latest published Connector version** — which only contains new code if that version actually advanced first ([Update your Connector](https://docs.commercetools.com/connect/getting-started.md#update-your-connector)):

1. push the code and create a new git tag;
2. `setRepository` on the ConnectorStaged with that tag;
3. `publish` the ConnectorStaged — this runs the [validation pipeline](https://docs.commercetools.com/connect/validation-pipeline.md);
4. _then_ `redeploy` the Deployment with `updateConnector: true`.

A redeploy that reports `Deployed` but behaves exactly as before is almost always steps 1–3 not having landed — the tag was never set, or `publish` failed validation — with `updateConnector` correctly redeploying the version that *is* current. Diagnose it there, not at the deployment: compare `connector.version` on the Deployment against the Connector's own current `version`, and read the ConnectorStaged's `publishingReport` (or `previewableReport` for a `preview` deployment, which needs a fresh `updatePreviewable` after a new tag). Retrying the same `redeploy` cannot fix a version that was never published.

If the new version fails to build or deploy, the **previously deployed code keeps serving**. That is deliberate — a bad release doesn't take the integration down — so "still running the old behavior" is the expected outcome of a failed update, not a symptom of a stuck deployment.

**The CLI is not the only automation path, and often not the best one.** The `deployment`/`connectorstaged` commands have no machine-readable output flag, so a script built on them parses console text. Every one of them has a REST equivalent against `https://connect.{region}.commercetools.com`, using the same OAuth token as the core API — the command-by-command mapping is published at [CLI and Connect API mapping](https://docs.commercetools.com/connect/cli.md#cli-and-connect-api-mapping); read exact request shapes from the Knowledge MCP (`connect-Deployment`, `connect-Connector`).

What that mapping page doesn't give you, and what you need to script against it:

- **Redeploy body:** `POST /{projectKey}/deployments/key={key}` with `{ version, actions: [{ action: "redeploy", configurationValues, updateConnector, skipScripts }] }` — `redeploy` is the only update action on a Deployment.
- **Finding a connector:** `GET /connectors/search` filters on `text`, `key`, `integrationTypes`, `creator.company`, `private`; `GET /connectors/key={key}` fetches one directly.
- **Listing deployments:** `GET /{projectKey}/deployments` filters on `deploymentType` and `integrationTypes`.
- **Logs:** `GET /{projectKey}/deployments/{deploymentId}/logs` takes `applicationName`, `startDate`, `endDate`, and `pageToken` (cursor-based).

**Pull the connector's live config contract instead of trusting a static table.** A public connector iterates its own configuration, so any documented key list — including the ones in this skill's integration sub-areas — is a snapshot that can lag the deployed version's actual `required` flags, defaults, and scope list. Before finalizing a `deployment create` or `redeploy` config block, especially for a `required: true` key with no default:

```bash
curl -s "https://connect.{region}.commercetools.com/connectors/key={connector-key}" \
  -H "Authorization: Bearer {token}"
```

`configurations[]` gives every application's `standardConfiguration`/`securedConfiguration` keys with their `description`, `required`, and `default`; `apiClient.scopes` gives the exact scope list an auto-generated runtime client will be granted. For an already-installed connector the same data is on the Deployment itself under `connector.configurations`, so `GET /{projectKey}/deployments/key={key}` answers "what does this deployment actually accept?" in one call.

## Pattern 5: Certification for public connectors

Certification is **only** required to list a connector publicly on the Connect marketplace; a private connector needs none (verified: [Connect overview — certification](https://docs.commercetools.com/connect/overview.md)). Certification reviews functionality, security, and stability — the production-readiness checklist in `SKILL.md` is aligned with what such a review expects. For the full process see [Certification](https://docs.commercetools.com/connect/certification.md).

## Pattern 6: The required connector README

Every connector built with this skill ships a README. It is the install contract for a human operator and a certification artifact. It must state:

- **Fail-open vs fail-closed stance** per use case — what happens to carts/orders/messages when the external dependency is down ([service-applications.md](./service-applications.md), [event-applications.md](./event-applications.md)).
- **Required scopes** — the exact `inheritAs.apiClient.scopes` (or the minimal pre-created client scopes), never "admin" ([security.md](./security.md)).
- **Configuration table** — every `connect.yaml` key (standard and secured), its meaning, whether required, and its default.
- **Poison-message / replay runbook** — detection, DLQ/containment, and replay procedure ([observability-operations.md](./observability-operations.md)).

## Pattern 7: Troubleshooting

- **`postDeploy` failed** → **don't rely on `deployment.status` to tell you.** Docs say `postDeploy` runs after a successful deployment but don't define what a failing script does to the status, so check `deployment logs` first and then confirm the resource itself exists (`GET /{projectKey}/extensions`, `GET /{projectKey}/subscriptions`) — that is the only proof the registration happened. Common causes: missing required config, invalid external credentials (validate them in `postDeploy` so this is explicit), an Extension/Subscription key collision, or a wrong discriminator value in the destination ([lifecycle-scripts.md](./lifecycle-scripts.md), Pattern 5).
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
- [ ] Config values verified against the connector's **live** contract (`GET /connectors/key={key}`), not a documentation snapshot
- [ ] Deploy success verified from `deployment logs` and the registered resource itself — never `deployment.status` alone
- [ ] Redeploy config treated as a partial merge (omitted keys keep their current value, not their default)
- [ ] Code updates go the full chain — new tag → `setRepository` → `publish` → `redeploy` with `updateConnector: true`; unchanged behavior afterwards diagnosed against `connector.version` and the ConnectorStaged's publishing report, not by recreating the Deployment
- [ ] Connector README documents: fail-open/closed stance, required scopes, full configuration table, poison-message/replay runbook
- [ ] For public listing: certification requirements reviewed (private connectors skip this)

**Back to:** [SKILL.md](../SKILL.md)
