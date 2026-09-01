---
name: payment-connector-integration-test
description: The capstone full-flow integration test for a direct payment-connector integration — one automated test that drives a real deployed connector with a PSP test card from session through Order, capture/refund, and webhook reconciliation, asserting each step left the right trace in commercetools.
when_to_use:
  - "Writing the single end-to-end test that exercises the whole connector flow against a real deployment"
  - "Turning the manual round-trip verification into a repeatable automated integration test"
  - "Proving session -> pay -> Order -> capture/refund -> webhook reconciliation all work together"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
---

# The full-flow integration test

The unit tests in [backend-tdd.md](./backend-tdd.md) prove each backend decision in isolation against mocks. They run on every commit and never touch a network. But they cannot prove the **wiring** — that your session metadata actually matches what the deployed processor expects, that a real test card produces a real `Charge`, that the PSP webhook actually reaches the processor and finalizes the transaction. That's the gap this test closes: **one automated test that drives the real, deployed pieces end to end and asserts the trace each step leaves in commercetools.**

This is the capstone of **Step 5**. Where [verification.md](./verification.md) is a manual checklist you walk once, this turns that same round trip into a test you can re-run after every deploy — the difference between "I clicked through it and it worked" and "it provably still works."

## Prerequisites

**Do not write or run this test until the unit suite from [backend-tdd.md](./backend-tdd.md) is fully green.** The integration test proves the wiring; the unit tests prove the decisions. Running the integration test first skips the decisions layer and makes failures much harder to localize. The correct order is always: unit tests green → integration test written → integration test run against a real deployment.

## What it is (and isn't)

- It runs against a **real deployed connector** (processor + enabler URLs from config) and a **real commercetools project**, using the PSP's **test cards** — never live cards, never production keys.
- It reuses the [test-harness.md](./test-harness.md) flow as its **driver** for the browser half (session → enabler → submit), and [verification.md](./verification.md) as its **oracle** for the backend half (find the Payment, read its transactions).
- It is **not** a unit test and should not run on every commit. It needs secrets and a live deployment, it's slower, and a PSP sandbox hiccup can make it flake. Run it in a dedicated job (nightly, pre-release, or post-deploy smoke), gated on the connector config being present — **skip with a loud, explicit message when config is absent** so a missing secret reads as "not configured here," never as a silent pass. A silent pass on a missing secret is the same as having no test.
- Keep it to **one or a few** scenarios. Its value is breadth (it touches everything), not depth (the unit tests own the edge cases).

## The flow it asserts

The test walks the same path a customer does, asserting the commercetools trace at each commit point — so a failure tells you *which* seam broke, not just "it didn't work":

```
1. Mint session server-side (BFF)      -> assert: sessionId returned; response carries no secrets
2. Drive enabler + submit a test card  -> assert: onComplete fired / no enabler error
3. Find the Payment (verification.md)   -> assert: cart.paymentInfo has a Payment; transaction is Success;
                                                   paymentInterface matches the connector; exactly one Payment
4. Place the Order                      -> assert: Order created; cartState -> Ordered; idempotent on orderNumber
5. Capture (if manual) via processor    -> assert: a Charge/Success transaction appears on the Payment
6. Refund via the processor route       -> assert: a Refund transaction appears; Payment Intents API never called
7. Webhook reconciliation (async PSP)   -> assert: transaction reaches Success after the webhook (poll, don't sleep)
```

Steps 5–7 are conditional on the requirements from Step 1: skip capture if the flow is immediate-charge, skip the webhook wait for a fully-synchronous method. Assert only what the configured flow actually does — a test that asserts a manual capture against an automatic-capture deployment is testing the wrong contract.

## Shape

Async settlement is the part that bites: the webhook arrives *after* `submit()` returns, so the Payment isn't `Success` the instant the browser says "done." **Poll with a timeout; never a fixed `sleep`.** A fixed sleep is either too short (flaky) or too long (slow) — polling is both faster and more reliable.

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadConnectorConfig } from './support/config';
import { runHarnessFlow } from './support/harness';        // the test-harness.md flow, scripted
import { findPaymentForCart, findPaymentsForCart, getPayment, getCart } from './support/ct';
import { placeOrder, capture, refund } from '../src/backend';

const cfg = loadConnectorConfig();           // PROCESSOR_URL, ENABLER_URL, CT creds, project, region
const itLive = cfg ? it : it.skip;           // skip (loudly) when no deployment is configured

// poll until a predicate holds, so async webhook settlement doesn't force a brittle sleep
async function until<T>(fn: () => Promise<T>, ok: (v: T) => boolean, { tries = 20, gapMs = 1500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (ok(v)) return v;
    await new Promise(r => setTimeout(r, gapMs));
  }
  throw new Error('condition not met within timeout — suspect the webhook (see backend-integration.md)');
}

