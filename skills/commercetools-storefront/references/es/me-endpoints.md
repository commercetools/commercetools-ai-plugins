# Me Endpoints

## Overview

`/me` endpoints allow a customer's browser or mobile app to call CT directly using a password-flow or anonymous-session token scoped to that customer. CT's own guidance:

> We recommend that you only use the me endpoints in the absence of a middleware layer.

In practice, even "no middleware" scenarios require at least a lightweight BFF to issue and refresh tokens securely. The recommendation from PS engagements is: **default to a BFF with client credentials; use `/me` only when a BFF is genuinely absent and the capability gaps are acceptable.**

## Available Me Endpoints

- My Customer Profile: `/me` (profile create/update)
- My Carts: `/me/carts`
- My Orders: `/me/orders`
- My Payments: `/me/payments`
- My Shopping Lists: `/me/shopping-lists`
- My Quotes / My Quote Requests: `/me/quotes`, `/me/quote-requests`
- My Business Units (B2B): `/me/business-units`

## Authentication Requirements

All `/me` endpoints require a token from either:
- **Password Flow** — for signed-in customers with a CT-managed password
- **Anonymous Session Flow** — for guest sessions

The Password Flow can only be used safely server-side (client secret required). A "no middleware" setup still needs at least a token-issuance endpoint on the server.

For ExternalAuth customers (IDP-managed passwords), the customer record must still exist in CT with `authenticationMode: ExternalAuth`. This adds a sync requirement and means `/me` auth still depends on CT customer records even when the identity provider is external.

## Capability Gaps (Deliberate Restrictions)

These restrictions are intentional security limits — they protect against browser-side manipulation of sensitive fields:

**Carts / Orders**
- Cannot set external line item prices (`LineItemPriceMode: ExternalPrice`)
- Cannot set external taxes or custom tax rates
- Cannot set Custom Line Items
- Cannot set `paymentState` or `orderNumber` on a created Order
- After a Transaction is added to a Payment, it cannot be updated or deleted via My Payments

**Customers**
- Cannot set `customerGroup`, `customerNumber`, `externalId`, or `ExternalAuth` authentication mode

**B2B**
- No `as-associate` API support — B2B flows must use a BFF
- Cannot expand Associates on a Business Unit

**Reference expansion bug**
- Expanded references in `/me` responses are not scoped to the customer. This is a known product bug.

If any of these gaps apply to your project, a BFF is required regardless.

## The Complexity Spiral Anti-pattern

Starting with `/me` to avoid building a BFF often leads to a gradual escalation:

1. Simple mobile app uses `/me` — no middleware needed initially.
2. A cart feature requires external taxes → must add a server-side call → light BFF begins.
3. B2B buyer flow requires `as-associate` → BFF expands.
4. Order management requires setting `orderNumber` → BFF expands further.
5. Refactor: now the project maintains both `/me` logic on the frontend and BFF logic on the server — duplicated, inconsistent, and harder to test.

The PS pattern recommendation: **if there's any chance the use case will grow, start with a BFF.** The short-term setup cost of a BFF is lower than the long-term refactor cost.

## BFF Alternative Pattern

When a BFF exists (or can be added), the recommended flow:

1. BFF authenticates using **Client Credentials Flow** (server-side, narrow-scoped token).
2. Customer authenticates: call `POST /customers/login` to validate email + password (does not return a CT token).
3. On success, BFF issues a **signed JWT** (containing `customerId` and expiry) stored as a cookie in the browser.
4. All subsequent customer-scoped requests go through the BFF, which reads the JWT to identify the customer and calls CT with the client credentials token.
5. No CT password-flow token is ever sent to the browser.

This pattern gives full API access (no capability gaps), better retry/error handling, and supports any identity provider without requiring CT-managed passwords.

## Performance Considerations

Skipping a middleware layer has platform-side costs:

- **Browser preflight (OPTIONS) requests double API traffic.** Browsers send an HTTP OPTIONS prefetch before every cross-origin call. In one PS engagement (MarcOPolo), 6M product search requests produced 2M OPTIONS requests — 33% overhead. A BFF eliminates this because the BFF-to-CT connection is same-origin and server-side.
- **No caching layer means repeated fetches of reference data.** Categories, product types, states, channels, and stores are fetched fresh per customer session with no `/me`-side caching. A BFF can cache these (or use a CDN) and serve them without hitting CT.

## When `/me` Is Acceptable

- Purely mobile or SPA with no BFF and no plans to add one
- The use case fits within the capability gaps (no external prices, no external taxes, no B2B, no orderNumber)
- Performance implications of OPTIONS preflight and reference data fetching are acceptable
- The team is prepared to maintain separate token flows (password + anonymous + potentially client credentials) with separate error surfaces
