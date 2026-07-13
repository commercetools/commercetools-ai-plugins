---
name: payment-connector-backend
description: The backend half of a direct payment-connector integration — server-side session/cart creation (BFF), creating the Order after payment, and post-purchase capture/refund/cancel against an authorized Payment.
when_to_use:
  - "Moving session/cart/token creation server-side for production (out of the test harness)"
  - "Creating the Order once payment is authorized, and getting order-creation timing right"
  - "Capturing, refunding, reversing, or canceling a payment after the Order exists"
  - "Reconciling Payment transaction state from the PSP webhook"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
---

# Backend integration

The frontend flow (session → enabler → submit) and [connector-contract.md](./connector-contract.md) get you a paid cart. The backend owns everything around it: minting the session securely, **converting the cart to an Order**, and the **post-purchase money movements** (capture, refund, cancel). The connector's processor deliberately does **not** create Orders — the [payment integration template](https://docs.commercetools.com/connect/templates/payment-integration.md) states cart-to-order conversion is out of its scope, "ensuring the payment connector is not directly responsible for cart-to-order conversion." That responsibility is yours.

## Table of contents
- [Server-side session creation (BFF)](#server-side-session-creation-bff)
- [Creating the Order after payment](#creating-the-order-after-payment)
- [Post-purchase: capture, refund, cancel](#post-purchase-capture-refund-cancel)
- [Webhook reconciliation](#webhook-reconciliation)
- [Who creates the Payment, revisited](#who-creates-the-payment-revisited)

## Server-side session creation (BFF)

In production, the token, cart, and session (steps 1–3 of the flow) run on **your backend-for-frontend**, never the browser. The browser receives only the `sessionId`, the processor URL, and the enabler URL — never `CT_CLIENT_SECRET` or a `manage_sessions` token. The test harness ([test-harness.md](./test-harness.md)) cuts this corner for speed; the real integration must not.

A single BFF endpoint does the three server steps and returns the session:

```ts
// POST /api/checkout/session  — returns { sessionId, processorUrl, enablerUrl }
export async function createCheckoutSession(req, res) {
  // 1. Verify the cart belongs to this user (IDOR guard) — fetch it and compare
  //    customerId / anonymousId to the authenticated caller before trusting cartId.
  const cartId = req.session.cartId;

  const token = await getManageSessionsToken();   // client_credentials, manage_sessions:{projectKey}

  // 2. Ensure the cart is payable: recalculate and confirm a non-zero total
  //    (the processor rejects a €0 cart — see contract pitfall 3).

  // 3. Create the Checkout Session (cartRef + processor-matching metadata)
  const r = await fetch(`https://session.${region}.commercetools.com/${projectKey}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cart: { cartRef: { id: cartId } },
      metadata: { applicationKey: APP_KEY },   // or { processorUrl } — what the connector expects
    }),
  });
  const session = await r.json();
  res.json({ sessionId: session.id, processorUrl: PROCESSOR_URL, enablerUrl: ENABLER_URL });
}
```

Notes that matter:
- **Create the session as late as possible** — when the user reaches the payment step — because sessions expire. Don't mint it at cart creation.
- **Verify cart ownership** before creating a session (IDOR): fetch the cart and compare its `customerId`/`anonymousId` to the authenticated user. See the [BFF responsibilities](https://docs.commercetools.com/learning-implement-checkout/custom-checkout/payment.md).
- The browser never needs `projectKey`/`region` as public env vars — return them from this endpoint alongside `sessionId`.

## Creating the Order after payment

This is the commit step, and it's yours. Create the Order **from the Cart**, server-side, only once preconditions hold ([order creation](https://docs.commercetools.com/learning-implement-checkout/custom-checkout/order-creation.md)):

Preconditions before `POST /orders`:
1. The cart has shipping address, shipping method, and billing address (if required) — and the Payment is **linked to the cart** (the processor does the link via `addPayment`; confirm `cart.paymentInfo.payments` is populated).
2. **Payment authorization is complete** for synchronous flows. For async PSPs, wait for the webhook to move the transaction to `Success` before committing (see [reconciliation](#webhook-reconciliation)).
3. You're using the **latest cart version**.
4. Business validations (stock, min order value) pass.

```ts
// POST /api/checkout/place-order
const order = await apiRoot.orders().post({
  body: {
    cart: { typeId: 'cart', id: cartId },
    version: cartVersion,          // must be current
    orderNumber,                   // unique, pre-generated → idempotency
  },
}).execute();
```

Make it **idempotent** so a retry can't double-create: pre-generate a unique `orderNumber` (a duplicate is rejected) and reuse the same value on retry; cart versioning gives you a second guard (a stale version fails). Creating the Order snapshots prices/payments and flips `cartState` to `Ordered`. An `OrderCreated` Message lets you trigger confirmation email / ERP sync via a Subscription — keep that work out of the request path.

**Never trust a client-supplied `cartVersion` for order creation.** The processor bumps the cart version when it links the Payment to the cart via `addPayment` — this happens inside `submit()`, after the browser captured the version. Any version stored on the client (sessionStorage, URL param, hidden field) will be stale by the time the return URL fires. Always **refetch the current cart version server-side** immediately before calling `POST /orders`:

```ts
// server-side, inside the order-creation route
const { body: cart } = await apiRoot.carts().withId({ ID: cartId }).get().execute()
// cart.version is now current — use it, not the client-supplied version
const order = await apiRoot.orders().post({ body: {
  cart: { typeId: 'cart', id: cartId },
  version: cart.version,   // ← always freshly fetched
  orderNumber,
}}).execute()
```

The extra cart fetch is cheap and eliminates `ConcurrentModification` errors entirely on this path.

Order-creation timing — pick one and be consistent:
- **Authorize → create Order → capture on fulfillment** (common for physical goods): the connector authorizes during `submit()`; you create the Order on a successful authorization, then capture later.
- **Immediate capture → create Order** (digital goods): the connector captures during `submit()` (`STRIPE_CAPTURE_METHOD=automatic`); you create the Order once the `Charge` is `Success`.

If the cart total changed between authorization and order creation (discount expired, tax shift), don't silently proceed — cancel the authorization and re-authorize for the new amount, or surface the new total for confirmation. The processor/PSP handles the money; you orchestrate the decision.

## Post-purchase: capture, refund, cancel

These happen **after** the Order exists and are a merchant responsibility, not the storefront's. How you trigger them depends on whether the Payment was created by **Checkout** or by a **direct-connector** flow — and this skill's path is the latter:

- **Direct-connector path (this skill):** the **processor exposes its own operation routes** for capture/refund/cancel. The template states "The processor application exposes additional API endpoints for initiating the capture, refund, and cancellation transactions." Call those processor routes (session- or service-authenticated per the connector) from your back-office/fulfillment backend. The processor talks to the PSP and writes the resulting `Charge` / `Refund` / `CancelAuthorization` transaction onto the Payment.
- **Checkout-product path (not this skill):** if the Payment was created by the hosted Checkout product, use the [Checkout Payment Intents API](https://docs.commercetools.com/checkout/payment-intents-api.md) (`manage_checkout_payment_intents` scope) to capture/refund/reverse/cancel. **The Payment Intents API works only for payments created by Checkout** — do not reach for it on the direct-connector path.

Either way, the resulting [transaction types](https://docs.commercetools.com/checkout/payments-lifecycle.md) are the same and land on the Payment inside the Order:

| Operation | Transaction added | When |
|---|---|---|
| Capture | `Charge` | funds taken (auto, or manual at fulfillment) |
| Cancel authorization | `CancelAuthorization` | void an auth before capture (order canceled/unfulfillable) |
| Refund | `Refund` | return captured funds; partial refunds allowed up to the captured amount, repeatable |

Reconcile against the Payment's transactions, and keep these idempotent (one `Charge` per PSP `interactionId`) so a retried capture can't double-charge.

## Webhook reconciliation

For PSPs that finalize asynchronously (Stripe partly; Adyen heavily), the **authoritative payment state is the commercetools Payment, driven by the PSP webhook the processor receives** — not the browser's `onComplete`. The processor verifies the webhook (e.g. signing secret / HMAC) and updates the transaction state. Your backend should:

- Treat a UI "success" as provisional; gate Order creation (or order *confirmation*) on the transaction reaching `Success` when the PSP is async.
- If a transaction is stuck `Pending`, suspect the webhook (endpoint registered, points at the processor, secret matches — see the provider reference).
- Make handling idempotent: the same webhook may arrive twice.

### The return URL race condition

This is the most common runtime failure on this path, and it's invisible in development until the webhook is wired: **the browser reaches the return URL (payment-complete page) before the webhook has arrived at the processor and updated the CT Payment transaction to `Success`.** The browser redirect is nearly instant; the webhook delivery takes 1–5 seconds even in a healthy setup.

If your return URL handler fires Order creation immediately on page load, it hits the gate while the transaction is still `Pending` and fails with "no successful payment found."

**The fix: poll with a timeout, not a single fetch.** Retry the Order creation call on a 422 response (gate not open yet) with a short gap, up to a generous timeout:

```ts
// return URL page — order creation with webhook-wait polling
const MAX_ATTEMPTS = 10
const GAP_MS = 1500   // 10 × 1.5s = 15s total — enough for any healthy webhook delivery

