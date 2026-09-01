---
name: email-verification
description: Verify an email connector round trip — each event produces the right email to the right recipient — and the traps that look like bugs but aren't (no Subscription registered → no email; ESP sandbox/test mode doesn't deliver; duplicates from at-least-once; silent drops from ack-first). The email sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - email
    - connect
---

# Verify the email round trip

Don't declare done until a real commercetools event produces a real email in the ESP. Because sending is fire-and-forget-ish and asynchronous, "no error in the logs" is **not** evidence it worked — verify at the ESP.

## Check 1 — the Subscription exists and points at the connector

No Subscription → no message → **no email fires at all**, silently. Before anything else:

- Query Subscriptions and confirm one exists for your key with the expected `messages` (`resourceTypeId` + `types`) and a destination pointing at the deployed app.
- If it's missing, `postDeploy` didn't run or failed — check the deployment logs. This is the number-one "nothing happens" cause.

## Check 2 — each event produces the right email

For every email in scope, trigger its event and confirm the send in the **ESP's activity/logs feed** (not just your connector logs):

| Email | Trigger | Confirm |
|---|---|---|
| Registration | Create a Customer | ESP shows a send to the customer's email with the registration template |
| Email verification | Create an email token (≤60 min to get the value in the Message) | Send contains a working verification link/token |
| Password reset | Create a password token | Send contains a working reset link/token |
| Order confirmation | Place an order (convert a cart) | Send with the order number, line items, totals |
| Shipment | Transition the order's shipmentState to `Shipped` | Send fires **only** on the target state, not other transitions |
| Refund/return | Add/set return info | Send fires; other order changes don't |

Locally (without a real broker) you can POST the base64 `OrderCreated`/`CustomerCreated` envelope straight to the app's endpoint and assert the ESP call — see [test an event application locally](https://docs.commercetools.com/connect/test-applications-locally.md#test-an-event-application).

Check the details, not just "an email was sent": right **recipient**, right **template**, right **language**, and data (order number, name) actually rendered — not empty placeholders.

## The traps (correct-looking behavior that is a bug, or vice-versa)

### Trap 1 — ESP sandbox / test mode accepts but doesn't deliver

Most ESPs have a sandbox/test mode (or SES *sandbox*, which can only send to verified recipients). The API returns `202`/`200`, your connector logs success — but **nothing is delivered**. An empty inbox after a "successful" send is expected in sandbox. Verify the *contract* (accepted, right payload) in sandbox; verify *delivery* on a live key sending to a real inbox (then clean up).

### Trap 2 — duplicate emails (at-least-once without dedupe)

Two identical emails for one order means you're on at-least-once delivery (Option B) **without dedupe**, and the message was redelivered. Add an ESP idempotency key or a sent-marker ([email-contract.md](./email-contract.md)). This is a real defect, not the platform misbehaving — redelivery is guaranteed.

### Trap 3 — silent drops (ack-first + a failing send)

With ack-first (Option A, the template default) a transient ESP failure is acked and **never retried** — the email just doesn't arrive, and there's no redelivery to save it. If drop-intolerant emails (reset/verification) go missing intermittently, this is why. Move those to Option B with dedupe, or add your own retry/DLQ.

### Trap 4 — an email on every state change

If shoppers get an email on internal transitions, the order-state handler isn't gated on the target state. Re-fetch and check the specific `orderState`/`shipmentState` before sending; ack the rest ([email-contract.md](./email-contract.md)).

### Trap 5 — empty reset/verification links

A blank token in the email means the token value wasn't in the Message (validity > 60 min) and you read from the payload instead of minting it. Use ≤60-min validity or mint the token in the handler (`manage_customers`) — [email-contract.md](./email-contract.md).

## Verification checklist

- [ ] Subscription registered with the expected message types and destination (else: no email at all)
- [ ] Each in-scope event produces a send visible in the **ESP** feed to the right recipient
- [ ] Right template, right language, real data rendered (no empty placeholders)
- [ ] Order-state/shipment emails fire only on the target state
- [ ] Reset/verification links actually work (token present and valid)
- [ ] Delivery confirmed on a **live** key to a real inbox (sandbox/test mode may not deliver)
- [ ] No duplicates under redelivery; no silent drops on transient ESP failure
- [ ] No PII/token values in logs
