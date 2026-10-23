---
name: hosting-connect
description: How commercetools Connect hosts a Merchant Center Custom Application (repository layout, connect.yaml, the API client, publish and deployment), and what onboard.mjs runs when deployment help is on.
metadata:
  contentType: REFERENCE
---

# commercetools Connect

Source: [Deploy to Connect](https://docs.commercetools.com/merchant-center-customizations/deployment/commercetools-connect.md) and the [Connect API](https://docs.commercetools.com/connect/connect-api-overview.md). Connect is not a static host: it builds the app itself from a Git tag of a GitHub repository and serves it, so the three requirements in [other.md](./other.md) are met by Connect rather than by a rewrite file and an upload. Choose it when the user does not want to run a host at all. The session's review screen is the consent for everything below (a GitHub repository, a Connector, a Deployment); on the manual path, show each command and get the user's confirmation before it, as in step 4 of other.md.

## What is different from a static host

- **Layout.** The folder named in the form is the repository root. It holds `connect.yaml` and the app one level down, in a folder named like the `deployAs` entry (the app folder name). Connect requires that match. A resume may name either level.
- **Package manager.** Connect builds Node projects with npm or yarn only, so the app is scaffolded with `--package-manager npm` and built locally with `npm run build`. The pnpm build-script step does not apply.
- **URL.** Connect provides `APPLICATION_URL` at build time, so the config holds `url: '${env:APPLICATION_URL}'` instead of a literal. The local build sets a placeholder for it; `register.mjs` sets it to the real URL when it syncs. The literal never needs to be committed.
- **Identity.** `connect.yaml` declares `CUSTOM_APPLICATION_ID`, `ENTRY_POINT_URI_PATH` and `CLOUD_IDENTIFIER`; the session passes the registered `applicationId`, the entry point and the cloud identifier as the Deployment's configuration. That is why registration (Draft, which yields the id) comes before the deploy, as on every host.
- **Repository.** Connect fetches a public repository over HTTPS. A private one needs the SSH URL and read access for the `connect-mu` machine user; the session grants it as a collaborator through `gh api`. If that invitation is still pending when Connect fetches, the publish report fails at its "Fetch Connector repository" step: accept the invitation for `connect-mu` (or make the repository public) and press r.
- **Deployment type.** The session creates a `sandbox` Deployment: it needs no production Project and is the type Connect deploys by default. A [production Deployment](https://docs.commercetools.com/connect/deployment-behavior-and-environments.md) is a later, separate decision: it needs a non-trial Project, and before the first one the user contacts their Customer Success Manager or commercetools support.

## connect.yaml

```yaml
deployAs:
  - name: <app folder>
    applicationType: merchant-center-custom-application
    configuration:
      standardConfiguration:
        - key: CUSTOM_APPLICATION_ID
          description: The Custom Application ID
          required: true
        - key: ENTRY_POINT_URI_PATH
          description: The Application entry point URI path
          required: true
        - key: CLOUD_IDENTIFIER
          description: The cloud identifier
          default: '<cloud identifier>'
```

## What the session runs with deployment help on

1. **API client.** Connect needs an [API client](https://docs.commercetools.com/connect/hosts-and-authorization.md) for the Project with the scopes `manage_connectors` and `manage_connectors_deployments`. The session asks for its id, then its secret (kept in memory, never logged). A rejected secret is asked for again.
2. **Repository and tag.** `git init -b main` if needed, `git add -A`, a commit, `gh auth status` (the GitHub CLI must be signed in), and if there is no `origin`, the user picks public or private and the session runs `gh repo create <name> --<visibility> --source <root> --remote origin --push`. Then a new tag `v0.1.<n>` is made and pushed. Every run makes a new tag, because Connect builds a tag, not a branch.
3. **Connector.** A `ConnectorStaged` keyed after the app folder is created with the repository and tag, the region, and the Project in `privateProjects`, or repointed at the new tag with `setRepository`. It is published for private use (`certification: false`). The step polls every 15 seconds until the status is `Published`; `Failed` stops with the publishing report.
4. **Deployment.** A sandbox Deployment keyed `<name>-sandbox` is created with the configuration above, or redeployed with `updateConnector` after a republish. The step polls until `Deployed` (up to 15 minutes) and takes `applications[0].url` as the production URL; `Failed` stops with the report.
5. The host check and the finish step then run as for any host.

## When a publish fails on a fresh starter

Connect's [validation pipeline](https://docs.commercetools.com/connect/validation-pipeline.md) scans dependencies and source. A fresh starter template can fail on its own dependencies, which is not a session bug. Read the report in the error (or in the Merchant Center under Connect, the Connector's publish report), update the flagged package or code, and press r: the session tags, pushes and publishes again.
