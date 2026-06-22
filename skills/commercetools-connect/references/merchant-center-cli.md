---
name: merchant-center-cli
description: The Merchant Center customization CLI toolchain — scaffold with @commercetools-frontend/create-mc-app, then develop, authenticate, build, serve, and sync config with @commercetools-frontend/mc-scripts. The canonical source for every command used to create and run a custom application or custom view locally.
when_to_use:
  - "Scaffolding a new Merchant Center custom application or custom view"
  - "Looking up the exact mc-scripts command for start, build, compile-html, serve, login, or config:sync"
  - "Authenticating the CLI against a real project for local development"
  - "Pinning the @commercetools-frontend/* package versions"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - merchant-center
    - tooling
---

# Merchant Center CLI

You are scaffolding and running a Merchant Center **custom application** or **custom view** with the official Merchant Center frontend toolchain. This reference is the mechanics — the *judgment* (when to build an app vs a view, the config-file contract, and deploying via Connect) lives in [merchant-center-customizations.md](./merchant-center-customizations.md).

> **This is a different CLI from the Connect CLI.** MC customizations are built with the `@commercetools-frontend/*` toolchain (`create-mc-app`, `mc-scripts`), **not** `@commercetools/cli`. The Connect CLI ([connect-cli.md](./connect-cli.md)) only enters the picture at deploy time, when Connect ships the built bundle (Step 5 there). Don't conflate the two.

Sections: [Step 1 — Scaffold](#step-1-scaffold) · [Step 2 — The mc-scripts toolchain](#step-2-the-mc-scripts-toolchain) · [Step 3 — Pin versions](#step-3-pin-versions) · [Step 4 — Develop & authenticate locally](#step-4-develop-and-authenticate-locally)

## Step 1. Scaffold

Generate the project from the official starter — don't hand-roll the tree (it carries the config file, `index.html.template`, the application-shell wiring, and the test setup).

```bash
# Custom application (default):
npx @commercetools-frontend/create-mc-app@latest my-app --template starter

# Custom view:
npx @commercetools-frontend/create-mc-app@latest my-view --application-type custom-view --template starter
```

`--template starter` is JavaScript; use `--template starter-typescript` for TypeScript. Whether you want an application or a view is a deliberate decision — see [merchant-center-customizations.md](./merchant-center-customizations.md), Pattern 1 (verified: [Custom Applications](https://docs.commercetools.com/merchant-center-customizations/custom-applications.md), [Custom Views](https://docs.commercetools.com/merchant-center-customizations/custom-views.md)).

## Step 2. The `mc-scripts` toolchain

`@commercetools-frontend/mc-scripts` is the build/run tool for both apps and views. Run everything through it so local behavior matches what Connect ships (verified: [CLI](https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/cli.md)).

| Command | What it does |
|---|---|
| `mc-scripts start` | Dev server with hot reload at `http://localhost:3001` |
| `mc-scripts build` | Production bundle into `public/` (`--build-only` skips HTML compilation) |
| `mc-scripts compile-html` | Compiles `index.html.template` → `index.html` per the config file (`--transformer <path>` to customize) |
| `mc-scripts serve` | Serves the already-built `public/` locally — production-mode smoke test |
| `mc-scripts login` | Authenticates the CLI against your project (`--headless` for CI) |
| `mc-scripts config:sync` | Creates/updates the customization's config in the Merchant Center |
| `mc-scripts config:sync:ci` | Non-interactive `config:sync` for pipelines (`--dry-run` to preview) |

The generated `package.json` wraps these as `npm`/`yarn` scripts (`start`, `build`, `compile-html`); use the underlying `mc-scripts` names when you need a flag.

## Step 3. Pin versions

Keep **all** `@commercetools-frontend/*` packages on the **same** version — `mc-scripts`, `application-shell`, `ui-kit`, `jest-preset-mc-app`, the i18n/permissions packages. They are released in lockstep and mixing versions breaks the shell at runtime. Bump them together, never individually.

## Step 4. Develop and authenticate locally

```bash
mc-scripts login    # authenticate against a real project (one-time, opens a browser)
mc-scripts start    # http://localhost:3001
```

`mc-scripts start` serves the customization against a real project — `login` establishes the session and the config file's `env.development` (`initialProjectKey`, `teamId`) selects which project/team and permission set you develop against (see [merchant-center-customizations.md](./merchant-center-customizations.md), Pattern 2). A **custom view** has no route of its own, so the local server first renders a host dummy application and embeds your panel inside it, mirroring how it appears in the Merchant Center (verified: [Custom Views](https://docs.commercetools.com/merchant-center-customizations/custom-views.md)).

> Flags and options can evolve — confirm with `npx @commercetools-frontend/mc-scripts --help` and the [Merchant Center CLI docs](https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/cli). Source of truth for platform behavior: [docs.commercetools.com/merchant-center-customizations](https://docs.commercetools.com/merchant-center-customizations).

**Next:** [merchant-center-customizations.md](./merchant-center-customizations.md) — implement and deploy a custom app/view via Connect.
