---
name: promotion-public-connectors
description: Which public promotion integration to actually use (Talon.One via Orium's Connect connector vs the vendor's PoC accelerator; Voucherify's standalone service), and the commercetools-side judgment to apply when forking one — the parts no vendor doc covers. The promotion sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - promotions
    - connect
---

# Public promotion integrations — which one, and what to fix

**This file deliberately does not restate configuration keys, API payloads, or setup steps.** Those live in each repo's `connect.yaml` and README and in the vendor's docs, they change, and whoever maintains them does it better than a copy here would. Read them at the source — links below.

What this file *does* cover is the two things no vendor page will tell you:

1. **Which artifact is the production one** — for the engines here, that is not obvious, and the vendor's own documentation points elsewhere.
2. **What to change when you fork one** — commercetools production-readiness judgment applied to someone else's connector.

## Get the current facts from the source

For any public connector, in this order:

1. **The repo's `connect.yaml`** — applications, types, endpoints, scripts, and the full `standardConfiguration`/`securedConfiguration` surface. This is the authoritative config contract; nothing else is.
2. **The repo's README** — install, credentials, and setup.
3. **The repo source** — `postDeploy` (which resources the extensions/subscriptions are registered on) and the effect-mapping module. `connect.yaml` tells you the deployment shape; only the source tells you the behavior.
4. **The vendor's API docs** — the engine-side endpoints, session model, and effect vocabulary.
5. **The marketplace listing** — for certified vs registered status, which changes. Record what you saw; don't assert it from memory.

## Talon.One — mind which repository

Three different artifacts exist, and picking the wrong one is the most likely early mistake:

| Artifact | Maintained by | Use it? |
|---|---|---|
| [`composable-com/ct-connect-talonone`](https://github.com/composable-com/ct-connect-talonone) — a **Connect** connector, MIT | **Orium** (a systems integrator), *not* Talon.One | **Yes** — the production path, and the basis for a rung-1 install or a rung-3 fork |
| [`talon-one/commercetools-talonone-accelerator`](https://github.com/talon-one/commercetools-talonone-accelerator) — AWS/GCP microservice | Talon.One | **No.** Talon.One's own documentation describes it as an experimental method suited to proof-of-concept or simulation projects, **not production** |
| [`talon-one/commercetools-talonone-connector`](https://github.com/talon-one/commercetools-talonone-connector) — AWS connector | Talon.One | Separate, AWS-specific; not the Connect path |

The consequence worth internalizing: **the vendor's docs and the production connector point in different directions.** [Talon.One's commercetools integration docs](https://docs.talon.one/docs/dev/technology-partners/commercetools/commercetools-integration) describe *their* accelerator; the Connect connector is a third party's and is documented in its own repo. Use the vendor's docs for the **engine** (sessions, effects, the API), and Orium's repo for the **integration**. If someone cites the vendor's integration page as the implementation plan, redirect them and say why.

### The model (concepts only — the API is the vendor's to document)

A Talon.One **Customer Session** is what a Cart is to commercetools, and a Customer Profile is what a Customer is. Talon.One is a rules-and-**effects** engine: it doesn't return "a discount", it returns a list of effects (set discount, add free item, award loyalty points, accept/reject coupon, show a message). The connector's real work is the **effect → cart update action** mapping — the table in [promotion-contract.md](./promotion-contract.md) — and keeping the session key stable across the cart's life. Everything else is engine-side and belongs in the vendor's docs.

## Voucherify — a port, not an install

[`voucherifyio/commerce-tools-integration`](https://github.com/voucherifyio/commerce-tools-integration) is MIT and instructive, but **not a Connect application**: it is a standalone Node service that registers its own API Extensions and is documented for self-hosted / Heroku deployment. Running it under Connect means **porting** it (a `connect.yaml`, lifecycle scripts, endpoint↔route wiring, env vars moved into standard/secured configuration). That is rung-3 work, not a marketplace install — plan it as such. Nothing in the vendor's docs frames it this way, because from their side it isn't a Connect product.

Three of its design decisions are worth copying — or consciously rejecting:

- **Discounts as negative custom line items by default, Direct Discounts behind a flag.** Its docs are explicit that the custom-line-item path **requires storefront changes** and that the integration **bypasses native Discount Codes**, storing codes in cart custom fields instead — the exclusivity rule from [config-from-requirements.md](./config-from-requirements.md#how-discounts-land-on-the-cart) showing up in a shipped product. For a new build, invert the default: Direct Discounts first.
- **Codes and their validation status in cart custom fields** — the same pattern [promotion-contract.md](./promotion-contract.md) prescribes for rejecting a coupon without failing the cart update.
- **Redemption on payment state → `Paid`, not on `OrderCreated`.** A defensible variation: it avoids consuming a coupon for an order that is never paid. Put this to the user as a real decision — redeem at **order creation** (simpler, matches "the promotion was used", needs rollback on cancellation) or at **payment confirmation** (nothing consumed for unpaid orders, but the discount is shown before it is consumed, and the syncer subscribes to payment/order-state messages instead). Either is fine; drifting between them by accident is not.

## What to fix when you fork (rung 3)

The public promotion connectors predate parts of the current Connect guidance. Forking is the moment to correct these — each maps to an item on the parent skill's [production-readiness gate](../../../SKILL.md). Check each against the fork's actual `connect.yaml` and source rather than assuming it still applies:

- **Hand-supplied commercetools credentials → `inheritAs.apiClient.scopes`.** `CTP_CLIENT_ID` / `CTP_CLIENT_SECRET` / `CTP_SCOPE` as secured config means a human provisions and rotates an API client with whatever scopes they happened to grant. Declaring scopes lets Connect mint a least-privilege client instead. Highest-value single change, and both public promotion integrations need it.
- **Non-secrets in `securedConfiguration`.** A tax-category id, a locale, a region are configuration, not credentials. Their presence is also a signal: a tax-category id means the connector can represent discounts as **custom line items** (which require one) — check which mechanism you're inheriting and whether you want it ([config-from-requirements.md](./config-from-requirements.md#how-discounts-land-on-the-cart)).
- **A root `endpoint: /`.** Works, but makes the route↔endpoint contract easy to break and gives you nothing to distinguish apps by. Prefer a named endpoint with the router mounted to match ([project-structure.md](../../project-structure.md)).
- **`npm install` in lifecycle scripts → `npm ci --omit=dev`.** Reproducible, and no dev dependencies in the deployed image.
- **One `service` doing both halves.** If the connector performs redemption synchronously inside an `order` extension rather than an `OrderCreated` Subscription, understand the trade you are inheriting: it puts the engine on the **critical path of order creation**, so an engine outage can block orders — fail-closed on the money path. For new work, split evaluate (`service`) from redeem (`event`) as [overview.md](./overview.md) describes. If you keep synchronous redemption, document that stance in the README.
- **Pinned SDK versions** — check against the parent skill's gate (`@commercetools/platform-sdk@^8` + `@commercetools/ts-client@^4`).

## Other engines

Dovetech Campaigns, Eagle Eye, NULogic, Annex Cloud, Currency Alliance, and SheerID have marketplace listings without public source. For those, rung 1 (configure) or a partner conversation are the realistic options — a genuine gap you can neither configure around nor fork means either the vendor changes something or you build (rung 4). See [connector-selection.md](./connector-selection.md).

Adding an engine here means a short section naming **which artifact is the production one** and any fork fixes — not a copy of its configuration reference.
