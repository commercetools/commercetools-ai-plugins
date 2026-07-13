---
name: stripe-payment-connector
description: Stripe-specific values for the commercetools Stripe payment connector — connector repo/version, exact connect.yaml config keys (standard vs secured), enabler bundle name and UMD global, test cards, and webhook setup. Apply on top of the provider-agnostic connector-contract.
when_to_use:
  - "Integrating or configuring the commercetools Stripe payment connector"
  - "Looking up the Stripe connector's exact env var names, enabler bundle name, or test cards"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
    - stripe
---

# Stripe payment connector

Provider specifics for Stripe. Read [connector-contract.md](./connector-contract.md) first for the flow and pitfalls — this only fills in the Stripe-specific blanks.

## The connector

- **Connector:** Stripe Payment for Checkout (`stripe-payment-connector`).
- **Source:** [`stripe/stripe-commercetools-checkout-app`](https://github.com/stripe/stripe-commercetools-checkout-app) — a monorepo with `processor/` (service) and `enabler/` (assets).
- **Verify the version** you're integrating before trusting any specific key — Stripe iterates the connector. Config keys are read from a recent release; re-check the deployment's `connect.yaml` if behavior differs.

## Enabler bundle (browser)

- File: **`connector-enabler.umd.js`** (and `connector-enabler.es.js`). Load the **UMD** one via `<script>` — see contract pitfall 5.
- UMD global: **`window.Connector`** → `window.Connector.Enabler`.
- Internally imports `@stripe/stripe-js`, which is exactly why dynamic ES `import()` is fragile here.

```html
<script src="https://assets-….{region}.commercetools.app/connector-enabler.umd.js"></script>
<script>
  const { Enabler } = window.Connector;
  const enabler = new Enabler({ processorUrl, sessionId, locale: 'en-US', onComplete, onError });
  const dropin = await (await enabler.createDropinBuilder('embedded')).build({ showPayButton: false });
  dropin.mount('#dropin-container');   // then wait for `ready` before enabling Pay (pitfall 7)
</script>
```

## Configuration keys (`connect.yaml`)

The processor application takes these. **Secured** values go in `securedConfiguration` and are never logged or returned. Don't hardcode any of them in the frontend — the publishable key and appearance reach the browser via the processor's `GET /operations/config`.

Secured (secrets):

| Key | Purpose |
|---|---|
| `CTP_CLIENT_ID` | commercetools API client id |
| `CTP_CLIENT_SECRET` | commercetools API client secret |
| `STRIPE_SECRET_KEY` | Stripe secret API key |
| `STRIPE_WEBHOOK_SIGNING_SECRET` | verifies inbound Stripe webhooks |

Standard (notable ones — see the deployment's `connect.yaml` for the complete list and current defaults):

| Key | Notes |
|---|---|
| `CTP_PROJECT_KEY` | project key |
| `CTP_AUTH_URL` / `CTP_API_URL` / `CTP_SESSION_URL` | region hosts; defaults point at `europe-west1.gcp` — set to your region |
| `CTP_CHECKOUT_URL` | required |
| `CTP_JWKS_URL` / `CTP_JWT_ISSUER` | Merchant Center JWKS + issuer for session JWT validation |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (reaches the browser via the processor) |
| `STRIPE_WEBHOOK_ID` | the Stripe webhook endpoint id the connector manages |
| `STRIPE_CAPTURE_METHOD` | `automatic` (immediate capture) or `manual` (authorize, capture later). Default `automatic`. Drives the capture-mode requirement **and** when you create the Order. |
| `STRIPE_SAVED_PAYMENT_METHODS_CONFIG` | JSON, e.g. `{"payment_method_save":"enabled"}`. Default `{"payment_method_save":"disabled"}`. Enable for saved-cards requirement — needs a `customerId` on the cart. |
| `STRIPE_PAYMENT_INTENT_SETUP_FUTURE_USAGE` | "Setup future usage" for the PaymentIntent — pairs with saved payment methods. |
| `STRIPE_ENABLE_MULTI_OPERATIONS` | `true`/`false` (default `false`). Enables multicapture + multirefund; **also requires multicapture enabled in the Stripe account**. Set for partial-refund/split-capture requirement. Don't enable speculatively — it changes transaction handling. |
| `STRIPE_COLLECT_BILLING_ADDRESS` | `auto` \| `never` \| `if_required` (required; default `auto`). Whether the Payment Element collects billing address. |
| `STRIPE_API_VERSION` | pinned Stripe API version. **Do not hardcode this in documentation or generated code.** Derive it from the installed `stripe` npm package rather than pinning a literal — the value changes with each major SDK release and a stale value causes a TypeScript type error. Note that `stripe/esm/apiVersion.js` is **not** in the package's exports map, so it can't be imported directly; see the **Stripe API version** section below for the supported ways to read it. |
| `STRIPE_LAYOUT` / `STRIPE_APPEARANCE_PAYMENT_ELEMENT` / `STRIPE_EXPRESS_ELEMENT_OPTIONS` | Payment Element layout/appearance + express button options (JSON; cosmetic, safe to leave default) |
| `MERCHANT_RETURN_URL` | required; **must be an absolute URL with a scheme** (contract pitfall 6) |
| `ALLOWED_ORIGINS` | required; comma-separated list; must include every frontend origin that calls the processor (CORS) |
| `PAYMENT_INTERFACE` | the `paymentMethodInfo.paymentInterface` written on the Payment; default `checkout-stripe` |

For turning requirements into these values with a worked example, see [config-from-requirements.md](./config-from-requirements.md).

### Session metadata for Stripe
The Stripe connector validates the session against its own deployed processor. If you hit **401 "Session is not active"** from the processor with a fresh session, confirm the session `metadata` carries what this deployment expects — either the Checkout Application `applicationKey`, or `processorUrl` set to the connector's processor URL — and that the cart total is non-zero. See contract pitfalls 2 and 3.

**Custom connectors (built from the payment-integration template) use `metadata.processorUrl`, not `applicationKey`.** The template's session-auth hook validates that the session's `metadata.processorUrl` matches the processor's own deployed URL. There is no Checkout Application involved. Use:

```json
{ "metadata": { "processorUrl": "https://service-….europe-west1.gcp.3.sandbox.commercetools.app" } }
```

`applicationKey` only applies if you have configured a Checkout Application in the Merchant Center (the hosted Checkout product path). Trying `applicationKey` on a custom connector will get you a 401 that looks like a session issue but is actually a metadata mismatch.

## API client scopes

Two separate API clients are involved. Requesting a scope the client doesn't have returns a `400 invalid_scope` (not a 403), which surfaces as a generic "Permissions exceeded" error at runtime.

| Actor | Minimum required scopes |
|---|---|
| **Storefront BFF** (session creation, order creation) | `manage_sessions:{projectKey}`, `manage_orders:{projectKey}` |
| **Processor** (CT API client used for payments, cart reads, session validation) | `manage_payments:{projectKey}`, `view_sessions:{projectKey}`, `manage_orders:{projectKey}` |

Notes:
- Checkout splits session scopes: `manage_sessions:{projectKey}` grants **creating** a session (the Storefront BFF needs this), while `view_sessions:{projectKey}` grants **reading** one — the latter is the scope required for connectors to interact with Checkout and validate sessions, so the Processor needs `view_sessions`. See [Checkout Scopes](https://docs.commercetools.com/checkout/scopes.md#checkout-sessions).
- `manage_orders` covers reading carts (needed for cart version lookups and `addPayment`) — **do not request `view_orders`** or `manage_my_orders` unless the client was explicitly granted them.
- The processor and storefront BFF can share a single API client in development, but should use separate clients in production to enforce least-privilege.

## Webhook setup

Stripe is partly asynchronous: the final transaction state can arrive via webhook. The connector manages a Stripe webhook endpoint (`STRIPE_WEBHOOK_ID`) and verifies it with `STRIPE_WEBHOOK_SIGNING_SECRET`. If a payment authorizes in the UI but the commercetools Payment transaction never moves to `Success`, suspect the webhook: confirm the endpoint exists in the Stripe dashboard, points at the processor, and the signing secret matches.

## Test cards

Use Stripe **test mode** keys and test cards (see Stripe's testing documentation):

| Card | Outcome |
|---|---|
| `4242 4242 4242 4242` | succeeds, no authentication |
| `4000 0025 0000 3155` | requires 3D Secure authentication |
| `4000 0000 0000 9995` | declined (insufficient funds) |

Any future expiry, any CVC, any postal code.

## Building a custom Stripe connector (from the payment-integration template)

When building your own connector (ladder rung 4 — no public connector, or forking), two things differ from the public connector experience:

**Payment route method.** The public Stripe connector's payment-creation route happens to be a `GET /payments` (the enabler calls it for you — see contract pitfall 8). When you build from the template you own that route and should implement it as `POST /payments`. Don't let the "GET" note in connector-contract.md confuse you — it applies to the *public* connector; in your own processor you write the HTTP method.

**Raw body for webhook signature verification.** Stripe's `stripe.webhooks.constructEvent()` requires the raw unparsed request body (a `Buffer`), not the JSON-parsed body. Fastify parses bodies by default. Use the `fastify-raw-body` npm package (note: the scoped `@fastify/raw-body` does **not** exist — it will 404 on install):

```bash
npm install fastify-raw-body
```

```typescript
import rawBody from 'fastify-raw-body';

await server.register(rawBody, {
  field: 'rawBody',
  global: false,      // opt-in per route, not global
  encoding: false,    // keep as Buffer, not string
  runFirst: true,
  routes: ['/stripe/webhooks'],
});
```

Then in the webhook route, read `(request as any).rawBody` as the Buffer to pass to `constructEvent`.

> **`fastify-raw-body` v5 replaces the JSON content-type parser globally.** Despite `global: false`, v5 replaces Fastify's default JSON content-type parser for ALL routes (not just webhook routes). The `global` flag only controls the `preParsing` hook, not the parser replacement. This means any `POST` route that receives `Content-Type: application/json` with an **empty body** (`""`) will be rejected by the patched `almostDefaultJsonParser` — even `POST /payments`. **The fix:** always send `body: "{}"` (a valid empty JSON object) from the enabler's `fetch` call to `POST /payments`, never an empty string or no body at all.

**`stripe.elements()` requires mode + real cart amount (deferred-intent pattern).** Without `mode`, `amount`, and `currency`, the Stripe Payment Element mounts as a **blank box with no error** — a silent failure. The certified connector solves this with a `GET /config-element/:paymentComponent` endpoint (session-authenticated) that returns the real cart amount, currency, capture method, and layout. **This endpoint is not in the payment-integration template by default** — you must add it. The enabler fetches `/operations/config` and `/config-element/payment` in parallel, then calls:

```typescript
stripe.elements({
  mode: 'payment',
  amount: cartElement.cartInfo.amount,          // centAmount from the CT cart
  currency: cartElement.cartInfo.currency.toLowerCase(),
  capture_method: cartElement.captureMethod,    // 'automatic' | 'manual'
});
```

The processor endpoint should read the cart from session context (`getCartIdFromContext()`) and call `ctCartService.getPaymentAmount({ cart })`:

```typescript
// GET /config-element/:paymentComponent — session-authenticated
async initializeCartPayment() {
  const ctCart = await this.ctCartService.getCart({ id: getCartIdFromContext() });
  const amount = await this.ctCartService.getPaymentAmount({ cart: ctCart });
  return {
    cartInfo: { amount: amount.centAmount, currency: amount.currencyCode },
    captureMethod: getConfig().stripeCaptureMethod,
    collectBillingAddress: getConfig().stripeCollectBillingAddress,
    layout: JSON.stringify({ type: 'tabs', defaultCollapsed: false }),
  };
}
```

**PaymentIntent must use `automatic_payment_methods`, not `payment_method_types`.** When Elements is initialized in deferred-intent / automatic mode (no explicit `payment_method_types` list — which is the correct pattern when using `GET /config-element/payment`), the PaymentIntent created in `POST /payments` must also use `automatic_payment_methods: { enabled: true }`. Using `payment_method_types: ['card']` causes a Stripe 400: "Payment details were collected through Stripe Elements using automatic payment methods and cannot be confirmed through the API configured with payment_method_types." The payment-integration template scaffolds `payment_method_types: ['card']` by default — **remove it and replace**:

```typescript
await stripe.paymentIntents.create({
  amount: amountPlanned.centAmount,
  currency: amountPlanned.currencyCode.toLowerCase(),
  capture_method: cfg.stripeCaptureMethod,
  automatic_payment_methods: { enabled: true }, // not payment_method_types: ['card']
  metadata: { ... },
});
```

**Deferred-intent: fetch `clientSecret` inside `submit()`, not at mount time.** With `stripe.elements({ mode: 'payment', ... })`, `stripe.confirmPayment()` needs a `clientSecret` — but the PaymentIntent doesn't exist yet when the element mounts. Create it server-side *inside* `submit()`, then confirm. (This is the Stripe instance of [connector-contract.md pitfall 12](./connector-contract.md#12-deferred-intent-create-the-psp-intent-inside-submit-not-at-mount-time).)

```typescript
// 1. Validate the form
const { error: submitError } = await elements.submit();
if (submitError) { /* handle */ return; }

// 2. Create the PaymentIntent server-side NOW (not at mount time)
const res = await fetch(`${processorUrl}/payments`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
  body: '{}',
});
const { clientSecret } = await res.json();

// 3. Confirm with the clientSecret
const { error, paymentIntent } = await stripe.confirmPayment({
  clientSecret,   // ← required for deferred-intent
  elements,
  confirmParams: { return_url: merchantReturnUrl },
  redirect: 'if_required',
});
```

Calling `stripe.confirmPayment({ elements, confirmParams })` **without** `clientSecret` throws `IntegrationError: You must pass in a clientSecret`. Calling `POST /payments` at mount time instead of submit time creates a PaymentIntent before the user has confirmed — abandoned intents accumulate in Stripe.

**Refund needs a charge id (`ch_xxx`), not a PaymentIntent id.** For `automatic` capture flows the webhook writes `interactionId: paymentIntent.id` (`pi_xxx`) on the Success transaction — that's what `POST /payments/:id/refund` receives as `stripeChargeId`. But `stripe.refunds.create` operates on **charges**, not PaymentIntents. Passing a `pi_xxx` id returns `404 No such charge`. Fix: retrieve the charge id from Stripe before refunding — the PaymentIntent's `latest_charge` field carries it:

```ts
const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
const stripeChargeId = pi.latest_charge as string; // ch_xxx
```

Alternatively, update the webhook handler to write the charge id (from `paymentIntent.latest_charge`) as the `interactionId` for `Charge`-type transactions, so the CT Payment itself carries the refundable id. (This is the Stripe instance of [connector-contract.md pitfall 16](./connector-contract.md#16-the-id-the-webhook-records-may-not-be-the-id-the-refund-route-needs).)

**Classify Stripe errors in the enabler, not the storefront.** `card_error` and `validation_error` (from both `elements.submit()` and `stripe.confirmPayment()`) are user-recoverable — show them inline near the payment form and clear on the next `change` event so the user can correct and retry without the storefront intervening. Non-recoverable errors (`invalid_request_error`, `api_error`) bubble to `onError`. Pattern:

```typescript
// In mount():
this.errorEl = document.createElement('div');
this.errorEl.setAttribute('role', 'alert');
container.appendChild(this.errorEl);
paymentElement.on('change', () => { this.errorEl.textContent = ''; });

// In submit(), after elements.submit():
if (submitError?.type === 'validation_error') {
  this.errorEl.textContent = submitError.message ?? 'Please complete your payment details.';
  return;
}

// After stripe.confirmPayment():
if (confirmError?.type === 'card_error' || confirmError?.type === 'validation_error') {
  this.errorEl.textContent = confirmError.message ?? 'Payment failed. Please check your card details.';
  return;
}
// non-recoverable → onError(confirmError, { paymentReference })
```

**Stripe API version.** The goal is to stay in sync with the installed SDK without hardcoding a literal string that silently drifts when the package is upgraded. `stripe/esm/apiVersion` is **not exposed via the package's exports map** — importing it directly fails at runtime (`ERR_PACKAGE_PATH_NOT_EXPORTED`) and TypeScript can't find it (no `.d.ts` in `esm/`). Use whichever approach fits your module system and build setup — any of these are fine:

- **Read from disk at startup (CJS processors):** `fs.readFileSync('node_modules/stripe/esm/apiVersion.js')` and regex-extract the value. Works without any build step.
- **Build-time codegen:** a `prebuild` script that runs `node -e "..."` and writes the version to a generated `src/generated/stripeApiVersion.ts` file that TypeScript can import normally.
- **Pin it explicitly and own the update:** hardcode the string (e.g. `'2024-06-20'`), add a comment like `// update when upgrading stripe SDK`, and enforce it in CI with a check that compares against the installed version. Honest and often the most pragmatic choice.

Do not leave it as the TypeScript default (`''` or omitted) — Stripe will use its own latest version server-side, which may differ from what the SDK expects and cause subtle type mismatches.

**Prefer Jest for connector apps; if you use Vitest, run it through a wrapper.** Connect [validates `npm test` at publish](https://docs.commercetools.com/connect/convert-existing-integration.md#test-your-connect-application) and its examples use Jest, which is what the connector templates assume. Vitest can work, but its CLI aborts on any unknown option it's passed — so make each app's `test` script call Vitest with a fixed, explicit arg list rather than letting extra arguments reach it. The simplest way is a small wrapper script:

```js
// scripts/run-tests.mjs  →  "test": "node scripts/run-tests.mjs"
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--coverage'], { stdio: 'inherit' });
process.exit(r.status ?? 1); // forward exit code so real failures still fail the build
```

Two related points: **every app needs a `test` script** — since tests are mandatory and reviewed at publish, an `assets`/enabler app with no `test` script won't pass validation. Give it the same wrapper plus at least one real test. And put coverage config in `vitest.config.ts`, not CLI flags, so the wrapper stays the single source of truth.

## Quick reference
- Bundle: `connector-enabler.umd.js`, global `window.Connector`.
- Auth to processor: `X-Session-Id` (contract pitfall 9).
- Capture mode: `STRIPE_CAPTURE_METHOD` (`automatic` | `manual`).
- Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SIGNING_SECRET`, `CTP_CLIENT_SECRET`, `CTP_CLIENT_ID`.
- 401 from processor → session `metadata` / cart-total check.
- Raw body for webhooks: `fastify-raw-body` (not `@fastify/raw-body` — that package doesn't exist).
- API version: do not hardcode and do not import `stripe/esm/apiVersion` directly (not in exports map). Options: `fs.readFileSync` at startup, build-time codegen, or an explicit pinned string with a CI check. See the "Stripe API version" section above.
- Payment Element blank box (no error) → `stripe.elements()` missing `mode`/`amount`/`currency` — add `GET /config-element/payment` to the processor; fetch it in parallel with `/operations/config` before initializing Elements.
- `POST /payments` 500 with empty body → `fastify-raw-body` v5 global JSON parser replacement. Send `body: "{}"` (not `""` or no body) from the enabler's fetch.
- PaymentIntent 400 "cannot be confirmed … configured with payment_method_types" → template default `payment_method_types: ['card']` conflicts with automatic Elements mode. Replace with `automatic_payment_methods: { enabled: true }`.
- Enabler error handling: `card_error`/`validation_error` → inline message + clear on `change`; `invalid_request_error`/`api_error` → `onError`.
- Vitest test script failing at publish though it passes locally → Vitest aborts on unknown CLI options; route `test` through a wrapper that calls Vitest with a fixed arg list. Prefer Jest (templates assume it). Every app (incl. enabler) needs a `test` script. See the "Prefer Jest for connector apps" note above.
- Image security analysis fails but SAST/SCA pass → base-image OS CVE, pin `engines.node` (e.g. `20.x`) in every app's `package.json`. Dependency-CVE fixes are *upgrades*, never downgrades. See [deploy-custom-connector.md](./deploy-custom-connector.md#the-three-scans-fail-for-different-reasons--read-which-one-failed).
