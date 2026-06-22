---
name: project-structure
description: Scaffold and structure a Connect connector with the Connect CLI — project layout, the commercetools client (ts-client + platform-sdk), connect.yaml anatomy, route-to-endpoint matching, fail-fast env validation, typed SDK usage, and local dev (build/test/start) via the CLI.
when_to_use:
  - "Scaffolding a new connector with the Connect CLI"
  - "Laying out a connector repository and shared code across applications"
  - "Setting up the commercetools client (ts-client / platform-sdk)"
  - "Matching the Express route path to the connect.yaml endpoint"
  - "Understanding connect.yaml fields (deployAs, scripts, configuration, properties, inheritAs)"
  - "Adding fail-fast environment validation; running build/test/start locally"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - architecture
---

# Project Structure

**Impact: HIGH — Scaffolding by hand (instead of with the CLI) and mismatching the route path to the `connect.yaml` endpoint are common, avoidable failures: the first drifts from the platform's expected shape, the second makes the deployed app 404 on all traffic.**

## Table of Contents
- [Pattern 1: Scaffold with the Connect CLI](#pattern-1-scaffold-with-the-connect-cli)
- [Pattern 2: Match the route path to the connect.yaml endpoint](#pattern-2-match-the-route-path-to-the-connectyaml-endpoint)
- [Pattern 3: Multi-application layout and the shared workspace](#pattern-3-multi-application-layout-and-the-shared-workspace)
- [Pattern 4: commercetools client setup](#pattern-4-commercetools-client-setup)
- [Pattern 5: connect.yaml anatomy](#pattern-5-connectyaml-anatomy)
- [Pattern 6: Fail-fast environment validation](#pattern-6-fail-fast-environment-validation)
- [Pattern 7: Typed SDK usage at the boundary](#pattern-7-typed-sdk-usage-at-the-boundary)
- [Local development with the CLI](#local-development-with-the-cli)
- [Checklist](#checklist)

---

## Pattern 1: Scaffold with the Connect CLI

Do not hand-roll the project. The [Connect CLI](https://docs.commercetools.com/connect/cli) (`@commercetools/cli`) generates the canonical structure, scripts, tsconfig, lint/test config, and a working app skeleton — the same shape the platform expects.

**Follow the [connect-cli.md](./connect-cli.md) reference** ([Step 2 — Scaffold](./connect-cli.md#step-2-scaffold-the-connector)) for the full install → `auth login` → `connect init` (template) → version-pin → local-dev → ship sequence.

The generated `service` application looks like this (one folder per application; the folder name **must match** the `name` in `connect.yaml`):

```
my-connector/
├── connect.yaml                 # declares every application
└── service/
    ├── src/
    │   ├── index.ts             # express bootstrap (listens on the platform-provided port)
    │   ├── app.ts               # mounts the router at the endpoint path; error middleware
    │   ├── routes/              # router (+ a /status health route)
    │   ├── controllers/         # request handlers
    │   ├── client/              # build.client.ts (ClientBuilder) + create.client.ts (apiRoot)
    │   ├── connector/           # post-deploy.ts, pre-undeploy.ts, actions.ts
    │   ├── middleware/          # auth, error, http
    │   ├── validators/          # env validation
    │   ├── utils/               # config, logger
    │   └── types/ interfaces/
    ├── tests/                   # jest (the template seeds an integration spec)
    ├── package.json             # scripts: build, start, start:dev, test, connector:post-deploy…
    └── tsconfig.json
```


## Pattern 2: Match the route path to the connect.yaml endpoint

The platform forwards external traffic to `{connect-provided-url}/{endpoint}` (verified: [connect.yaml reference](https://docs.commercetools.com/connect/development.md)). Your Express app must serve that exact path, or every request 404s.

**INCORRECT — router mounted at `/` while `connect.yaml` says `/service`:**
```typescript
// connect.yaml →  endpoint: /service
app.use('/', serviceRouter);          // app serves POST / , platform calls POST /service → 404
```
*Why this fails:* the deployed URL is `…commercetools.app/service`; traffic arrives at `/service`, but the app only handles `/`. Nothing reaches your handler. (This is a real, easy-to-miss mismatch — keep the two in lockstep.)

**CORRECT — mount at the endpoint base, route relative to it (the CLI template's pattern):**
```typescript
// connect.yaml →  endpoint: /service
app.use('/service', serviceRouter);   // app.ts
// routes/service.route.ts
serviceRouter.post('/', handler);      // full path = POST /service
serviceRouter.get('/status', liveness);
```
If you change `endpoint` in `connect.yaml`, change the `app.use(...)` mount to match. Keep `/status` reachable for liveness ([observability-operations.md](./observability-operations.md)).

## Pattern 3: Multi-application layout and the shared workspace

A connector with more than one application (e.g. two `service` extensions + an `event` handler) gets one folder per `deployAs` entry plus a `shared/` workspace for code they all use — the SDK client builder, env validation, error middleware, JWT/secret checks, and domain mappers.

```
my-connector/
├── connect.yaml
├── service-a/  service-b/   event/   job/      # one per application; name matches connect.yaml
└── shared/src/                    # client, errors, middleware, validators, types, mappers
```
Duplicating that shared code across apps guarantees drift. Note the `shared/` is a plain code **folder** imported by relative path — *not* an npm-workspaces root; Connect builds each app folder independently. To put this connector and a storefront in **one repo**, see [monorepo-with-storefront.md](./monorepo-with-storefront.md).

## Pattern 4: commercetools client setup

Use the **current, pinned** client stack enforced in [connect-cli.md Step 3](./connect-cli.md#step-3-pin-dependency-versions).

Don't instantiate `ClientBuilder` per request — build `apiRoot` once and reuse it. When the platform auto-generates the API client (`inheritAs.apiClient.scopes`), the credentials arrive as env vars; read them through validated config (Pattern 6). For the full SDK/`ClientBuilder` reference and auth/region URLs, see the [commercetools-platform](../../commercetools-platform/SKILL.md) skill rather than restating them here.

## Pattern 5: connect.yaml anatomy

`connect.yaml` at the repo root declares every application; it's the install contract. For the full field reference, read the [connect.yaml docs](https://docs.commercetools.com/connect/development.md) — the points that change *your* decisions:

```yaml
deployAs:
  - name: service                 # must match the folder name
    applicationType: service
    endpoint: /service             # must match your route mount (Pattern 2)
    scripts:                       # optional — only if you create Extensions/Subscriptions/Types
      postDeploy: npm ci && npm run build && npm run connector:post-deploy
      preUndeploy: npm ci && npm run build && npm run connector:pre-undeploy
    configuration:
      standardConfiguration: [ { key: CTP_REGION, description: …, required: true } ]   # non-secret
      securedConfiguration: [ { key: EXTERNAL_API_KEY, description: …, required: true } ]  # secrets
  - name: nightly-reconcile
    applicationType: job
    endpoint: /job
    properties: { schedule: '0 1 * * *' }   # cron; required for job; overridable per deployment
inheritAs:
  apiClient:
    scopes: [ manage_orders, manage_subscriptions, manage_extensions ]   # least-privilege; platform generates the client
```
Decision-relevant notes: secrets go in `securedConfiguration` (never `standardConfiguration`, never hardcoded — [security.md](./security.md)); `inheritAs.apiClient.scopes` makes the platform auto-generate a scoped API client at install ([security.md](./security.md)); `scripts` is only needed for resource registration ([lifecycle-scripts.md](./lifecycle-scripts.md)); `properties.schedule` is `job`-only ([job-applications.md](./job-applications.md)).

## Pattern 6: Fail-fast environment validation

Connect apps are **stateless** (no shared filesystem, no session storage — [best practices](https://docs.commercetools.com/connect/best-practices)); all config arrives as env vars and must be validated once at startup so a bad deploy fails visibly, not mid-request.

**INCORRECT:** `const key = process.env.EXTERNAL_API_KEY!;` deep in a handler — undefined → cryptic 500 in production, and `!` hides it.

**CORRECT — validate all config once, throw on invalid:**
```typescript
let cached: Config | undefined;
export function readConfiguration(): Config {
  if (cached) return cached;
  const cfg = { region: process.env.CTP_REGION, externalApiKey: process.env.EXTERNAL_API_KEY };
  const errors = validate(cfg);            // typed rules: present, length, format, enum
  if (errors.length) throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  return (cached = cfg as Config);
}
```
Call it from `app.ts`/`index.ts` before the server starts. 

## Pattern 7: Typed SDK usage at the boundary

Type payloads as `@commercetools/platform-sdk` types and map to your own domain types at the edge; no `any` escapes, no dead code.

**INCORRECT:** `const order = req.body.payload as any;` then `order.lineItems[0].variant.sku`.
**CORRECT:**
```typescript
import type { Order } from '@commercetools/platform-sdk';
const order: Order = await getOrderById(resourceId);   // typed end to end
const dto = toExternalOrder(order);                     // map in shared/src/mappers
```

## Local development with the CLI

Run everything through the CLI so local behavior matches the platform — `commercetools connect application build | start | test` and `commercetools connect validate`. Exact commands and flags: [connect-cli.md Step 4](./connect-cli.md#step-4-develop-and-test-locally) and the [Connect CLI docs](https://docs.commercetools.com/connect/cli). The generated `package.json` also exposes `npm run build|start|start:dev|test` and `connector:post-deploy`/`connector:pre-undeploy`; the CLI wraps the same lifecycle in the platform's environment.

---

## Checklist
- [ ] Project scaffolded with `commercetools connect init` (not hand-rolled); built on the template structure
- [ ] One folder per `deployAs` entry; folder name matches application `name`
- [ ] Express router mounted at the same base path as `connect.yaml` `endpoint`; `/status` reachable
- [ ] Pinned versions: `@commercetools/ts-client@^4` + `@commercetools/platform-sdk@^8` (not `sdk-client-v2`); Java `spring-boot-starter-parent` 3.x+ & commercetools Java SDK 19+; `apiRoot` built once and reused
- [ ] Shared code in a single `shared/` workspace (multi-app connectors); imported, not duplicated
- [ ] Secrets only in `securedConfiguration`; least-privilege `inheritAs.apiClient.scopes`
- [ ] `readConfiguration()` validates all env vars once at startup and throws on invalid; app is stateless
- [ ] SDK types end to end; no `any` escapes; no dead code
- [ ] `commercetools connect validate` passes; `commercetools connect application test` runs the suite

**Next:** [event-applications.md](./event-applications.md) · [service-applications.md](./service-applications.md) · [job-applications.md](./job-applications.md) · [deployment-installation.md](./deployment-installation.md)
