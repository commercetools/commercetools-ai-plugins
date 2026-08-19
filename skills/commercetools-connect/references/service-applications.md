---
name: service-applications
description: Build production-ready service (API extension) Connect applications. Covers authenticated extension registration, trigger conditions, the extension timeout budget, fail-open vs fail-closed, outbound timeout budgeting, hot-path work minimization, and the success/validation/update-action response format.
when_to_use:
  - "Registering an API extension to validate or modify a cart or order at checkout"
  - "Deciding fail-open vs fail-closed when an external dependency is down"
  - "Setting an outbound timeout budget under the extension response limit"
  - "Skipping redundant external calls on the synchronous hot path"
  - "Returning the correct success, validation-error, or update-action response"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - service
    - api-extensions
---

# Service Applications (HTTP Endpoints)

**Impact: CRITICAL — A `service` app is a public HTTP endpoint. In its API-Extension mode its latency is added to every cart/checkout call and its downtime can block them. In its inbound-webhook mode it writes to commercetools on a caller's behalf. Either way, an unauthenticated endpoint is a security hole.**

A `service` application is an HTTP endpoint Connect exposes (5-minute request timeout, autoscaled). It runs in one of **two modes** — decide which before building:

- **API Extension** (commercetools → you): registered as an [API Extension](https://docs.commercetools.com/api/projects/api-extensions.md) in `postDeploy`, commercetools calls it *synchronously* after processing a create/update but **before persistence**; it can validate (reject) or return up to 100 update actions. This mode carries the strict 2 s/10 s response limit. → Patterns 1–6.
- **Inbound webhook / API** (external system → commercetools): an external system calls it to push data *into* commercetools; you authenticate the caller, validate the payload, and write to commercetools via the SDK yourself. **No Extension is registered**, and the 2 s/10 s limit does **not** apply — the 5-min service timeout does. → Pattern 7.


## Table of Contents
- [Contract facts (verified)](#contract-facts-verified)
- [Pattern 1: Authenticate the extension destination](#pattern-1-authenticate-the-extension-destination)
- [Pattern 2: Trigger conditions — don't fire when you can't act](#pattern-2-trigger-conditions--dont-fire-when-you-cant-act)
- [Pattern 3: Timeout budget](#pattern-3-timeout-budget)
- [Pattern 4: Fail-open vs fail-closed](#pattern-4-fail-open-vs-fail-closed)
- [Pattern 5: Minimize work on the hot path](#pattern-5-minimize-work-on-the-hot-path)
- [Pattern 6: Response format](#pattern-6-response-format)
- [Pattern 7: Inbound webhook mode (external system → commercetools)](#pattern-7-inbound-webhook-mode-external-system--commercetools)
- [Checklist](#checklist)

---

## Contract facts (verified)

> Patterns 1–6 below are the **API Extension** mode. For the **inbound webhook** mode, jump to [Pattern 7](#pattern-7-inbound-webhook-mode-external-system--commercetools) — the timeout and response-format facts here are extension-specific and do not apply to it.

From [API Extensions](https://docs.commercetools.com/api/projects/api-extensions.md):

- **Timeouts:** connection limit **1 s**; response limit **2 s default**, configurable via `timeoutInMs` up to **10 s** (higher needs a per-project performance review). Aim to respond fast — ~50 ms for simple validation.
- **Coupling:** "If it fails or takes a second longer to return, the whole API call fails or takes a second longer." Applied to *all* clients, including the Merchant Center.
- **Extensible resources:** carts, orders, payments, payment-methods, customers, customer-groups, quote-requests, staged-quotes, quotes, business-units, shopping-lists. Max **25 extensions per project**.
- **Response:** HTTP destination returns `200`/`201` for success (empty body or update actions), `400` with an `errors` array for validation failure. Any other status = failure to respond.
- **Headers in:** `X-Correlation-ID` is provided and echoed to the original API caller — log it. `Authorization` / `x-functions-key` set if you configured destination auth.
- **`additionalContext.includeOldResource: true`** adds `oldResource` to Update payloads (not Create) — use it to diff what changed.

> Note: the Connect *service* request timeout (5 minutes) and autoscaling are separate platform facts; the binding constraint for an extension is the **2 s / 10 s extension response limit**, not 5 minutes.

## Pattern 1: Authenticate the extension destination

The endpoint is publicly reachable. It must be authenticated both at registration *and* validated in-app.

**INCORRECT — open HTTP destination, no in-app check:**
```typescript
await apiRoot.extensions().post({ body: {
  key, destination: { type: 'HTTP', url: serviceUrl },   // no authentication block
  triggers: [...],
}}).execute();
```
*Why this fails:* anyone who learns the URL can POST forged carts/orders and drive your external calls or update actions. The endpoint is open to the internet.

**CORRECT — set destination authentication and verify it in the handler:**
```typescript
// registration (post-deploy)
await apiRoot.extensions().post({ body: {
  key,
  destination: {
    type: 'HTTP',
    url: serviceUrl,
    authentication: { type: 'AuthorizationHeader', headerValue: `Bearer ${sharedSecret}` },
  },
  triggers: [...],
}}).execute();
```
```typescript
// handler: reject anything without the expected secret
function assertAuthorized(req: Request) {
  if (req.get('authorization') !== `Bearer ${readConfiguration().extensionSecret}`) {
    throw new Unauthorized();
  }
}
```
For Azure Functions destinations use `{ type: 'AzureFunctions', key }` (sets `x-functions-key`); for Google Cloud Functions prefer the dedicated `GoogleCloudFunction` destination with IAM (verified: [API Extensions — destinations](https://docs.commercetools.com/api/projects/api-extensions.md)). Store the secret in `securedConfiguration` — see [security.md](./security.md).

## Pattern 2: Trigger conditions — don't fire when you can't act

A trigger `condition` (a query predicate) keeps the extension from being invoked on resources it can't process yet — saving latency on every skipped call.

```typescript
triggers: [{
  resourceTypeId: 'cart',
  actions: ['Create', 'Update'],
  condition: 'shippingAddress is defined AND lineItems is not empty',
}]
```

## Pattern 3: Timeout budget

Your outbound calls must finish inside the extension response limit, with margin.

**INCORRECT:** call the external API with no timeout and hope it returns within 2 s.
*Why this fails:* a slow third party blows the response limit; commercetools times the extension out and the cart/checkout call fails regardless of your fail-mode intent.

**CORRECT — budget explicitly and abort:**
```typescript
const controller = new AbortController();
const t = setTimeout(() => controller.abort(), 1500);   // < the 2s extension limit, leaving margin
try {
  const res = await fetch(externalUrl, { signal: controller.signal });
  // ...
} finally { clearTimeout(t); }
```
If your real work can't fit in ~1.5 s, raise `timeoutInMs` (up to 10 s) deliberately — but a longer extension timeout means a slower checkout for every customer. Consider moving the work to an `event` app instead.

**Connect the failure signature to the cause before reaching for a code fix.** An extension that intermittently blows the response limit and then **succeeds on an immediate retry with no other change** is usually a cold start in a scale-to-zero backing service, not a code bug. Match the fix to the cause — they are different fixes:

- **Cold start.** A `sandbox` deployment needs ~15 s to boot after idling ([deployment-installation.md](./deployment-installation.md), Pattern 2), which is *above* the 10 s `timeoutInMs` ceiling — so raising the timeout cannot cover it. The fixes are a `production` deployment (warmed instances, no scale-to-zero) or keeping the service warm with a periodic ping.
- **Genuinely slow dependency work** that fits under 10 s. Here raising `timeoutInMs` from the 2 s default is the right first move — a one-line update (`setTimeoutInMs`) with no redeploy — before adding client-side retry logic. Allow up to a minute for the change to take effect.

## Pattern 4: Fail-open vs fail-closed

When the external dependency is down or times out, you must have *decided* what happens — and documented it.

- **Fail-open:** on error, return success with no update actions so the cart/order proceeds (possibly without your enrichment). Right when the operation must not be blocked (e.g. optional enrichment, non-blocking validation).
- **Fail-closed:** on error, return a `400` so the operation is rejected. Right only when proceeding would be incorrect or unsafe (e.g. compliance validation that must hold).

**INCORRECT — fail-closed by accident:**
```typescript
catch (error) { return { statusCode: 400, error: error.message }; }   // any outage blocks ALL carts
```
*Why this fails:* a third-party tax outage blocks every cart update and checkout, with no deliberate decision and no documentation. Whatever you choose, choose it on purpose.

**CORRECT — explicit, logged decision:**
```typescript
catch (err) {
  logger.error({ correlationId, err }, 'external dependency failed');
  if (FAIL_OPEN) return res.status(200).end();          // proceed without enrichment
  return res.status(400).json({ errors: [{ code: 'InvalidOperation', message: 'validation unavailable' }] });
}
```
Record the stance in the connector README (see [deployment-installation.md](./deployment-installation.md)).

**Classify the dependency's error before mapping it to a response code.** Fail-open vs fail-closed answers "what do we do when the dependency is *down*" — it does not cover the dependency rejecting a specific, legitimately invalid input. A `4xx` from the provider means *this cart will never succeed* and is an actionable, fixable problem; a `5xx`/timeout/connection error means *try again later*. Collapsing both into one response hides the former behind an outage-looking failure, and applying the fail-open stance to a `4xx` silently ships a cart with no tax on it forever.

```typescript
catch (err) {
  // `err` is `unknown` under strict TS — narrow before reading anything off it.
  const e = err as { status?: number; statusCode?: number };
  const status = e.status ?? e.statusCode;                   // shape varies — see below

  // Bad input = this cart will never succeed. 401/403 (misconfigured credentials)
  // and 408/429 (retryable) are 4xx but belong in the outage branch.
  const isBadInput =
    typeof status === 'number' && status >= 400 && status < 500 &&
    ![401, 403, 408, 429].includes(status);

  if (isBadInput) {
    logger.warn({ correlationId, status, err }, 'external dependency rejected the input');
    // Fixed message: the provider's own text reaches the API caller, so don't echo it.
    return res.status(400).json({ errors: [{ code: 'InvalidInput', message: 'validation failed' }] });
  }

  if (status === undefined) {
    // Not a real outage — this dependency's error shape doesn't match the read above.
    logger.error({ correlationId, err }, 'could not resolve a status from the dependency error');
  }
  logger.error({ correlationId, status, err }, 'external dependency unavailable');
  if (FAIL_OPEN) return res.status(200).end();
  return res.status(400).json({ errors: [{ code: 'InvalidOperation', message: 'validation unavailable' }] });
}
```

The `errors[].code` must be one of the [defined error codes](https://docs.commercetools.com/api/errors.md) — docs name `InvalidInput` and `InvalidOperation` for a [failed Extension validation](https://docs.commercetools.com/api/projects/api-extensions.md#validation-failed). Don't reach for `General`: it's the generic **500** code, not a 400 one.

**A repeated 401/403 is not transient.** It sits in the outage branch because retrying is the right immediate behaviour, but under `FAIL_OPEN` that quietly ships every cart without your enrichment for as long as the credential stays broken. Alert on sustained 401/403 separately from genuine timeouts.

**Don't assume one provider shapes its errors consistently across its own surface.** The same provider can reject with a typed `Error` carrying `.statusCode` on one method, a plain `{status, error, detail}` object on another, and a `200`-shaped body with the failure embedded in a field on a third. Check the actual error shape of each SDK method you depend on rather than reusing a check that worked for a different call — a `status` read that comes back `undefined` silently routes every rejection down the outage branch.

## Pattern 5: Minimize work on the hot path

The extension fires on every matching create/update. Skip the expensive external call when nothing relevant changed.

```typescript
const hash = hashTaxRelevantFields(cart);                 // address, line items, quantities…
if (hash === cart.custom?.fields?.lastHash && cart.taxedPrice) {
  return res.status(200).end();                           // nothing changed → no external call, no actions
}
const actions = await computeAndBuildActions(cart);
actions.push(setHashAction(hash));                        // store the new hash for next time
return res.status(200).json({ actions });
```

## Pattern 6: Response format

(verified: [API Extensions — Response](https://docs.commercetools.com/api/projects/api-extensions.md))

- **Success, no changes:** `200`/`201`, empty body (or empty `actions`).
- **Updates:** `200`/`201` with `{ "actions": [ ... ] }` — up to 100 actions, each a valid update action for that resource type. Return well-formed, domain-correct actions (e.g. for external tax on a cart: `changeTaxMode` → `ExternalAmount`, then `setLineItemTaxAmount` / `setCartTotalTax`).
- **Validation failure:** `400` with `{ "errors": [{ "code": "InvalidInput", "message": "..." }] }` — `code` must be a [known error code](https://docs.commercetools.com/api/errors); optional `localizedMessage`, `extensionExtraInfo`.

## Pattern 7: Inbound webhook mode (external system → commercetools)

Use this mode when an external system pushes data *into* commercetools as it changes (e.g. "a product is updated in system A → upsert it into commercetools"). The `service` app is a plain HTTP endpoint the external system calls; you do **not** register an API Extension, and the 2 s/10 s extension limit does not apply (the 5-min Connect service timeout does). For *scheduled* sync (poll system A on a timer) use a `job` instead — see [job-applications.md](./job-applications.md).

The discipline is different from an extension — you own the whole write:

1. **Authenticate the caller.** The endpoint is public; validate a shared secret or a full JWT on every request (see [security.md](./security.md)). This is not optional just because commercetools isn't the caller.
2. **Validate the payload** before trusting it; reject malformed input with a 4xx.
3. **Write idempotently.** The same update may be delivered twice (most senders retry). Upsert by a stable key, don't blind-create.
4. **Return a status the caller can act on** — 2xx on success, 4xx on bad input, 5xx on a transient failure so the sender retries.

**INCORRECT — blind create on every call, no idempotency:**
```typescript
router.post('/products', async (req, res) => {
  await apiRoot.products().post({ body: toProductDraft(req.body) }).execute();  // duplicates on retry
  res.status(201).end();
});
```
*Why this fails:* the sender retries on timeout/5xx, and a second delivery creates a duplicate product (or 409s on a duplicate key with no recovery).

**CORRECT — authenticate, then upsert by key:**
```typescript
router.post('/products', verifyInbound, async (req, res) => {
  const draft = toProductDraft(validatePayload(req.body));   // 400 on invalid
  try {
    const existing = await getProductByKey(draft.key);       // stable external key
    if (existing) {
      await apiRoot.products().withKey({ key: draft.key })
        .post({ body: { version: existing.version, actions: diffToActions(existing, draft) } }).execute();
    } else {
      await apiRoot.products().post({ body: draft }).execute();
    }
    res.status(200).json({ key: draft.key });
  } catch (err) {
    if (isVersionConflict(err)) return res.status(409).end();   // sender may retry; you re-read & re-apply
    logger.error({ correlationId, err }, 'inbound upsert failed');
    res.status(503).end();                                       // transient → let the sender retry
  }
});
```
Map the external model to the commercetools draft in `shared/src/mappers` ([project-structure.md](./project-structure.md)). Use the external system's stable identifier as the commercetools `key` so upserts are deterministic. Consider the [Import API](https://docs.commercetools.com/api/import-export/overview) for high-volume bulk loads instead of one call per item.

---

## Checklist

**API Extension mode (Patterns 1–6):**
- [ ] Destination registered with `AuthorizationHeader` (or `AzureFunctions`) auth, and the secret validated in-app
- [ ] Trigger `condition` set so the extension only fires when it can actually act
- [ ] Outbound calls have an explicit timeout under the extension response limit; `timeoutInMs` set deliberately if >2 s
- [ ] Fail-open vs fail-closed decided per use case and documented in the README
- [ ] The dependency's `4xx` (bad input — actionable) branched separately from its `5xx`/timeout (outage — retryable), against that SDK method's real error shape
- [ ] Hot-path work skipped when relevant inputs are unchanged (hash/signature compare)
- [ ] Responses use the correct format: 200/201 (+ actions) or 400 (+ errors with valid codes)

**Inbound webhook mode (Pattern 7):**
- [ ] Caller authenticated (shared secret or full JWT) on every request
- [ ] Payload validated; malformed input rejected with 4xx
- [ ] Write is idempotent — upsert by a stable key, never blind-create; version conflicts handled
- [ ] Status codes let the sender retry safely (2xx / 4xx / 5xx); Import API considered for bulk

**Both modes:**
- [ ] `X-Correlation-ID` (or your own correlation key) logged on every line → [observability-operations.md](./observability-operations.md)

**Next:** [lifecycle-scripts.md](./lifecycle-scripts.md) · [security.md](./security.md) · [testing.md](./testing.md)
