---
name: analytics-config-from-requirements
description: Map analytics-export requirements to a commercetools connector's connect.yaml — which Messages the streamer subscribes to and/or the batch job schedule, least-privilege read scopes, destination credentials in securedConfiguration — with a worked example. The analytics sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - analytics
    - data
    - connect
    - integration
---

# Requirements → analytics connector config

This turns the Step 1 requirements ([overview.md](./overview.md)) into concrete `connect.yaml` values. For a public connector these are its documented keys; for a build (the common case) these are the keys and apps you define.

## The requirement → config map

| Requirement (Step 1) | Config / decision | Why |
|---|---|---|
| Destination + credentials | `securedConfiguration`: destination API key / service-account JSON / connection string | Secrets never in `standardConfiguration`, never hardcoded — often PII-adjacent |
| Latency (stream / batch / both) | **App composition** (see below) | Direction is fixed (egress); latency decides which apps exist |
| Which data domains | The Messages the streamer subscribes to **and** the read scopes | Only subscribe to / read what you export |
| Historical backfill | A separate **`job`** with a `schedule` (or on-demand) | Backfill and delta need different tooling — keep them separate |
| Destination schema / grain | Transform module + dedup/merge key | Event-row vs upserted current-state decides the transform |
| Region + project | `standardConfiguration: CTP_REGION`; scopes via `inheritAs` | Host + client provisioning are region/project specific |
| Volume / throughput | Batch page size + backoff toggles; Subscription budget | The 50-Subscription soft limit and destination rate limits constrain design |

## Latency → app composition

Direction is always **commercetools → destination**; latency decides the apps (build only what you need — see [overview.md](./overview.md)):

- **Streaming (near-real-time):** an **`event`** app. Register a **[MessageSubscription](https://docs.commercetools.com/api/projects/subscriptions.md#messagesubscription)** to the specific Messages you export (e.g. `OrderCreated`, `OrderStateChanged`, `CustomerCreated`), or a **ChangeSubscription** on a resource to catch *every* change. Subscribe to the **minimum** set — the 50-Subscription-per-Project limit is a [soft limit](https://docs.commercetools.com/api/limits.md#subscriptions), so don't burn it with one Subscription per message type when a ChangeSubscription covers the resource.
- **Batch / backfill:** a **`job`** (`properties.schedule`) that queries the API with a `lastModifiedAt` window + cursor pagination and loads the delta. Also the vehicle for the one-time historical load.
- **Optional full-export service:** a **`service`** endpoint that triggers an on-demand full export (the template's full-export app). Mention it; build it only if the user needs on-demand full loads.

## Scopes and secrets

- **Least-privilege, read-only.** Egress reads commercetools and writes the *destination* — so the commercetools scopes are **read** scopes for the domains you export plus `manage_subscriptions` for the streamer's registration. Never an admin/`manage_project` client. → parent [security.md](../../security.md).
- **Destination credentials in `securedConfiguration`** — API key / service-account JSON / connection string — never `standardConfiguration`, never hardcoded. Analytics data includes customer PII; treat destination creds accordingly.

## The connect.yaml envelope

`connect.yaml` has **no published JSON Schema** — its shape is defined only by the [docs](https://docs.commercetools.com/connect/development.md). Use only documented envelope keys (`deployAs` / `applicationType` / `endpoint` / `scripts` / `properties` / `configuration`; `inheritAs`), and place the file at the **repository root** — a nested `connect.yaml` silently fails to deploy.

### Native client provisioning (prefer this)

Declare scopes and let Connect mint a least-privilege API client rather than hand-supplying `CTP_CLIENT_ID`/`SECRET`:

```yaml
inheritAs:
  apiClient:
    scopes:
      - manage_subscriptions   # streamer: postDeploy registers the Subscriptions
      - view_orders            # export orders / order Messages
      - view_customers         # export customers (PII — only if in scope)
      - view_published_products # export catalog (use the read scope your domains need)
      # add view_payments / view_stock etc. only for the domains you actually export
  configuration:
    standardConfiguration:
      - key: DESTINATION_DATASET
        description: Warehouse dataset / table (or CDP source id)
    securedConfiguration:
      - key: DESTINATION_CREDENTIALS
        description: Destination API key / service-account JSON / connection string
```

> **Note:** `view_subscriptions` is **not** a valid standalone scope — `manage_subscriptions` covers read + write. Declaring non-existent view scopes fails client creation. Grant only the `view_*` scopes for the domains you export — nothing more.

### Per-app config

```yaml
deployAs:
  - name: analytics-streamer        # near-real-time
    applicationType: event
    endpoint: /analyticsStreamer
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy   # registers the Subscriptions
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
    configuration:
      standardConfiguration:
        - key: CONNECT_SUBSCRIPTION_DESTINATION
          description: "Injected by Connect (GoogleCloudPubSub or SNS)"
  - name: analytics-backfill        # scheduled batch + one-time history
    applicationType: job
    endpoint: /analyticsBackfill
    properties:
      schedule: "0 2 * * *"         # 02:00 daily; or run on-demand for the one-time load
```

## Worked example (Snowflake, build, orders + customers, stream + nightly backfill)

Requirements: **Snowflake** warehouse; export **orders + customers**; near-real-time stream for freshness **plus** a **nightly backfill** to repair gaps and load history; one row per event, deduped on the warehouse side; `europe-west1.gcp`.

Derived config:

```yaml
inheritAs:
  apiClient:
    scopes: [manage_subscriptions, view_orders, view_customers]
  configuration:
    standardConfiguration:
      - key: SNOWFLAKE_ACCOUNT
        description: "Snowflake account + database/schema/table"
    securedConfiguration:
      - key: SNOWFLAKE_CREDENTIALS
        description: Snowflake key-pair / PAT for the loader role
deployAs:
  - name: analytics-streamer
    applicationType: event
    endpoint: /analyticsStreamer
    scripts: { postDeploy: "npm ci --omit=dev && npm run connector:post-deploy", preUndeploy: "npm ci --omit=dev && npm run connector:pre-undeploy" }
    configuration:
      standardConfiguration:
        - key: CONNECT_SUBSCRIPTION_DESTINATION
          description: "GoogleCloudPubSub (injected on Connect)"
  - name: analytics-backfill
    applicationType: job
    endpoint: /analyticsBackfill
    properties:
      schedule: "0 2 * * *"
```

Rationale to hand the user: one **event** streamer registering a MessageSubscription on `order` (`OrderCreated`, `OrderStateChanged`) and a ChangeSubscription on `customer` — re-fetch by id, transform to the Snowflake row, deliver, and emit `resource.id` + `sequenceNumber` as the **dedup key** so a `MERGE` on the warehouse side is idempotent; one **job** windowing on `lastModifiedAt` + cursor pagination for the nightly gap-repair and the one-time history load; scopes are exactly the two read scopes + `manage_subscriptions` the apps need; Snowflake creds are `securedConfiguration`; customer PII is minimized to the columns analytics needs and never logged ([pipeline-architecture.md](./pipeline-architecture.md)).
