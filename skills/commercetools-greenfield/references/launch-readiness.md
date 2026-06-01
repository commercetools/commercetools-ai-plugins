# Launch Readiness Review

**Source:** Launch Readiness Review deck (Customer Success Engineering, commercetools)

---

## Overview

The Launch Readiness Review (LRR) is a structured Expert Services engagement that analyzes a commercetools implementation before go-live to identify blocking or critical issues and provide mitigation strategies. It is **not** an architectural review or security audit — it is a focused analysis of data model quality, integration patterns, API usage, and operational readiness.

---

## LRR Process

The engagement follows a defined sequence:

| Phase | Activities |
|-------|-----------|
| **Kickoff** | High-level project review; agree on testing/launch timeline, workplan, analysis process, meeting schedule; exchange project and staff access |
| **Discovery — Schema** | In-depth review of data models, customizations (types, product types, custom fields), and business logic patterns; identify schema anti-patterns |
| **Discovery — Traffic Analysis** | In-depth review of API traffic patterns (endpoint mix, error rates, latency, rate limit headroom); identify anti-patterns and performance risks |
| **Findings Review Meeting** | Present findings; discuss recommendations; working session to collaborate on remediation steps |
| **Conclusion** | Final report with recommendations, next steps, and prioritized remediation backlog |

---

## What the LRR Reviews

### Data Model Review

- **Product catalog:** product type design, attribute modeling, variant structure, category hierarchy
- **Customer and checkout:** customer profile fields, cart configuration, custom types on orders/carts
- **Business and process modeling:** discount structures, shipping method configuration, tax categories
- Checks for **schema anti-patterns** — e.g., over-use of custom objects where proper resources exist, missing `key` fields on resources that need them for sync, overly flat vs. overly nested product types

### Integration Review

- **Synchronous processes:** API Extensions — timeout risk, error handling, fallback behavior
- **Asynchronous processes:** Subscriptions — delivery guarantees, idempotency, queue configuration
- Common integration anti-patterns: polling without cursor (missing events), missing retry logic, synchronous calls to slow downstream systems inside an extension

### API Usage and Performance Review

- **API traffic analysis:** endpoint distribution, error rate by endpoint, latency percentiles (P90/P95/P99)
- **Rate limits:** headroom vs. peak projections; any endpoints near quota ceiling (see `rate-limits.md`)
- **Best practice compliance:** pagination strategy (offset vs. cursor), `Accept-Encoding: gzip` usage, GraphQL vs REST selection
- **Search usage:** search API query patterns, filter complexity, search index freshness
- **Anti-patterns and errors:** repeated `409 Conflict` (concurrency issues), `400 Bad Request` spikes (client-side errors), over-fetching (large `limit` with unused fields)

### New Business Case and Roadmap Review

- Upcoming feature adoptions and new business initiatives that may impact platform design
- Identify areas where the current data model will need to evolve and plan ahead

---

## LRR Deliverables

- API KPI detailed analysis (endpoint-level latency, error rate, throughput)
- Process refinement recommendations
- Process documentation
- Schema refinement recommendations
- Feature roadmap adoption plan

---

## Pre-Launch Checklist

Use this as a self-assessment before go-live or before requesting an LRR engagement.

### Data Model

- [ ] All product types reviewed and finalized — no placeholder or test attributes in production
- [ ] `key` fields set on all resources that will be synced or referenced across environments (product types, types, tax categories, shipping methods, channels, stores)
- [ ] Custom types validated — field definitions match actual usage; no orphaned fields
- [ ] Category tree finalized and imported
- [ ] Prices and standalone prices validated for all active locales and currencies
- [ ] Tax categories configured for all required regions

### API Client and Security

- [ ] Production API clients scoped to minimum required permissions (no `manage_project` in production integrations)
- [ ] API client credentials stored in secrets manager (not in environment config files or source code)
- [ ] Frontend/BFF uses narrow-scoped tokens; no write tokens exposed to browser
- [ ] Password flow protected by rate limiting and CAPTCHA in BFF (CT does not protect this natively)

### Performance and Rate Limits

