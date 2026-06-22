---
name: lifecycle-scripts
description: Write idempotent postDeploy and preUndeploy scripts for a Connect connector. Covers get-then-update registration (not delete-then-recreate), schema-as-code for custom types, deploy-time external dependency validation, and clean teardown.
when_to_use:
  - "Writing a postDeploy or preUndeploy script"
  - "Registering an API extension or subscription without a redeploy gap window"
  - "Creating custom types/fields idempotently and removing them on undeploy"
  - "Validating external credentials at deploy time"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - deployment
    - lifecycle
---

# Lifecycle Scripts (postDeploy / preUndeploy)

**Impact: HIGH — Lifecycle scripts run as the connector's privileged setup. A non-idempotent script leaves a redelivery/validation gap on every redeploy; a script that exits non-zero rolls back the deployment.**

`postDeploy` runs after a successful deployment (register Extensions/Subscriptions, create Custom Types). `preUndeploy` runs before teardown (remove them). Declared in `connect.yaml` `scripts` (verified: [automation scripts](https://docs.commercetools.com/connect/automation-scripts.md)).

## Table of Contents
- [Pattern 1: Idempotent registration (get-then-update, not delete-then-recreate)](#pattern-1-idempotent-registration-get-then-update-not-delete-then-recreate)
- [Pattern 2: Schema-as-code for custom types](#pattern-2-schema-as-code-for-custom-types)
- [Pattern 3: Deploy-time external dependency validation](#pattern-3-deploy-time-external-dependency-validation)
- [Pattern 4: Clean teardown in preUndeploy](#pattern-4-clean-teardown-in-preundeploy)
- [Pattern 5: Exit codes and platform-injected variables](#pattern-5-exit-codes-and-platform-injected-variables)
- [Checklist](#checklist)

---

## Pattern 1: Idempotent registration (get-then-update, not delete-then-recreate)

Redeploys re-run `postDeploy`. The registration should converge to the desired state without a window where the Extension/Subscription is missing. **How much that window matters depends on the resource type — read the nuance below before treating delete-then-recreate as always wrong.**

**INCORRECT for Extensions — delete then recreate:**
```typescript
const { body: { results } } = await apiRoot.extensions()
  .get({ queryArgs: { where: `key = "${KEY}"` } }).execute();
if (results.length) {
  await apiRoot.extensions().withKey({ key: KEY })
    .delete({ queryArgs: { version: results[0].version } }).execute();
}
await apiRoot.extensions().post({ body: draft }).execute();   // gap between delete and post
```
*Why this fails (Extensions):* between the delete and the re-create, the Extension does not exist, and an Extension sits **synchronously in the path of live operations**. A cart or order created in that window skips the extension entirely — the triggering API operation runs without the logic the extension was meant to enforce. Every redeploy reopens the gap, so prefer get-then-update for Extensions.

> **Subscriptions are different — and the public docs example uses delete-then-recreate for them.** The [event-application `postDeploy` example](https://docs.commercetools.com/connect/automation-scripts.md) deletes and re-creates the Subscription on each deploy, and that's an accepted pattern. A Subscription is **not** in the synchronous path of any operation: the gap only risks *missing change messages emitted during the short delete→recreate window* — it never fails the triggering create/update itself. Given at-least-once delivery and the recommendation to re-fetch-and-reconcile by ID ([event-applications.md](./event-applications.md)), that milder "missed events" risk is often acceptable. Use get-then-update (below) if you want to close even that window; use delete-then-recreate (matching the docs) if a brief miss is tolerable and reconciliation covers it. For Extensions, get-then-update is the clear choice.

**CORRECT — create only if absent, otherwise update in place:**
```typescript
const { body: { results } } = await apiRoot.extensions()
  .get({ queryArgs: { where: `key = "${KEY}"` } }).execute();

if (results.length === 0) {
  await apiRoot.extensions().post({ body: draft }).execute();          // first deploy
} else {
  const current = results[0];
  await apiRoot.extensions().withKey({ key: KEY }).post({ body: {
    version: current.version,
    actions: diffToUpdateActions(current, draft),                      // e.g. setTriggers, changeDestination, changeTimeoutInMs
  }}).execute();                                                       // no gap
}
```

## Pattern 2: Schema-as-code for custom types

If the connector relies on custom fields, create the Types idempotently in `postDeploy` and remove them in `preUndeploy` — never assume a human created them.

```typescript
async function ensureType(apiRoot, draft) {
  const { body: { results } } = await apiRoot.types()
    .get({ queryArgs: { where: `key = "${draft.key}"` } }).execute();
  if (results.length === 0) {
    await apiRoot.types().post({ body: draft }).execute();
  } else {
    const existing = results[0];
    const missing = draft.fieldDefinitions.filter(
      f => !existing.fieldDefinitions?.some(e => e.name === f.name));
    if (missing.length) {
      await apiRoot.types().withKey({ key: draft.key }).post({ body: {
        version: existing.version,
        actions: missing.map(fieldDefinition => ({ action: 'addFieldDefinition', fieldDefinition })),
      }}).execute();
    }
  }
}
```

## Pattern 3: Deploy-time external dependency validation

Surface bad external credentials at deploy time, not on the first customer request.

```typescript
const ok = await externalClient.testConnection();
if (!ok) {
  // Decide: warn-and-continue, or fail the deploy. State which in the README.
  process.stderr.write('WARNING: external credentials invalid — connector deployed but non-functional\n');
}
```
 Warning-and-continue is reasonable for a connector that should still deploy; failing fast is reasonable when the connector is useless without the dependency. Choose deliberately and document it.

## Pattern 4: Clean teardown in preUndeploy

`preUndeploy` removes everything `postDeploy` created — Extensions, Subscriptions, and Custom Types — so an undeploy doesn't leave a dangling Extension pointing at a dead URL (which would then fail every cart/order).

```typescript
await deleteExtensionIfPresent(apiRoot, EXTENSION_KEY);
await deleteSubscriptionIfPresent(apiRoot, SUBSCRIPTION_KEY);
await removeCustomTypeFieldsIfPresent(apiRoot, TYPE_KEY);   // remove fields you added; drop the type if you own it
```
A leftover Extension after undeploy is especially dangerous: it stays registered, its URL is gone, and (if fail-closed) it blocks every triggering operation.

## Pattern 5: Exit codes and platform-injected variables

- **Exit non-zero on real failure.** A non-zero exit from `postDeploy`/`preUndeploy` rolls back the deployment. Wrap `run()` and set `process.exitCode = 1` on genuine errors; don't exit non-zero for benign "already exists" cases.
- **Use the injected variables** rather than guessing URLs/topics (verified: [automation scripts](https://docs.commercetools.com/connect/automation-scripts.md)):
  - `service`: `CONNECT_SERVICE_URL` — the public URL to register as the extension destination.
  - `event`: `CONNECT_GCP_TOPIC_NAME` and `CONNECT_GCP_PROJECT_ID` — build the Google Cloud Pub/Sub destination from these. See [event-applications.md](./event-applications.md), Pattern 7.

---

## Checklist
- [ ] Extension registration is get-then-update (create only if absent) — no delete-then-recreate gap (an Extension gap fails live operations); Subscriptions may use get-then-update or the docs' delete-then-recreate, since their gap only risks missed events covered by re-fetch reconciliation
- [ ] Custom Types created idempotently (add only missing fields) and removed in `preUndeploy`
- [ ] `preUndeploy` deletes every resource `postDeploy` created (no dangling extension/subscription)
- [ ] External credentials validated at deploy time; warn-vs-fail decision documented
- [ ] Scripts exit non-zero only on genuine failure; benign "already exists" is not an error
- [ ] Destination URL/topic read from injected `CONNECT_*` variables, not hardcoded

**Next:** [security.md](./security.md) · [deployment-installation.md](./deployment-installation.md)
