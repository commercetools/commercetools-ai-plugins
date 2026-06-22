---
name: architecture-decisions
description: Choose the Connect application type and price the synchronous vs asynchronous contract before writing code. Decision tables and trade-offs for service (API extension), event (subscription handler), job, and merchant-center applications.
when_to_use:
  - "Deciding whether a connector should be a service, event, or job application"
  - "Understanding the latency/availability cost of a synchronous API extension"
  - "Understanding the at-least-once / ordering / redelivery cost of an event subscription"
  - "Splitting one connector into multiple applications"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - architecture
---

# Architecture Decisions

**Impact: CRITICAL — The application type and its delivery contract determine nearly every later decision (timeouts, idempotency, error handling, scaling). Getting this wrong is expensive to undo.**

A Connector is one repository whose `connect.yaml` declares one or more **applications**, each with an `applicationType`. Choose by *how the application is invoked*, then accept the contract that invocation imposes.

## Table of Contents
- [Pattern 1: Pick the application type](#pattern-1-pick-the-application-type)
- [Pattern 2: Price the synchronous contract (service as API Extension)](#pattern-2-price-the-synchronous-contract-service-as-api-extension)
- [Pattern 3: Price the asynchronous contract (event)](#pattern-3-price-the-asynchronous-contract-event)
- [Pattern 4: Combine application types in one connector](#pattern-4-combine-application-types-in-one-connector)
- [Pattern 5: Is Connect the right fit? (best practices)](#pattern-5-is-connect-the-right-fit-best-practices)
- [Checklist](#checklist)

---

## Pattern 1: Pick the application type

`applicationType` accepts `service`, `event`, `job`, `merchant-center-custom-application`, `merchant-center-custom-view`, and `assets` (verified: [connect.yaml reference](https://docs.commercetools.com/connect/development.md)).

First settle the **direction** of the data flow, because it splits the answer:

| Question | Answer → type |
|---|---|
| Must it run *during* a commercetools API call and change or block the result? (commercetools → you) | `service` registered as an [API Extension](https://docs.commercetools.com/api/projects/api-extensions.md) |
| Does an **external system push data *into* commercetools** as it changes? (external → commercetools, reactive) | `service` as an **inbound webhook** (external system calls your endpoint; you write to commercetools) |
| Must it react *after* a **commercetools** change, asynchronously? (commercetools → you) | `event` (consumes a [Subscription](https://docs.commercetools.com/api/projects/subscriptions.md)) |
| Is it scheduled or invoked on-demand as a batch? (e.g. periodically poll an external system and upsert) | `job` |
| Is it Merchant Center UI? | `merchant-center-custom-application` / `merchant-center-custom-view` |
| Static files? | `assets` |

Two axes decide it: **direction** (who is the source of the change) and **timing** (synchronous vs. after-the-fact vs. scheduled) — not the domain. "Calculate tax" is a `service` API Extension when it must price the cart before checkout completes, but an `event` when it commits a finalized tax document after the order is placed — the same domain, two contracts. And "sync a product" is a `service` inbound webhook when the external system pushes changes live, but a `job` when you poll on a schedule.

> A `service` app is just an HTTP endpoint; **API Extension is one mode, inbound webhook is another** — see [service-applications.md](./service-applications.md). Note that `event` apps consume *commercetools'* own Subscription messages only; an external system's changes never arrive as `event` messages, so "external → commercetools" is always `service` (reactive) or `job` (scheduled).

## Pattern 2: Price the synchronous contract (service as API Extension)

This prices the **API Extension** mode of a `service` app. The inbound-webhook mode of a `service` app is *not* on the commercetools hot path — it gets the 5-min service timeout and you own idempotency; see [service-applications.md](./service-applications.md), Pattern 7.

An API Extension runs *inside* the commercetools request, after processing but before persistence. Its cost (verified: [API Extensions](https://docs.commercetools.com/api/projects/api-extensions.md)):

- **Latency is additive.** Connection must establish within **1 s**; the response limit is **2 s by default**, configurable up to **10 s** (`timeoutInMs`); beyond that needs a per-project review. Every millisecond your extension takes is added to the customer's cart/checkout call.
- **Availability is coupled.** If your extension fails or times out, the commercetools operation fails or stalls. It is applied to *all* clients, including the Merchant Center.
- **Therefore you must decide:** fail-open (let the operation proceed on error) or fail-closed (block it), and budget an outbound timeout *well under* the extension timeout.

Choose `service` only when the result genuinely must be reflected before the operation completes (validation that must reject, amounts that must be correct at checkout). Otherwise prefer `event`.

## Pattern 3: Price the asynchronous contract (event)

A Subscription delivers a message to a queue; your `event` app processes it. Its cost (verified: [Subscriptions — Delivery](https://docs.commercetools.com/api/projects/subscriptions.md)):

- **At-least-once delivery.** The same message may arrive more than once → you must be **idempotent**.
- **No ordering guarantee.** Messages can arrive out of order, especially after retries → never assume "created before updated"; use `sequenceNumber` (Message) or re-fetch current state.
- **Redelivery on non-ack.** If you don't acknowledge (Connect: any response other than `102/200/201/202/204`), the message is retried. A bug that returns 500 on an unprocessable message becomes an infinite redelivery loop.
- **No delivery-time guarantee.** Usually seconds, but minutes are possible. Do not use Subscriptions for time-critical paths.

Choose `event` for reactions that tolerate eventual consistency: external sync, notifications, indexing, downstream document creation.

## Pattern 4: Combine application types in one connector

`deployAs` is an array. A tax connector typically ships **both**:

```yaml
deployAs:
  - name: tax-extension
    applicationType: service      # price the cart synchronously at checkout
    endpoint: /service
  - name: tax-committer
    applicationType: event        # commit/void the tax document after the order is placed
    endpoint: /event
```

Shared logic (SDK client, validators, mappers) goes in a `shared/` workspace both import — see [project-structure.md](./project-structure.md). Each application still satisfies its own half of the contract: the `service` half prices the latency/fail-mode question, the `event` half prices the idempotency/ordering question.

## Pattern 5: Is Connect the right fit? (best practices)

Before committing, check the connector against the platform's [best practices](https://docs.commercetools.com/connect/best-practices) — chiefly that it stays **stateless** ([project-structure.md](./project-structure.md), [event-applications.md](./event-applications.md)), keeps a **narrow single responsibility**, and **fits the serverless runtime envelope** (the timeouts in Patterns 2–3, plus autoscaling — no long-running processes, oversized batches, or heavy local storage).

If a use case fails these, the answer may be "not a Connect app" — say so rather than forcing it.

---

## Checklist
- [ ] Connector is stateless, single-responsibility, and fits the runtime timeouts ([best practices](https://docs.commercetools.com/connect/best-practices))
- [ ] Each application's type chosen by *invocation timing*, not domain
- [ ] For every `service` API Extension: latency budget and fail-open/closed stance written down → [service-applications.md](./service-applications.md)
- [ ] For every `service` inbound webhook: caller auth and idempotent-upsert strategy written down → [service-applications.md](./service-applications.md)
- [ ] "External system → commercetools" routed to `service` (reactive) or `job` (scheduled), never `event`
- [ ] For every `event` app: idempotency key and redelivery-safe ack strategy written down → [event-applications.md](./event-applications.md)
- [ ] Work that doesn't need to block the operation is an `event`, not a `service`
- [ ] Shared code factored into a `shared/` workspace, not duplicated per app

**Next:** [project-structure.md](./project-structure.md)
