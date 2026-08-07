---
name: search-config-from-requirements
description: Shape the search document and map search requirements to a connector's connect.yaml — the two apps (full ingestion + incremental updater), index/engine keys, least-privilege scopes, secured config — with a worked example. The search sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - search
    - connect
---

# Requirements → search document + connector config

Two deliverables, in this order: the **search document shape** (where a search integration succeeds or rots — the full method is [data-mapping.md](./data-mapping.md)), then the `connect.yaml`. For a public connector these are its documented keys; for a fork or a build these are the keys and apps you define. The official scaffold is the [Product export template](https://docs.commercetools.com/connect/templates/product-export.md).

## The search document, in one line

Every record is a **flat, denormalized projection** of a published Product (or Variant), keyed on a stable `objectID`, carrying only what the storefront queries/filters/sorts/displays — resolved to one price context and one locale strategy, with categories denormalized and availability handled deliberately. Derive it from a [Product Projection](https://docs.commercetools.com/api/projects/productProjections.md) (`staged=false`), never the raw Product. The full decision method — granularity, price-context explosion, localization, category denormalization, Store assortment — is [data-mapping.md](./data-mapping.md); this file only maps the *config* those decisions imply.

## Requirements → app composition

A search integration is **two jobs**, so two apps ([search-contract.md](./search-contract.md)). Pick the shape from cadence and trigger; keep each its own app, never one app with a mode switch.

| Job | Default app | Alternative |
|---|---|---|
| **Full ingestion** — (re)build the whole index from the catalog | `service` with an on-demand REST trigger (e.g. `/fullSync`), matching the [Product export template](https://docs.commercetools.com/connect/templates/product-export.md) | `job` on a schedule (`properties.schedule`) when nightly rebuilds are enough and no on-demand trigger is needed |
| **Incremental updater** — keep the index fresh on catalog changes | `event` on product/store/selection [Subscriptions](https://docs.commercetools.com/api/projects/subscriptions.md) (e.g. `/deltaSync`) | `job` polling Product Projections on `lastModifiedAt` when the engine or ops model can't take a push |

**Whole-catalog vs Store-specific** decides the read side, not the app shape: whole-catalog reads `/product-projections?staged=false` with cursor pagination; Store-specific reads `/in-store/key={storeKey}/product-projections` and is driven by Product Selection messages (the Product export template is Store-specific — **one Deployment per Store**; don't model one Deployment per Store at scale — see [data-mapping.md](./data-mapping.md)).

## The connect.yaml envelope

`connect.yaml` has **no published JSON Schema** — its shape is defined only by the [Connect docs](https://docs.commercetools.com/connect/development.md). Use only documented envelope keys (`deployAs` / `applicationType` / `endpoint` / `scripts` / `properties` / `configuration`; `inheritAs`), and keep the file at the **repository root** — a nested `connect.yaml` silently fails to deploy.

### Native client provisioning (prefer this)

A search connector is **read-only on commercetools** (it exports; it never writes the catalog). Declare the narrow read scopes and let Connect mint a least-privilege client instead of hand-supplying `CTP_CLIENT_ID`/`CTP_CLIENT_SECRET` (a pattern you may see in existing search connectors and should not copy — check which form a fork candidate uses, per [connector-selection.md](./connector-selection.md)):

```yaml
inheritAs:
  apiClient:
    scopes:
      - view_products              # read Products / Product Projections (the catalog to index)
      # add only as the requirements need:
      # - view_product_selections  # Store-specific: read a Store's Product Selection assignments
      # - view_stores              # Store-specific: resolve the Store / in-store projections
      # - manage_subscriptions     # the incremental-updater app, whose postDeploy registers the Subscription
```

> **Scope notes.** The engine side needs **no** commercetools scope — it is reached with the engine's own API key. Grant `manage_subscriptions` only to the `event` app (it registers the Subscription in `postDeploy`); the `service`/`job` full-export app needs only `view_products` (+ the Store read scopes for the Store-specific pattern). There is no write scope here — if you find `manage_products` on a search connector, it is over-privileged. Check the current list in [API scopes](https://docs.commercetools.com/api/scopes.md) rather than guessing, and grant per app, not per connector.

### Per-app config

Engine credentials are **`securedConfiguration`**; index name, region, locale, price context, and behavioral toggles are **`standardConfiguration`**.

```yaml
deployAs:
  - name: full-export                  # (re)build the whole index on demand
    applicationType: service
    endpoint: /fullSync                 # the Express router must mount at this same base path
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
    configuration:
      standardConfiguration:
        - key: SEARCH_INDEX_NAME
          description: Target index / collection name
        - key: PRICE_CONTEXT
          description: "currency[,country[,customerGroup,channel]] used to select the indexed price"
        - key: LOCALES
          description: "Comma-separated locales to index, e.g. en-US,de-DE"
        - key: STORE_KEY
          description: "Store key for the Store-specific pattern; omit for whole-catalog"
          required: false
      securedConfiguration:
        - key: SEARCH_ENGINE_API_KEY
          description: Engine admin/write API key (index management + record writes)
  - name: incremental-updater           # keep the index fresh on catalog changes
    applicationType: event
    endpoint: /deltaSync
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy   # registers the product/store/selection Subscription
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
    configuration:
      standardConfiguration:
        - key: CONNECT_SUBSCRIPTION_DESTINATION
          description: "GoogleCloudPubSub or SNS"
```

## Worked example (whole-catalog, Algolia-style, build/fork)

Requirements: index the whole published catalog into one Algolia index; ~120k products, product-level records; three locales (`en-US`, `de-DE`, `fr-FR`); one price context (`EUR`/`DE`); availability as a coarse `inStock` boolean only; near-real-time on publish/unpublish plus a nightly safety rebuild; `europe-west1.gcp`.

Model: one **index** (`SEARCH_INDEX_NAME=products`), **per-locale fields** rather than an index per locale (three locales, one price context — a single index stays simple); `objectID` = the Product `id`; price selected with `PRICE_CONTEXT=EUR,DE`; `inStock` derived from variant `availability` but never treated as live stock; categories denormalized to name + breadcrumb path per locale ([data-mapping.md](./data-mapping.md)).

```yaml
inheritAs:
  apiClient:
    scopes:
      [
        view_products, # read the catalog to index
        manage_subscriptions, # incremental-updater postDeploy registers the Subscription
      ]
deployAs:
  - name: full-export
    applicationType: service
    endpoint: /fullSync
    scripts: { postDeploy: "npm ci --omit=dev && npm run connector:post-deploy", preUndeploy: "npm ci --omit=dev && npm run connector:pre-undeploy" }
    configuration:
      standardConfiguration:
        - { key: SEARCH_INDEX_NAME, description: "Algolia index name" }
        - { key: PRICE_CONTEXT, description: "EUR,DE" }
        - { key: LOCALES, description: "en-US,de-DE,fr-FR" }
      securedConfiguration:
        - { key: SEARCH_ENGINE_API_KEY, description: "Algolia Admin API key" }
  - name: incremental-updater
    applicationType: event
    endpoint: /deltaSync
    scripts: { postDeploy: "npm ci --omit=dev && npm run connector:post-deploy", preUndeploy: "npm ci --omit=dev && npm run connector:pre-undeploy" }
    configuration:
      standardConfiguration:
        - { key: CONNECT_SUBSCRIPTION_DESTINATION, description: "GoogleCloudPubSub" }
```

Rationale to hand the user: one **`service`** app that pages `/product-projections?staged=false` (cursor on `id`), builds records, and does an **atomic** replace-all into `products` — triggered on demand and by the nightly schedule (a `job` variant, or a scheduler hitting `/fullSync`); one **`event`** app whose `postDeploy` registers a *single* Subscription on `ProductPublished`/`ProductUnpublished` (+ the Store/Product-Selection messages if Store-specific) and upserts/removes one record per message, idempotently on `objectID`. Scopes are read-only + `manage_subscriptions`; the Algolia Admin key is `securedConfiguration`. Correctness rules per app: [search-contract.md](./search-contract.md).
