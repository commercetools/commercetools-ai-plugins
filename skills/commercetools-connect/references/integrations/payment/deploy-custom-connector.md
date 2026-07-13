---
name: deploy-custom-connector
description: Stage, publish, and deploy a custom (Organization) payment connector built from the payment-integration template — the connectorstaged create → publish → deployment create flow, with CLI pitfalls from live testing.
when_to_use:
  - "Deploying a connector you built yourself (rung 4 — build from template, or rung 3 — forked from a public connector)"
  - "Hitting errors on connectorstaged create: missing flags, wrong URL format, repo not reachable"
  - "Understanding the difference between staging/publishing a custom connector vs installing a public one"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
---

# Deploy a custom (Organization) connector

This is the flow for a connector **you built or forked** — ladder rung 3 (fork/extend) or rung 4 (build from template). You stage it, publish it as an Organization connector (no public certification required), then deploy it. This is different from installing a public connector → see [deploy-public-connector.md](./deploy-public-connector.md).

## The flow

```
0. connect validate         → run the platform's checks LOCALLY, before staging (fast feedback)
1. connectorstaged create   → registers your repo + tag, returns a connector id
2. connectorstaged publish  → server-side validation (SAST/SCA + connect.yaml), makes it deployable (async)
3. deployment create        → actually runs the connector in your project
```

Steps 1–2 use the same CLI client as public connector deployment (same auth, same scopes — `manage_connectors` + `manage_connectors_deployments`). No separate auth step.

**Validate locally first.** `commercetools connect validate` runs the same class of checks the platform runs at publish/preview (`connect.yaml` validation, image security analysis, SAST, SCA) — so running it before you stage turns a slow, async, server-side publish *rejection* into a local failure you fix in seconds. Do this **before `connectorstaged create`/`publish`**, not at `deployment create`: by the time you deploy, the code has already cleared validation at the publish gate, and `deployment create` fails on different things (missing config values, wrong scopes). For installing a *public* connector there's nothing for you to validate — it's already certified — so `connect validate` only applies to a connector you built or forked.

## Step 0 — Authenticate

Same as the public connector path:

```bash
commercetools auth login \
  --client-credentials \
  --client-id <CLIENT_ID> \
  --client-secret <CLIENT_SECRET> \
  --region <region e.g. europe-west1.gcp> \
  --project-key <projectKey>
```

The client needs `manage_connectors` + `manage_connectors_deployments` (or `manage_project`).

## Step 1 — Stage the connector

```bash
commercetools connect connectorstaged create \
  --name "my-connector" \
  --description "Custom Stripe payment connector" \
  --repository-url https://github.com/<org>/<repo>.git \
  --repository-tag <git-tag> \
  --creator-email <your-email> \
  --supported-regions europe-west1.gcp \
  --integration-types psp
```

**CLI pitfalls (verified by live testing):**

| Pitfall | Detail |
|---|---|
| Wrong command path | The command is `commercetools connect connectorstaged create` — **not** bare `connectorstaged create`. The CLI binary is `commercetools`, not `ct`. |
| No `--region` flag | `connectorstaged create` does **not** accept `--region`. Omit it — region is set via auth login. |
| URL must end in `.git` | `https://github.com/org/repo` → error "not a valid Git repository URL". Use `https://github.com/org/repo.git`. |
| `--creator-email` is required | Omitting it causes a flag validation error. Pass your email. |
| Private repo → "not reachable" | Connect clones the repo server-side. A private GitHub repo returns `GitRepositoryNotReachable`. Either **make the repo public**, or use the repo's **SSH URL** (`git@github.com:org/repo.git`) and grant read access to the [`connect-mu`](https://github.com/connect-mu) machine user — the documented way to give Connect access to a private repo. |

Note the `id` in the response — you need it for step 2.

## Step 2 — Publish

```bash
commercetools connect connectorstaged publish --id <id-from-step-1>
```

- Only `--id` or `--key` — there is no `--force` flag.
- Runs **async** — Connect clones your repo, validates `connect.yaml`, and registers the connector. It can take a minute or two. You can check status with `connectorstaged describe --id <id>`.
- Once `status` shows `published`, proceed to step 3.

### Publish runs a production-readiness scan — for private connectors too

Publish (and preview builds) don't just check `connect.yaml`. The [validation process](https://docs.commercetools.com/connect/overview.md#validation-process) also runs **image security analysis, SAST, and software composition analysis (SCA)** over the code whenever you request a preview build or publish — for **any** connector, including private/Organization ones, not only for public marketplace certification. A connector that fails them won't publish, so clean the repo to the production bar *before* you publish, not after a rejected report. Catch most of it locally first:

```bash
commercetools connect validate    # connect.yaml + the same class of checks, locally
```

