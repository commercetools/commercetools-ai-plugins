---
name: security
description: Security baseline for Connect applications — authenticated inbound endpoints (extension destination auth + in-app validation, full JWT validation on webhooks), least-privilege commercetools scopes via inheritAs.apiClient.scopes, secrets in securedConfiguration, and error hygiene that hides stack traces in production.
when_to_use:
  - "Securing an inbound endpoint (API extension or external webhook)"
  - "Validating a JWT (signature, issuer, audience, subject, expiry, algorithm)"
  - "Choosing least-privilege commercetools scopes for a connector"
  - "Deciding standardConfiguration vs securedConfiguration for a value"
  - "Making error responses safe (no stack traces or secrets)"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - security
---

# Security

**Impact: CRITICAL — Connect endpoints are internet-reachable and connectors hold privileged API credentials. An unauthenticated endpoint, an over-scoped client, or a leaked secret turns a connector into an attack surface.**

## Table of Contents
- [Pattern 1: Authenticate every inbound endpoint](#pattern-1-authenticate-every-inbound-endpoint)
- [Pattern 2: Validate JWTs fully](#pattern-2-validate-jwts-fully)
- [Pattern 3: Least-privilege commercetools scopes](#pattern-3-least-privilege-commercetools-scopes)
- [Pattern 4: Secrets in securedConfiguration](#pattern-4-secrets-in-securedconfiguration)
- [Pattern 5: Error hygiene](#pattern-5-error-hygiene)
- [Checklist](#checklist)

---

## Pattern 1: Authenticate every inbound endpoint

Two kinds of inbound endpoint, both must be authenticated:

1. **API extension endpoint** — called by commercetools. Register destination auth *and* verify it in-app (see [service-applications.md](./service-applications.md), Pattern 1). commercetools sends the `Authorization` header (or `x-functions-key`) you configured.
2. **External webhook endpoint** — called by a third-party system pushing events to your connector. Authenticate with a full JWT or a shared secret the external system signs.

**INCORRECT — an "internal" route left open:**
```typescript
serviceRouter.post('/', handleExtension);          // no auth middleware
serviceRouter.use(['/admin'], verifyJWT);          // auth only on a different route
```
*Why this fails:* the highest-value route — the one that drives external calls and update actions — is reachable by anyone. Auth must cover the endpoint that actually does the work.

**CORRECT — authenticate the work endpoint; leave only `/status` open:**
```typescript
router.get('/status', statusHandler);              // liveness only, no secrets
router.post('/', verifyInbound, handler);          // every processing route authenticated
```

## Pattern 2: Validate JWTs fully

For webhook endpoints secured by JWT, verify **every** claim — a partial check is a bypass.

**INCORRECT — decode without verifying:**
```typescript
const { payload } = jwt.decode(token, { complete: true });   // decode ≠ verify; signature unchecked
if (payload.iss === expectedIssuer) next();                   // trivially forged
```
*Why this fails:* `decode` does not check the signature; an attacker forges any payload. Accepting `alg: none` or an unverified signature is a full auth bypass.

**CORRECT — verify signature, issuer, audience, subject, expiry, and pin the algorithm:**
```typescript
import { verify } from 'jsonwebtoken';
const payload = verify(token, secret, {
  algorithms: ['HS256'],        // pin; never allow 'none' or caller-chosen alg
  issuer: cfg.jwtIssuer,
  audience: cfg.jwtAudience,
  subject: cfg.jwtSubject,
  ignoreExpiration: false,
});
```

## Pattern 3: Least-privilege commercetools scopes

Grant only the scopes the apps use. The modern mechanism is platform-generated API clients via `inheritAs.apiClient.scopes` (verified: [modify connector](https://docs.commercetools.com/connect/modify-connector.md)):

```yaml
inheritAs:
  apiClient:
    scopes:
      - manage_orders
      - manage_subscriptions   # only if an event app uses Subscriptions
      - manage_extensions      # only if a service app uses API Extensions
```
At install time the platform generates an API client scoped to exactly these and injects `CTP_CLIENT_ID`/`CTP_CLIENT_SECRET`/`CTP_SCOPE`/`CTP_PROJECT_KEY`/`CTP_API_URL`/`CTP_AUTH_URL` — "no more and no less" than needed. Do **not** also declare those CTP credential keys in `configuration` when using auto-generation; they're provided at runtime.

**INCORRECT:** instruct installers to create an admin / `manage_project` API client.
*Why this fails:* a leaked or misused connector credential then has full project access. Scope to the specific resources.

If you must accept pre-created credentials instead of auto-generation, still document the minimal scope set the connector needs (e.g. `manage_orders view_products`), never "admin".

## Pattern 4: Secrets in securedConfiguration

Anything sensitive goes in `securedConfiguration` (write-only, not echoed back), never `standardConfiguration`, never hardcoded.

| Value | Where |
|---|---|
| External API keys, passwords, connection strings | `securedConfiguration` |
| JWT shared secret | `securedConfiguration` |
| Pre-created `CTP_CLIENT_ID`/`CTP_CLIENT_SECRET`/`CTP_SCOPE` (if not auto-generated) | `securedConfiguration` |
| Region, project key, feature flags, non-secret defaults | `standardConfiguration` |

Secrets are encrypted at rest by the platform and surfaced as env vars; read them through validated config ([project-structure.md](./project-structure.md), Pattern 3). Never log secret values.

## Pattern 5: Error hygiene

Error responses and logs must not leak stack traces, secrets, or internals to callers.

**CORRECT — generic message in production, detail only in development:**
```typescript
export const errorMiddleware = (err, _req, res, _next) => {
  const dev = process.env.NODE_ENV === 'development';
  if (err instanceof CustomError) {
    return res.status(err.statusCode).json({ message: err.message, ...(dev && { stack: err.stack }) });
  }
  res.status(500).json({ message: dev ? String(err) : 'Internal server error' });
};
```

---

## Checklist
- [ ] Every processing endpoint authenticated (extension destination auth + in-app check; webhooks via full JWT/secret); only `/status` is open
- [ ] JWT validation checks signature, issuer, audience, subject, expiry, and pins the algorithm (no `alg: none`)
- [ ] Scopes are least-privilege via `inheritAs.apiClient.scopes` (or a documented minimal set) — never admin/`manage_project`
- [ ] All secrets in `securedConfiguration`; none hardcoded or in `standardConfiguration`; secrets never logged
- [ ] Error responses hide stack traces and internals in production
- [ ] Request bodies/PII not logged; only identifiers and correlation keys

**Next:** [testing.md](./testing.md) · [observability-operations.md](./observability-operations.md)
