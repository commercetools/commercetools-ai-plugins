---
name: merchant-center-customizations
description: Build a Merchant Center custom application or custom view and ship it with Connect as the deployment vessel — choosing app vs view, the config-file contract (entryPointUriPath, oAuthScopes, env), the local develop-and-test loop, permissions, and the connect.yaml plus order-of-operations to deploy via Connect.
when_to_use:
  - "Deciding between a custom application and a custom view"
  - "Configuring custom-application-config.mjs / custom-view-config.mjs (entry point, scopes, env, menu links)"
  - "Developing and testing a custom app/view locally"
  - "Deploying a custom application or custom view via Connect"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - merchant-center
    - deployment
---

# Merchant Center Custom Applications & Views

**Impact: HIGH — A custom application or view is operator-facing UI inside the Merchant Center. The choice of app vs view, an over-broad `oAuthScopes`, or a botched register→deploy→URL handshake either blocks the UI from loading or exposes data the operator shouldn't see.**

This is the judgment layer. For the CLI commands themselves (scaffold, run, build, login) see [merchant-center-cli.md](./merchant-center-cli.md); for the shared Connect deploy lifecycle see [deployment-installation.md](./deployment-installation.md). The official docs are the source of truth for every field and step — this reference tells you *which* decisions matter and *why*, and links the rest.

