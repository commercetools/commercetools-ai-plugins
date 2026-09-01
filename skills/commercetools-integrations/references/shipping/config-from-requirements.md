---
name: shipping-config-from-requirements
description: "Map shipping requirements onto a commercetools Connect shipping connector's connect.yaml — which applications to declare, carrier credentials and account settings, enabled carriers/service levels/package defaults/markup, the timeout and fallback keys the rate extension needs, and least-privilege scopes — with a worked example."
metadata:
  contentType: REFERENCE
  area:
    - connect
    - shipping
    - integration
---

# Requirements → shipping connector config

Turns the Step 1 requirements ([overview.md](./overview.md)) into concrete `connect.yaml` values. Give each a one-line **why** when you present it.

**Where the keys come from.** For a **public connector**, the authoritative key list is its repo's `connect.yaml` and README — read those and use their names; the keys below are illustrative and will not match. For a **build**, these are keys you define, so the names are yours; what each carrier *needs* configured (service codes, package/unit conventions, account identifiers) comes from the carrier's own API docs.

## The requirement → config map

| Requirement (Step 1) | Config / decision | Why |
|---|---|---|
| Which shipping service + credentials | `securedConfiguration`: API key/secret plus whatever account identifiers that carrier's API requires (take the list from their docs) | Secrets never in `standardConfiguration`, never hardcoded |
| Quoting, execution, or both | Which applications you declare in `deployAs` | One `service` for rating, one `event` for labels/tracking; deploy only what's in scope |
| Landing mechanism (A/B/C) | `standardConfiguration`: e.g. `RATE_STRATEGY: score \| customShippingMethod` | The hard-to-reverse decision from [shipping-contract.md](./shipping-contract.md) — make it explicit, not implicit in code |
| Enabled carriers / service levels | `standardConfiguration`: comma-separated carrier + service codes | The commonest post-launch change; must not need a code change |
| Origin address / ship-from | `standardConfiguration` (or per-Channel lookup if multi-warehouse) | Rates are origin-dependent; a wrong origin quietly misprices everything |
| Package defaults & dimensional weight | `standardConfiguration`: default package dims, weight unit, DIM divisor | Carriers price on dimensional weight; defaults belong in config, not constants |
| Markup / handling fee | `standardConfiguration`: percentage or flat amount | Merchants change this often and it is not a carrier setting |
| Latency + fallback | `standardConfiguration`: `CARRIER_TIMEOUT_MS`, `QUOTE_CACHE_TTL_S`, `FALLBACK_SHIPPING_METHOD_KEY` | The fail-open contract has to be operable without a redeploy |
| Which Order Messages trigger a label | `standardConfiguration`: message types / order-state gate; Subscription registered in `postDeploy` | Booking on the wrong trigger buys labels for unpaid orders |
| `Single` vs `Multiple` shipping mode | Not config — it changes which update actions the code emits | Decide in requirements; it is fixed per Cart |
| Region + project | `standardConfiguration: CTP_REGION`; scopes via `inheritAs` | Hosts and client provisioning are region/project specific |
| Sandbox vs production carrier account | `standardConfiguration`: `CARRIER_SANDBOX` | Sandbox rates are usually list rates, not negotiated — see [verification.md](./verification.md) |

## The connect.yaml envelope

