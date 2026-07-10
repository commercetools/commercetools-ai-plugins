---
name: connector-contract
description: The provider-agnostic contract for driving a deployed commercetools payment connector from a custom frontend — the 8-step flow, Sessions API body, enabler loading, processor routes and auth, and the full pitfall catalog with fixes.
when_to_use:
  - "Implementing the session → enabler → submit flow against a deployed payment connector"
  - "Debugging session 401s, enabler load failures, a stuck pay button, or processor 502s"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
---

# Payment connector contract (provider-agnostic)

This is the shared contract every PSP connector built from the [payment integration template](https://docs.commercetools.com/connect/templates/payment-integration.md) follows. Only a few provider-specific values differ (enabler bundle filename + UMD global, a handful of config keys, test cards) — those live in the per-provider reference. The flow, the auth model, and the pitfalls below are the same for Stripe, Adyen, Mollie, and PayPal.

## Table of contents
- [Two URLs you need](#two-urls-you-need)
- [The 8-step flow](#the-8-step-flow)
- [Sessions API: the request body](#sessions-api-the-request-body)
- [Loading the enabler](#loading-the-enabler)
- [Processor routes and auth](#processor-routes-and-auth)
- [Who owns the Payment object](#who-owns-the-payment-object)
- [Pitfall catalog](#pitfall-catalog)
- [Configuration that breaks the frontend](#configuration-that-breaks-the-frontend)

## Two URLs you need

A deployed connector exposes two public URLs (visible in the Merchant Center deployment view, or via the Connect deployments API):

- **processor URL** — the `service` app, e.g. `https://service-….{region}.commercetools.app`. Your frontend points the enabler at it; the enabler calls it; you can call `GET /operations/status` directly.
- **enabler URL** — the `assets` app, e.g. `https://assets-….{region}.commercetools.app`. You load the enabler JS bundle from here.

Don't hardcode these — read them from config/env. A URL is assigned per deployment and stays **stable across redeploys of that same deployment**; a brand-new `deployment create` gets a fresh URL. Reading them from config keeps you correct either way.

## The 8-step flow

```
1. OAuth token            POST {auth}/oauth/token (client_credentials, manage_sessions[+])
2. Cart (non-zero total)  POST {api}/{projectKey}/carts
3. Checkout Session       POST https://session.{region}.commercetools.com/{projectKey}/sessions
4. Warm processor         GET  {processorUrl}/operations/status        (cold-start guard)
5. Load enabler           <script src="{enablerUrl}/connector-enabler.umd.js">  → window.<Global>.Enabler
6. Construct + build       new Enabler({processorUrl, sessionId, onComplete, onError}) → createDropinBuilder('embedded') → build()
7. Mount + wait ready     dropin.mount('#container'); wait for `ready` before enabling Pay
8. Submit                 dropin.submit()  → processor authorizes/charges via PSP, writes the CT Payment
```

Steps 1–4 are server-side (or in a harness, done before mounting). Steps 5–8 are browser-side. The enabler hides the processor's HTTP calls — your code never calls `GET /payments` itself (see [pitfall 8](#8-the-payment-creation-route-is-get-not-post)).

## Sessions API: the request body

A **Checkout Session** is what authenticates the browser to the processor. It is created server-side with an access token carrying at least `manage_sessions:{projectKey}` ([docs](https://docs.commercetools.com/checkout/installing-checkout.md#create-checkout-sessions)).

```http
POST https://session.{region}.commercetools.com/{projectKey}/sessions
Authorization: Bearer <token with manage_sessions>

{
  "cart": { "cartRef": { "id": "<cartId>" } },
  "metadata": { "applicationKey": "<checkout-application-key>" }
}
```

Two things the docs make non-obvious for the direct-connector path:

- **`cart.cartRef.id`** — a *reference* to an existing cart, not an inline cart (see pitfall 1).
- **`metadata` must identify the processor the session is for.** With a Checkout Application configured in the Merchant Center, that is `metadata.applicationKey`. Some connector deployments instead validate `metadata.processorUrl` (the processor checks the session's metadata matches its own deployed URL and otherwise returns **401 "Session is not active"**). Use whichever the connector expects — if you get a 401 from the processor with a freshly created session, this metadata mismatch is the first thing to check. The provider reference notes which one a given connector wants.

The response `id` is the `sessionId` you hand to the enabler.

**Session response shape.** The Sessions API returns the cart reference under `activeCart.cartRef.id`, **not** `cart.cartRef.id`. When the processor validates the session and reads the cart ID, use:

```typescript
const cartId = session.activeCart?.cartRef?.id;
```

A processor that reads `session.cart?.cartRef?.id` will always get `undefined` and return "Session has no cart reference".

## Loading the enabler

The enabler is published as two bundles: an ES module (`…enabler.es.js`) and a **UMD** build (`…enabler.umd.js`) that attaches a global (e.g. `window.Connector`). The exact filename and global name are per-provider — see the provider reference.

**Use the UMD build via a `<script>` tag.** See [pitfall 5](#5-load-the-enabler-via-umd-script-tag-not-dynamic-es-import) for why dynamic `import()` of the ES bundle fails in browsers.

```html
<script src="https://assets-….commercetools.app/connector-enabler.umd.js"></script>
<script>
  const Enabler = window.Connector.Enabler;   // global name is provider-specific
</script>
```

Then:

```js
const enabler = new Enabler({
  processorUrl,
  sessionId,
  locale: 'en-US',                 // pass the real locale; don't hardcode in prod
  onComplete: (result) => { /* success → redirect to return URL */ },
  onError: (err) => { /* surface err.message / err.code */ },
});

const builder = await enabler.createDropinBuilder('embedded');
const dropin  = await builder.build({ showPayButton: false }); // own your Pay button
dropin.mount('#dropin-container');
```

## Processor routes and auth

The processor exposes a small, stable surface (names from the template's `/operations` + payment routes):

- `GET /operations/config` — public-ish config the enabler reads (publishable key, capture method, billing address setting, merchant return URL, etc.). On a custom connector you own this endpoint; ensure it returns at least the public key and `merchantReturnUrl` so the enabler can configure the PSP's JS SDK and the redirect. Some PSPs need **additional** session-authenticated config routes beyond `/operations/config` (e.g. one that returns the real cart `amount`/`currency` to initialize the payment element) — the provider reference documents any extra routes a given connector requires.
- `GET /operations/status` — health/readiness. **Ping it right after session creation to warm a cold container** ([pitfall 10](#10-processor-cold-start-504)).
- the payment route (the enabler calls this for you) — see [pitfall 8](#8-the-payment-creation-route-is-get-not-post).
- additional operation routes for capture/refund/cancel — not part of the storefront pay flow, but you call them from your backend for post-purchase money movements (→ [backend-integration.md](./backend-integration.md#post-purchase-capture-refund-cancel)).

**Auth to the processor is the session header, not Bearer.** The enabler sends `X-Session-Id: <sessionId>` (the processor's session-authentication hook from `@commercetools/connect-payments-sdk` validates it). If you ever call a processor route directly, use `X-Session-Id`, not `Authorization: Bearer` (see [pitfall 9](#9-processor-auth-header-is-x-session-id-not-bearer)).

## Who owns the Payment object

On this path, **the processor creates and maintains the commercetools [Payment](https://docs.commercetools.com/api/projects/payments.md)** — it creates the Payment, adds the `Authorization`/`Charge` transaction, and records PSP interactions. Your frontend does **not** create Payment objects (that is the *raw BFF* model from [custom checkout](https://docs.commercetools.com/learning-implement-checkout/custom-checkout/payment.md), which applies only when you integrate a PSP *without* a connector). Confusing the two leads to duplicate Payments. Verifying the round trip therefore means *finding the Payment the processor wrote* — see [verification.md](./verification.md).

## Pitfall catalog

Each pitfall below cost real debugging time. Treat them as pre-flight checks.

### 1. Session body requires `cartRef`, not an inline cart
The Sessions API rejects an inline cart. Always `{ "cart": { "cartRef": { "id": "<cartId>" } } }`.

### 2. Session `metadata` must match what the processor expects
Missing/wrong `metadata` (e.g. `applicationKey` or `processorUrl`) → processor returns **401 "Session is not active"**. First thing to check on a processor 401 with a fresh session.

### 3. Cart must have a non-zero total
The processor checks `paidAmount >= cartAmount`; a €0 cart is rejected ("already paid in full"). Easiest non-zero cart without needing a tax category: `taxMode: ExternalAmount` with a `customLineItem` carrying an `externalTotalPrice`. Example:

```json
{
  "currency": "EUR",
  "taxMode": "ExternalAmount",
  "customLineItems": [{
    "name": { "en": "Test item" },
    "quantity": 1,
    "money": { "currencyCode": "EUR", "centAmount": 1999 },
    "slug": "test-item",
    "externalTaxRate": { "name": "test", "amount": 0.0, "country": "DE" }
  }]
}
```

### 4. Stale CT API Extension returns 502 on cart updates
A leftover API Extension from a previous deployment (destination pointing at a dead URL) fires synchronously on every cart update — including the connector's `addPayment` — surfacing as a generic processor failure (500→502). Diagnose with `GET {api}/{projectKey}/extensions` and inspect each `destination`. API Extensions are **project-global** and may belong to tax, pricing, fraud, or another integration — deleting a live one silently breaks the project with no error. So do **not** delete one automatically: identify the suspect (destination URL matching the dead/old deployment), report it to the user with its `key` and `destination`, and remove it only on explicit confirmation — `DELETE {api}/{projectKey}/extensions/key={key}?version=N`. Modern templates do **not** register such an extension for the basic pay flow, but "likely legacy" is not proof — confirm the destination is actually dead before removing.

### 5. Load the enabler via UMD script tag, not dynamic ES `import()`
Dynamic `import('…enabler.es.js')` can fail with `ERR_CONNECTION_CLOSED` because the enabler internally imports the PSP's JS (e.g. `@stripe/stripe-js`), which injects its own script tag and trips up the ES-module loader in some browsers. Load the **UMD** bundle with a `<script>` tag and read the global (`window.<Global>.Enabler`).

### 6. `MERCHANT_RETURN_URL` must be an absolute URL with a scheme
The enabler calls `new URL(merchantReturnUrl)`, which throws on a bare host (e.g. the default `127.0.0.1/processor/callback/...`). Set it to a real absolute URL like `http://localhost:5173/payment-complete` in the connector config.

### 7. Wait for the enabler `ready` event before `submit()`
`dropin.mount()` returns before the PSP's payment iframe is actually ready. Calling `submit()` too early throws "could not retrieve data from the specified Element". Enable your Pay button only after the enabler signals `ready` (listen on the container, with a fallback timeout).

### 8. The payment-creation route is GET, not POST
Counter-intuitively the processor's payment-intent creation can be a `GET /payments`. **The enabler calls it for you** — don't call it directly. If you're tempted to, you're probably reimplementing the enabler; don't.

### 9. Processor auth header is `X-Session-Id`, not Bearer
The browser↔processor auth is `X-Session-Id: <sessionId>`. A `GET /operations/status` warm-up needs no auth; data routes need the session header. `Authorization: Bearer` will not authenticate you to the processor.

### 10. Processor cold-start 504
A sandbox processor container sleeps and takes some time to wake (see [Connect overview: Environments](https://docs.commercetools.com/connect/overview.md)), so the enabler's first call can time out (504). Fire `GET {processorUrl}/operations/status` right after creating the session to warm it before the enabler runs.

### 11. Raw-body webhook parsing can reject empty POST bodies on all routes
A custom processor that registers a raw-body plugin for webhook signature verification can have that plugin replace the JSON body parser **globally** — so any `POST` with `Content-Type: application/json` and an empty/missing body fails, including the `POST /payments` call from the enabler. Defensive fix that works regardless of the plugin's quirks: always send `body: "{}"` (a valid empty JSON object) from the enabler, never an empty string or no body. The exact plugin behavior is provider-specific — see the provider reference (e.g. [stripe.md](./stripe.md#building-a-custom-stripe-connector-from-the-payment-integration-template) for the `fastify-raw-body` v5 case).

### 12. Deferred-intent: create the PSP intent inside `submit()`, not at mount time
For PSPs that use a deferred-intent pattern (the payment element mounts before the underlying payment intent exists), the order of operations matters: validate the form, then create the intent **server-side inside `submit()`** (your `POST /payments` call), then confirm with whatever token the create returns. Creating the intent at mount time instead — before the user has confirmed — leaves abandoned intents accumulating at the PSP, and confirming without the token the create returns fails. The provider-specific API names and the exact confirm sequence live in the provider reference — see [stripe.md](./stripe.md#building-a-custom-stripe-connector-from-the-payment-integration-template) for the Stripe (`stripe.elements()` / `clientSecret` / `confirmPayment`) version.

### 13. `ConcurrentModification` on Order creation — cart version is always stale from the client

The processor calls `addPayment` on the cart inside `submit()` to link the newly created CT Payment. This bumps the cart version. Any `cartVersion` the browser captured before `submit()` (from the checkout page, sessionStorage, a URL param) is therefore stale by the time the return URL fires and Order creation runs. Passing it to `POST /orders` produces:

```
"Object <cartId> has a different version than expected. Expected: 1 - Actual: 3."
```

**Fix: always refetch the cart version server-side** inside the Order creation route, immediately before calling `POST /orders`. The extra GET is cheap and eliminates this error entirely:

```ts
const { body: cart } = await apiRoot.carts().withId({ ID: cartId }).get().execute()
// use cart.version — never the client-supplied value
```

Do not try to work around this by passing the version from the return URL query string or sessionStorage — those are just as stale. The only reliable source is a fresh GET.

### 14. Return URL fires before the webhook — Order creation gets a 422

The browser reaches `MERCHANT_RETURN_URL` (your payment-complete page) in under a second. The Stripe webhook that moves the CT Payment transaction from `Pending` to `Success` arrives 1–5 seconds later, even in a healthy setup. If your return URL handler calls Order creation immediately on page load, it hits the payment gate while the transaction is still `Pending` and gets back `"no successful payment found"` (422).

**Fix: poll with a timeout on 422, never fire once.** Pre-generate the `orderNumber` before the first attempt so retries reuse the same value and can't double-create:

```ts
const MAX_ATTEMPTS = 10
const GAP_MS = 1500

for (let i = 0; i < MAX_ATTEMPTS; i++) {
  const res = await fetch('/api/orders/create', { method: 'POST', body: JSON.stringify({ cartId, cartVersion, orderNumber }) })
  if (res.ok) return await res.json()
  if (res.status !== 422) throw new Error(await res.text())   // hard error — stop
  if (i < MAX_ATTEMPTS - 1) await new Promise(r => setTimeout(r, GAP_MS))
}
throw new Error('Webhook timeout — check processor webhook secret and Stripe dashboard delivery log')
```

A `DuplicateField` 400 on `orderNumber` means a concurrent retry already succeeded — fetch and return the existing Order. Do not use a fixed sleep: too short = still flaky; too long = bad UX. See [backend-integration.md → Return URL race condition](./backend-integration.md#the-return-url-race-condition).

### 15. Order creation returns 400 "cart is not in active state" on idempotent retry

When `POST /orders` succeeds, CT flips `cartState` to `Ordered`. A second call with the same `cartId` then fails with `InvalidOperation: The cart is not in active state` **before** CT can check whether `orderNumber` is a duplicate. If your retry logic only catches `DuplicateField` 400, the second attempt throws instead of returning the existing Order.

Fix: also catch `InvalidOperation` with "not in active state" and fetch by `orderNumber` in that branch:

```ts
const isDuplicate = err?.statusCode === 400 &&
  err?.body?.errors?.some((e: any) => e.code === 'DuplicateField' && e.field === 'orderNumber');
const isCartOrdered = err?.statusCode === 400 &&
  err?.body?.errors?.some((e: any) => e.code === 'InvalidOperation' && e.message?.includes('not in active state'));

if (isDuplicate || isCartOrdered) {
  const { body: existing } = await apiRoot.orders().withOrderNumber({ orderNumber }).get().execute();
  return existing;
}
```

### 16. The id the webhook records may not be the id the refund route needs

A common refund failure: the `interactionId` your webhook writes on the Success transaction is the PSP's *authorization/intent* id, but the PSP's refund API operates on a different object (the *charge*/*capture*), so passing the recorded id to refund returns a "not found" error. Two fixes: resolve the correct id from the PSP before refunding, or have the webhook handler record the refundable id on the `Charge` transaction in the first place. The provider-specific id types and lookup are in the provider reference — see [stripe.md](./stripe.md#building-a-custom-stripe-connector-from-the-payment-integration-template) for the Stripe `pi_xxx` → `ch_xxx` case.

### 17. `/operations/status` returns 401 during redeployment
While a deployment is mid-restart (status `Deploying`), the old container is torn down before the new one is ready. During this window `GET /operations/status` — normally public/unauthenticated — returns **401**. This is transient: wait for the deployment to reach `Deployed`, then the endpoint returns 200 as normal. Don't confuse this with an auth misconfiguration; if the 401 appears immediately after triggering a redeploy, it's the restart window.

## Configuration that breaks the frontend

These connector config values are set at install/deploy time but only fail at *frontend* runtime, so check them here:

| Config | Why it breaks the frontend | Fix |
|---|---|---|
| `MERCHANT_RETURN_URL` | enabler `new URL()` throws on a bare host | absolute URL with scheme |
| `ALLOWED_ORIGINS` | processor CORS-rejects the browser | include the frontend's exact origin |
| connector API-client scopes | session/payment calls 403 | manage payments + read sessions (provider reference lists exact set) |
| webhook id/secret (async PSPs) | transaction state never finalizes | register the PSP webhook, store its id/secret in secured config |

For the exact config key names and defaults of a specific connector, read the provider reference (e.g. [stripe.md](./stripe.md)).

## Webhook events — look up, then select for the use case

For async PSPs, the connector's processor reconciles payment state from webhook events. **Which events to subscribe to is provider-specific and use-case-specific — do not hardcode a list.** Instead:

1. **Look it up.** Consult the chosen PSP's official webhook-events documentation for the catalog of event types it emits (each PSP names them differently).
2. **Map to the lifecycle this skill cares about.** The reconciliation only needs the events that move a commercetools transaction or open the Order gate: authorization succeeded, amount became capturable (authorize-now/capture-later), payment failed/declined, refund settled, and — for production — dispute/chargeback opened. Ignore events that don't change payment state.
3. **Select the minimal set for *this* user's flow.** The capture mode, refund policy, and whether disputes must be handled (all gathered in Step 1 / [config-from-requirements.md](./config-from-requirements.md)) decide which of the above apply. Example: a charge-now flow with no partial refunds needs the "succeeded" and "refunded" events but not "amount capturable"; a manual-capture flow does need the capturable event. Subscribe to what the use case requires, nothing more.

Register exactly that set when setting up the PSP webhook endpoint (the mechanics of registering are in the provider reference and the deploy guide). If a needed event isn't subscribed, the corresponding transaction silently never finalizes.

## Checklist
- [ ] processor URL and enabler URL read from config (not hardcoded)
- [ ] session created with `cartRef` + processor-matching `metadata`; got a `sessionId`
- [ ] cart total is non-zero
- [ ] processor warmed via `GET /operations/status`
- [ ] enabler loaded from the UMD bundle; global resolved
- [ ] Pay button gated on the `ready` event; `submit()` only after
- [ ] no stale API Extension pointing at a dead URL
- [ ] Payment object found after submit (→ [verification.md](./verification.md))
- [ ] webhook events selected by looking up the PSP's docs and matching the user's use case (not a hardcoded list) — see [Webhook events](#webhook-events--look-up-then-select-for-the-use-case)
- [ ] (Custom processor) `POST /payments` sends `body: "{}"` — `fastify-raw-body` v5 rejects empty bodies on all routes
