---
name: crm-config-from-requirements
description: Map CRM requirements to a commercetools connector's connect.yaml — direction → app composition, source of truth, externalId/Custom-Field linking, least-privilege scopes, secured config — with a worked example. The CRM sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - crm
    - connect
---

# Requirements → CRM connector config

This turns the Step 1 requirements ([overview.md](./overview.md)) into concrete `connect.yaml` values and a linking model. For a public connector these are its documented keys; for a build these are the keys and apps you define.

## The requirement → config map

| Requirement (Step 1) | Config / decision | Why |
|---|---|---|
| Which CRM + credentials | `securedConfiguration`: CRM API token / OAuth client id+secret | Secrets never in `standardConfiguration`, never hardcoded; this is PII-adjacent |
| Direction (out / in / both) | **App composition** (see below) | Direction *is* the architecture — it decides which apps exist |
| Source of truth | Field-level read/write ownership; read-only Custom Fields on the mastered side | Prevents the losing side from overwriting the master |
| Which entities/objects | Mapping module: Customer→Contact, Order→Deal | The core of the build; keep it a pure function |
| Which events sync (out) | Subscription message types registered in `postDeploy` | Only subscribe to what you sync |
| Deletion / consent | `CustomerDeleted` subscription (out) and/or erasure endpoint; consent field mapping | GDPR: deletion must propagate; consent must not be lost |
| Region + project | `standardConfiguration: CTP_REGION`; scopes via `inheritAs` | Host + client provisioning are region/project specific |
| Volume / latency | event/webhook (real-time) vs job (batch) + page size / backoff toggles | Batch vs broadcast is the documented trade-off |

## Direction → app composition

Direction decides which apps you deploy. Build only what the direction needs (see the table in [overview.md](./overview.md)):

- **commercetools → CRM (outbound):** one or more **`event`** apps. To catch *every* customer change, register a **ChangeSubscription** on the `customer` resource (delivers `ResourceCreated`/`ResourceUpdated`/`ResourceDeleted`); to sync only specific changes, register **MessageSubscriptions** to the Customer messages you care about (`CustomerCreated`, `CustomerEmailChanged`, `CustomerAddressAdded`, `CustomerDeleted`, …). Add `OrderCreated` if syncing orders. This is the *broadcasting events* pattern.
- **CRM → commercetools (inbound):** a **`service`** inbound webhook (CRM pushes changes; 5-min timeout, you authenticate the caller) **or** a **`job`** that polls the CRM for deltas on a schedule. Pick webhook when the CRM can push and you need low latency; poll when it can't or when batch is fine.
- **Initial migration:** a **`job`** for the one-time bulk backfill — kept separate from the ongoing sync, as the docs recommend, because backfill and delta need different pagination/throughput handling.

## Source of truth and the linking model

The single most consequential choice after direction. Decide **who masters customer data**, then wire the link:

- **Link every synced pair by a stable key.** Store the CRM record id in the Customer's **`externalId`** (the field commercetools provides for exactly this — external-system references), or in a Custom Field if `externalId` is already used. This key is your **upsert / idempotency key** in both directions — never blind-create.
- **When the CRM masters** customer data, keep a Customer in commercetools anyway (it owns permissions, Cart/Order ownership, and promotions), and hold CRM-only attributes in **Custom Fields marked read-only** so storefront/MC edits can't diverge from the master.
- **When commercetools masters**, the CRM record is downstream; write to it, don't read authoritative fields back.
- **Bi-directional is discouraged.** If unavoidable, you must assign *field-level* ownership (which side wins per field) and add self-change filtering to break loops — see [crm-contract.md](./crm-contract.md).

## The connect.yaml envelope

`connect.yaml` has **no published JSON Schema** — its shape is defined only by the [docs](https://docs.commercetools.com/connect/development.md). Use only documented envelope keys (`deployAs` / `applicationType` / `endpoint` / `scripts` / `configuration`; `inheritAs`), and place the file at the **repository root** — a nested `connect.yaml` silently fails to deploy.

### Native client provisioning (prefer this)

Declare the connector's scopes and let Connect mint a least-privilege API client, rather than hand-supplying `CTP_CLIENT_ID`/`SECRET`. Scopes depend on direction:

```yaml
inheritAs:
  apiClient:
    scopes:
      - manage_subscriptions   # outbound: postDeploy registers the Subscriptions
      - view_customers         # outbound: re-fetch the Customer to build the CRM payload
      - view_orders            # outbound: re-fetch the Order (if syncing orders)
      # inbound instead needs:
      # - manage_customers     # upsert Customers coming from the CRM
      # - manage_types         # only if postDeploy creates the Custom Type for CRM fields
  configuration:
    standardConfiguration:
      - key: CRM_BASE_URL
        description: CRM API base URL (or sandbox vs prod toggle)
    securedConfiguration:
      - key: CRM_API_TOKEN
        description: CRM API token / OAuth client secret
```

> **Note:** `view_subscriptions` is **not** a valid standalone scope — `manage_subscriptions` covers read + write. Declaring non-existent view scopes fails client creation. Grant `manage_customers` only on the inbound app that actually writes Customers.

### Per-app config

```yaml
deployAs:
  - name: customer-syncer          # outbound example
    applicationType: event
    endpoint: /customerSyncer
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy   # registers the Subscriptions
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
    configuration:
      standardConfiguration:
        - key: CONNECT_SUBSCRIPTION_DESTINATION
          description: "GoogleCloudPubSub or SNS"
  - name: crm-migration            # one-time backfill
    applicationType: job
    endpoint: /crmMigration
    properties:
      schedule: "0 3 * * *"        # or run on-demand
```

## Worked example (HubSpot, build, commercetools → CRM one-way)

Requirements: HubSpot; **CRM is master for marketing attributes but commercetools masters the account record**; sync every customer change + `OrderCreated` out; one-time migration of existing customers; propagate deletion; near-real-time; `europe-west1.gcp`.

Derived config:

```yaml
inheritAs:
  apiClient:
    scopes: [manage_subscriptions, view_customers, view_orders]
  configuration:
    standardConfiguration:
      - key: CRM_BASE_URL
        description: "HubSpot API base (sandbox vs prod)"
    securedConfiguration:
      - key: CRM_API_TOKEN
        description: HubSpot private-app token
deployAs:
  - name: customer-syncer
    applicationType: event
    endpoint: /customerSyncer
    scripts: { postDeploy: "npm ci --omit=dev && npm run connector:post-deploy", preUndeploy: "npm ci --omit=dev && npm run connector:pre-undeploy" }
    configuration:
      standardConfiguration:
        - key: CONNECT_SUBSCRIPTION_DESTINATION
          description: "GoogleCloudPubSub or SNS"
  - name: crm-migration
    applicationType: job
    endpoint: /crmMigration
```

Rationale to hand the user: one **event** syncer registering a ChangeSubscription on `customer` (covering create/update/delete in one) plus an `OrderCreated` MessageSubscription; a **job** for the one-time backfill; scopes are exactly what the `postDeploy` registration and the resource re-fetches need — nothing more; the HubSpot token is `securedConfiguration`; each contact is upserted by `externalId` = HubSpot contact id, written back to the Customer on first sync. Marketing attributes that HubSpot masters are held in **read-only Custom Fields** so they aren't clobbered from commercetools ([crm-contract.md](./crm-contract.md)).
