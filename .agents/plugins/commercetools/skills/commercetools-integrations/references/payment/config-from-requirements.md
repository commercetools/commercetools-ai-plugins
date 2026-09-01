---
name: config-from-requirements
description: Map a user's payment requirements (capture mode, saved cards, partial refunds, methods, region, origins) onto the correct payment-connector connect.yaml config for the chosen provider, with a worked example producing a filled config plus rationale.
when_to_use:
  - "Turning payment requirements into concrete connector configuration"
  - "Deciding capture method, saved-cards, multi-operations, billing collection, CORS, and return-URL config values"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
---

# From requirements to config

The connector's *behavior* is set by `connect.yaml` configuration, and most of it has a default that quietly bakes in a decision. So the job is: take the requirements gathered in Step 1, decide each value deliberately, and hand the user a filled config block with a one-line **why** per non-obvious key. This reference gives the provider-agnostic mapping; exact key names, defaults, and the secured-vs-standard split are in the provider reference (e.g. [stripe.md](./stripe.md)).

## Table of contents
- [The connect.yaml envelope](#the-connectyaml-envelope)
- [The mapping](#the-mapping)
- [How to present the result](#how-to-present-the-result)
- [Worked example (Stripe)](#worked-example-stripe)
- [Pitfalls in the config itself](#pitfalls-in-the-config-itself)

## The connect.yaml envelope

Before deciding *values*, get the *shape* right. The values below (capture method, saved cards, origins) all live inside a fixed envelope that the connector author defines and Connect validates at publish/deploy time. There is **no published JSON Schema or OpenAPI file for `connect.yaml`** — the authoritative spec is the documentation, not a linter — so the envelope is easy to get subtly wrong. Two rules close the common gaps.

**1. Don't invent fields.** The envelope has a closed set of keys. Use only these; if a key you "remember" isn't on this list, it doesn't exist. The canonical reference is the docs page [Configure connect.yaml](https://docs.commercetools.com/connect/development.md) (fetch `https://docs.commercetools.com/connect/development.md` to confirm against the current spec) — read it rather than reconstructing the structure from memory.

```yaml
deployAs:                              # required — array of the connector's applications
  - name: processor                    # required — must match the application's folder name in the repo
    applicationType: service           # service | event | job | merchant-center-custom-application | merchant-center-custom-view | assets
    endpoint: /processor               # required for service/event/job; omit for assets and the MC types
    properties:
      schedule: '*/5 * * * *'          # job type only — cron expression
    scripts:                           # optional — only if the app installs Extensions/Subscriptions
      postDeploy: npm run connector:post-deploy
      preUndeploy: npm run connector:pre-undeploy
    configuration:                     # optional (omit for assets)
      standardConfiguration:           # non-secret env vars; each: key, description, required, default?
        - key: CTP_PROJECT_KEY
          description: ...
          required: true
          default: 'default-key'       # default? is allowed here only
      securedConfiguration:            # secrets; each: key, description, required — NO default
        - key: CTP_CLIENT_SECRET
          description: ...
          required: true
inheritAs:                             # optional — config/scopes shared across all applications
  configuration:
    standardConfiguration: [...]
    securedConfiguration: [...]
  apiClient:
    scopes:                            # for auto-generated API Client credentials
      - manage_payments
```

> **`inheritAs.apiClient` and self-supplied `CTP_CLIENT_ID`/`CTP_CLIENT_SECRET` are mutually exclusive — declaring both is a deploy/install-time conflict.** Pick one credential model, not both:
> - **Auto-generated (recommended):** declare `inheritAs.apiClient.scopes` and let Connect mint the credentials and inject them. Then remove the CT-client keys from your config — `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, and `CTP_SCOPE` from `securedConfiguration`, **and** `CTP_PROJECT_KEY` from `standardConfiguration` — Connect injects all of these at runtime, and leaving them declared causes a deploy conflict.
> - **Self-supplied:** declare `CTP_CLIENT_ID`/`CTP_CLIENT_SECRET` in `securedConfiguration` and drop the `inheritAs.apiClient` block; the deployer provides the values.
>
> The `securedConfiguration` example below shows the self-supplied half; if you keep `inheritAs.apiClient`, remove those CT-client keys.

The only per-entry fields are: `name`, `applicationType`, `endpoint`, `properties` (with `schedule`), `scripts` (`postDeploy`/`preUndeploy`), and `configuration`. Each config item is exactly `{ key, description, required }` plus `default` for `standardConfiguration` only. Anything else — a `type`, `value`, `env`, `secret`, `validation` field on a config item, or a top-level key other than `deployAs`/`inheritAs` — is hallucinated. (Note: the *connector author* writes `connect.yaml` with these key **declarations**; the *deployer* supplies the actual `value` for each at `deployment create` time. The YAML itself carries no `value` field — don't add one.)

**2. `connect.yaml` lives at the repository root.** It is the entry point Connect looks for, and it must sit at the top level of the connector repo — not inside `processor/`, `enabler/`, `src/`, or any nested folder. A nested `connect.yaml` is not discovered and the connector fails to stage/deploy with no obvious cause. The application folders (`processor/`, `enabler/`) are siblings *below* the root, and each app's `name` in `deployAs` points at its folder; the single `connect.yaml` at the root describes them all.

```
my-stripe-connector/
├── connect.yaml          ← here, and only here
├── processor/            ← name: processor, applicationType: service
└── enabler/              ← name: enabler, applicationType: assets
```

## The mapping

Each requirement drives one or more config keys. The middle column is the *concept* (provider-agnostic); the provider reference gives the actual key name for the chosen PSP.

| Requirement (Step 1) | Config concept it drives | Decision guidance |
|---|---|---|
| **Region + project** | the `CTP_*_URL` hosts (`CTP_API_URL`, `CTP_AUTH_URL`, `CTP_SESSION_URL`, `CTP_CHECKOUT_URL`), `CTP_JWKS_URL`, `CTP_JWT_ISSUER`, `CTP_PROJECT_KEY` | All must point at the user's region; defaults usually point at one region (often `europe-west1.gcp`) — change them or auth/session calls fail. |
| **Capture mode** (charge now vs. authorize→capture later) | capture-method key (e.g. `automatic` vs `manual`) | `manual` = authorize at `submit()`, you capture later via the processor on fulfillment → also delays *when you create the Order* (see backend). `automatic` = charged at `submit()`. |
| **Saved payment methods / returning customers** | saved-cards config + "setup future usage" | Enabling it requires the cart to carry a `customerId` (stored methods bind to a Customer). Off by default — only enable if the business wants reuse. |
| **Partial refunds / split captures** | multi-operations toggle | Off by default; enabling partial/multiple captures or refunds often also requires the capability enabled in the PSP account. Don't enable speculatively — it changes transaction handling. |
| **Payment methods + drop-in vs components** | layout / appearance / express-element config; the integration *type* chosen in the Merchant Center | Drop-in (one element) is simplest; web components give per-method control. Layout/appearance keys are cosmetic and safe to leave default. |
| **Storefront origin(s)** | allowed-origins (CORS) | Must list every exact origin the browser calls the processor from (scheme + host + port). Missing origin → processor CORS-rejects the browser. |
| **Post-payment return URL** | merchant-return-URL | Must be an **absolute URL with a scheme** — the enabler calls `new URL()` on it; a bare host throws and silently breaks the flow. |
| **Payment interface naming** | payment-interface value | The `paymentMethodInfo.paymentInterface` written on the Payment; pick a stable identifier so you can query payments by interface later. |
| **Sync vs. async settlement** | webhook id + signing secret (secured) | Required whenever final state arrives via webhook. Without it the transaction never finalizes. Drives whether Order creation waits on the webhook. |
| **(always)** PSP credentials, CT client | secured: PSP secret key, webhook signing secret, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET` | Always `securedConfiguration`, never standard, never hardcoded, never invented — the user supplies the real values. |

**When configuring an existing public connector, verify against the live connector before finalizing.** The key tables here and in the provider references are snapshots; a fast-iterating connector's actual `required` flags, defaults, and runtime scope list can have moved. `GET /connectors/key={connector-key}` returns the authoritative `configurations` and `apiClient.scopes` — see [deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md), Pattern 4. This does not apply when you're authoring `connect.yaml` for a connector you're building, where this file *is* the source.

## How to present the result

Give the user four things, not a vague pointer:

1. A **filled `standardConfiguration` block** with the chosen values inline.
2. The **`securedConfiguration` keys** they must set themselves (names only — never fabricate secret values).
3. The **API-client scopes** the connector needs (at minimum: `manage_payments`, `view_sessions`; add `manage_orders` if the connector creates/links Carts or Orders). Two traps here:
   - **Don't request `manage_project` as a shortcut.** It's a broad superset that masks which scopes you actually need and over-privileges the connector; it also won't survive a least-privilege review or certification. List the specific scopes.
   - **The runtime token scopes must match the declared scopes.** Whatever the SDK client requests at token time (e.g. `withClientCredentialsFlow({ scopes: [...] })`) must be covered by the API client's granted scopes. With auto-generated credentials (`inheritAs.apiClient.scopes`), requesting a scope you didn't declare — e.g. `manage_project` — fails token acquisition with `invalid_scope` (400). Either omit the explicit `scopes` array (inherit the client's scopes) or request exactly the declared set.
4. A short **rationale list**: for each non-default or non-obvious key, one line tying it to the requirement it came from. This is what lets the user catch a wrong assumption.

## Worked example (Stripe)

Requirements gathered: Stripe connector, region `europe-west1.gcp`, project `acme`, **authorize now and capture on shipment**, **save cards for logged-in customers**, **partial refunds expected**, drop-in, storefront at `https://shop.acme.com` (+ `http://localhost:5173` for dev), return to `https://shop.acme.com/order-complete`.

Derived config (key names/defaults from [stripe.md](./stripe.md)). **The `value:` lines below are the deployment-time inputs the deployer supplies (e.g. via `--configuration`) — they are *not* part of `connect.yaml` itself, which only declares the keys (see the per-entry-fields note above):**

```yaml
# processor — standardConfiguration — values shown are deployment inputs, NOT connect.yaml fields
- key: CTP_PROJECT_KEY
  value: acme
- key: CTP_API_URL
  value: https://api.europe-west1.gcp.commercetools.com      # region
- key: CTP_AUTH_URL
  value: https://auth.europe-west1.gcp.commercetools.com     # region
- key: CTP_SESSION_URL
  value: https://session.europe-west1.gcp.commercetools.com  # region
- key: STRIPE_CAPTURE_METHOD
  value: manual                  # authorize now, capture on shipment → also: create Order on auth, capture later
- key: STRIPE_SAVED_PAYMENT_METHODS_CONFIG
  value: '{"payment_method_save":"enabled"}'   # save cards → requires customerId on the cart
- key: STRIPE_ENABLE_MULTI_OPERATIONS
  value: 'true'                  # partial refunds expected (also enable multicapture in the Stripe account)
- key: STRIPE_COLLECT_BILLING_ADDRESS
  value: auto
- key: MERCHANT_RETURN_URL
  value: https://shop.acme.com/order-complete   # absolute URL w/ scheme
- key: ALLOWED_ORIGINS
  value: https://shop.acme.com,http://localhost:5173   # every browser origin that calls the processor
- key: PAYMENT_INTERFACE
  value: checkout-stripe         # written on the Payment; query payments by this later

# processor — securedConfiguration (user supplies the values)
- key: STRIPE_SECRET_KEY                  # Stripe test/live secret key
- key: STRIPE_WEBHOOK_SIGNING_SECRET      # verifies inbound Stripe webhooks
- key: CTP_CLIENT_ID
- key: CTP_CLIENT_SECRET
- key: CTP_SCOPE                           # required alongside ID/SECRET in the self-supplied model
# plus STRIPE_WEBHOOK_ID (standard) once the webhook endpoint exists
```

Rationale to hand back:
- `STRIPE_CAPTURE_METHOD: manual` — they capture on shipment, so authorize at pay time and capture later via the processor; this is also why the **Order is created on a successful authorization**, not on charge.
- `STRIPE_SAVED_PAYMENT_METHODS_CONFIG: enabled` — saving cards binds methods to a Customer, so the cart must carry a `customerId`; anonymous carts won't save.
- `STRIPE_ENABLE_MULTI_OPERATIONS: true` — partial refunds were required; this also needs multicapture enabled in the Stripe account.
- `ALLOWED_ORIGINS` / `MERCHANT_RETURN_URL` — the two values that silently break the browser flow if wrong; both pinned to the real storefront.

## Pitfalls in the config itself
- Leaving region URLs at their defaults when the project is in another region → auth/session failures.
- Enabling saved cards without ensuring a `customerId` on the cart → no methods saved, confusing "why didn't it save" reports.
- Enabling multi-operations in the connector but not in the PSP account → partial capture/refund calls fail at the PSP.
- A bare-host `MERCHANT_RETURN_URL` or a missing origin in `ALLOWED_ORIGINS` → the frontend breaks at runtime, not at deploy.

## Checklist
- [ ] every requirement from Step 1 mapped to a concrete value (no silent defaults left on behavior-changing keys)
- [ ] standardConfiguration filled; securedConfiguration listed by name only
- [ ] scopes stated; region URLs match the project's region
- [ ] rationale line per non-obvious key, tied to its requirement
- [ ] capture-mode decision reflected in the Order-creation timing (→ [backend-integration.md](./backend-integration.md#creating-the-order-after-payment))