- [ ] Load test completed against a staging environment with production-representative traffic volume
- [ ] Peak RPS estimate documented and compared to CT rate limits
- [ ] Rate limit increase requested (if needed) — minimum 2 weeks before go-live
- [ ] `Accept-Encoding: gzip` sent on all list queries
- [ ] Pagination uses cursor/sort+ID pattern for any datasets over 10,000 records
- [ ] API Extension p99 response time under 1.5 seconds in load test

### Integrations

- [ ] All API Extensions tested under load; timeout headroom confirmed (2-second hard limit for sync extensions)
- [ ] Subscriptions tested end-to-end (message delivery, handler processing, dead-letter queue)
- [ ] Subscription handlers are idempotent (tested with duplicate message delivery)
- [ ] Retry logic with exponential backoff implemented for all CT API calls
- [ ] `409 Conflict` recovery implemented (re-read + re-apply + retry)

### Monitoring and Observability

- [ ] Platform Insights configured (or alternative APM integration in place)
- [ ] Alert on `X-RateLimit-Remaining` dropping below 20%
- [ ] Alert on CT API error rate above threshold
- [ ] Correlation IDs (`X-Correlation-ID`) logged alongside every CT API call
- [ ] Runbook documented for production incident response

### Rollback Plan

- [ ] Rollback criteria defined (what triggers a rollback decision and who decides)
- [ ] Rollback procedure documented (e.g., DNS cutover back to incumbent, cache invalidation)
- [ ] Data consistency plan for orders placed during a partial rollback window
- [ ] CT support notified of go-live date and rollback plan

---

## Load Testing Approach

### What to test

- Simulate the expected peak RPS for each endpoint mix (browse, search, add-to-cart, checkout, order placement)
- Test your API Extensions at peak load — this is the most common performance failure point
- Test subscription handler throughput — can your queue consumers keep up with CT message delivery rate at peak order volume?

### How to structure the test

1. **Baseline:** run at 50% of expected peak for 30 minutes — establish clean baseline metrics
2. **Ramp:** increase to 100% peak RPS over 10 minutes
3. **Sustained peak:** hold at peak for at least 30 minutes
4. **Spike:** briefly push to 150% of peak to verify graceful degradation

### CT rate limit considerations during load testing

- Load test against your **staging project**, not production
- Staging projects share the same rate limit structure as production projects — do not assume staging is unlimited
- If your load test will exceed normal rate limits, request a temporary increase from CT support in advance
- Monitor `X-RateLimit-Limit` and `X-RateLimit-Remaining` response headers throughout the test

### Pass/fail criteria

| Metric | Pass |
|--------|------|
| CT API error rate (5xx) | < 0.1% |
| P99 cart creation latency | < 2 seconds |
| P99 API Extension response time | < 1.5 seconds |
| Rate limit headroom at peak | > 20% remaining |
| No `429 Too Many Requests` errors | Zero |

---

## Cache Warming

For product catalog data served via CDN or application cache:

- **Warm the cache before go-live** — do not rely on organic traffic to populate caches on launch day
- Script a crawl of all public-facing category and product detail pages using your staging/pre-prod environment before the DNS switch
- Pre-populate any in-process caches (Redis, Memcached) with high-traffic product and category data
- Verify cache hit rate in your CDN before opening traffic

---

## Common Launch Failures

| Failure Mode | Root Cause | Prevention |
|--------------|------------|------------|
| API Extension timeout at launch | Extension p99 latency fine in dev but exceeds 2s at production traffic | Load test extensions at production RPS; add pre-call cache for slow lookups |
| Rate limit exhaustion during traffic spike | Checkout + marketing email send triggered simultaneously | Request rate limit increase; implement request queuing and backoff |
| Stale prices at launch | Price import incomplete or cache not invalidated | Validate all price records before cutover; flush caches after import completes |
| Missing orders post-cutover | Subscription handler not keeping up with order volume; messages backed up | Load test subscription consumers; ensure dead-letter queue and alerting are in place |
| `409 Conflict` storms on cart updates | Concurrent cart updates from multiple browser tabs or retries without re-read | Implement proper `409` recovery (re-read + re-apply + retry); do not retry with same version |
| Customers unable to log in | Password migration incomplete; IDP config not pointed at production | Validate login flow end-to-end before DNS cutover; test with a representative set of migrated accounts |
| Search returning stale results | CT search index not yet synced after bulk product import | Allow adequate time for index to sync after import; verify search results before go-live |
