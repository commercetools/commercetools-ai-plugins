# Import API — Performance Tuning

## Loading 15M Records Using Import API — Batch Pattern

This section describes how to design the initial load of 15 million customer records using the Import API to ensure optimal performance.

### Recommended Approach

1. **Create 5 containers of 200,000 operations each.**
2. **Send requests in batches of 20 requests** per container, with a **60-second interval** between each batch request to a container.
   - The 60-second interval is a safe time interval when processing 5 containers concurrently.
   - Running 5 containers in parallel means pushing 100 customers (20 requests × 5 containers) every minute.
   - Continue until each container registers 200,000 requests — totalling **1 million customers** per batch round.
3. **Wait for all 5 containers to complete** (30–40 minutes maximum per container), then send another batch of 5 containers of 200,000 each.
4. **Repeat** until all 15M records are imported.

### Performance Estimates

| Metric | Value |
|--------|-------|
| Container size | 200,000 operations |
| Parallel containers | 5 |
| Batch size per request | 20 |
| Interval between batches | 60 seconds |
| Customers per minute | 100 |
| Time per 1M customers | 30–40 minutes |
| Estimated total time for 15M | 7–9 hours |

> These numbers are suggestive based on current usage and performance metrics. Test in a Dev environment first to plan performance for the production release.

### Coordination Recommendations

- **Test in Dev environment** before running in production to validate the performance plan.
- **Sync with CSE or Support team** to evaluate the best time window for large data loads.
- **Notify the Support team via CSM** about your planned import activity so that they are aware of the increased activity on large data load.

### Multi-threaded Mode for Regular API (Delta Updates)

For delta updates using the regular HTTP API or Java sync (not Import API):

- Send a maximum of **20 requests in multi-threaded mode** for optimal performance.
- Batch all updates for a single customer resource into **one request** to reduce individual API call counts.
