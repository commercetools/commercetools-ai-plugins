---
name: monorepo-with-storefront
description: Lay out a single repository that holds both a commercetools Connect connector (one or more backend apps + an optional Merchant Center custom app) and a customer-facing storefront. Covers the root-sibling folder layout the connect.yaml-at-root rule forces, why npm workspaces don't apply, and the two independent deploy lifecycles (Connect for the connector, Vercel/Netlify for the storefront).
when_to_use:
  - "Putting a Connect connector and a storefront in one repository"
  - "Deciding the folder structure for a connector + storefront monorepo"
  - "Understanding why connector apps must be root siblings and why npm workspaces don't fit"
  - "Coordinating the connector (Connect) and storefront (Vercel/Netlify) deploys from one repo"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - storefront
    - architecture
---

# Monorepo: Connector + Storefront

**Impact: MEDIUM — One repo holding a Connect connector and a storefront is convenient, but the layout is not free-form: `connect.yaml` at the repo root dictates where the backend apps must sit, and the two halves deploy on entirely separate lifecycles. Get the shape wrong and Connect can't find the apps, or the storefront build drags in connector code.**

This reference is only the **cross-cutting** concern — co-locating the two in one repo. It does not restate either side:

- Connector internals (scaffold, `shared/` folder, route↔endpoint, `connect.yaml` fields) → [project-structure.md](./project-structure.md).
- `connect.yaml` configuration contract and deploy lifecycle → [deployment-installation.md](./deployment-installation.md), CLI commands → [connect-cli.md](./connect-cli.md).
- Merchant Center custom app/view (scaffold, register, deploy via Connect) → [merchant-center-cli.md](./merchant-center-cli.md), [merchant-center-customizations.md](./merchant-center-customizations.md).
- Storefront layout, framework wiring, and **its deploy** → the **[commercetools-storefront](../../commercetools-storefront/SKILL.md)** skill and its stack adapter.

## Table of Contents
- [Pattern 1: The layout](#pattern-1-the-layout)
- [Pattern 2: Why this shape (the constraints)](#pattern-2-why-this-shape-the-constraints)
- [Pattern 3: Two independent deploy lifecycles](#pattern-3-two-independent-deploy-lifecycles)
- [Pattern 4: One repo or two?](#pattern-4-one-repo-or-two)
- [Checklist](#checklist)

---

## Pattern 1: The layout

Everything the connector deploys is a **direct child of the repo root**, beside `connect.yaml`. The storefront is just one more root sibling, in its own directory (the storefront's `<root-dir>`, e.g. `site/`):

```
<repo root>/
├── connect.yaml          # Connect: declares every backend app — MUST be at the repo root
├── package.json          # tooling hub only (dev scripts, install:all) — NOT an npm-workspaces root
│
├── orders/               # Connect service app   ─┐  each folder name == its connect.yaml `name`
├── inventory/            # Connect event app      ─┤  (only [A-Za-z0-9_-], no slashes →
├── merchant-center-app/  # Connect MC custom app  ─┘   the apps can only be root siblings)
├── shared/               # plain shared-code folder, imported by relative path (Pattern 3 below)
│
├── vercel.json           # storefront deploy config  ┐  owned by the storefront skill —
├── netlify.toml          # storefront deploy config  ┘  see its stack adapter, don't hand-author here
└── <root-dir>/                 # the storefront — deploys independently of Connect
```

The connector half (root `connect.yaml`, app folders, `shared/`) follows [project-structure.md](./project-structure.md) Patterns 1, 3, and 5 exactly — this only adds the storefront beside it.

## Pattern 2: Why this shape (the constraints)

Three platform facts force the layout; none are negotiable:

- **`connect.yaml` lives at the repo root, and `deployAs[].name` maps to a sibling folder.** Each app's `name` allows only `[A-Za-z0-9_-]` — no slashes — so a `connectors/orders/` nesting is impossible; backend apps can only be root siblings (verified: [connect.yaml reference](https://docs.commercetools.com/connect/development.md); see [project-structure.md](./project-structure.md#pattern-5-connectyaml-anatomy)).
- **No npm workspaces.** Connect clones the whole repo, then runs `npm install` and the build script **from inside each app folder** — never once from a workspace root. A root `package.json` with a `"workspaces"` field would therefore make every app's install pull in all workspace packages: bigger installs, version conflicts, surprises. So keep each connector app **self-contained** (its own `dependencies`), keep the root `package.json` a **tooling hub only** (dev scripts), and share code through a plain `shared/` **folder** imported by relative path (per [project-structure.md](./project-structure.md#pattern-3-multi-application-layout-and-the-shared-workspace)) — a shared *folder* is fine; a workspaces *root* is not.
- **The storefront is not a Connect app.** It has no entry in `connect.yaml` and deploys on its own (Pattern 3). Connect ignores it; it must ignore Connect.

## Pattern 3: Two independent deploy lifecycles

The same repo ships through **two pipelines that never touch each other**:

| Half | Deploys via | Follow |
|---|---|---|
| Connector (service/event/job apps) | commercetools Connect | [connect-cli.md Step 5](./connect-cli.md#step-5-stage-preview-publish-and-deploy), [deployment-installation.md](./deployment-installation.md) |
| Merchant Center custom app/view | commercetools Connect (a `merchant-center-*` app in the same `connect.yaml`) | [merchant-center-customizations.md](./merchant-center-customizations.md#pattern-5-deploy-via-connect-the-vessel) |
| Storefront (`<root-dir>/`) | Vercel or Netlify | the [commercetools-storefront](../../commercetools-storefront/SKILL.md) skill's stack adapter + its `/nextjs/nuxtjs-deploy-*` commands |

The one rule that makes them coexist: **scope the storefront host to the storefront directory** so it doesn't build the connector. The storefront skill already does this (its stack adapter pins the deploy config and tells you to set the platform's project root to the storefront dir — Vercel **Root Directory**, Netlify **base/package directory**). Don't re-derive or restate that config here; defer to the storefront skill, which owns it. Connect, for its part, only ever reads `connect.yaml` and the named app folders, so it ignores `<root-dir>/`, `vercel.json`, and `netlify.toml` entirely.

> Optionally skip a half's CI build when only the other half changed (e.g. a Vercel `ignoreCommand`) — a storefront-deploy detail; configure it per the storefront skill, not here.

## Pattern 4: One repo or two?

Co-locating is a convenience, not a requirement. Keep them in **one repo** when they're built, versioned, and released by the same people in lockstep (a small team shipping a connector + its admin/storefront together). Split into **separate repos** when release cadences, ownership, or compliance boundaries diverge — the connector and storefront share nothing at runtime, so splitting costs only a second checkout. The same trade-off governs whether multiple backend apps share one connector or split into several: see [architecture-decisions.md](./architecture-decisions.md).

---

## Checklist
- [ ] `connect.yaml` at the repo root; every backend app is a root-sibling folder whose name matches its `deployAs[].name`
- [ ] Root `package.json` is a tooling hub only — no `"workspaces"`; each connector app is self-contained
- [ ] Shared connector code in a plain `shared/` folder, imported by relative path (not via npm workspaces)
- [ ] Storefront lives in its own root-sibling dir `<root-dir>`; its deploy is scoped to that dir per the storefront skill
- [ ] Connector + MC app deployed via Connect; storefront deployed via Vercel/Netlify — two independent lifecycles
- [ ] MC custom app (if any) follows the register-first / update-URL-last sequence → [merchant-center-customizations.md](./merchant-center-customizations.md#pattern-5-deploy-via-connect-the-vessel)

**Back to:** [SKILL.md](../SKILL.md)
