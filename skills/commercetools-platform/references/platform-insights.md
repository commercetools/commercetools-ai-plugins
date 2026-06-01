# Platform Insights — API Observability

**Sources:** Platform Insights: Technical Introduction deck + ES-Platform Insights Setup & Testing guide (Expert Services, 2026)

Platform Insights is commercetools' native observability feature that forwards server-side API metrics and access logs from the Composable Commerce platform directly to an external APM tool. Zero code changes or SDK modifications are required — configuration is entirely via the `/insights-configuration` API endpoint.

**Status as of Q1 2026:** Public Beta. Will become a Premium paid feature at GA. Pricing as of March 2026: ~1000 EUR/month including 5 projects; additional projects in increments of 5. Confirm pricing with CSM.

---

## Available Metrics

Five metrics are available in your APM once configured:

| Metric | Type | Description |
|--------|------|-------------|
| `ct_time_sec` | Histogram | Average request processing time in seconds (request to first byte of response) |
| `ct_response_count` | Counter | Number of responses from commercetools for all API calls |
| `ct_sent_bytes` | Counter | Bytes sent from commercetools to end users (response size) |
| `ct_received_bytes` | Counter | Bytes received by commercetools from end users (request size) |
| `ct_error_count` | Counter | Requests that returned 4xx or 5xx HTTP status codes |

All metrics can be faceted (filtered/grouped) by:
- `endpoint` — e.g., `POST /{project-key}/carts`
- `http_status` — e.g., `200`, `400`, `500`
- `http_method` — e.g., `GET`, `POST`
- `project_key`

---

## Available Logs

When log forwarding is enabled (`"eventTypes": ["Logs"]`), each API request generates a JSON log entry:

```json
{
  "correlation_id": "my-project-key-a50e5bec-9ac4-4967-be91-dee8ed9e087a",
  "ctp_api_endpoint": "POST /<project-key>/product-types",
  "ctp_client_id": "myclientid",
  "ctp_http_endpoint": "/<project-key>/product-types",
  "ctp_project_key": "my-project-key",
  "duration": 0.111,
  "http_method": "POST",
  "http_status": 201,
  "http_uri": "/my-project-key/product-types",
  "http_sent_bytes": 920,
  "http_received_bytes": 516,
  "http_remote": "10.10.10.10",
  "message": "POST /my-project-key/product-types 201",
  "timestamp": 1764321656452
}
```

**Known issue (as of February 2026):** Log forwarding is not working reliably. After a verified configuration with both `"Metrics"` and `"Logs"` enabled for 2+ weeks, only API key validation heartbeat messages appeared in the APM — no detailed access logs. A support ticket was raised on 2026-02-17. **Until resolved, configure with `"eventTypes": ["Metrics"]` only.**

---

## Supported APM Providers

| Provider | Regions/Modes |
|----------|---------------|
| New Relic | US, EU |
| Datadog | US1, US3, US5, EU1, US1-FED, AP1 |
| Dynatrace | SaaS and ActiveGate |
| OpenTelemetry | OTLP and OTLP HTTP |

If your APM isn't on this list, use the OpenTelemetry option with a self-hosted OpenTelemetry collector that forwards to your APM.

Multiple providers can be configured simultaneously using `POST` to `/insights-configuration` (instead of `PUT`, which replaces the current config).

---

## Configuration

### Step 1 — Request access

Contact your commercetools CSM to enable Platform Insights for your project.

### Step 2 — Generate APM API keys

Obtain an ingest key from your APM provider (New Relic License Key, Datadog API Key, etc.).

### Step 3 — Configure via API

`PUT` (single provider) or `POST` (multiple providers) to the `/insights-configuration` endpoint:

```bash
curl -X PUT \
  'https://api.{region}.commercetools.com/{project-key}/insights-configuration' \
  -H 'Authorization: Bearer {token}' \
  -H 'Content-Type: application/json' \
  -d '{
    "providers": [{
      "type": "NewRelic",
      "region": "us",
      "apiKey": "your-newrelic-license-key",
      "eventTypes": ["Metrics"]
    }]
  }'
```

Start with `"eventTypes": ["Metrics"]` only (see Known Issues above for logs). After confirming metrics flow, add `"Logs"` if needed.

---

## Sample New Relic (NRQL) Queries

### Performance and usage overview — P90/P95/P99 + error rate by endpoint

```sql
FROM Metric
SELECT
    percentile(ct_time_sec, 90) AS 'P90 (s)',
    percentile(ct_time_sec, 95) AS 'P95 (s)',
    percentile(ct_time_sec, 99) AS 'P99 (s)',
    sum(ct_response_count) AS 'Responses',
    (sum(ct_error_count)/sum(ct_response_count))*100 AS 'Error rate %'
FACET endpoint
```

### Request throughput by endpoint (time series)

```sql
FROM Metric SELECT rate(sum(ct_response_count), 1 minute) AS 'Requests per second'
FACET endpoint
TIMESERIES 1 minute
SINCE 1 hour ago
```

### Latency distribution

```sql
FROM Metric SELECT percentile(ct_time_sec, 90, 95, 99) FACET endpoint
```

### Error rate percent by endpoint

```sql
FROM Metric SELECT (sum(ct_error_count) / sum(ct_response_count)) * 100 AS 'Error Rate %'
FACET endpoint
SINCE 30 minutes ago
LIMIT 20
```

### Data transfer volume

```sql
FROM Metric
SELECT
    sum(ct_response_count) AS 'Total Requests',
    sum(ct_sent_bytes) AS 'Sent Bytes',
    sum(ct_received_bytes) AS 'Received Bytes'
WHERE metricName IN ('ct_sent_bytes', 'ct_received_bytes', 'ct_response_count')
FACET endpoint
SINCE 30 minutes ago
LIMIT 10
```

---

## Best Practices

### Configuration

- **Start with metrics only.** Validate data is flowing before enabling logs. Use `"eventTypes": ["Metrics"]` initially.
- **Wait 15 minutes after configuration changes.** Platform Insights propagation is eventually consistent — give it time before assuming a configuration isn't working.
- **Generate test traffic after setup.** Make a few API calls to your project and verify metrics appear in your APM within ~15 minutes.

### Data volume and cost

- **Logs generate significantly more data than metrics.** Evaluate APM ingest costs before enabling `"Logs"` for high-traffic projects.
- **High-traffic projects** should start with metrics-only and selectively enable logs only for critical endpoints.
- **Use APM-side filtering** to focus on the endpoints that matter and reduce noise in dashboards.

### Implementation sequence

1. Enable with `"eventTypes": ["Metrics"]` only
2. Build dashboards and confirm metric data quality
3. Define which specific endpoints need detailed log analysis
4. Enable logs after confirming metrics provide value
5. Set up SLA-based alerts using the metric queries above
