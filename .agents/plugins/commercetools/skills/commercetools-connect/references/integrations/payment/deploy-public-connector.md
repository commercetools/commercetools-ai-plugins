---
name: deploy-public-connector
description: Install a public/certified payment connector (e.g. Stripe) into a project via the Connect CLI — correct auth, the right Connect scopes, and why a public connector is deployed directly (no connectorstaged staging).
when_to_use:
  - "Installing/deploying an already-public payment connector into a project"
  - "Hitting auth/scope errors or confusion about connectorstaged vs deployment create"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
---

# Deploy a public payment connector

This is the install path for a **public/certified** connector (Stripe, Adyen, PayPal, …) — the common case (ladder rung 1). You do **not** build or stage it; you deploy the existing public connector into your project. Building/staging your *own* connector (rung 3/4) uses a different flow → [deploy-custom-connector.md](./deploy-custom-connector.md).

Most Merchant Center users install a public connector through the **Connect UI** (Organization → Connect → install + fill config). The CLI path below is the scriptable equivalent and the one to reach for in an agentic/automated context. Verify command shapes against the live [Connect CLI docs](https://docs.commercetools.com/connect/cli.md) — flags evolve.

## Two clients — don't conflate them

This trips people up, and conflating them is the usual cause of auth/scope failures:

| Client | Used for | Scopes |
|---|---|---|
| **CLI / deploy client** | authenticating the CLI to create the deployment | `manage_connectors:{projectKey}` **+** `manage_connectors_deployments:{projectKey}` (plus `manage_api_clients:{projectKey}` if the connector auto-generates its runtime API client credentials — without it the deploy fails with `403 access denied`), or `manage_project:{projectKey}` which covers all of these — see [Connect authorization](https://docs.commercetools.com/connect/hosts-and-authorization.md#authorization) |
| **Connector runtime client** | the credentials the *deployed connector* uses to call commercetools at runtime (create Payments, read sessions) | **auto-generated at deploy time** — the Connect platform shows the scopes it needs (e.g. `manage_payments`, `view_sessions`) during the deploy step and provisions them; you usually don't hand-create this client |

Common mistake: inventing a scope like `manage_deployments` (not a real scope — it's `manage_connectors_deployments:{projectKey}`), or pre-creating a runtime client with payment scopes and trying to authenticate the *CLI* with it. The CLI client needs the connector/deployment scopes above; the payment/session scopes belong to the auto-provisioned runtime client.

## Step 1 — Authenticate the CLI

The command is client-credentials based; **`--region` must match the project's region**:

```bash
commercetools auth login --client-credentials \
  --client-id <CLI_CLIENT_ID> \
  --client-secret <CLI_CLIENT_SECRET> \
  --region <region e.g. europe-west1.gcp> \
  --project-key <projectKey>
```

The client behind these credentials needs `manage_connectors:{projectKey}` + `manage_connectors_deployments:{projectKey}` (and `manage_api_clients:{projectKey}` if the connector auto-generates its runtime credentials), or `manage_project:{projectKey}` which covers all of these.

## Step 2 — Deploy the public connector directly

A public connector is referenced by its **connector key or id** — there is **no `connectorstaged` step** (that command stages *your own* connector for certification, which is a different, build-side flow). Deploy it:

```bash
commercetools connect deployment create \
  --region <region> \
  --connector-key <public-connector-key>   # or --connector-id <id> \
  --type sandbox                            # preview | sandbox | production \
  --key <your-deployment-key> \
  --configuration '<applicationName>.<KEY>=<value>' \
  --configuration '<KEY>=<value>'
```

- Pass the config you derived in Step 2 of the skill via repeated `--configuration` flags (`{applicationName}.{key}=value` for app-specific, `{key}=value` for global). Secrets go here too — they land in the connector's secured config, not in the browser.
- During this step the platform surfaces the **runtime scopes** the connector will be granted (the auto-generated client) — review them; that's expected, not an error.
- Find the connector's key/id in the Connect marketplace (Merchant Center → Connect) or via the Connect API.

## Step 3 — Get the URLs back

Once deployed, read the **processor URL** and **enabler URL** from the deployment (Merchant Center deployment view, or `commercetools connect deployment describe --key <your-deployment-key>`). Bring those back to the skill's Step 2 (config) / Step 4 (backend) — they're what the BFF and enabler point at. A URL is stable across redeploys of the same deployment but a fresh `deployment create` gets a new one, so read them from config rather than hardcoding.

## If something fails
- **Auth/scope error on deploy** → the CLI client is missing `manage_connectors:{projectKey}` / `manage_connectors_deployments:{projectKey}` (or you used a non-existent scope like `manage_deployments`). Fix the client's scopes and re-login.
- **"connector not found"** → wrong `--connector-key`/`--connector-id`, or the connector isn't available to your organization yet (install it from the marketplace first).
- **Region mismatch** → `--region` on both `auth login` and `deployment create` must equal the project's region.
- Anything about *building, bundling, staging, or certifying* a connector → that's [commercetools-connect](../../../SKILL.md), not this path.

## Checklist
- [ ] CLI authenticated with a client that has `manage_connectors:{projectKey}` + `manage_connectors_deployments:{projectKey}` (plus `manage_api_clients:{projectKey}` if credentials are auto-generated), or `manage_project:{projectKey}`
- [ ] Deployed via `deployment create --connector-key …` (no `connectorstaged` for a public connector)
- [ ] Config passed via `--configuration`; secrets in secured config, never the browser
- [ ] Runtime scopes reviewed at deploy time (auto-generated client — expected)
- [ ] processor URL + enabler URL captured for the integration steps