The bar these checks enforce is the same security bar described in the Connect [certification requirements](https://docs.commercetools.com/connect/certification.md#security-requirements) — a useful reference for what "clean" means, even though that page formally describes the certification process:

- **No logs or any code/configuration that isn't meant for production.** Strip leftover `console.log`/debug logging, dev-only mocks or fixtures, test scaffolding, commented-out blocks, and local-only config (`.env` samples, `NODE_ENV=development` defaults baked into the build). If you forked a public connector (rung 3), this is where forks most often fail — leftover demo/sample code from the template.
- **No hardcoded URLs, tokens, credentials, or passwords** in code or config — everything sensitive belongs in `securedConfiguration` and is supplied at deploy time (see [config-from-requirements.md](./config-from-requirements.md#the-connectyaml-envelope)).
- **No outdated/insecure dependencies**, and **stateless** apps (no in-memory session state — the runtime scales and restarts).

For the deeper code-quality and security baseline (error hygiene that hides stack traces in production, structured logging that doesn't leak PII, the no-dead-code rule), the connector-build skill owns it: [`commercetools-connect` → security.md](../../security.md) and [observability-operations.md](../../observability-operations.md).

#### The three scans fail for different reasons — read *which* one failed

The publishing report lists the checks separately (`Image security analysis`, `SAST and SCA analysis`, `Connector specification file validation`, `Application Build`). **Which one fails tells you where to look** — they are not interchangeable:

- **Image security analysis failed (but SAST/SCA passed)** → the finding is in the **container base image's OS packages**, *not* your code or your declared dependencies. The base image is chosen by the buildpack from your **Node version**, so the lever you control is pinning it. Add `engines.node` to **every** app's `package.json` (e.g. `"engines": { "node": "20.x" }`) so the buildpack selects a maintained, scanned-clean base image instead of a default. A `stdlib`-style CVE (e.g. a Go stdlib advisory) in this scan is the classic base-image symptom — it is never something in your `package.json`.
- **Runtime-version vs. framework-version trap.** Pinning the runtime can collide with a dependency's own engine requirement, and the two fixes can be mutually exclusive. Real example hit in the field: Fastify v5 requires Node 20+, but Fastify v4's transitive deps (`fast-uri`, `fast-json-stringify`) carry HIGH-severity CVEs whose *only* fix is Fastify v5. So "pin Node 18" (image scan) and "downgrade Fastify to v4" (avoid a different finding) cancel out — the working combination was **Fastify v5 + Node 20**. When the image scan and the SCA scan seem to pull in opposite directions, check the framework's supported-Node matrix before downgrading anything; **the fix for a dependency CVE is almost always to *upgrade*, not downgrade** (downgrading lands you *on* the vulnerable version).
- **SCA failed** → a declared dependency (in some `package-lock.json` in the repo) has a known CVE. Note the **`File` field in each finding** — it tells you *which* lockfile. If it points at a folder that isn't a connector app (see "Keep the repo to connector apps only" below), the fix is removing that folder, not upgrading.

`commercetools connect validate` reproduces all of this locally (its buildpack is version-synced to the platform) — but the **image scan step needs Docker running**, and the buildpack pulls several GB of images, so ensure Docker has disk headroom or the build fails with opaque `input/output error`s that look like connector problems but are local-environment problems.

#### Keep the repo to connector apps only — sibling folders poison SCA

The SCA scan walks the **whole repository** for lockfiles, not just the folders named in `connect.yaml`. If you keep a storefront, BFF, or test harness in the same repo (e.g. a `backend/` Next.js app alongside `processor/` and `enabler/`), **its** dependencies get scanned too — and a stale storefront dep (old `next`, `vite`, `vitest`) will fail the connector's publish even though it ships none of that code. Keep the connector repo to the connector applications only; move any storefront/harness to its own repo (or, as a stopgap, `.gitignore` + `git rm --cached` it so it leaves the published git tag — the platform builds from the tag, though `connect validate` still scans the on-disk working tree).

```bash
commercetools connect connectorstaged describe --id <id>
```

## Step 3 — Deploy

Once published, deploy it into your project with your config:

```bash
commercetools connect deployment create \
  --region <region> \
  --connector-id <id-from-step-1> \
  --key <your-deployment-key> \
  --type sandbox \
  --configuration 'processor.CTP_PROJECT_KEY=<value>' \
  --configuration 'processor.CTP_CLIENT_ID=<value>' \
  --configuration 'processor.CTP_AUTH_URL=<value>' \
  --configuration 'processor.CTP_API_URL=<value>' \
  --configuration 'processor.CTP_SESSION_URL=<value>' \
  --configuration 'processor.CTP_CHECKOUT_URL=<value>' \
  --configuration 'processor.CTP_JWKS_URL=<value>' \
  --configuration 'processor.CTP_JWT_ISSUER=<value>' \
  --configuration 'processor.STRIPE_PUBLISHABLE_KEY=<value>' \
  --configuration 'processor.MERCHANT_RETURN_URL=<value>' \
  --configuration 'processor.ALLOWED_ORIGINS=<value>'
```

Secured config (secrets) goes via separate `--configuration` flags too — the platform stores them encrypted:

```bash
  --configuration 'processor.CTP_CLIENT_SECRET=<value>' \
  --configuration 'processor.STRIPE_SECRET_KEY=<value>' \
  --configuration 'processor.STRIPE_WEBHOOK_SIGNING_SECRET=<value>'
```

App-specific config is namespaced with the application name from `connect.yaml` (`processor.KEY` or `enabler.KEY`). Global (shared) config uses bare `KEY=value`.

> **The deployment must include *every* application declared in `connect.yaml` — including the `assets` enabler, even though it takes no config.** If you build the deployment draft by hand (e.g. via the REST API) and list only `processor`, the deploy may appear to succeed but is malformed: the **enabler never deploys** (no enabler URL is produced), and a later `redeploy` fails with the confusing `DeploymentApplicationDoNotBelong` — *"deployment does not include application: 'enabler'"*. Include the enabler with empty config arrays: `{ "applicationName": "enabler", "standardConfiguration": [], "securedConfiguration": [] }`. The CLI's `deployment create` handles this for you; raw API/scripted drafts are where this bites.

## Step 4 — Get the URLs

After deployment, read the **processor URL** and **enabler URL**:

```bash
commercetools connect deployment describe --key <your-deployment-key>
```

These are what the BFF and storefront point at. They are **stable across a `redeploy`** — the URLs do not change when you redeploy the *same* deployment. But a **delete + recreate gives new URLs** (the host id is per-deployment). If you ever recreate a deployment — e.g. to fix a malformed one that omitted an app — you must update everything that hardcoded the old URL: the BFF/storefront env (`PROCESSOR_URL`/`ENABLER_URL`) **and the Stripe webhook endpoint** (the old URL is now dead, so events silently stop arriving and transactions hang in `Pending`). Prefer `redeploy` over recreate whenever possible precisely to keep the URLs stable.

## Step 5 — Register the Stripe webhook

After you have the processor URL, go to the Stripe dashboard and register the webhook:

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `{processorUrl}/stripe/webhooks`
3. Subscribe to the events this user's flow needs — don't copy a fixed list. Look up Stripe's webhook-event catalog and select per the use case, as described in [connector-contract.md → Webhook events](./connector-contract.md#webhook-events--look-up-then-select-for-the-use-case). (For a typical Stripe flow that often means events like `payment_intent.succeeded`, `payment_intent.amount_capturable_updated` for manual capture, `payment_intent.payment_failed`, and `charge.refunded` — but confirm against Stripe's current docs and the user's capture/refund/dispute requirements.)
4. Copy the **signing secret** (`whsec_…`)
5. Update the deployment's secured config via `redeploy` — there is no `deployment update` CLI command, and the Connect REST API does not accept a `setApplicationConfiguration` action (only `redeploy` is a valid discriminator):
   ```bash
   commercetools connect deployment redeploy \
     --key <your-deployment-key> \
     --configuration 'processor.STRIPE_WEBHOOK_SIGNING_SECRET=<whsec_…>' \
     --configuration 'processor.CTP_CLIENT_SECRET=<value>' \
     --configuration 'processor.STRIPE_SECRET_KEY=<value>'
   ```
   After a redeploy the deployment goes back through `Deploying` — same wait as the initial deploy. URLs remain stable.

   **To pick up a newly published connector version**, add `--updateConnector`:
   ```bash
   commercetools connect deployment redeploy \
     --key <your-deployment-key> \
     --updateConnector \
     --configuration 'processor.KEY=value'
   ```
   Without `--updateConnector`, `redeploy` keeps the **current connector version** and silently does not update the deployed code — it only refreshes config and restarts.
6. Optionally set `processor.STRIPE_WEBHOOK_ID=<we_…>` for the post-undeploy cleanup script

## Checklist
- [ ] CLI authenticated with `manage_connectors` + `manage_connectors_deployments`
- [ ] Repo is public (or private via SSH URL with `connect-mu` granted read access)
- [ ] `connectorstaged create` used `--repository-url` ending in `.git`, included `--creator-email`
- [ ] **Production-ready before publish (applies to private too):** `commercetools connect validate` passes **before staging**; no debug/`console.log` logging, dev mocks, test scaffolding, commented-out code, or local-only config left in the repo; no hardcoded secrets/URLs; deps current; apps stateless
- [ ] `engines.node` pinned (e.g. `20.x`) in **every** app's `package.json` (image-scan base image); dependency CVEs resolved by **upgrading**, not downgrading
- [ ] Every app has a passing `test` script; Vitest apps route through a wrapper that ignores the buildpack's injected Jest flags
- [ ] Repo contains **only** connector apps — no storefront/BFF/harness folder whose lockfile would be SCA-scanned
- [ ] Deployment draft lists **all** apps from `connect.yaml`, including the `assets` enabler (empty config) — else redeploy fails and no enabler URL is produced
- [ ] `connectorstaged publish` completed (status = `published`)
- [ ] `deployment create` passed all required config, secrets in secured config
- [ ] processor URL + enabler URL captured from `deployment describe`
- [ ] Stripe webhook registered at `{processorUrl}/stripe/webhooks`; signing secret stored in secured config
