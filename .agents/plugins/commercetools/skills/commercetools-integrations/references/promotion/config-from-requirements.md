---
name: promotion-config-from-requirements
description: Map promotion requirements to a commercetools promotion connector's connect.yaml — how discounts land on the cart (setDirectDiscounts vs custom line items), coupon-code custom field, effect mapping, least-privilege scopes — with a worked example. The promotion sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - promotions
    - connect
---

# Requirements → promotion connector config

This turns the Step 1 requirements ([overview.md](./overview.md)) into concrete `connect.yaml` values. For a from-scratch build these are the keys you define. **For an existing public connector, read its own `connect.yaml` for the authoritative key list** — don't work from a copy, here or anywhere else ([public-connectors.md](./public-connectors.md)); use the mapping below to decide what each of its keys should be *set to*.

## The requirement → config map

| Requirement (Step 1) | Config / decision | Why |
|---|---|---|
| Which engine + credentials | `securedConfiguration`: engine API key / application key | Secrets never in `standardConfiguration`, never hardcoded |
| Region + project | `standardConfiguration: CTP_REGION`; scopes via `inheritAs` | Host + client provisioning are region/project specific |
| Engine owns promotions | Discount mechanism = `setDirectDiscounts`; native Discount Codes become inert | Direct Discounts and Discount Codes are mutually exclusive (below) |
| Coupon/voucher codes | Cart **custom type + field** for the code, plus a field for the validation result | Native Discount Codes are unavailable once Direct Discounts are in play |
| Evaluation + redemption | Deploy **both** apps (evaluator + syncer); evaluation-only = just the evaluator | Redemption is a separate engine endpoint and a separate Connect app |
| Loyalty points / balances | Mirror-target setting (Customer Custom Field) or "engine is sole source of record" | Points must not silently diverge between systems |
| Rollback on cancel/return | Syncer subscribes to `OrderStateChanged` / return messages + order-state → action mapping | A cancelled order must not consume a coupon or keep points |
| Fail-open vs fail-closed | Outbound timeout + error behavior in the evaluator; documented in the README | Decides whether a down engine breaks carts or just drops discounts |
| Cart/customer attributes the engine needs | Attribute-mapping keys in `standardConfiguration` | The engine's rules can only match on what you forward |
| Discount line items need a tax category | `standardConfiguration: CTP_TAX_CATEGORY_ID` (only if using custom line items) | A custom line item requires a tax category; not needed for Direct Discounts |

## How discounts land on the cart

The single most consequential choice, and the one that leaks into the storefront. Three mechanisms:

### `setDirectDiscounts` — recommended

