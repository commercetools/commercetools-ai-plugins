---
name: connect-cli
description: The full commercetools Connect CLI lifecycle with @commercetools/cli — install/auth, connect init from a template, pinned dependency versions (JS/TS and Java), local build/test/start, and the connectorstaged/deployment publish and deploy commands. The canonical source for every Connect CLI command, from setup to deploy.
when_to_use:
  - "Scaffolding a new connector from an official template"
  - "Looking up the exact Connect CLI command or flag for build, test, validate, stage, publish, or deploy"
  - "Pinning the supported SDK/client dependency versions (JS/TS and Java)"
  - "Running a connector locally so behavior matches the platform"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - tooling
---

# Connect CLI

You are setting up, running, and deploying a commercetools **Connect** connector with the official Connect CLI. This reference is the single source of truth for the CLI commands, the project bootstrap, the pinned dependency versions, and the deploy lifecycle. For the *production patterns* (decision framework, idempotency, auth, fail-modes, testing strategy), follow the rest of the **commercetools-connect** skill — this reference is the mechanics, the skill is the judgment.

Sections: [Step 1 — Install & authenticate](#step-1-install-the-cli-and-authenticate) · [Step 2 — Scaffold](#step-2-scaffold-the-connector) · [Step 3 — Pin versions](#step-3-pin-dependency-versions) · [Step 4 — Develop & test](#step-4-develop-and-test-locally) · [Step 5 — Stage, publish & deploy](#step-5-stage-preview-publish-and-deploy)

## Step 1. Install the CLI and authenticate

```bash
npm install -g @commercetools/cli
commercetools --version
commercetools auth login --client-credentials \
  --client-id <id> --client-secret <secret> --region <region> --project-key <key>
```

## Step 2. Scaffold the connector

Create the project from an official template. Pick the closest template to the use case; if none fit, scaffold a plain `service`/`event`/`job` and adapt.

```bash
commercetools connect init my-connector            # add: --template <name> to start from a template
```
Templates: `tax-integration`, `product-ingestion`, `email-integration`, `payment-integration`, `fulfilment-integration`.

Add another application to an existing connector later:
```bash
commercetools connect application add --type service|event|job --language typescript|javascript|java
```

Do **not** hand-roll the directory layout — the generated tree (one folder per `deployAs` entry, `src/`, `connect.yaml`, scripts, tsconfig, test config) is the canonical shape. Build on it.

> **A template is a starting point, not a warranty.** The [template docs](https://docs.commercetools.com/connect/templates/payment-integration.md) say so directly: "Connect application templates are for development purposes. They require further customization before being used in production projects." The directory layout is canonical and safe to build on; the generated *logic* is not production-verified. Read and test-drive the generated `postDeploy`/`preUndeploy` scripts and any bundled validators against a real deployment before relying on them as correct by construction.

> **Match the route to the endpoint.** The platform routes traffic to `{connect-url}/{endpoint}`. Mount your router at the same base path as the `endpoint` in `connect.yaml` (e.g. `endpoint: /service` ↔ `app.use('/service', router)`), or all traffic 404s.

## Step 3. Pin dependency versions

These are the minimum supported versions for a connector built with this tooling. Pin them; do not fall back to older clients.

**JavaScript / TypeScript** — install/verify:
```bash
npm install \
  @commercetools/platform-sdk@^8 \
  @commercetools/ts-client@^4
```
- `@commercetools/platform-sdk@^8` — the typed API builder (`createApiBuilderFromCtpClient`).
- `@commercetools/ts-client@^4` — the client (`ClientBuilder`). **Do not** use the legacy `@commercetools/sdk-client-v2`.

**Java** — in `pom.xml`:
```xml
<dependency>
  <groupId>com.commercetools.sdk</groupId>
  <artifactId>commercetools-sdk-java-api</artifactId>
  <version>19.0.0</version>    <!-- commercetools Java SDK 19 or above -->
</dependency>
```
- commercetools Java SDK **19+**

## Step 4. Develop and test locally

Run everything through the CLI so local behavior matches the platform:
```bash
commercetools connect application build     # build
commercetools connect application start     # run locally
commercetools connect application test      # run the test suite
commercetools connect validate              # validate connect.yaml + apps before shipping
commercetools connect bundle                # bundle the applications
```
The generated `package.json` also exposes `npm run build|start|start:dev|test` and `connector:post-deploy` / `connector:pre-undeploy`; the CLI wraps the same lifecycle in the platform's environment.

## Step 5. Stage, preview, publish, and deploy

```bash
# Register the staged (private) connector from your git repo:
commercetools connect connectorstaged create \
  --repository-url <url> --repository-tag <tag> --creator-email <email> --name <name>
commercetools connect connectorstaged describe --key <connector-key>
commercetools connect connectorstaged list

# Preview to test the staged connector (needs isPreviewable):
commercetools connect connectorstaged preview \
  --key <connector-key> --deployment-key <dep-key> --region <region>

# Publish so it can run in production:
commercetools connect connectorstaged publish --key <connector-key>
# Public marketplace listing only — certification:
commercetools connect connectorstaged certify --key <connector-key>

# Deploy / install into a project (this IS installation):
commercetools connect deployment create --connector-key <key> --region <region> --type preview|sandbox|production
commercetools connect deployment describe --key <deployment-key>
commercetools connect deployment logs --key <deployment-key> --application service --startDate <iso> --endDate <iso>
commercetools connect deployment redeploy --key <deployment-key> --configuration KEY=value
commercetools connect deployment list
commercetools connect deployment delete --key <deployment-key>
```

Deploy in the **same region as your project**. Redeploy (don't delete/recreate) for config changes — `postDeploy` re-runs, so registration must be idempotent.

> Flag names and exact options can evolve — confirm with `commercetools connect <command> --help` and the [Connect CLI docs](https://docs.commercetools.com/connect/cli). Source of truth for platform behavior: [docs.commercetools.com/connect](https://docs.commercetools.com/connect).
