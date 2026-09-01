---
name: giftcard-connector-contract
description: The two-app gift card connector contract — the enabler (session-driven UI) and the processor (balance/redeem session-authenticated, payment-intents modifyPayment for refund/reverse). Partial and multiple cards, idempotency, the always-pair-with-a-fallback rule, and a full pitfall catalog. The gift card sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - giftcard
    - connect
---

# The two-app gift card contract

Everything the processor and enabler must do, and the pitfalls that silently break each. Grounded in the [gift card integration template](https://github.com/commercetools/connect-giftcard-integration-template) and the [Voucherify connector](https://github.com/commercetools/connect-giftcard-integration-voucherify), both built on `@commercetools/connect-payment-sdk` (TypeScript, Fastify).

## The rule that frames everything: never ship alone

A gift card Payment Integration must always be configured **alongside at least one other Payment Integration** (a PSP). A card frequently can't cover the whole cart; the fallback method covers the remainder. This is enforced in the Checkout Application configuration, not in the connector — but it shapes the connector's behavior: **redeem must handle "balance < cart total" by redeeming what it can and leaving a remainder**, never by rejecting the payment outright.

## App 1 — the processor (`service`, endpoint `/`)

The backend middleware to the gift card system. It **owns the commercetools Payment**: it creates the Payment and records redeem/refund transactions on it. Routes are mounted at the root (`endpoint: /`).

### Routes and their auth (the auth split is the thing to get right)

| Route | Auth | Purpose |
|---|---|---|
| `GET /status` | JWT | Health / liveness |
| `POST /balance` | **Session** (`SessionHeaderAuthenticationHook`) | Body `{ code }` → check the card's balance against the gift card system; report the amount and whether it covers the cart |
| `POST /redeem` | **Session** | Body `{ code, redeemAmount }` → redeem value against the system and record it on the Payment |
| `POST /payment-intents/:id` | **JWT / OAuth2** (`manage_checkout_payment_intents`) | `modifyPayment({ paymentId, data })` → post-order operations (refund, reverse/rollback) driven by the [Payment Intents API](https://docs.commercetools.com/checkout/payment-intents-api.md) |

The split is deliberate and easy to get wrong: **balance/redeem are shopper-driven and authenticated with the Checkout Session** (the browser has a `sessionId`, not CT credentials); **payment-intents is server/Checkout-driven and authenticated with a JWT/OAuth token** carrying `manage_checkout_payment_intents`. Wiring session auth on the payment-intents route (or vice versa) breaks the corresponding flow. Use the SDK's session/JWT hooks as `preHandler` per route — don't hand-roll validation.

### Balance

- Take `{ code }` (and PIN/security code if the system requires one), call the gift card system's balance API, and return the balance plus whether it's sufficient for the current cart. Checkout surfaces this to the shopper via the `gift_card_balance_success` [Message](https://docs.commercetools.com/checkout/messages.md#gift-card-messages) (`amount`, `isBalanceSufficient`).
- Balance is a **read** — it must not redeem or reserve value. A common bug is redeeming on the balance call.
- Handle zero/invalid/expired codes cleanly → `gift_card_balance_error`, so the shopper can try another card or method.

### Redeem

- Take `{ code, redeemAmount }`, redeem `redeemAmount` against the system, and **record it on the commercetools Payment** as a transaction (the processor owns the Payment). Checkout emits `gift_card_redeem_success` on success.
- **Partial redemption is the norm.** If the balance is less than the cart total, redeem the available amount and leave a remainder — the fallback PSP integration covers it. Redeeming a card must not assume it settles the whole cart.
- **Multiple cards:** a cart may redeem several cards in sequence, each reducing the outstanding amount. Each redeem is its own transaction on the Payment.
- **Be idempotent.** A retried redeem (network hiccup, double-submit) must not double-charge the card. Key redemption on a stable identifier (the code + amount + payment/cart context, or the system's own idempotency key) so a replay is a no-op, and reconcile against the Payment's existing transactions before adding another.

### Post-order operations (`/payment-intents/:id`)

- Refund and reverse/rollback happen **after** the Order exists, through the [Payment Intents API](https://docs.commercetools.com/checkout/payment-intents-api.md) → `modifyPayment`. This returns redeemed value to the card (refund) or unwinds a redemption (reverse).
- Automated **reversals** require the connector to declare support for the `reversePayment` action; implement it only if the requirements include automatic unwinding of authorized-but-not-completed payments.
- These operations update the Payment's transactions to reflect the new state; keep them idempotent on the intent/operation id.

### Keep the mapping pure and testable

The code→system-request and system-response→Payment-transaction mapping is deterministic — keep it a **pure function** with no network, so balance/redeem/refund logic is unit-testable without a deployment, a session, or a token. Assert: balance is read-only, redeem records the right transaction amount, partial redemption leaves the correct remainder, a duplicate redeem is a no-op, and refund/reverse produce the right transaction.

## App 2 — the enabler (`assets`)

A browser JS library that renders the gift-card input (code, and PIN if needed) and calls the processor's `/balance` and `/redeem` with the session. Checkout loads it based on the Payment Integration configuration; it can also be embedded in a custom frontend. It is a **thin slice** — it holds no CT credentials and no gift-card-system secrets; it only carries the `sessionId` and talks to the processor. Sensitive operations stay server-side in the processor. Keep the enabler's job to: render, capture the code, call balance, call redeem, and surface the result.

## Pitfall catalog

| Pitfall | Symptom | Fix |
|---|---|---|
| Gift card integration shipped **alone** | Shopper stuck when balance < total; "checkout is broken" | Configure a fallback PSP Payment Integration alongside it (Checkout Application config) |
| Redeem **rejects** when balance < total | Partial payments impossible; valid cards refused | Redeem the available amount, leave a remainder for the fallback method |
| Session auth on `/payment-intents` (or JWT on `/balance`) | The corresponding flow 401s | Session hook on balance/redeem; JWT/OAuth (`manage_checkout_payment_intents`) on payment-intents |
| Balance call redeems/reserves value | Balance shrinks just from checking | Balance is a read; never mutate the card on `/balance` |
| Non-idempotent redeem | Double-submit or retry double-charges the card | Idempotency key on redeem; reconcile against existing Payment transactions |
| Wrong-region CT hosts / JWKS / issuer | Session validation or JWKS lookup fails; every call 401s | Match `CTP_AUTH/API/SESSION_URL`, `CTP_JWKS_URL`, `CTP_JWT_ISSUER` to the project region |
| Currency mismatch | Redeem fails or applies the wrong amount | One deployment per currency; validate the cart currency against the deployment's currency |
| Router not mounted at `/` | Checkout's calls 404 | Processor `endpoint: /`; mount routes at the root |
| Using the sample connector in production | No real redemption happens; `Valid-…` codes "work" but nothing settles | Sample is PoC-only; build/use a real connector for production |
| Legacy SDK / no connect-payment-sdk hooks | Hand-rolled auth drifts from the platform contract | Use `@commercetools/connect-payment-sdk` session/JWT hooks; pin current CT SDK versions (commercetools-connect skill gate) |

## Test-first checklist (mirror in the suite)

Processor
- [ ] `/balance` is read-only, session-authenticated; reports amount + sufficiency; handles zero/invalid/expired codes
- [ ] `/redeem` session-authenticated; records the redeem transaction on the Payment
- [ ] Partial redemption leaves the correct remainder; multiple cards accumulate transactions
- [ ] Redeem is idempotent — a replayed request is a no-op (asserted)
- [ ] `/payment-intents/:id` refund/reverse JWT/OAuth-authenticated; produces the right transaction (if in scope)
- [ ] Boundary (gift card system, CT APIs) mocked; suite runs with no deployment/secrets

Enabler
- [ ] Renders code (and PIN) input; carries only the session; holds no secrets
- [ ] Calls `/balance` then `/redeem`; surfaces balance/redeem errors to the shopper
