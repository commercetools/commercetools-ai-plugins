---
name: testing
description: Test a Connect application at the router level — the parameterized authorization rejection matrix (including alg none), envelope and ack edge cases, and supertest + msw patterns with mocked outbound HTTP. What to mock and what to assert.
when_to_use:
  - "Writing tests for an API extension or event handler"
  - "Building a parameterized JWT/auth rejection test matrix"
  - "Testing envelope validation and acknowledgement edge cases"
  - "Setting up supertest + msw for router-level tests"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - testing
---

# Testing

**Impact: HIGH — The two failure modes that bite hardest in production (auth bypass and redelivery/loss from wrong status codes) are exactly the ones a router-level test suite catches cheaply. Skipping them ships the bug.**

Run the suite with `commercetools connect application test` (the CLI runs your tests locally; the generated `package.json` also exposes `npm test` / jest). See [connect-cli.md Step 4](./connect-cli.md#step-4-develop-and-test-locally) for the local build/test/start commands. The CLI template seeds a `tests/integration/` spec — grow it, don't delete it.

Test at the **router level**: drive the Express app with `supertest`, mock outbound HTTP (commercetools SDK calls, external APIs) with `msw`, and assert on status code and side effects. This exercises middleware (auth, error handling) and controllers together — where the production-critical behavior lives. **A couple of happy-path tests is not enough** — cover the auth matrix, the envelope/ack edge cases (event) or pure logic + returned actions (service), an idempotency/duplicate test, and idempotent registration (below).

---

## Checklist
- [ ] Parameterized auth rejection matrix covering missing/malformed/`alg:none`/wrong-signature/wrong-issuer/wrong-audience/wrong-subject/expired, plus a valid-token accept case
- [ ] Envelope tests decode the Pub/Sub wrapper (base64 `message.data`) and reject malformed input per the chosen contract → [event-applications.md](./event-applications.md), Pattern 1
- [ ] Ack-contract tests: 2xx for handled/irrelevant, non-2xx for transient failure
- [ ] Idempotency test: same message twice → one side effect
- [ ] Router-level tests use supertest + msw with `onUnhandledRequest: 'error'`
- [ ] Hot-path skip asserted (external call not made when inputs unchanged)
- [ ] Lifecycle scripts tested for idempotency (no delete-then-recreate)

**Next:** [deployment-installation.md](./deployment-installation.md)
