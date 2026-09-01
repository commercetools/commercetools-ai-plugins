---
name: tax-config-from-requirements
description: Map tax requirements to a commercetools tax connector's connect.yaml — tax mode (ExternalAmount vs External), nexus, tax-code source, exemptions, least-privilege scopes — with a worked example. The tax sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - tax
    - connect
---

# Requirements → tax connector config

This turns the Step 1 requirements ([overview.md](./overview.md)) into concrete `connect.yaml` values. For a certified connector these are its documented keys; for a from-template build these are the keys you define. Provider-exact key names/defaults are in [avalara.md](./avalara.md).

## The requirement → config map

| Requirement (Step 1) | Config / decision | Why |
|---|---|---|
| Which engine + credentials | `securedConfiguration`: engine API token or username/password/company-code | Secrets never in `standardConfiguration`, never hardcoded |
| Nexus regions | (engine-side account setting, not connect.yaml) | The engine only returns tax where you have nexus; a missing nexus is the usual "tax is zero" cause |
| Region + project | `standardConfiguration: CTP_REGION`; scopes via `inheritAs` | Host + client provisioning are region/project specific |
| Calculation + recording | Deploy **both** apps (calculator + syncer); calculation-only = just the calculator | Recording is a separate engine API and a separate Connect app |
| Void on cancel / refund on return | Syncer subscribes to `OrderStateChanged` / return messages + the order-state → action mapping | Filing must follow the order's real lifecycle, not just creation |
| Product tax categories/codes | Tax-code **source** setting (Product attribute name / Tax Category / Custom Field) | The calculator must know where to read each item's tax code |
| Tax-exempt buyers | Exemption/entity-use-code **source** (Customer Custom Field) | Passed to the engine so exempt buyers are taxed correctly |
| VAT-inclusive / rounding | Cart `taxMode`, `taxCalculationMode`, `taxRoundingMode` (and `includedInPrice` on the external rate) | Controls how the platform combines the external amounts |

## Tax mode

The single most consequential choice. Set on the cart (the connector usually sets it via `changeTaxMode`), it decides who owns the arithmetic:

- **`ExternalAmount` (recommended).** You supply the exact tax **amounts**; commercetools stores them as-is. No re-derivation, so **no rounding drift** between what the engine files and what the cart shows. This is what the tax docs recommend and what the certified Avalara connector uses. Requires taxing **every** priced element — line items, custom line items, **and shipping** — plus a cart total (see [tax-contract.md](./tax-contract.md)).
- **`External`.** You supply tax **rates**; commercetools computes amounts. Simpler payloads, but the platform's rounding can differ from the engine's by cents — a reconciliation headache when the engine is the system of record for filing.
- `Platform` / `Disabled` are not external-engine modes.

Default to `ExternalAmount` unless the user has a specific reason (e.g. they only have rates, not amounts). Record the choice and why.

## The connect.yaml envelope

`connect.yaml` has **no published JSON Schema** — its shape is defined only by the [docs](https://docs.commercetools.com/connect/development.md). Use only documented envelope keys (`deployAs` / `applicationType` / `endpoint` / `scripts` / `configuration`; `inheritAs`), and place the file at the **repository root** — a nested `connect.yaml` silently fails to deploy.

### Native client provisioning (prefer this)

Declare the connector's scopes and let Connect mint a least-privilege API client, rather than hand-supplying `CTP_CLIENT_ID`/`SECRET`:

```yaml
inheritAs:
  apiClient:
    scopes:
      - manage_extensions      # calculator postDeploy registers the Cart API Extension
      - manage_subscriptions   # syncer postDeploy registers the OrderCreated Subscription
      - view_orders            # syncer re-fetches the Order to build the transaction
  configuration:
    standardConfiguration:
      - key: TAX_SANDBOX
        description: "'true' to call the engine sandbox instead of live"
    securedConfiguration:
      - key: TAX_PROVIDER_API_TOKEN
        description: Tax engine API token, used by both apps
```

> **Note:** `view_extensions` / `view_subscriptions` are **not** valid standalone scopes — `manage_extensions` / `manage_subscriptions` cover read + write. Declaring the non-existent view scopes fails client creation.

The official template hand-declares `CTP_CLIENT_ID/SECRET/SCOPE` as secured config; migrating to `inheritAs.apiClient.scopes` is the more native, lower-maintenance form and is worth doing on a from-template build.

### Per-app config

```yaml
deployAs:
  - name: tax-calculator
    applicationType: service
    endpoint: /taxCalculator
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy   # registers the API Extension
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
  - name: order-syncer
    applicationType: event
    endpoint: /orderSyncer
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy   # registers the Subscription
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
    configuration:
      standardConfiguration:
        - key: CONNECT_SUBSCRIPTION_DESTINATION
          description: "GoogleCloudPubSub or SNS"
```

> **Template gotcha:** the official template's `tax-calculator` `postDeploy` was just `npm install` — it never registered the extension, and its post-deploy pointed the destination at the app's base URL instead of `<url>/taxCalculator`. Wire `connector:post-deploy` for **both** apps, and make the extension destination include the endpoint path.

## Worked example (TaxJar, from-template build)

Requirements: TaxJar; nexus in DE; calculation **and** recording; tax code from a Product attribute `tax-code`; no exemptions yet; `ExternalAmount`; `europe-west1.gcp`.

Derived config:

```yaml
inheritAs:
  apiClient:
    scopes: [manage_extensions, manage_subscriptions, view_orders]
  configuration:
    standardConfiguration:
      - key: TAXJAR_SANDBOX
        description: "'true' for sandbox; note the sandbox does not persist transactions"
    securedConfiguration:
      - key: TAX_PROVIDER_API_TOKEN
        description: TaxJar API token (same token both apps)
deployAs:
  - name: tax-calculator
    applicationType: service
    endpoint: /taxCalculator
    scripts: { postDeploy: "npm ci --omit=dev && npm run connector:post-deploy", preUndeploy: "npm ci --omit=dev && npm run connector:pre-undeploy" }
  - name: order-syncer
    applicationType: event
    endpoint: /orderSyncer
    scripts: { postDeploy: "npm ci --omit=dev && npm run connector:post-deploy", preUndeploy: "npm ci --omit=dev && npm run connector:pre-undeploy" }
    configuration:
      standardConfiguration:
        - key: CONNECT_SUBSCRIPTION_DESTINATION
          description: "GoogleCloudPubSub or SNS"
```

Rationale to hand the user: `ExternalAmount` so TaxJar's amounts are authoritative; both apps because they want filing, not just checkout tax; `manage_extensions`+`manage_subscriptions`+`view_orders` are exactly what the two `postDeploy` scripts and the syncer's order re-fetch need — nothing more. **Nexus is DE-only on the account, so US destinations will (correctly) show zero tax** — flag this so it isn't mistaken for a bug ([verification.md](./verification.md)).

For the certified Avalara connector's exact standard/secured keys (custom-type keys, `AVATAX_PRODUCT_ATTRIBUTE_NAME`, `AVALARA_USERNAME/PASSWORD/COMPANY_CODE/ENV`, commit/void order-state settings), see [avalara.md](./avalara.md).
