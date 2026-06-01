---
name: commercetools-merchant-center-app
description: Custom Merchant Center applications — Application Kit scaffolding, custom views, custom panels, Apollo GraphQL state management, ui-kit components, and MC app deployment lifecycle. Use when building or extending a custom app in the Merchant Center.
when_to_use:
  - "Building a custom MC app with Application Kit scaffolding"
  - "Custom views — standalone pages in the MC sidebar navigation"
  - "Custom panels — embedded panels inside existing MC resource pages"
  - "Apollo GraphQL state management within a MC app"
  - "ui-kit components, forms, data tables, and navigation patterns"
  - "MC app environment configuration (env vars, permissions, menu links)"
  - "Deploying a custom app to the MC apps registry"
metadata:
  contentType: SKILL
  area:
    - platform
---

# commercetools Merchant Center App

Patterns for building custom applications inside the commercetools Merchant Center using the Application Kit.

## Key Takeaways

**Custom MC apps run inside an iframe in the Merchant Center.** The Application Kit provides the scaffolding, routing, and authentication so you don't have to implement MC SSO. Your app gets the current project key and user token via the Application Kit SDK.

**Two integration points: Custom Views and Custom Panels.** Custom Views are full-page apps that appear as standalone items in the MC sidebar. Custom Panels are embedded inside existing MC resource pages (e.g., an order detail panel). Choose based on whether the UI is standalone or contextually attached to a CT resource.

**Use Apollo Client for data fetching — it's pre-configured in the Application Kit.** The kit provides a pre-configured Apollo Client instance that handles MC authentication and points to the CT GraphQL endpoint for your project. Use `@commercetools-frontend/application-shell` hooks to access it.

**`@commercetools-uikit` is the component library.** All forms, tables, buttons, and navigation should use ui-kit components for visual consistency with the Merchant Center host. Do not use generic UI libraries (Material UI, Tailwind) as the primary component library inside a MC app.

**Configure permissions in `custom-application-config.mjs`.** MC apps declare their required API scopes and user permissions in the app config. These are enforced by the MC platform — the app will not load if the current user lacks the declared permissions.

---

## Reference Index

| Topic | Reference | Source |
|-------|-----------|--------|
| Application Kit scaffolding, project structure, config | [references/app-kit-scaffold.md](references/app-kit-scaffold.md) | Application Kit docs |
| Custom Views — routing, menu config, full-page app | [references/custom-views.md](references/custom-views.md) | MC App docs |
| Custom Panels — embedded panels, resource detail integration | [references/custom-panels.md](references/custom-panels.md) | MC App docs |
| Apollo GraphQL in MC apps — pre-configured client, hooks, CT GraphQL queries | [references/apollo-graphql.md](references/apollo-graphql.md) | Application Kit docs |
| ui-kit components — forms, data tables, buttons, navigation | [references/uikit-components.md](references/uikit-components.md) | @commercetools-uikit docs |
| Deployment — app registry, env vars, permissions, menu links | [references/deployment.md](references/deployment.md) | MC App deployment docs |

---

## Priority Tiers

### CRITICAL

- **Never make direct CT API calls with a client credentials token from a MC app.** The app runs in the browser — use the Application Kit's Apollo client which handles MC-scoped tokens automatically.
- **Declare all required API scopes in `custom-application-config.mjs`.** Missing scope declarations cause the MC platform to block app loading for users without those scopes.
- **Custom Views and Custom Panels have different entry points.** Custom Views use a top-level route; Custom Panels use the `customViewId` parameter. Mixing them up causes routing failures.

### HIGH

- **Use `@commercetools-uikit` for all UI components.** Third-party UI libraries break visual consistency with the MC host and may cause style conflicts inside the iframe.
- **Use Apollo Client's `useQuery` and `useMutation` hooks for all data fetching.** Do not use `fetch()` directly in a MC app — the Application Kit Apollo client handles token injection and error normalization.
- **Test with realistic data volumes.** MC apps often display resource lists (orders, customers, products) — test with pagination and large result sets before considering the feature complete.

### MEDIUM

- **Use the `@commercetools-frontend/application-shell` `useApplicationContext` hook** to access the current project key, user locale, and permissions rather than reading them from environment variables.
- **MC apps are versioned by deployment.** Rolling back requires redeploying the previous version — there is no rollback button in the MC registry.
