---
name: payment-connector-backend-tdd
description: Test-drive the payment-connector backend — write a failing test per behavior before the code, mocking the PSP/processor/Sessions API boundary, so the integration's hard-won invariants (idempotency, gate-on-Success, processor-owns-the-Payment) become executable assertions instead of prose.
when_to_use:
  - "Writing the backend (BFF session, Order creation, capture/refund/cancel, webhook handler) test-first"
  - "Deciding what to assert and what to mock for each backend piece"
  - "Turning the skill's repeated warnings (don't double-charge, don't use Payment Intents API, gate on webhook Success) into regression tests"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
---

# Test-driving the backend

> **Hard rule: no implementation code before its test.**
> Install Vitest and write the first failing test *before* writing any function body. If you find yourself with working code and no test, you have skipped this step — stop, write the test (it may already pass, which means it's now a regression guard rather than a design tool, but it still must exist), and confirm it would fail if the behavior were removed before continuing.

The backend pieces in [backend-integration.md](./backend-integration.md) — BFF session, Order creation, post-purchase capture/refund/cancel, webhook reconciliation — are an unusually good fit for TDD. Not because tests are virtuous, but because **the rules that make this integration correct are invisible at the call site and only show up under conditions that are annoying to reproduce by hand**: a retried webhook, a stale cart version, an async PSP that hasn't settled yet, a developer reaching for the Payment Intents API out of habit. Each of those is one cheap assertion. Writing the test first is the fastest way to pin the behavior down *and* leave a tripwire so the next change can't quietly undo it.

This is the discipline for **Step 4**. Write the test, watch it fail for the right reason, make it pass, then move on. The payoff is concentrated in the invariants the rest of this skill keeps repeating — they stop being prose you hope the reader internalizes and become checks that break the build.

**Setup first.** Before writing any backend code, install Vitest and verify `npm test` runs (even with zero test files). This takes two minutes and means every subsequent test-first cycle has a working harness to run against. Do not defer this to "after the backend is done."

```bash
npm install --save-dev vitest @vitest/coverage-v8
# add to package.json scripts: "test": "vitest run"
npm test   # should exit 0 with "no test files found" — harness is live
```

> This `"test": "vitest run"` is right for the **BFF/storefront** (which you run yourself). But for a **custom connector**, prefer Jest — the Connect platform [validates `npm test` at publish](https://docs.commercetools.com/connect/convert-existing-integration.md#test-your-connect-application) and its examples (and the connector templates) use Jest. If you do use Vitest, run each app's `test` through a wrapper that calls Vitest with a fixed arg list (Vitest aborts on unknown CLI options), and give every app — including the `assets` enabler — a `test` script. See [stripe.md → "Prefer Jest for connector apps"](./stripe.md).

## The loop

For each behavior, smallest first:

1. **Red** — write one test that names the behavior and asserts the outcome. Run it. It must fail *because the behavior is missing*, not because the import is wrong or the mock isn't wired — a test that passes before you've written anything, or errors for a boring reason, is testing nothing. Read the failure and confirm it's the failure you expected.
2. **Green** — write the least code that makes it pass. Resist generalizing; the next test will tell you what to generalize.
3. **Refactor** — clean up with the test as a safety net.

Keep tests at the **behavior** level, not the line level. "Creating an Order twice with the same `orderNumber` doesn't double-create" is a behavior worth a test; "the function calls `fetch` with these exact headers" is usually too brittle to be worth pinning unless the header *is* the behavior (the `X-Session-Id` auth header is — see below).

## Where to draw the test boundary

The backend's job is **orchestration** — it decides *when* to mint a session, *when* the Order may be created, *which* route a refund goes through, *whether* a webhook has already been handled. The PSP, the connector's processor, and the Sessions/Orders APIs are someone else's code across a network. So:

- **Mock the outbound boundary** (the processor's operation routes, the Sessions API, the PSP, the CT Orders/Payments API client) and assert on **what your code decided to do**: which endpoint it called, with what body, in what order, and what it did with the response. These tests are fast, deterministic, and run with no deployment and no secrets — so they run on every commit.
- **Don't** mock your own orchestration logic — that's the thing under test.
- **Don't** try to assert the PSP actually charged a card here. That's the job of the **full-flow integration test** ([integration-test.md](./integration-test.md)), which runs against a real deployed connector with test cards. Unit tests prove your decisions; the integration test proves the wiring.

A thin **port** in front of each outbound dependency makes this painless: a `processorClient` with `capture()/refund()/cancel()`, a `sessionsApi.create()`, a `ctOrders.create()`. Tests inject a fake; production injects the real one. If you find a behavior hard to test, it's usually because the decision and the I/O are tangled — separating them is the refactor the test is asking for.

The examples below use **Vitest + TypeScript** to match the storefront stack, but nothing depends on Vitest specifics — `vi.fn()` → `jest.fn()` and they read identically under Jest or node:test.

## What to test, per backend piece

For each piece: the behaviors worth pinning, and — just as important — what the test is *guarding against*, since that's the bug the prose warning is trying to prevent.

**Start each piece with the happy path, then the deviations.** The happy-path test is the one every other test is a deviation *from* — "owned cart + a `Success` transaction → exactly one Order, Payment linked, `cartState: Ordered`." Write it first: it's the cheapest to get green, it forces the function's shape into existence, and without it a suite can drift into asserting every way the flow *breaks* while never asserting it actually *works* (a green build where the success path silently regressed). Then add the error and edge deviations below, which is where the real defects hide.

### BFF session creation

The security-critical decisions happen here, and they're exactly the ones a happy-path manual test never exercises — so test the happy path *and* the guards.

- **Happy path:** an owned, non-zero cart yields a `sessionId` and the processor/enabler URLs. This is the baseline the guards below deviate from.
- **IDOR guard:** a session is created only when the cart belongs to the caller. Test the *rejection* path — a cart whose `customerId` differs from the authenticated user must not produce a session. This is the test that matters most and the one most likely to be missing.
- **Secrets stay server-side:** the object returned to the browser contains `sessionId`, `processorUrl`, `enablerUrl` and **nothing else** — assert the response has no `access_token`, no client secret. A snapshot or explicit key-set assertion catches a careless `res.json(session)` that leaks the whole token response.
- **Non-zero cart:** a €0 cart is refused before a session is minted (the processor would reject it anyway — contract pitfall 3).

```ts
import { describe, it, expect, vi } from 'vitest';
import { createCheckoutSession } from '../bff/session';

describe('BFF session creation', () => {
  it('refuses to create a session for a cart the caller does not own (IDOR)', async () => {
    const ctCarts = { get: vi.fn().mockResolvedValue({ id: 'cart-1', customerId: 'someone-else' }) };
    const sessionsApi = { create: vi.fn() };

    await expect(
      createCheckoutSession({ cartId: 'cart-1', user: { customerId: 'me' }, ctCarts, sessionsApi }),
    ).rejects.toThrow(/forbidden|ownership/i);

    expect(sessionsApi.create).not.toHaveBeenCalled();   // the real assertion: no session was minted
  });

  it('returns only sessionId + processor/enabler URLs to the browser', async () => {
    const ctCarts = { get: vi.fn().mockResolvedValue({ id: 'cart-1', customerId: 'me', totalPrice: { centAmount: 1999 } }) };
    const sessionsApi = { create: vi.fn().mockResolvedValue({ id: 'sess-1', accessToken: 'SECRET' }) };

    const out = await createCheckoutSession({ cartId: 'cart-1', user: { customerId: 'me' }, ctCarts, sessionsApi });

    expect(out).toEqual({ sessionId: 'sess-1', processorUrl: expect.any(String), enablerUrl: expect.any(String) });
    expect(JSON.stringify(out)).not.toContain('SECRET');   // no token leaks to the client
  });
});
```

### Order creation

The whole point is the **preconditions and idempotency** — the Order is the commit, and committing twice or committing too early is the failure mode. Pin the success case first, then the two ways it must refuse.

- **Happy path:** an owned cart whose linked Payment has a `Success` transaction creates exactly one Order at the current cart version and flips `cartState` to `Ordered`. This is the contract; the gates below are when it must *not* fire.
- **Gated on authorization:** with no `Success` transaction on the linked Payment, `placeOrder` must not call `ctOrders.create`. For an **async** PSP, "authorization complete" means the *webhook* moved it to `Success` — so the gate is the same test with the transaction still `Pending`.
- **Declined payment never commits:** a `Failure` transaction (card declined, insufficient funds — the most common real-world error path) must block Order creation just like `Pending` does, and the caller should get a clear decline back, not a generic 500. This is distinct from `Pending`: `Pending` is "not yet," `Failure` is "no" — and an Order built on a declined Payment is the worst outcome, an unpaid fulfilled order.
- **Idempotent on `orderNumber`:** two calls with the same pre-generated `orderNumber` create at most one Order. Simulate the CT "duplicate orderNumber" rejection on the second call and assert your code treats it as success (returns the existing Order), not as an error to retry into a third attempt.
- **Uses the current cart version:** a stale version is rejected; assert you refetch/propagate the version rather than reusing a cached one.

```ts
it('creates exactly one Order from an authorized cart and marks it Ordered (happy path)', async () => {
  const created = { id: 'order-1', orderNumber: 'ord-1', cartState: 'Ordered' };
  const ctOrders = { create: vi.fn().mockResolvedValue(created) };
  const payment = { transactions: [{ type: 'Authorization', state: 'Success' }] };  // authorized

  const order = await placeOrder({ cartId: 'c1', cartVersion: 3, orderNumber: 'ord-1', payment, ctOrders });

  expect(ctOrders.create).toHaveBeenCalledOnce();
  expect(ctOrders.create).toHaveBeenCalledWith(expect.objectContaining({ orderNumber: 'ord-1', version: 3 }));
  expect(order.cartState).toBe('Ordered');
});

it('does not create an Order until a Success transaction exists', async () => {
  const ctOrders = { create: vi.fn() };
  const payment = { transactions: [{ type: 'Authorization', state: 'Pending' }] };  // async PSP, not settled

  await expect(placeOrder({ cartId: 'c1', cartVersion: 3, orderNumber: 'ord-1', payment, ctOrders }))
    .rejects.toThrow(/not authorized|pending/i);
  expect(ctOrders.create).not.toHaveBeenCalled();
});

it('refuses to create an Order on a declined payment, surfacing the decline (error path)', async () => {
  const ctOrders = { create: vi.fn() };
  const payment = { transactions: [{ type: 'Authorization', state: 'Failure' }] };  // card declined

  await expect(placeOrder({ cartId: 'c1', cartVersion: 3, orderNumber: 'ord-1', payment, ctOrders }))
    .rejects.toMatchObject({ code: 'PaymentDeclined' });   // a clear decline, not a generic 500
  expect(ctOrders.create).not.toHaveBeenCalled();          // never an unpaid Order
});

it('is idempotent: a duplicate orderNumber returns the existing Order, not an error', async () => {
  const existing = { id: 'order-1', orderNumber: 'ord-1' };
  const ctOrders = {
    create: vi.fn().mockRejectedValueOnce({ statusCode: 400, code: 'DuplicateField', field: 'orderNumber' }),
    getByOrderNumber: vi.fn().mockResolvedValue(existing),
  };
  const payment = { transactions: [{ type: 'Authorization', state: 'Success' }] };

  const order = await placeOrder({ cartId: 'c1', cartVersion: 3, orderNumber: 'ord-1', payment, ctOrders });
  expect(order).toEqual(existing);     // a retry converges on the one Order, never a second
});

it('is idempotent: "cart not in active state" (cartState=Ordered) also returns the existing Order', async () => {
  // After the first order creation succeeds, CT flips cartState → Ordered.
  // A second POST /orders then fails with InvalidOperation "not in active state"
  // *before* CT checks the orderNumber, so DuplicateField is never raised.
  // The handler must also catch this case and return the existing Order.
  const existing = { id: 'order-1', orderNumber: 'ord-1' };
  const ctOrders = {
    create: vi.fn().mockRejectedValueOnce({
      statusCode: 400,
      body: { errors: [{ code: 'InvalidOperation', message: 'The cart is not in active state.' }] },
    }),
    getByOrderNumber: vi.fn().mockResolvedValue(existing),
  };
  const payment = { transactions: [{ type: 'Authorization', state: 'Success' }] };

  const order = await placeOrder({ cartId: 'c1', cartVersion: 4, orderNumber: 'ord-1', payment, ctOrders });
  expect(order).toEqual(existing);
});
```

### Post-purchase capture / refund / cancel

The decision this code must get right is **which API it calls** — and the single most valuable test in the whole suite is the one that fails if someone routes a direct-connector refund through the Checkout Payment Intents API.

- **Routes through the processor, never the Payment Intents API:** assert the processor's operation route was called and that no Payment Intents endpoint (`/checkout/payment-intents`, the `manage_checkout_payment_intents` path) was touched. This is a guardrail test — its job is to *fail loudly* the day someone "simplifies" it to the wrong API.
- **Capture idempotency:** one `Charge` per PSP `interactionId`; a retried capture with the same interaction id doesn't double-charge.
- **Partial refund only when configured/allowed:** a partial refund above the captured amount is rejected; multiple partial refunds sum correctly up to the captured total.

```ts
it('routes capture through the processor, not the Payment Intents API', async () => {
  const processor = { capture: vi.fn().mockResolvedValue({ ok: true }) };
  const paymentIntents = { capture: vi.fn() };   // the wrong API — must stay untouched

  await capturePayment({ paymentId: 'pay-1', amount: { centAmount: 1999 }, processor, paymentIntents });

  expect(processor.capture).toHaveBeenCalledOnce();
  expect(paymentIntents.capture).not.toHaveBeenCalled();   // guardrail against the Checkout-only API
});

it('does not double-charge on a retried capture (idempotent by interactionId)', async () => {
  const processor = { capture: vi.fn().mockResolvedValue({ interactionId: 'pi_123' }) };
  const seen = new Set<string>();

  await capturePayment({ paymentId: 'pay-1', interactionId: 'pi_123', processor, seen });
  await capturePayment({ paymentId: 'pay-1', interactionId: 'pi_123', processor, seen });   // retry

  expect(processor.capture).toHaveBeenCalledOnce();
});
```

### Webhook reconciliation

This is where async PSPs live, and it's the piece most painful to exercise by hand because it depends on a signed event arriving — possibly twice. Tests pay off the most here.

- **Idempotent on redelivery:** the same webhook event id applied twice leaves the Payment in the same state and creates at most one transaction. PSPs *will* redeliver; assert it.
- **Signature/verification is enforced:** a tampered or unsigned payload is rejected before any state change. (For a custom processor you own this; for the public connector, test your own handler's gate if you have one in front.)
- **Drives the gate the Order waits on:** after the webhook moves the transaction to `Success`, the Order-creation gate that was closed in the Order test now opens. A test that asserts "stuck `Pending` → no Order; webhook arrives → Order proceeds."

```ts
it('is idempotent when the PSP redelivers the same event', async () => {
  const ctPayments = { addTransaction: vi.fn().mockResolvedValue({}) };
  const processed = new Set<string>();
  const event = { id: 'evt_1', type: 'payment_intent.succeeded', paymentId: 'pay-1' };

  await handleWebhook({ event, ctPayments, processed });
  await handleWebhook({ event, ctPayments, processed });   // redelivery

  expect(ctPayments.addTransaction).toHaveBeenCalledOnce();
});
```

## A note on not over-testing

The goal is a small suite of behaviors that would each represent a real production incident if broken: the happy path per piece (session minted, Order created once and marked `Ordered`, capture/refund recorded) plus the deviations that bite — IDOR, premature/declined Order, double-create, double-charge, wrong-API, webhook redelivery. That's roughly a dozen tests, and they're worth keeping forever. The happy path earns its place precisely because it's load-bearing: it's the one a broad refactor is most likely to break without any error test noticing. Resist mirroring every line of orchestration into an assertion; tests that pin implementation details (exact header order, internal call counts that aren't about idempotency) make refactoring miserable and tend to get deleted in frustration, taking the valuable tests with them. When in doubt, ask: *"what production bug does this test catch?"* If you can't name one, don't write it.

Once these pass, prove the wiring end to end with the [full-flow integration test](./integration-test.md).

## Checklist

> **Gate: do not proceed to Step 5 (integration test / verification) until every box below is checked and `npm test` exits 0 with no secrets in the environment.**

- [ ] **Vitest installed and `npm test` runs before the first line of implementation** — not after
- [ ] Each backend behavior was written test-first: a failing test, confirmed to fail for the right reason, then the code; no function body existed before its test
- [ ] Outbound boundary (processor, Sessions/Orders API, PSP) is mocked behind a port; orchestration logic is not mocked
- [ ] Happy path pinned per piece: owned cart → session; `Success` → exactly one Order marked `Ordered`; capture/refund recorded
- [ ] BFF: IDOR rejection tested; response asserted to carry no secrets; €0 cart refused
- [ ] Order: gated on a `Success` transaction (async = webhook); declined (`Failure`) payment refused with a clear decline (not a generic 500); idempotent on `orderNumber`; current cart version used
- [ ] Capture/refund/cancel: routed through the processor with the Payment Intents API asserted untouched; capture idempotent by `interactionId`
- [ ] Webhook: idempotent on redelivery; signature verification enforced before any state change; opens the Order gate
- [ ] `npm test` exits 0 with no deployment/secrets in the environment (those belong to the integration test)
