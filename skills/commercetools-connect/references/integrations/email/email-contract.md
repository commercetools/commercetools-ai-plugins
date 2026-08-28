---
name: email-connector-contract
description: The one-app email connector contract — Subscription registration, message→email routing, the at-most-once vs at-least-once delivery decision for non-idempotent sends, the token-email gotcha, order-state filtering, localization, and PII hygiene. Full pitfall catalog. The email sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - email
    - connect
    - subscriptions
---

# The one-app email contract

Everything the `mail-sender` `event` app must do, and the pitfalls that silently break each. Grounded in the official [transactional email template](https://github.com/commercetools/connect-email-integration-template). This is a pure `event` app, so read it **on top of** [event-applications.md](../../event-applications.md) (envelope decode, ack table, idempotency, re-fetch, self-change filtering) — this file adds only the email-specific layer. Provider send-call shapes are in [providers.md](./providers.md).

## What triggers it — one Subscription, several message types

Register a **Subscription** in `postDeploy` (idempotently — the template deletes-by-key then recreates), keyed on a stable subscription key, with the destination built from the injected `CONNECT_GCP_*` vars ([event-applications.md](https://docs.commercetools.com/dev-tooling/skills/commercetools-connect#event-applications-pattern-7-register-the-subscription-destination)). Subscribe to **only** the message types you send email for — the broker shouldn't deliver noise you'll just ack-and-ignore.

The canonical message set (grounded in the template) and what each email is:

| Email                              | `resourceTypeId`          | Message `type`                                               |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------ |
| Registration / welcome             | `customer`                | `CustomerCreated`                                            |
| Email verification (double opt-in) | `customer-email-token`    | `CustomerEmailTokenCreated`                                  |
| Password reset                     | `customer-password-token` | `CustomerPasswordTokenCreated`                               |
| Order confirmation                 | `order`                   | `OrderCreated` (and `OrderImported` if you email on imports) |
| Order state / cancellation         | `order`                   | `OrderStateChanged`                                          |
| Shipment                           | `order`                   | `OrderShipmentStateChanged`                                  |
| Refund / returns                   | `order`                   | `ReturnInfoAdded`, `ReturnInfoSet`                           |

Register these as `messages: [{ resourceTypeId, types: [...] }]`. Message reference: [customer messages](https://docs.commercetools.com/api/projects/messages/customer-messages.md), [cart & order messages](https://docs.commercetools.com/api/projects/messages/cart-order-messages.md).

## What the handler must do

1. **Decode & validate the envelope**, then **branch on Message type** to the right email (the template uses a handler factory). Ack anything you don't handle (see the delivery-semantics section, and [event-applications.md](../../event-applications.md#pattern-3-filter-message-types-and-ignore-the-rest)).
2. **Re-fetch the resource by id** — `getOrderById(message.resource.id)`, `getCustomerById(order.customerId)`. Don't trust the payload: it can be stale (no ordering) or omitted (`payloadNotIncluded`). The template does this correctly. Token emails are the exception (below).
3. **Build the personalization data** (recipient, name, order lines, totals) and pick the **template id** for the email type (and locale).
4. **Send via the ESP** ([providers.md](./providers.md)) behind a **tight timeout** — the event ack timeout is 10 s; a hung ESP call must abort, not stall the handler.

Keep the map from resource → ESP request a **pure function** (no network), so the whole mapping is unit-testable without a deployment, a token, or a real send. Assert: the right email type is chosen, the recipient/template/data are correct, money and dates format correctly, and missing optional fields don't throw.

## The central decision: delivery semantics for a non-idempotent send

An ESP send is **not idempotent** — two calls send two emails. Event delivery is **at-least-once**, so the same Message _will_ occasionally be redelivered. Your acknowledgement choice decides the failure mode. There is no free lunch; pick per email type.

**A `2xx` ack for an event app means "don't redeliver" — including `202`.** (This is the opposite of an API Extension, where `202` _fails_ the operation. Same number, different contract, because event ack semantics differ from extension response semantics. The tax _calculator_ is an Extension; this email app is an `event` — don't carry the `202` rule across.)

### Option A — ack first, then send (at-most-once; the template's default)

The template sends `202` at the **top** of the handler, before validation and before the ESP call:

```js
response.status(HTTP_STATUS_SUCCESS_ACCEPTED).send(); // 202, immediately
// …then decode, route, re-fetch, sendMail — errors only get logged
```

- **Guarantees:** never double-sends on redelivery (the message is already acked).
- **Cost:** a transient ESP failure (or a throw) **silently drops the email** — the platform will not redeliver. Fire-and-forget.
- **Use when** a duplicate is worse than a miss, or you add your **own** retry/DLQ around the send.

### Option B — send, then ack on success (at-least-once + dedupe)

Ack only after the ESP confirms; return non-2xx on a transient failure so the broker redelivers:

```js
try {
  await sendMail(...);           // confirmed accepted by the ESP
  res.status(204).send();        // ack — safe to stop
} catch (err) {
  if (isTransient(err)) { res.status(503).send(); return; }  // redeliver
  res.status(200).send();        // permanent: ack + alert, don't loop
}
```

- **Guarantees:** transient failures retry — the email eventually goes out.
- **Cost:** redelivery **will** re-send unless you **dedupe**. Email sends aren't idempotent at the platform, so make them so:
  - **ESP idempotency key** — pass a stable key (e.g. `resource.id` + `sequenceNumber`, or the message id) so the ESP collapses duplicates ([providers.md](./providers.md) — SendGrid, others support this).
  - **or a sent-marker** — record "sent" on a stable key the target can check before re-sending (a Custom Field/Custom Object), re-checking live state — never an in-process set ([event-applications.md](../../event-applications.md#pattern-4-idempotency-under-at-least-once-delivery)).

**Recommendation:** default confirmations to Option A (a rare dropped confirmation is tolerable; a double confirmation annoys). Use Option B **with dedupe** for **drop-intolerant** emails — password reset and email verification, where a lost email blocks the user. State the choice per email type in the README.

## Token emails (verification & password reset) — the value isn't always in the Message

The token _value_ rides the `CustomerEmailTokenCreated` / `CustomerPasswordTokenCreated` Message **only when the token's validity is ≤ 60 minutes** ([customer password reset](https://docs.commercetools.com/api/customers-overview.md#customer-password-reset)). Otherwise it's omitted. Two designs:

- **Read from the Message** — create tokens with ≤ 60-min validity so the value is present; `view_customers` is enough. Simplest, and the emailed token is the one the user's action created.
- **Mint in the handler** — call `POST .../password-token` (or email-token) yourself and email that value (what the template does). Works for any validity, but needs **`manage_customers`** (a write), and the emailed token differs from the triggering one. Under **at-least-once** this also means a redelivery mints _another_ token — dedupe, or accept that older tokens stay valid until used (creating a token doesn't invalidate older ones by default).

Never log the token value (PII/secret) — see hygiene below.

## Order-state emails must be gated on the target state

`OrderStateChanged` and `OrderShipmentStateChanged` fire on **every** transition. The template routes all of them to one handler and emails unconditionally — so a shopper gets an email on every internal state change. After re-fetching, **gate on the specific target state** you mean:

```js
const order = await getOrderById(id);
if (order.shipmentState !== "Shipped") return ack(); // only the shipment email
// or: if (order.orderState !== 'Cancelled') return ack();
```

Ack (don't error) the transitions you don't email on. Make the target states **configurable** where they vary by project.

## Localization

The template hardcodes `DEFAULT_LOCALE = 'en-US'` for line-item names and picks one template id per email — so every email is English. For multi-language:

- Read the language from `customer.locale` (fallback: order/store locale, then a default).
- Resolve localized strings from `LocalizedString` fields (`lineItem.name[locale]`) with a fallback, and pick a **locale-specific template id** (or pass the locale to the ESP if the template branches internally).

## Hygiene: PII, consent, deliverability

- **Don't log PII or tokens.** The template logs full message bodies and email addresses; scrub recipient addresses, names, and any token value from logs (log the `resource.id`/`sequenceNumber` correlation key instead). → [security.md](../../security.md), [observability-operations.md](../../observability-operations.md).
- **Keep it transactional.** Transactional emails (order/account/token) generally don't require marketing opt-in; marketing/promotional email does and belongs in a marketing platform, not this connector. Don't quietly turn a transactional connector into a marketing sender.
- **Sender must be verified.** `SENDER_EMAIL_ADDRESS` must be a verified sender/domain in the ESP or mail is rejected or spam-filed.
- **Bounces/complaints** are the ESP's to report. If you need them reflected back into commercetools, that's a _separate_ inbound-webhook `service` app consuming the ESP's event webhook — out of scope for the sender.

## Pitfall catalog

| Pitfall                                 | Symptom                                             | Fix                                                                         |
| --------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| Ack-first + failed send                 | Email silently never arrives; no retry              | Option B with dedupe for drop-intolerant emails, or add your own retry/DLQ  |
| At-least-once without dedupe            | Customer gets 2+ copies                             | ESP idempotency key or a sent-marker on a stable key                        |
| Emailing on every `OrderStateChanged`   | Shopper spammed on internal transitions             | Gate on the target state after re-fetch                                     |
| Trusting the payload                    | Wrong/missing data; throws on `payloadNotIncluded`  | Re-fetch the Order/Customer by `resource.id`                                |
| Token value read from a >60-min Message | Empty reset link                                    | Use ≤60-min validity, or mint the token in the handler (`manage_customers`) |
| Hardcoded `en-US`                       | Wrong-language emails                               | Localize by `customer.locale` + locale-specific template id                 |
| Subscribing to whole resources          | Broker delivers noise; every message hits a handler | Register only the exact message `types`                                     |
| Non-idempotent `postDeploy`             | Duplicate/failed Subscription on redeploy           | Delete-by-key then create, or get-then-skip                                 |
| Logging recipient/token                 | PII & secret leakage                                | Log the correlation id only; scrub addresses and token values               |
| Unverified sender                       | Sends rejected / spam-filed                         | Verify the sender domain in the ESP                                         |
| Legacy SDK                              | Fails the parent skill's pinned-version gate        | `@commercetools/platform-sdk@^8` + `@commercetools/ts-client@^4`            |

## Test-first checklist (mirror in the suite)

- [ ] Decodes the base64 envelope; validates & branches on message type; acks unhandled types
- [ ] **Delivery semantics asserted** — ack-first _or_ ack-after-success + dedupe; the failure path proven (no silent drop / no double-send for the chosen mode)
- [ ] Re-fetches Order/Customer by id; handles `payloadNotIncluded`
- [ ] Order-state/shipment emails gated on the target state (asserted)
- [ ] Correct template id + recipient + personalization data per email type; money/date formatting
- [ ] Localization picks the right template/strings from `customer.locale` with fallback
- [ ] Token email: value sourced correctly (Message ≤60 min, or minted) and never logged
- [ ] `postDeploy` registers only the needed message types, idempotently; boundary mocked; suite runs with no deployment/secrets