for (let i = 0; i < MAX_ATTEMPTS; i++) {
  const res = await fetch('/api/orders/create', { method: 'POST', body: ... })
  if (res.ok) return await res.json()            // gate opened, order created
  if (res.status !== 422) throw new Error(...)   // hard error — don't retry
  if (i < MAX_ATTEMPTS - 1) await sleep(GAP_MS) // 422 = still Pending, wait for webhook
}
throw new Error('Payment not confirmed after webhook timeout — check Stripe webhook delivery')
```

The `orderNumber` must be pre-generated and stable across retries (idempotency — see above), so a retry that races a concurrent success doesn't double-create. A `DuplicateField` error on `orderNumber` means the first attempt already succeeded — fetch and return the existing Order.

**Do not use a fixed sleep instead of polling** — a fixed sleep is either too short (still flaky on a slow webhook) or too long (bad UX on a fast one). Poll until the gate opens or the timeout expires.

## Who creates the Payment, revisited

To keep the boundary crisp across this skill: on the direct-connector path the **processor creates and owns the Payment** (it adds the `Authorization`/`Charge` and links it to the cart during `submit()`). Your backend does **not** create Payment objects — doing so produces duplicates. Creating Payments yourself is the *raw BFF / custom-checkout* model (no connector), documented separately at [custom checkout → payment](https://docs.commercetools.com/learning-implement-checkout/custom-checkout/payment.md). Your backend's job is sessions, the Order, and post-purchase operations — not the Payment itself.

## Checklist
- [ ] Session/cart/token creation is server-side; browser gets only `sessionId` + processor/enabler URLs
- [ ] Cart ownership verified before session creation (IDOR guard)
- [ ] Order created from cart with **server-refetched** version (never the client-supplied version — the processor bumps the cart via `addPayment` and makes any client-held version stale) + unique pre-generated `orderNumber` (idempotent)
- [ ] Order creation gated on authorization complete (and on webhook `Success` for async PSPs)
- [ ] Return URL handler **polls** for Order creation (retries on 422 with a gap) rather than firing once — avoids the return-URL/webhook race condition
- [ ] `orderNumber` is pre-generated and reused across retries so polling can't double-create
- [ ] Capture/refund/cancel go through the **processor's** operation routes (not the Payment Intents API, which is Checkout-only)
- [ ] Post-order side effects (email, ERP) driven off the `OrderCreated` Subscription, not the request path
- [ ] Backend does not create Payment objects (the processor owns them)
