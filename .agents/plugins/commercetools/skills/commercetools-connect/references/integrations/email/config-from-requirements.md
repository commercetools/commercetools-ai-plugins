---
name: email-config-from-requirements
description: Map email requirements to a commercetools email connector's connect.yaml — which Messages, ESP key + per-email template IDs, sender, least-privilege scopes (scoped to the emails in use) — with a worked example. The email sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - email
    - connect
---

# Requirements → email connector config

This turns the Step 1 requirements ([overview.md](./overview.md)) into concrete `connect.yaml` values. For a ready-made connector these are its documented keys; for a from-template build these are the keys you define. The template's own key names are called out below.

## The requirement → config map

| Requirement (Step 1) | Config / decision | Why |
|---|---|---|
| Which ESP + credentials | `securedConfiguration`: `EMAIL_PROVIDER_API_KEY` (or the ESP's user/pass/region) | Secrets never in `standardConfiguration`, never hardcoded |
| Sender identity | `securedConfiguration`: `SENDER_EMAIL_ADDRESS` (must be a verified domain/sender in the ESP) | Unverified senders are rejected or land in spam |
| Which emails | The Subscription message types (in code/postDeploy) **and** one template id per email | The handler routes by message type to a template |
| ESP-hosted templates | `securedConfiguration`: one `*_TEMPLATE_ID` per email type | Points each email at its ESP template |
| Localization | Language source (`customer.locale` / order / store) → per-locale template id or a locale field passed to the ESP | Right language per recipient (template hardcodes `en-US` — a gap) |
| Order-state target states | Config or code list of the states that trigger a send | `OrderStateChanged` fires on every transition; gate it |
| Region + project | `standardConfiguration: CTP_REGION`; scopes via `inheritAs` | Host + client provisioning are region/project specific |
| Token emails in scope | `manage_customers` scope (mint token is a write); token-validity ≤ 60 min if you want the value in the Message | See [email-contract.md](./email-contract.md) |

## Scopes — least-privilege depends on which emails you send

The connector needs exactly the scopes its `postDeploy` and handlers use — no more. Build the set from the emails in scope:

| Capability | Scope | Needed when |
|---|---|---|
| Register the Subscription in `postDeploy` | `manage_subscriptions` | **always** |
| Re-fetch the Order to build order emails | `view_orders` | any order email (confirmation, state/shipment, refund) |
| Re-fetch the Customer to build customer emails | `view_customers` | registration / any email that reads customer data |
| Mint an email/password token in the handler | `manage_customers` | verification / password-reset emails (supersedes `view_customers`) |

> **Why token emails need write access.** The token *value* is only present in the `CustomerEmailTokenCreated` / `CustomerPasswordTokenCreated` Message when the token's validity is **≤ 60 minutes** ([customer password reset](https://docs.commercetools.com/api/customers-overview.md#customer-password-reset)). For longer-lived tokens the value is omitted, so the connector must create the token itself (a `POST .../password-token` write) — which is what the official template does. If your reset tokens are short-lived and you read the value straight from the Message, `view_customers` is enough; if you mint in the handler, you need `manage_customers`.

## The connect.yaml envelope

`connect.yaml` has **no published JSON Schema** — its shape is defined only by the [docs](https://docs.commercetools.com/connect/development.md). Use only documented envelope keys, and place the file at the **repository root** — a nested `connect.yaml` silently fails to deploy.

### Native client provisioning (prefer this)

Declare scopes and let Connect mint a least-privilege API client, rather than hand-supplying `CTP_CLIENT_ID`/`SECRET`:

```yaml
inheritAs:
  apiClient:
    scopes:
      - manage_subscriptions   # postDeploy registers the email Subscription
      - view_orders            # handlers re-fetch the Order for order emails
      - manage_customers       # only if minting verification/password tokens; else view_customers
```

The official template hand-declares `CTP_CLIENT_ID/SECRET/SCOPE` as secured config; migrating to `inheritAs.apiClient.scopes` is the more native, lower-maintenance form and is worth doing on a from-template build.

### The event app

```yaml
deployAs:
  - name: mail-sender
    applicationType: event
    endpoint: /mailSender
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy    # registers the Subscription
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy  # deletes it
    configuration:
      standardConfiguration:
        - key: CTP_REGION
          description: commercetools Composable Commerce API region
      securedConfiguration:
        - key: EMAIL_PROVIDER_API_KEY
          description: API key for the email service provider
        - key: SENDER_EMAIL_ADDRESS
          description: Verified sender address shown in the email
        - key: ORDER_CONFIRMATION_TEMPLATE_ID
          description: ESP template id for order confirmation
        # …one template id per email type in scope
```

> **Subscription destination is injected, not declared.** An `event` app's queue/topic is provisioned by Connect, which injects `CONNECT_SUBSCRIPTION_DESTINATION` and `CONNECT_GCP_TOPIC_NAME` / `CONNECT_GCP_PROJECT_ID` (or `CONNECT_AWS_TOPIC_ARN` for SNS) at deploy time. Build the Subscription destination from those in `postDeploy` — don't add them to `connect.yaml` and don't hardcode a broker ([event-applications.md](https://docs.commercetools.com/dev-tooling/skills/commercetools-connect#event-applications-pattern-7-register-the-subscription-destination)).

## Worked example (SendGrid, from-template build)

Requirements: SendGrid; order confirmation + shipment + password reset; ESP-hosted dynamic templates; English + German by `customer.locale`; `europe-west1.gcp`; short-lived reset tokens minted in the connector.

Derived config:

```yaml
inheritAs:
  apiClient:
    scopes: [manage_subscriptions, view_orders, manage_customers]  # manage_customers: mints the reset token
  configuration:
    standardConfiguration:
      - key: CTP_REGION
        description: commercetools Composable Commerce API region
    securedConfiguration:
      - key: EMAIL_PROVIDER_API_KEY
        description: SendGrid API key
      - key: SENDER_EMAIL_ADDRESS
        description: Verified sender (e.g. no-reply@shop.example)
      - key: ORDER_CONFIRMATION_TEMPLATE_ID_EN
        description: SendGrid dynamic template id — order confirmation (en)
      - key: ORDER_CONFIRMATION_TEMPLATE_ID_DE
        description: SendGrid dynamic template id — order confirmation (de)
      - key: ORDER_SHIPMENT_TEMPLATE_ID_EN
        description: SendGrid dynamic template id — shipment (en)
      - key: ORDER_SHIPMENT_TEMPLATE_ID_DE
        description: SendGrid dynamic template id — shipment (de)
      - key: PASSWORD_RESET_TEMPLATE_ID_EN
        description: SendGrid dynamic template id — password reset (en)
      - key: PASSWORD_RESET_TEMPLATE_ID_DE
        description: SendGrid dynamic template id — password reset (de)
deployAs:
  - name: mail-sender
    applicationType: event
    endpoint: /mailSender
    scripts:
      postDeploy: npm ci --omit=dev && npm run connector:post-deploy
      preUndeploy: npm ci --omit=dev && npm run connector:pre-undeploy
```

Rationale to hand the user: `manage_subscriptions` for the postDeploy registration, `view_orders` to re-fetch orders for confirmation/shipment, `manage_customers` because the reset email mints a short-lived token in the handler — nothing more. Two template ids per email keep localization explicit; the handler picks `_EN`/`_DE` from `customer.locale` with `EN` as the fallback. **Shipment emails must be gated on the shipment reaching `Shipped`** (not fired on every `OrderStateChanged`) — see [email-contract.md](./email-contract.md). Provider-exact send-call shape (dynamic templates, `dynamic_template_data`, idempotency header): [providers.md](./providers.md).
