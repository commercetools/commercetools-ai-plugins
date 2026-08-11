---
name: build-oms-connector
description: Build a new commercetools Connect connector for a user-defined order-management service (ladder rung 4) — there is no dedicated OMS template, so scaffold with create-connect-app and compose event (export) + service (inbound webhook) + job (reconcile) applications, connecting to the OMS API the user defines.
when_to_use:
  - "No public connector fits, or the OMS is bespoke/home-grown, and a new connector must be built"
  - "Deciding which applications to declare in connect.yaml for an order-management connector and how to connect to the OMS API"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - order-management
    - oms
    - integration
---

# Build a new OMS connector

This is ladder **rung 4**: no existing connector fits, or the OMS is bespoke/home-grown, so you build one connecting to the OMS API the user defines. This reuses the parent [commercetools-connect](../../../SKILL.md) build-side workflow — the platform contracts, security, testing, and deploy are all type-agnostic. This page only covers what's specific to *order management*; do not duplicate the parent references, route to them.

## Start from the `fulfilment-integration` template

There **is** a dedicated starting template for this: the Connect CLI ships a `fulfilment-integration` template ([connect-cli.md](../../connect-cli.md) template list; repo [connect-fulfilment-integration-template](https://github.com/commercetools/connect-fulfilment-integration-template)). Note it is **not** on the public [Application templates overview](https://docs.commercetools.com/connect/templates/templates-overview.md) page (which documents only payment, product-export, tax, and email) — it's exposed through the CLI, so scaffold from it rather than composing from scratch:

```bash
commercetools connect init my-oms-connector --template fulfilment-integration
```

The template declares **four applications** that map almost 1:1 onto the [sync-architecture.md](./sync-architecture.md) flows — a strong signal your design is on the intended path:

| Template app | Type | Trigger | Sync flow it implements |
|---|---|---|---|
| **order-export** | `event` | Subscription on `OrderCreated` / `ReturnInfoAdded` | Export placed Orders → OMS |
| **order-updates** | `service` (REST) | inbound `endpoint: /order-updates` | Inbound status/shipping/packaging/parcel/tracking OMS → commercetools |
| **inventory-import** | `service` (REST) | inbound `endpoint: /inventory` | Inbound stock/status updates → `InventoryEntry` |
| **product-export** | `event` | Subscription on `ProductPublished` | (product sync — keep only if you need it) |

Keep the apps the requirements call for and delete the rest. If you also need a **reconcile `job`** (nightly full sync — the template doesn't ship one), add it with `commercetools connect application add --type job`. The [tax-integration template](https://docs.commercetools.com/connect/templates/tax-integration.md) `order-syncer` is a secondary reference for the `OrderCreated` subscriber shape.

Confirm that order **export reacts to Order Messages, so it is an `event` app** — the template's `order-export` is `deployAs: event`, and Subscription Messages are delivered to `event` applications through the Connect message broker; `service` apps are for API Extensions or inbound webhooks (here, `order-updates` / `inventory-import`). See the parent decision framework in [commercetools-connect](../../../SKILL.md) and [event-applications.md](../../event-applications.md).

Use only documented `connect.yaml` envelope keys (`deployAs`/`applicationType`/`configuration`/`inheritAs`) and keep the file at the **repository root** — a nested file silently fails to deploy ([project-structure.md](../../project-structure.md)).

## Connecting to the user-defined OMS

The OMS is an arbitrary external system — treat its API as the untrusted outbound/inbound boundary:

- **Config, not code.** OMS base URL, tenant/account id, and non-secret toggles → `standardConfiguration`. OMS API key/client secret, webhook signing secret → `securedConfiguration`, never hardcoded ([security.md](../../security.md)).
- **Deploy-time validation.** `postDeploy` should test-connect to the OMS and surface bad credentials immediately, and register the Subscription + any custom [State](https://docs.commercetools.com/api/projects/states.md) machine / Custom Types idempotently (get-then-create, never blind delete-recreate) → [lifecycle-scripts.md](../../lifecycle-scripts.md).
- **Map at the boundary.** Convert between the OMS's order/status model and commercetools' at the edge; keep SDK types end to end internally, no `any` escapes ([project-structure.md](../../project-structure.md)). The concrete field/action mapping is [sync-architecture.md](./sync-architecture.md).
- **Least-privilege scopes.** `inheritAs.apiClient.scopes` with only what the flows need — typically `manage_orders`, `view_orders`, `manage_subscriptions`, and `manage_inventory` if syncing stock — not `manage_project`.
- **Fail-open vs fail-closed.** Since the export is async and the inbound is a webhook (neither on a synchronous checkout path), a transient OMS outage should fail *closed* with retry (return non-ack / non-2xx to trigger redelivery), not silently drop. Document the stance in the README.

## Build test-first, then deploy

Build on the parent workflow's Quality gate — **test before implementation** for each behavior (failing test → confirm red for the right reason → least code to pass → refactor). Mock the OMS API and the commercetools API; assert on which endpoint your code called, with what body, and what it did with the response. The suite runs with zero deployment and zero secrets. → [testing.md](../../testing.md).

Pin the [sync-architecture.md](./sync-architecture.md) invariants as regression tests: export idempotent on `orderNumber`/OMS ref, inbound idempotent (redelivery no-op, no stale overwrite), self-change filtering prevents loops, inbound webhook rejects unauthenticated callers.

Deploy is type-agnostic: an Organization connector goes `connectorstaged create → publish → deployment create` (the publish-time production-readiness scan applies) → [deployment-installation.md](../../deployment-installation.md).

## Checklist
- [ ] Scaffolded from the `fulfilment-integration` template (`connect init --template fulfilment-integration`); kept only the needed apps (order-export/order-updates/inventory-import), added a reconcile `job` if required
- [ ] Applications declared in a root `connect.yaml` using only documented envelope keys; router mounts match `endpoint`; order-export is `deployAs: event`
- [ ] OMS URL/tenant in standardConfiguration; OMS + webhook secrets in securedConfiguration
- [ ] `postDeploy` validates OMS connectivity and idempotently registers Subscription + custom States/Types; `preUndeploy` cleans up
- [ ] Least-privilege scopes (`manage_orders` / `view_orders` / `manage_subscriptions` / `manage_inventory` as needed)
- [ ] Fail-open/closed stance documented; inbound webhook authenticated
- [ ] Built test-first; sync invariants pinned as tests; deployed via `connectorstaged → publish → deployment create`
