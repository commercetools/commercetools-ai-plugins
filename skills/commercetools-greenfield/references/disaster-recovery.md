# Disaster Recovery

**Source:** Disaster Recovery deck (Customer Success Engineering, commercetools)

---

## What commercetools Manages vs What You Own

Disaster recovery responsibilities are split between the commercetools platform and the customer's implementation. Understanding the boundary is the first step in designing a resilient system.

| Responsibility | commercetools | Customer |
|----------------|---------------|----------|
| Platform availability (API uptime) | Yes — per SLA | — |
| Data backup and restore | Yes — internal platform operations | — |
| Region failover (within CT infrastructure) | Yes — transparent to customers | — |
| Client-side retry logic | — | Yes |
| Integration resilience (queues, BFF, downstream services) | — | Yes |
| Cart/order data recovery from customer-side failures | — | Yes |
| Secret rotation (API client credentials) | — | Yes |
| DR plan documentation for your application | — | Yes |

---

## commercetools SLA / SLO

- commercetools provides a **99.9% monthly uptime SLA** for the Composable Commerce API (standard contract).
- SLA is measured at the platform API layer — it does not include downtime caused by customer-side integration failures or third-party dependencies.
- Consult your contract and the [commercetools Status Page](https://status.commercetools.com) for current incident history and maintenance windows.
- commercetools performs scheduled maintenance during low-traffic windows; maintenance events are posted to the status page in advance.

**RTO / RPO (platform-managed):**

- commercetools does not publish explicit customer-facing RTO/RPO figures for individual projects in standard agreements. For enterprise SLA commitments with explicit RTO/RPO targets, engage commercetools commercial/legal teams.
- Internal platform backups protect against data loss at the infrastructure level. Customers do not have direct access to platform-level backup/restore.

---

## API Resilience Patterns (Customer Responsibility)

The CT API is highly available, but your integration must handle transient errors gracefully.

### Retry with Exponential Backoff

Always implement retry logic for `5xx` responses and network timeouts. CT returns `503 Service Unavailable` during brief overload conditions.

```
Retry strategy:
  - Retry on: 503, 504, network timeout
  - Do NOT retry on: 400, 401, 403, 404, 409 (conflict — needs re-read)
  - Backoff: exponential with jitter (e.g. 100ms, 200ms, 400ms, 800ms)
  - Max retries: 3–5
  - Max wait: 30 seconds total
```

### Optimistic Concurrency and Conflict Recovery

CT uses version-based optimistic locking. A `409 Conflict` means the resource was modified since you last read it — this is not an error but an expected concurrency signal.

```
On 409:
  1. Re-fetch the resource (GET) to get the current version
  2. Re-apply your intended changes to the fresh state
  3. Retry the update with the new version number
```

Never retry a `409` with the same version number — it will fail again.

### Circuit Breaker

For high-throughput integrations (order processing pipelines, real-time stock lookups), wrap CT API calls in a circuit breaker:

- **Closed:** normal operation, calls pass through
- **Open:** triggered after N consecutive failures; calls fail fast without hitting CT
- **Half-open:** after a timeout, test with a single probe call; reclose if successful

This prevents cascading failures when CT experiences degraded performance.

### Idempotency for Writes

CT API mutations are not natively idempotent (except where an `externalId` or unique key constraint enforces it). Design your write paths to be safe to retry:

- Use `externalId` on customers, orders (from external systems), and other resources to prevent duplicate creation.
- For carts: check whether a cart already exists for the session/customer before creating a new one.
- For payments: reconcile payment state via `interfaceId` before creating a second transaction.

---

## Multi-Region Considerations

commercetools does not provide automatic cross-region failover for customer projects. Each project lives in a single region (e.g., GCP US Central, GCP EU, AWS EU West).

### What this means for your DR plan

- **There is no hot standby in another region** provided by CT by default.
- If your business requires cross-region redundancy, you must architect it at the application layer.
- Cross-region failover strategies used by enterprise customers:

| Strategy | Description | Complexity |
|----------|-------------|------------|
| Active-passive (manual failover) | Second CT project in another region kept in sync via project-sync or Import API; promote to active on DR event | High |
| Read replica via caching layer | CDN/cache layer in front of CT for reads; writes route to primary; cache survives brief CT unavailability | Medium |
| Graceful degradation | Storefront renders cached catalog data; blocks checkout during outage; resumes when CT recovers | Low-Medium |

### Region migration is not a DR feature

Migrating a project from one region to another (e.g., GCP US → GCP EMEA) is a planned, manual operation — not a failover mechanism. See `project-migration.md` for the process.

---

## Incident Response

### Customer-side incident checklist

When a production incident involves commercetools:

1. **Check the CT Status Page** ([status.commercetools.com](https://status.commercetools.com)) — verify if CT itself is experiencing an incident.
2. **Check your API client logs** — confirm whether errors are `5xx` (CT-side) or `4xx` (client-side).
3. **Check rate limit headers** — `X-RateLimit-Remaining` dropping to zero causes `429 Too Many Requests`. This is not a CT outage; it is a quota issue.
4. **Engage commercetools Support** if CT Status Page shows no incident but you are experiencing degraded performance — open a P1 ticket with your project key, correlation IDs, and timestamps.
5. **Activate your degraded-mode flows** (cached catalog, blocked checkout) while the incident is active.
6. **Post-incident:** review correlation IDs from CT API responses to identify which endpoints were affected.

### Correlation IDs

Every CT API response includes a `X-Correlation-ID` header. Log this value alongside every API call. When filing a support ticket, include:

- Project key
- `X-Correlation-ID` values from affected requests
- Timestamp range (UTC)
- Endpoints affected
- HTTP status codes observed

### Contacting CT Support for DR Events

- Standard support SLA: P1 (production down) response within 1 hour for Premium support tier.
- For planned high-traffic events (Black Friday, launches), notify CT support 2+ weeks in advance to pre-coordinate capacity.
- CT support cannot restore individual customer data records — platform-level recovery is handled internally by CT operations.

---

## Key Rules Summary

| Scenario | Action |
|----------|--------|
| Transient `5xx` from CT API | Retry with exponential backoff (max 3–5 retries) |
| `409 Conflict` | Re-read resource, re-apply changes, retry with new version |
| `429 Too Many Requests` | Back off and slow down; request rate limit increase if sustained |
| CT Status Page shows active incident | Activate degraded-mode flows; do not hammer API |
| Need cross-region redundancy | Architect at application layer; CT does not provide automatic cross-region failover |
| Production incident | Collect correlation IDs, open P1 support ticket with project key + timestamps |