describe('connector full flow (live deployment, test card)', () => {
  itLive('session -> pay -> Order -> capture -> refund leaves the right CT trace', async () => {
    // 1-2. server-side session + drive the enabler to submit a test card
    const { sessionId, cartId, result } = await runHarnessFlow(cfg, { testCard: '4242424242424242' });
    expect(result.error).toBeUndefined();

    // 3. the processor wrote the Payment — find it via the cart (verification.md)
    const payment = await until(
      () => findPaymentForCart(cfg, cartId),
      p => !!p && p.transactions.some(t => t.state === 'Success'),
    );
    expect(payment.paymentMethodInfo.paymentInterface).toBe(cfg.paymentInterface);  // e.g. 'checkout-stripe'
    const payments = await findPaymentsForCart(cfg, cartId);
    expect(payments).toHaveLength(1);                          // no duplicate Payment (frontend didn't create one)

    // 4. place the Order — and prove idempotency by doing it twice with the same orderNumber
    const orderNumber = `it-${sessionId}`;                     // deterministic per run; reused on retry
    const order  = await placeOrder({ cartId, orderNumber });
    const again  = await placeOrder({ cartId, orderNumber });
    expect(again.id).toBe(order.id);                           // converges on one Order
    expect(order.orderState).toBeDefined();
    const cart = await getCart(cfg, cartId);
    expect(cart.cartState).toBe('Ordered');

    // 5-6. capture then refund via the processor's operation routes
    if (cfg.captureMode === 'manual') {
      await capture({ paymentId: payment.id });
      const captured = await until(() => getPayment(cfg, payment.id),
        p => p.transactions.some(t => t.type === 'Charge' && t.state === 'Success'));
      expect(captured).toBeTruthy();
    }
    await refund({ paymentId: payment.id, amount: { centAmount: 100 } });
    const refunded = await until(() => getPayment(cfg, payment.id),
      p => p.transactions.some(t => t.type === 'Refund'));
    expect(refunded).toBeTruthy();
  }, 90_000);   // generous timeout: cold starts + webhook settlement
});
```

`runHarnessFlow` is the [test-harness.md](./test-harness.md) 8-step flow scripted instead of clicked — driven headlessly (e.g. Playwright loading the enabler UMD, or, if the connector supports it, replaying the processor calls the enabler would make). Stay close to the harness you already proved by hand; the integration test is that harness with assertions and an Order/capture/refund tail bolted on.

## Reading a failure

The assertions are positioned so the *first* one to fail localizes the break — this is the whole reason to assert at each commit point rather than only at the end:

| First failing step | Most likely cause | Where |
|---|---|---|
| 1 — no sessionId / secret leaked | BFF wiring, session metadata mismatch | [connector-contract.md](./connector-contract.md) pitfalls 1–2 |
| 2 — enabler error / no onComplete | enabler load, cold start, `ready` timing | [connector-contract.md](./connector-contract.md) pitfalls 5, 7, 10 |
| 3 — no Payment, or stuck `Pending` | submit never reached processor, or async webhook | [verification.md](./verification.md), [backend-integration.md](./backend-integration.md#webhook-reconciliation) |
| 3 — duplicate Payment | frontend wrongly created a Payment | [connector-contract.md](./connector-contract.md#who-owns-the-payment-object) |
| 4 — Order not created / not idempotent | gate or `orderNumber` reuse wrong | [backend-integration.md](./backend-integration.md#creating-the-order-after-payment) |
| 6 — refund 404/wrong call | reached for the Payment Intents API | [backend-integration.md](./backend-integration.md#post-purchase-capture-refund-cancel) |
| 7 — never reaches `Success` | webhook not delivered/verified | provider reference → webhook setup |

## Checklist

> **Gate: only write this test after the unit suite from [backend-tdd.md](./backend-tdd.md) exits 0.**

- [ ] Unit suite green before this test was written — not after
- [ ] One end-to-end test drives a **real deployed** connector with a PSP **test** card (never live keys)
- [ ] It asserts the CT trace at each commit point (session, Payment+Success, Order, capture, refund), so a failure localizes the broken seam
- [ ] Reuses the [test-harness.md](./test-harness.md) flow as the driver and [verification.md](./verification.md) as the oracle
- [ ] Async settlement handled by **polling with a timeout** (`until()` helper), not a fixed sleep
- [ ] Asserts no duplicate Payment and that capture/refund went through the **processor** routes (not the Payment Intents API)
- [ ] Skips **loudly** (explicit `it.skip` or `console.warn` with a clear message) when deployment/secrets are absent — a silent pass on a missing secret is a broken test
- [ ] Runs in a dedicated job (nightly/pre-release/post-deploy), not on every commit