The evaluator returns a [`setDirectDiscounts`](https://docs.commercetools.com/api/projects/carts.md) action carrying the engine's computed discounts. Each entry is a `DirectDiscountDraft` with a required `value` (`relative`, `absolute`, `fixed`, or `giftLineItem`) and an optional `target` (line items, custom line items, shipping cost, total price, multi-buy, or pattern) — the same value/target vocabulary as Cart Discounts, so an engine's percentage, fixed-amount, free-shipping, and free-gift effects all have a native landing spot. Fetch the current shape with this skill's `openApi-schemata.mjs --resource-name api-Cart-write` rather than trusting a copied field list.

Semantics that matter ([docs](https://docs.commercetools.com/api/pricing-and-discounts-overview.md#direct-discounts)):

- Always **active and valid** — no validity window, no `isActive` to manage.
- Default `StackingMode` `Stacking`, and **no `sortOrder`** — they apply **in array order**, so *you* control precedence by ordering the array. An engine that returns effects in priority order maps directly; one that doesn't means you sort before writing.
- The action **replaces** the cart's `directDiscounts` array — the evaluator always writes the complete current set, never a delta.
- They **transfer to the Order** automatically when the Order is created from the Cart. Changing them afterwards is not a plain cart update — it needs the [Order Edits `setDirectDiscounts`](https://docs.commercetools.com/api/projects/order-edits.md) action.
- They also work on **Quotes** (valid for that quote only) — relevant for B2B negotiated pricing.

> **The exclusivity rule.** Direct Discounts and Discount Codes are **mutually exclusive**: if a Direct Discount is applied to a Cart or Order, **any matching Cart Discounts in the Project are ignored**. Practical consequence to state to the user before writing a line of code: once the engine owns the cart, your native Discount Codes and Cart Discounts stop affecting it. "Engine promotions *plus* our existing native promo codes on the same cart" is not a supported design — pick one owner (see Step 1 question 3). The docs state the ignoring behavior; they do not define an API-level rejection for mixing, so **do not** rely on the platform to error out and warn you — enforce the ownership decision in your own code and configuration.

### Negative custom line items — legacy/compat

Add a custom line item with a negative price per discount. This is what the public Voucherify integration does by default (it exposes Direct Discounts as an opt-in flag instead). Costs: it needs a **tax category**, it shows up as a cart line the storefront must render and filter, it distorts subtotals and reporting, and totals interact with tax differently. Choose it only when you need a per-code visible line item or you're matching an existing storefront that already handles it. New builds: prefer Direct Discounts.

### Engine-managed native Discount Codes — narrow

The engine (or a `job`) creates/mirrors Cart Discounts and Discount Codes in commercetools, and the platform evaluates them natively. Keeps native semantics, no extension on the cart hot path, and no exclusivity problem — but adds sync lag, and Cart Discount and Discount Code [limits](https://docs.commercetools.com/api/limits.md) apply, which is exactly what "unique codes at scale" requirements break against. Viable for a modest, slow-changing campaign set; not for per-customer unique codes.

Record the choice and why.

## The connect.yaml envelope

`connect.yaml` has **no published JSON Schema** — its shape is defined only by the [docs](https://docs.commercetools.com/connect/development.md). Use only documented envelope keys (`deployAs` / `applicationType` / `endpoint` / `scripts` / `configuration`; `inheritAs`), and place the file at the **repository root** — a nested `connect.yaml` silently fails to deploy.

### Native client provisioning (prefer this)

Declare the connector's scopes and let Connect mint a least-privilege API client, rather than hand-supplying `CTP_CLIENT_ID`/`SECRET`:

```yaml
inheritAs:
  apiClient:
    scopes:
      - manage_extensions      # evaluator postDeploy registers the Cart API Extension
      - manage_subscriptions   # syncer postDeploy registers the OrderCreated Subscription
      - view_orders            # syncer re-fetches the Order to build the redemption
      - manage_types           # only if postDeploy creates the coupon-code custom type
  configuration:
    standardConfiguration:
      - key: PROMOTION_ENGINE_BASE_URL
        description: Engine API base URL (sandbox or live)
      - key: COUPON_CODE_FIELD
        description: Cart custom field holding the shopper-entered coupon code
    securedConfiguration:
      - key: PROMOTION_ENGINE_API_KEY
        description: Engine API key, used by both apps
```

> **Note:** `view_extensions` / `view_subscriptions` are **not** valid standalone scopes — `manage_extensions` / `manage_subscriptions` cover read + write. Declaring the non-existent view scopes fails client creation.

Add `view_customers` only if the evaluator forwards customer attributes, and `manage_customers` only if you mirror points back onto the Customer. Both are easy to over-grant — justify each.

The public promotion connectors hand-declare `CTP_CLIENT_ID/SECRET/SCOPE` as secured config; migrating to `inheritAs.apiClient.scopes` is the more native, lower-maintenance form and is worth doing on a fork or a fresh build ([public-connectors.md](./public-connectors.md)).

### Per-app config

```yaml
deployAs:
  - name: promotion-evaluator
    applicationType: service
    endpoint: /promotionEvaluator
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy   # registers the API Extension + custom type
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
    configuration:
      standardConfiguration:
        - key: FAIL_MODE
          description: "'open' (drop discounts on engine error) or 'closed' (fail the cart update)"
        - key: ENGINE_TIMEOUT_MS
          description: Outbound engine timeout, must stay under the extension budget
  - name: redemption-syncer
    applicationType: event
    endpoint: /redemptionSyncer
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy   # registers the Subscription
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
    configuration:
      standardConfiguration:
        - key: CONNECT_SUBSCRIPTION_DESTINATION
          description: "GoogleCloudPubSub or SNS"
        - key: ROLLBACK_ORDER_STATES
          description: Order states that trigger a redemption rollback (e.g. Cancelled)
```

The extension destination URL must include the endpoint path (`<url>/promotionEvaluator`), and the Express router must be mounted at the same base path — a mismatch 404s all platform traffic ([project-structure.md](../../../commercetools-connect/references/project-structure.md)).

## Worked example (in-house engine, from-scratch build)

Requirements: in-house "PromoSvc"; engine owns all promotions; shopper-entered coupon codes; loyalty points held solely in PromoSvc; rollback on cancellation; fail-open; `europe-west1.gcp`.

Derived config:

```yaml
inheritAs:
  apiClient:
    scopes: [manage_extensions, manage_subscriptions, view_orders, manage_types]
  configuration:
    standardConfiguration:
      - key: PROMOTION_ENGINE_BASE_URL
        description: PromoSvc base URL
      - key: COUPON_CODE_FIELD
        description: "Cart custom field with the entered code (promoSvcCouponCode)"
      - key: CART_HASH_FIELD
        description: "Cart custom field holding the promo-relevant cart hash (loop guard + call reduction)"
    securedConfiguration:
      - key: PROMOTION_ENGINE_API_KEY
        description: PromoSvc API key (same key both apps)
deployAs:
  - name: promotion-evaluator
    applicationType: service
    endpoint: /promotionEvaluator
    scripts: { postDeploy: "npm ci --omit=dev && npm run connector:post-deploy", preUndeploy: "npm ci --omit=dev && npm run connector:pre-undeploy" }
    configuration:
      standardConfiguration:
        - key: FAIL_MODE
          description: "'open' — a PromoSvc outage drops discounts, never blocks the cart"
        - key: ENGINE_TIMEOUT_MS
          description: "800 — well under the extension budget"
  - name: redemption-syncer
    applicationType: event
    endpoint: /redemptionSyncer
    scripts: { postDeploy: "npm ci --omit=dev && npm run connector:post-deploy", preUndeploy: "npm ci --omit=dev && npm run connector:pre-undeploy" }
    configuration:
      standardConfiguration:
        - key: CONNECT_SUBSCRIPTION_DESTINATION
          description: "GoogleCloudPubSub"
        - key: ROLLBACK_ORDER_STATES
          description: "Cancelled"
```

Rationale to hand the user: `setDirectDiscounts` so PromoSvc's amounts are authoritative and no custom line items pollute the cart; **native Discount Codes will no longer affect these carts** — coupon codes go through `promoSvcCouponCode` instead; both apps because redemption and point-awarding are real requirements, not just checkout display; `manage_types` only because `postDeploy` creates the two cart custom fields; fail-open with an 800 ms timeout so a PromoSvc incident degrades to "no promotions" rather than "no checkout".

The custom type creation belongs in `postDeploy`, get-then-update so a redeploy doesn't blow away existing fields ([lifecycle-scripts.md](../../../commercetools-connect/references/lifecycle-scripts.md)).

For an existing connector, read its `connect.yaml` for the real key names and apply this mapping to their values; the fixes worth making while you're forking are in [public-connectors.md](./public-connectors.md).