`connect.yaml` has **no published JSON Schema** — its shape is defined only by the [docs](https://docs.commercetools.com/connect/development.md). Use only documented envelope keys (`deployAs` / `applicationType` / `endpoint` / `scripts` / `configuration`; `inheritAs`) and put the file at the **repository root** — a nested `connect.yaml` silently fails to deploy.

### Scopes (least privilege)

Declare scopes and let Connect mint the API client rather than hand-supplying `CTP_CLIENT_ID`/`SECRET`. What a shipping connector actually needs:

| Scope | Needed by | For |
|---|---|---|
| `manage_extensions` | rate app `postDeploy`/`preUndeploy` | register/remove the Cart API Extension |
| `manage_shipping_methods` | rate app `postDeploy` | provision the fallback Shipping Method (and the `$0` carrier-quoted method for path C) |
| `view_tax_categories` | rate app | resolve the `taxCategory` reference a custom shipping method must carry |
| `manage_subscriptions` | label app `postDeploy`/`preUndeploy` | register/remove the Order Subscription |
| `manage_orders` | label app | re-fetch the Order and write `addDelivery` / `addParcelToDelivery` / `setParcelTrackingData` |
| `manage_types` | `postDeploy` | create the Custom Types for the quote-hash Cart field and the carrier shipment id on Delivery |
| `manage_key_value_documents` | rate app (optional) | quote cache in CustomObjects, if not held in a Cart custom field |
| `view_products` | rate app (optional) | read weight/dimension attributes when they live on the Product, not the Line Item |

Two things to get right: **the rate extension does not need cart write scope** — it returns update actions and commercetools applies them; and `view_extensions` / `view_subscriptions` are **not** valid standalone scopes (`manage_extensions` / `manage_subscriptions` cover read + write; declaring the view variants fails client creation).

### Worked example — both applications

```yaml
deployAs:
  - name: shipping-rates
    applicationType: service
    endpoint: /shippingRates
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy   # registers the Cart API Extension + fallback Shipping Method
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
  - name: shipping-labels
    applicationType: event
    endpoint: /shippingLabels
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy   # registers the Order Subscription
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy

inheritAs:
  apiClient:
    scopes:
      - manage_extensions
      - manage_shipping_methods
      - manage_subscriptions
      - manage_orders
      - manage_types
      - view_tax_categories
  configuration:
    standardConfiguration:
      - key: CTP_REGION
        description: commercetools region, for example europe-west1.gcp
      - key: RATE_STRATEGY
        description: "How quoted rates land on the Cart: score or customShippingMethod"
        default: customShippingMethod
      - key: ENABLED_CARRIER_SERVICES
        description: Comma-separated carrier/service codes to quote, in display order
      - key: SHIP_FROM_POSTAL_CODE
        description: Origin postal code used for rating
      - key: SHIP_FROM_COUNTRY
        description: Origin country code (ISO 3166-1 alpha-2)
      - key: HANDLING_MARKUP_PERCENT
        description: Percentage added to every quoted rate
        default: "0"
      - key: CARRIER_TIMEOUT_MS
        description: Outbound carrier timeout; must stay well under the API Extension budget
        default: "1200"
      - key: QUOTE_CACHE_TTL_S
        description: How long a quote may be reused for an unchanged cart
        default: "300"
      - key: FALLBACK_SHIPPING_METHOD_KEY
        description: Shipping Method applied when the carrier is unavailable (fail-open)
      - key: LABEL_TRIGGER_ORDER_STATE
        description: Order state that gates label creation, for example Confirmed
      - key: CARRIER_SANDBOX
        description: "'true' to call the carrier sandbox instead of the live account"
        default: "true"
    securedConfiguration:
      - key: CARRIER_API_KEY
        description: Carrier or rate-service API key
      - key: CARRIER_ACCOUNT_NUMBER
        description: Carrier account number that negotiated rates are tied to
```

Every value above is a **decision you can defend**; if you can't say why a key exists, drop it. Envelope mechanics and the deploy flow: [deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md). Idempotent registration of the Extension, Subscription, Types, and fallback Shipping Method: [lifecycle-scripts.md](../../../commercetools-connect/references/lifecycle-scripts.md).

## `postDeploy` has real work here

More than in most sub-areas, because the connector depends on commercetools resources existing:

- **Fallback Shipping Method** — create it get-then-update (only if absent), with a predicate that always matches and a rate in every currency in scope. Without it, fail-open has nothing to fall back to.
- **Custom Types** — the Cart field holding the quote hash/cached quote, and the Delivery field holding the carrier shipment id.
- **The Cart API Extension** — registered with an authenticated destination; use the discriminator value `AuthorizationHeader` (not the schema type name `AuthorizationHeaderAuthentication`, which fails with `InvalidJsonInput`), and confirm registration with `GET /{projectKey}/extensions` afterwards ([security.md](../../../commercetools-connect/references/security.md)).
- **Deploy-time credential validation** — make one cheap carrier call (an account or rate ping) so bad credentials fail the deployment instead of the first shopper's cart.

## Checklist

- [ ] Only documented `connect.yaml` envelope keys; file at the repository root
- [ ] Applications declared match the scope actually agreed (rating, execution, or both)
- [ ] Landing strategy is an explicit config key, not implicit in code
- [ ] Carrier credentials + account number in `securedConfiguration`; everything operational in `standardConfiguration`
- [ ] `CARRIER_TIMEOUT_MS` set below the API Extension budget; cache TTL set
- [ ] `FALLBACK_SHIPPING_METHOD_KEY` set **and** the method provisioned by `postDeploy`
- [ ] Scopes least-privilege and valid (no `view_extensions` / `view_subscriptions`; no cart write scope for the extension)
- [ ] `postDeploy` idempotent for Extension, Subscription, Types, and fallback Shipping Method; `preUndeploy` removes what it created
- [ ] `postDeploy` validates carrier credentials at deploy time
- [ ] Sandbox-vs-production carrier account switchable by config
