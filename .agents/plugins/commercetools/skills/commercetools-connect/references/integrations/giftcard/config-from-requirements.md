---
name: giftcard-config-from-requirements
description: Map gift card requirements to a commercetools gift card connector's connect.yaml — the CT connection block, currency, gift-card-system credentials, least-privilege scopes — with a worked example. The gift card sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - giftcard
    - connect
---

# Requirements → gift card connector config

This turns the Step 1 requirements ([overview.md](./overview.md)) into concrete `connect.yaml` values. For a public connector these are its documented keys; for a from-template build these are the keys you define. Grounded in the [gift card integration template](https://github.com/commercetools/connect-giftcard-integration-template) and the [Voucherify connector](https://github.com/commercetools/connect-giftcard-integration-voucherify).

## The requirement → config map

| Requirement (Step 1) | Config / decision | Why |
|---|---|---|
| Which gift card system + credentials | `securedConfiguration`: system API secret/token (+ any `standardConfiguration` application/program id, base URL) | Secrets never in `standardConfiguration`, never hardcoded |
| Region + project | `standardConfiguration`: `CTP_PROJECT_KEY`, `CTP_AUTH_URL`, `CTP_API_URL`, `CTP_SESSION_URL`, `CTP_JWKS_URL`, `CTP_JWT_ISSUER` | Hosts + token validation are region/project specific |
| Currency scope | `standardConfiguration`: a currency key (template: `MOCK_CONNECTOR_CURRENCY`; Voucherify: `VOUCHERIFY_CURRENCY`) | One deployment is typically scoped to one currency; multi-currency ⇒ multiple deployments or a converting system |
| Fallback payment method | (Merchant Center Payment Integration config, **not** connect.yaml) | The gift card integration is configured alongside a PSP integration — a Checkout Application setting |
| Balance / redeem | Both are core processor routes (always built) | The minimum gift-card contract |
| Refund / reverse on cancel-return | Implement the Payment Intents `modifyPayment` operations | Post-order lifecycle goes through the Payment Intents API, not the enabler |
| Partial + multiple cards | Redeem logic + remainder handling (code, not a single toggle) | The card may not cover the total; the remainder goes to the fallback method |

## The commercetools connection block

The processor validates two kinds of caller — Checkout **Sessions** (balance/redeem) and Merchant Center **JWTs** (Payment Intents operations) — so the CT block carries both the session URL and the JWKS/issuer:

```yaml
standardConfiguration:
  - key: CTP_PROJECT_KEY
    description: commercetools project key
    required: true
  - key: CTP_AUTH_URL
    description: commercetools Auth URL
    required: true
    default: https://auth.europe-west1.gcp.commercetools.com
  - key: CTP_API_URL
    description: commercetools API URL
    required: true
    default: https://api.europe-west1.gcp.commercetools.com
  - key: CTP_SESSION_URL
    description: Session API URL
    required: true
    default: https://session.europe-west1.gcp.commercetools.com
  - key: CTP_CLIENT_ID
    description: commercetools client ID (scopes below)
    required: true
  - key: CTP_JWKS_URL
    description: JWKs URL for JWT validation
    required: true
    default: https://mc-api.europe-west1.gcp.commercetools.com/.well-known/jwks.json
  - key: CTP_JWT_ISSUER
    description: JWT issuer for JWT validation
    required: true
    default: https://mc-api.europe-west1.gcp.commercetools.com
securedConfiguration:
  - key: CTP_CLIENT_SECRET
    description: commercetools client secret
    required: true
```

**Match every host to the project's region.** The defaults above are `europe-west1.gcp`; a project in another region needs the matching `auth`/`api`/`session`/`mc-api` hosts, or session validation and JWKS lookup fail. This is the most common misconfiguration.

## Scopes

The API client the connector runs as needs these scopes ([template](https://github.com/commercetools/connect-giftcard-integration-template) `CTP_CLIENT_ID` description):

```
manage_payments  manage_orders  view_sessions  view_api_clients  manage_checkout_payment_intents  introspect_oauth_tokens
```

- `manage_payments` — the processor creates and updates the Payment (redeem transactions).
- `manage_orders` — associate the Payment with the Order / read order context.
- `view_sessions` + `introspect_oauth_tokens` — validate the Checkout Session on `/balance` and `/redeem`.
- `view_api_clients` — resolve the calling client during session/JWT validation.
- `manage_checkout_payment_intents` — accept `POST /payment-intents/:id` calls from the [Payment Intents API](https://docs.commercetools.com/checkout/payment-intents-api.md) (refund/reverse). Automated **reversals** additionally require the connector to support the `reversePayment` action.

Prefer declaring scopes so Connect provisions a least-privilege client over hand-supplying `CTP_CLIENT_ID/SECRET`. Grant only the scopes the routes above use — nothing broader like `manage_project`.

## The connect.yaml envelope

`connect.yaml` has **no published JSON Schema** — its shape is defined only by the [docs](https://docs.commercetools.com/connect/development.md). Use only documented envelope keys (`deployAs` / `applicationType` / `endpoint` / `scripts` / `configuration`), and place the file at the **repository root** — a nested `connect.yaml` silently fails to deploy. The two apps:

```yaml
deployAs:
  - name: enabler
    applicationType: assets
  - name: processor
    applicationType: service
    endpoint: /
    configuration:
      standardConfiguration: [ ... CT block + currency + system config ... ]
      securedConfiguration:  [ ... CT client secret + system secret ... ]
```

The **enabler is `assets`** (a static bundle, no endpoint); the **processor is `service`** with `endpoint: /` (routes are mounted at the root — `/status`, `/balance`, `/redeem`, `/payment-intents/:id`). Keep the router mounted at `/` to match, or Checkout's calls 404.

## Worked example (build from template, in-house gift card ledger)

Requirements: in-house store-credit ledger with a REST API; single currency EUR; balance + redeem + refund; partial + multiple cards; paired with an existing Stripe PSP integration; `europe-west1.gcp`.

Derived processor config (CT block from above, plus):

```yaml
standardConfiguration:
  - key: GIFTCARD_CURRENCY
    description: Currency this deployment handles (EUR)
    required: true
  - key: GIFTCARD_API_URL
    description: Base URL of the store-credit ledger API
    required: true
securedConfiguration:
  - key: GIFTCARD_API_KEY
    description: Store-credit ledger API key
    required: true
```

Rationale to hand the user: one deployment for EUR (add a second deployment for another currency if needed); the ledger secret in `securedConfiguration`, its base URL in `standardConfiguration`; scopes exactly the six the routes need. **The fallback pairing (Stripe) is configured in the Checkout Application's Payment Integrations, not here** — flag that the gift card integration must not be shipped alone ([overview.md](./overview.md)). For Voucherify's exact keys instead (`VOUCHERIFY_APPLICATION_ID`, `VOUCHERIFY_API_URL`, `VOUCHERIFY_CURRENCY`, `VOUCHERIFY_SECRET_KEY`), see its [connect.yaml](https://github.com/commercetools/connect-giftcard-integration-voucherify).