## Table of Contents
- [Contract facts (verified)](#contract-facts-verified)
- [Pattern 1: Custom application vs custom view](#pattern-1-custom-application-vs-custom-view)
- [Pattern 2: The config-file contract](#pattern-2-the-config-file-contract)
- [Pattern 3: Permissions](#pattern-3-permissions)
- [Pattern 4: Develop and test locally](#pattern-4-develop-and-test-locally)
- [Pattern 5: Deploy via Connect (the vessel)](#pattern-5-deploy-via-connect-the-vessel)
- [Checklist](#checklist)

## Contract facts

From the Merchant Center customizations docs ([overview](https://docs.commercetools.com/merchant-center-customizations/overview.md), [Custom Applications](https://docs.commercetools.com/merchant-center-customizations/custom-applications.md), [Custom Views](https://docs.commercetools.com/merchant-center-customizations/custom-views.md)):

- A customization is a **hosted React application** built on the application-shell; the Merchant Center loads it from a URL you control. It is *not* a backend service — there is no inbound webhook, no Subscription, no `endpoint`.
- It runs **in the operator's authenticated session**: it inherits the logged-in user's project and permissions, and calls the commercetools APIs (and your own) on their behalf via the MC's proxy. There is no machine-to-machine API client for the UI itself.
- `entryPointUriPath` (apps) is **unique per cloud Region environment** and fixes the serving route; it cannot collide with another customization in the same Region.

---

## Pattern 1: Custom application vs custom view

Decide this before scaffolding — it changes the config file, the test utility, and the `connect.yaml` type.

- **Custom application** — a standalone destination with its own route and a **main-menu entry**, reachable from anywhere in the Merchant Center. Use it when the functionality doesn't belong inside a built-in application (a bespoke dashboard, an integration console, a bulk tool).
- **Custom view** — an embedded `CustomPanel` rendered **inside an existing built-in MC page** (e.g. a panel on the product detail page). Use it when the functionality augments a built-in app and you want to keep the operator in context instead of sending them to a separate screen. A view declares `locators` (which MC locations it may render in) and `typeSettings.size` (`SMALL`/`LARGE`) instead of menu links.

If the work is "a new place in the MC," build an application; if it's "extra capability on an existing screen," build a view (verified: [overview](https://docs.commercetools.com/merchant-center-customizations/overview.md)).

## Pattern 2: The config-file contract

Each customization is driven by a single config file — `custom-application-config.mjs` for apps, `custom-view-config.mjs` for views (`.json`/`.js`/`.mjs`/`.ts` are all accepted; `.mjs` is the starter and Connect default). Treat it as the contract between your code, the MC, and the deployment host. Don't memorize every field — know the ones that carry intent and read the rest in the docs (verified: [custom-application-config](https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/custom-application-config.md), [custom-view-config](https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/custom-view-config.md)):

- **Identity & routing** — `entryPointUriPath` (apps, unique per cloud Region environment) or `type: CustomPanel` + `locators` (views).
- **Region** — `cloudIdentifier` (e.g. `gcp-eu`); must match the project's region.
- **`env.development`** — `initialProjectKey`, `teamId`: which project/team and permission set you run against locally.
- **`env.production`** — `applicationId` (apps) / `customViewId` (views) and `url`: the registered ID and the hosting URL.
- **Permissions** — `oAuthScopes` (the default `view`/`manage` pair) and optional `additionalOAuthScopes` (Pattern 3).
- **Navigation (apps)** — `mainMenuLink` / `submenuLinks`, each with their own required `permissions`.

**Use `${env:...}` placeholders for the deploy-time values**, not literals — e.g. `applicationId: '${env:CUSTOM_APPLICATION_ID}'`, `url: '${env:APPLICATION_URL}'`, `entryPointUriPath: '${env:ENTRY_POINT_URI_PATH}'`. Those placeholders are exactly what Connect injects from `connect.yaml` at deploy time (Pattern 5), so the same repo deploys to any project without edits.

## Pattern 3: Permissions

Every customization ships a default **`view`** (read-only) and **`manage`** (read-write) permission pair; you may add granular groups via `additionalOAuthScopes` when one screen needs finer control than the others. Request **only the scopes the UI actually uses** — the operator's session is the blast radius. Gate the rendered UI to match: use the `useIsAuthorized` hook for in-page controls, and set `permissions` on `mainMenuLink`/`submenuLinks` so unauthorized users don't even see the entry (verified: [permissions](https://docs.commercetools.com/merchant-center-customizations/development/permissions.md)).

## Pattern 4: Develop and test locally

Run it against a real project before you deploy. `mc-scripts start` (→ [merchant-center-cli.md](./merchant-center-cli.md)) serves the app/view at `http://localhost:3001` using `env.development`. A view renders inside a host dummy app so you see it in context.

Test through the application-shell, not bare React — the shell provides the data, locale, and permission context the UI depends on (verified: [testing](https://docs.commercetools.com/merchant-center-customizations/development/testing.md)):

- **Jest** with the `@commercetools-frontend/jest-preset-mc-app` preset.
- The application-shell **test-utils**: `renderAppWithRedux` (applications) and `renderCustomView` (views), so components mount with a realistic shell.
- Drive permission paths explicitly (a `view`-only user must not see `manage` controls).
- **Cypress** for end-to-end flows.

## Pattern 5: Deploy via Connect (the vessel)

Connect is the recommended host: it builds the bundle, serves it on a managed URL, and ties the customization into the same connector lifecycle as the rest of your Connect apps. (Other hosts — Vercel, Netlify, Render, AWS, Azure, Cloudflare, Google Cloud — are documented alternatives; verified: [deployment](https://docs.commercetools.com/merchant-center-customizations/deployment.md).)

**Declare the customization in `connect.yaml`** with the MC-specific `applicationType`. Unlike `service`/`event`/`job`, there is **no `endpoint` and no `securedConfiguration`**, and you do **not** declare `APPLICATION_URL` — Connect provides it automatically (verified: [deploy via Connect](https://docs.commercetools.com/merchant-center-customizations/deployment/commercetools-connect.md)):

```yaml
deployAs:
  - name: my-app
    applicationType: merchant-center-custom-application
    configuration:
      standardConfiguration:
        - key: CUSTOM_APPLICATION_ID
          description: the Custom Application ID
          required: true
        - key: ENTRY_POINT_URI_PATH
          description: The Application entry point URI path
          required: true
        - key: CLOUD_IDENTIFIER
          description: The cloud identifier
          default: 'gcp-eu'
```

A custom view uses `applicationType: merchant-center-custom-view` with `CUSTOM_VIEW_ID` and `CLOUD_IDENTIFIER` (no entry-point path). These keys feed the `${env:...}` placeholders from Pattern 2.

**Order of operations — register first, fix the URL last.** The ID and the URL have a chicken-and-egg relationship; the docs resolve it with a placeholder:

1. **Register** the custom app/view in the Merchant Center with a *placeholder URL* → obtain its **ID** (`CUSTOM_APPLICATION_ID` / `CUSTOM_VIEW_ID`).
2. **Scaffold** a Connect-shaped project containing the MC app/view (→ [merchant-center-cli.md](./merchant-center-cli.md)).
3. **Wire** the config file's `${env:...}` placeholders and add the `connect.yaml` block above.
4. **Push** to git and cut a release tag.
5. **Stage → publish → deploy** with the Connect CLI: `connectorstaged create` → `publish` → `deployment create`, supplying the ID, entry-point path, and region — exact commands and flags in [connect-cli.md Step 5](./connect-cli.md#step-5-stage-preview-publish-and-deploy).
6. **Retrieve** the deployed URL from the deployment.
7. **Update** the Merchant Center registration, replacing the placeholder URL with the deployed one.

Deploy in the **same region** as the project and keep `cloudIdentifier` consistent with it. For the connector-level lifecycle (deployment types, redeploy on config change, regions, troubleshooting) see [deployment-installation.md](./deployment-installation.md).

---

## Checklist
- [ ] App-vs-view chosen deliberately (own route/menu → application; embedded `CustomPanel` → view)
- [ ] Config file uses `${env:...}` placeholders for `applicationId`/`customViewId`, `url`, and `entryPointUriPath` — no hardcoded per-project values
- [ ] `oAuthScopes` requests only what the UI uses; UI gated with `useIsAuthorized` and menu-link `permissions`
- [ ] Run and tested locally via the application-shell (`mc-scripts start`, jest-preset + `renderAppWithRedux`/`renderCustomView`), including a permission-denied path
- [ ] `connect.yaml` uses the correct `merchant-center-*` `applicationType` with no stray `endpoint`, `securedConfiguration`, or `APPLICATION_URL`
- [ ] Register-first / update-URL-last sequence followed; deployed in the project's region with a matching `cloudIdentifier`

**Back to:** [SKILL.md](../SKILL.md)
