---
name: marketplace-config-from-requirements
description: Model sellers and offers in commercetools (Channel/Store/CustomObject per seller, offer keying, per-seller price and stock scoping) and map marketplace requirements to a connector's connect.yaml — apps, scopes, secured config, with a worked example. The marketplace sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - marketplace
    - connect
---

# Requirements → seller model → marketplace connector config

Two deliverables, in this order: the **seller/offer data model** (where marketplace integrations actually succeed or rot), then the `connect.yaml`. For a public connector these are its documented keys; for a fork or a build these are the keys and apps you define.

## Model the marketplace domain onto commercetools

commercetools has no "seller" resource. Sellers are modeled with Channels, Stores, and Custom Objects — pick per requirement, not all of them by default.

| Marketplace concept | Model as | Why / the trap |
|---|---|---|
| **Seller / vendor** | a **[Channel](https://docs.commercetools.com/api/projects/channels.md)** keyed `seller-<marketplaceSellerId>`, with role `InventorySupply` (+ `ProductDistribution` if the seller prices independently) | Channels are the scoping primitive for stock and price. The key **is** your idempotency key. A Channel [can't be deleted while referenced](https://docs.commercetools.com/api/projects/channels.md#delete-channel) by an InventoryEntry, Line Item, Store, or Price — so offboarding means removing it from Stores and stopping sync, not deleting it |
| **Seller profile data** (business name, rating, logo, opening hours, address) | a **CustomObject** (container per entity type, key = marketplace seller id), and/or Custom Fields on the seller Channel | `POST /custom-objects` is create-or-update on `container`+`key`, so it is idempotent for free — the right home for arbitrary seller payloads. Put anything the storefront filters or scopes on the Channel instead |
| **Seller storefront / isolated assortment / seller-scoped MC access** | a **[Store](https://docs.commercetools.com/api/projects/stores.md)** per seller (+ [Product Selections](https://docs.commercetools.com/api/projects/product-selections.md)) | Only when isolation is a requirement — it also gives per-seller Merchant Center team permissions. Limits allow it at scale ([300,000 Stores per Project](https://docs.commercetools.com/api/limits.md)), but a Store is capped at **100 Product Selections**, so don't model one Product Selection per seller inside a shared Store |
| **Offer / listing** (a seller's sellable item) | a **Product/Variant** keyed on the marketplace's stable listing id — **or**, when several sellers sell the same SKU, **one Product** with per-seller Prices and InventoryEntries | Duplicating the Product per seller is the classic marketplace modeling mistake: it splinters search, ratings, and reporting. One Product + N seller offers is the default |
| **Offer stock** | an **[InventoryEntry](https://docs.commercetools.com/api/inventory-overview.md)** per `sku` + `supplyChannel` (the seller's Channel) | Stock is tracked per SKU and optionally per supply channel — that pair is the per-seller stock record. A Cart bound to a Store only sees stock from that Store's supply channels |
| **Offer price** | a Price / [StandalonePrice](https://docs.commercetools.com/api/projects/standalone-prices.md) with `channel` = the seller's distribution Channel | A price with **no** channel is visible in **every** Store — the leak that shows one seller's price on another seller's storefront. Always set the channel on seller prices |
| **Marketplace order coming in** | [Order Import](https://docs.commercetools.com/api/projects/orders-import.md) with `orderNumber` = the marketplace order id, `store` set, and per-line `supplyChannel` (+ line `custom` fields for the marketplace line id) | `orderNumber` is your dedupe key — Order has no top-level `externalId`. Store-referenced import also filters languages, prices, and inventory to that Store's channels |
| **Order handed off to a seller / marketplace** | the Order's **[`syncInfo`](https://docs.commercetools.com/api/projects/orders.md#update-syncinfo)** via `updateSyncInfo` — `channel` (a Channel with role `OrderExport`, or `OrderImport` for inbound), `externalId` = the marketplace id, `syncedAt` | This is the platform-native "already exported" marker. Use it instead of inventing a custom field, and read it back to skip re-exporting |
| **Per-seller fulfilment progress** | Line Item **`state`** (ItemStates) per line, plus Deliveries/Parcels per shipment | One multi-seller Order has many independent fulfilment tracks; a single order-level state can't express "seller A shipped, seller B cancelled" |
| **Commission, payout, settlement** | **not in commercetools** — the marketplace/PSP owns them | commercetools [tracks Payment status only](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md); it has no payout ledger. Sync commission *values* onto the Order/line as Custom Fields if reporting needs them, but don't build payouts here |

### Two limits that kill naive designs

- **[50 Subscriptions and 25 Extensions per Project](https://docs.commercetools.com/api/limits.md).** Never one per seller. Register **one** Subscription per message type and fan out to sellers inside your handler.
- **Store-scoped connectors don't scale per-seller either.** The `product-export` template deploys one Deployment *per Store*; with many sellers, one Deployment per seller is an operational trap — build a single app that resolves the seller from the resource instead.

## Role + direction → app composition

Build only what the role needs ([overview.md](./overview.md)). Keep each direction its own app; never one app with a mode switch.

**Operator (marketplace → commercetools, plus order routing out):**
- **`service`** inbound webhook — the marketplace pushes seller/offer/inventory/price changes; you authenticate the caller and upsert. 5-min service timeout applies (not the extension limit).
- **`job`** poll — when the marketplace can't push, or for large periodic feeds.
- **`event`** app on `OrderCreated` — group the Order's lines by seller (their supply channel) and push each group to the marketplace; record `syncInfo`.
- **`event`** app on order/state changes — fulfilment, cancellation, and return status both ways.
- **`job`** reconciliation — full sweep for drift (missed offers, stock divergence, orders the event path dropped), checkpointed.

**Seller role (commercetools → marketplace, orders in):**
- **`event`** app on Product/Product Selection/Store/price/inventory messages — export listing, price, and stock deltas (the [`product-export` template](https://docs.commercetools.com/connect/templates/product-export.md) is the closest starting shape).
- **`job`** — full/batch feed export when the marketplace wants scheduled files instead of deltas.
- **`service`** webhook or **`job`** — import marketplace orders (Order Import, keyed on `orderNumber`).
- **`event`** app — push shipment/tracking/cancellation back to the marketplace.

## The connect.yaml envelope

`connect.yaml` has **no published JSON Schema** — its shape is defined only by the [docs](https://docs.commercetools.com/connect/development.md). Use only documented envelope keys (`deployAs` / `applicationType` / `endpoint` / `scripts` / `configuration`; `inheritAs`), and keep the file at the **repository root** — a nested `connect.yaml` silently fails to deploy.

### Native client provisioning (prefer this)

Declare scopes and let Connect mint a least-privilege API client instead of hand-supplying `CTP_CLIENT_ID`/`CTP_CLIENT_SECRET` as secured config (a pattern you will see in existing marketplace connectors and should not copy — check which form a fork candidate uses, per [connector-selection.md](./connector-selection.md)):

```yaml
inheritAs:
  apiClient:
    scopes:
      # operator, inbound seller + offer sync
      - manage_products               # Products/Variants — and Channels + Inventory Entries
      - manage_standalone_prices      # only if seller offers are Standalone Prices
      - manage_key_value_documents    # only if seller profiles are Custom Objects
      - manage_orders                 # Order Import (seller role) / updateSyncInfo (operator)
      - manage_types                  # only if postDeploy creates Custom Types
      # plus, per app, the narrowest of:
      # - view_products / view_orders  (read-only apps)
      # - manage_stores, manage_product_selections  (only with Store-per-seller)
      # - manage_subscriptions         (apps whose postDeploy registers Subscriptions)
  configuration:
    standardConfiguration:
      - key: MARKETPLACE_BASE_URL
        description: Marketplace API base URL (sandbox vs production)
      - key: SELLER_CHANNEL_KEY_PREFIX
        description: Prefix for seller Channel keys, e.g. "seller-"
    securedConfiguration:
      - key: MARKETPLACE_API_TOKEN
        description: Marketplace API token / OAuth client secret
      - key: MARKETPLACE_WEBHOOK_SECRET
        description: Shared secret or signing key used to authenticate inbound webhooks
```

> **Scope notes.** `manage_products` covers **Channels and Inventory Entries** too — there is no separate channel or inventory scope, so seller Channels and per-seller stock need no extra grant. Standalone Prices, Stores, Product Selections, and Custom Objects each need their own scope (`manage_standalone_prices`, `manage_stores`, `manage_product_selections`, `manage_key_value_documents`) — a frequent cause of a working-locally-but-403-in-Connect connector. Check the current list in [API scopes](https://docs.commercetools.com/api/scopes.md) rather than guessing, and grant per app, not per connector. `view_subscriptions` is **not** a valid standalone scope; `manage_subscriptions` covers read + write. Give `manage_orders` only to the app that writes orders.

### Per-app config

```yaml
deployAs:
  - name: seller-offer-sync            # operator: marketplace pushes sellers + offers
    applicationType: service
    endpoint: /sellerOfferSync         # the Express router must mount at this same base path
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
  - name: order-router                 # operator: route each seller's lines out
    applicationType: event
    endpoint: /orderRouter
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy   # registers the OrderCreated Subscription
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
    configuration:
      standardConfiguration:
        - key: CONNECT_SUBSCRIPTION_DESTINATION
          description: "GoogleCloudPubSub or SNS"
  - name: marketplace-reconcile        # drift sweep
    applicationType: job
    endpoint: /marketplaceReconcile
    properties:
      schedule: "0 3 * * *"
```

## Worked example (operator, Marketplacer-style service, build/fork)

Requirements: an operator marketplace; the service pushes seller and listing changes by webhook; ~200 sellers, **no** per-seller storefront isolation; multiple sellers may sell the same SKU; commercetools captures the order and each seller's lines are pushed back to the marketplace; commissions and payouts stay in the marketplace; near-real-time; `europe-west1.gcp`.

Model: one **Channel per seller** (`seller-<id>`, roles `InventorySupply` + `ProductDistribution`); seller profile payload in a **CustomObject** (`container: seller`, `key: <marketplaceSellerId>`); **no Stores** (no isolation requirement); one **Product per listing id**, with a **StandalonePrice per seller** (channel = seller channel) and an **InventoryEntry per `sku` + seller supply channel**; a Channel with role **`OrderExport`** per seller for `syncInfo`; per-line `custom` field holding the marketplace line id.

```yaml
inheritAs:
  apiClient:
    scopes:
      [
        manage_products, # Products/Variants + seller Channels + Inventory Entries
        manage_standalone_prices, # per-seller offer prices
        manage_key_value_documents, # seller profile Custom Objects
        manage_orders, # updateSyncInfo on routed Orders
        manage_subscriptions, # postDeploy registers the OrderCreated Subscription
        manage_types, # postDeploy creates the line-item Custom Type
      ]
  configuration:
    standardConfiguration:
      - key: MARKETPLACE_BASE_URL
        description: "Marketplace API base (sandbox vs prod)"
    securedConfiguration:
      - key: MARKETPLACE_API_TOKEN
        description: Marketplace API token
      - key: MARKETPLACE_WEBHOOK_SECRET
        description: Signing secret for inbound webhooks
deployAs:
  - name: seller-offer-sync
    applicationType: service
    endpoint: /sellerOfferSync
    scripts: { postDeploy: "npm ci --omit=dev && npm run connector:post-deploy", preUndeploy: "npm ci --omit=dev && npm run connector:pre-undeploy" }
  - name: order-router
    applicationType: event
    endpoint: /orderRouter
    scripts: { postDeploy: "npm ci --omit=dev && npm run connector:post-deploy", preUndeploy: "npm ci --omit=dev && npm run connector:pre-undeploy" }
  - name: marketplace-reconcile
    applicationType: job
    endpoint: /marketplaceReconcile
```

Rationale to hand the user: one **`service`** webhook app upserting sellers (Channel + CustomObject) and offers (Product by listing id, price by seller channel, inventory by sku+channel), authenticating every call with `MARKETPLACE_WEBHOOK_SECRET`; one **`event`** app whose `postDeploy` registers a *single* `OrderCreated` Subscription and which groups lines by supply channel, pushes one payload per seller, and records `updateSyncInfo` per seller channel so a redelivery doesn't double-push; one **`job`** reconciling offers and stock nightly with a checkpoint. Scopes are exactly what those three do; the marketplace token and webhook secret are `securedConfiguration`. Correctness rules per app: [marketplace-contract.md](./marketplace-contract.md).
