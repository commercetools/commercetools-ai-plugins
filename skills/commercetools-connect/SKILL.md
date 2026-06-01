---
name: commercetools-connect
description: Connect runtime — service/job/event-driven connector apps, official Connect CLI, deployment lifecycle (preDeployment/postDeployment hooks), environment configuration, connector versioning, and marketplace publishing. Use when building, deploying, or debugging a commercetools Connect application.
when_to_use:
  - "Building a connector app for the Connect marketplace"
  - "Service app type — long-running HTTP endpoint (webhooks, APIs)"
  - "Job app type — scheduled or on-demand batch processing"
  - "Event app type — triggered by commercetools Subscription messages"
  - "Connect CLI, deployment lifecycle, preDeployment/postDeployment hooks"
  - "Connector environment configuration and secrets management"
  - "Publishing a connector to the CT marketplace"
  - "Connect app scaling, resource limits, and runtime constraints"
metadata:
  contentType: SKILL
  area:
    - platform
    - integration
---

# commercetools Connect

Patterns for building and operating commercetools Connect applications.

## Key Takeaways

**Connect has three app types: service, job, and event.** Service apps are long-running HTTP endpoints (e.g., webhook receivers, REST APIs). Job apps are invoked on-demand or on a schedule (e.g., nightly sync, bulk import). Event apps are triggered by CT Subscription messages. Choose the type based on how the app is invoked, not what it does.

**`preDeployment` and `postDeployment` hooks run CLI commands in the Connect deployment context.** `preDeployment` runs before traffic is switched to the new deployment (e.g., DB migration, schema validation). `postDeployment` runs after the deployment is live (e.g., seed data, cache warmup). Hook failures roll back the deployment.

**Environment variables are the only way to pass secrets into Connect apps.** Store API keys, credentials, and configuration as environment variables in the Connect deployment configuration. Never hardcode secrets in the connector code.

**Connect apps run in an isolated container — they cannot share state via the filesystem.** Any state that must persist between invocations (job runs, event messages) must be stored externally: CT Custom Objects, a database, or an external cache.

**The Connect CLI (`connect-application`) manages the full deployment lifecycle.** Use it for local development, deployment, and debugging. The CLI provides `connect:build`, `connect:deploy`, and `connect:logs` commands.

**Connector versioning is immutable.** Once a connector version is published to the marketplace, it cannot be modified. Create a new version for any changes.

---

## Reference Index

| Topic | Reference | Source |
|-------|-----------|--------|
| Connect app types — service, job, event; when to use each | [references/app-types.md](references/app-types.md) | Connect docs |
| Connect CLI — build, deploy, logs, local development | [references/connect-cli.md](references/connect-cli.md) | Connect CLI docs |
| Deployment lifecycle — preDeployment/postDeployment hooks, rollback | [references/deployment-lifecycle.md](references/deployment-lifecycle.md) | Connect docs |
| Environment configuration — secrets, env vars, CT API client setup | [references/env-config.md](references/env-config.md) | Connect docs |
| Marketplace publishing — connector versioning, certification, listing | [references/marketplace-publishing.md](references/marketplace-publishing.md) | Connect marketplace docs |

---

## Priority Tiers

### CRITICAL

- **Hook failures roll back the deployment.** Ensure `preDeployment` and `postDeployment` hooks exit with 0 on success. Any non-zero exit code triggers a rollback.
- **Never hardcode secrets in connector code.** Use environment variables — they are encrypted at rest in the Connect platform.
- **Connect apps cannot share state via the filesystem.** Persist any required state in CT Custom Objects, a database, or an external cache.

### HIGH

- **Event apps are invoked per-message — design for idempotency.** CT Subscriptions are at-least-once delivery. Event app handlers must be safe to invoke multiple times with the same message.
- **Service app endpoints must respond within 30 seconds.** Longer operations should be handled asynchronously (queue the work, return 202 immediately).
- **Job apps must handle their own concurrency.** Connect does not prevent concurrent invocations of a job. Use locking (CT Custom Object or external) if your job is not safe to run concurrently.

### MEDIUM

- **Test locally with the Connect CLI before deploying.** The CLI can simulate the Connect runtime environment locally, reducing deploy/debug cycles.
- **Connector versioning is immutable.** Plan connector releases carefully — there is no patch in place. Create a new version for any code changes.
- **Use structured logging.** Connect surfaces logs via the CLI and dashboard. Use JSON-structured logs for easier filtering and searching.
