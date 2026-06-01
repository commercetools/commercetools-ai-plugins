# Subscription Implementation Patterns — Push and Pull

**Source:** Additional Subscription Implementation Patterns (Expert Services)

---

## Overview

There are three architectural patterns for consuming commercetools events. Each has different security, reliability, and scalability trade-offs.

| Pattern | Type | Use when |
|---------|------|----------|
| DMZ Pattern | Push | Subscriptions required, but your backend is in a secure VPC that can't accept direct CT delivery |
| Polling Pattern | Pull | You need ordering guarantees, high throughput, or prefer pull-based resilience over push |
| ChangeSubscription Pattern | Push | You only need to know *that* a resource changed, and want to minimize payload exposure (no PII/PHI in transit) |

---

## DMZ Pattern

Use when: your processing systems live in a secure VPC that cannot be exposed to CT subscription delivery, but you still need push-based event delivery.

**Architecture:**
```
CoCo Ecosystem         Customer Public Facing DMZ          Customer Secure VPC
─────────────────    ──────────────────────────────    ──────────────────────────────
CoCo Subscriptions → Queue Service Bus → Cloud Fn → Queue Service Bus → Cloud Fn → Internal Systems
     (push)              (DMZ queue)    (forward)      (secure queue)   (process)
```

**Flow:**
1. Message/ChangeSubscription is registered with CT; CT pushes events to a queue in the **public-facing DMZ zone** (SQS, Azure Service Bus, GCP Pub/Sub)
2. A cloud function in the DMZ receives the message from the DMZ queue
3. The DMZ cloud function forwards the message securely into the **customer's secure VPC** queue (enhanced security controls between DMZ and VPC — VPN, private link, etc.)
4. Secure cloud components in the VPC handle message processing and route to internal systems

**Key points:**
- Works with both Message Subscriptions and Change Subscriptions
- The DMZ queue is the only endpoint exposed to CT — the secure VPC never touches CT directly
- Latency increases by one hop (DMZ queue → VPC queue)

---

## Polling Pattern

Use when: you want ordering guarantees, resilience without queue infrastructure, or want to bypass subscriptions entirely for high-volume order processing.

**Architecture:**
```
Commercetools
  ├─ Messages API  ──┐
  └─ Orders API   ──┤  ← Polling Application pulls
                    ↓
              Order Created Queue
                    ↓
            Order Created Listeners (multiple parallel processes)
                    ↓
         Message Processing Infrastructure
```

**How it works:**
1. Polling application periodically queries the **Messages API** or **Orders API** directly (HTTP GET)
2. Results are pushed to an internal queue (Order Created Queue)
3. Multiple listener processes drain the queue in parallel to scale throughput
4. If the message contains only identifiers (claim-check pattern), listeners fetch full resource details separately

**Advantages over push subscriptions:**
- **Order guarantees** — polling controls sequencing (sort by `createdAt`, use cursor-based pagination)
- **Resilience** — messages are persisted in CT; if polling fails, retry without loss
- **Scalable** — add more polling or listener processes to increase throughput
- **Simplicity** — no subscription configuration or queue infrastructure required for the CT side

**Real-world adoption:** Flink, ENBW, Trinny London, Zapp all use the Polling Pattern.
Flink built a scheduled polling service handling **10k–100k+ orders per day**.

**Implementation tips:**
- Use the Messages API when you need event semantics (`OrderCreated`, `OrderStateChanged`)
- Use the Orders API directly when you only need order data and want to skip message overhead entirely
- Use `sort=createdAt desc` + timestamp cursor to poll for new events since last check
- Scale per message type: dedicate separate polling services to high-volume message types

---

## ChangeSubscription Pattern

Use when: you need to react to resource changes but want to minimize payload size and avoid exposing PII or PHI in your queue infrastructure.

**Architecture:**
```
Commercetools
  Subscriptions → Subscription Destination (queue) → Queue Listener → Messages Endpoint → Upstream Processing
                                                       (fetch details)
```

**Flow:**
1. **Configuration (Step 0):** Create a cloud destination for ChangeSubscription events. Create a CT subscription for the desired resource (e.g., `order`) pointing to that destination.
2. **Subscription (Step 1):** CT emits a ChangeSubscription message to the destination whenever the resource changes.
3. **Destination (Step 2):** Message is enqueued in the cloud destination.
4. **Queue Listener (Step 3):** Listener processes the queued message. The ChangeSubscription payload contains only `resourceTypeId`, `id`, `version`, `oldVersion`, `modifiedAt` — no business data, no PII, no PHI. If full details are needed, the listener fetches them from the **Messages API** using the resource ID.
5. **Upstream Processing (Step 4):** Listener builds and forwards a richer event/message to upstream systems.

**ChangeSubscription payload structure (what you receive):**
```json
{
  "notificationType": "ResourceUpdated",
  "projectKey": "your-project",
  "resource": { "typeId": "order", "id": "<order-id>" },
  "version": 3,
  "oldVersion": 2,
  "modifiedAt": "2023-02-01T19:19:03.918Z"
}
```

**Why ChangeSubscription + claim-check:**
- The payload contains no customer data → safe to route through public queues without encryption overhead
- Security review burden is lower — no PII/PHI in the message bus
- Queue listener fetches full resource details only when needed (via GraphQL or REST with reference expansion), keeping sensitive data within your secure processing layer

**ChangeSubscription payload sample from Messages API:**
```graphql
messages(sort: "createdAt desc", limit: 100, where: "type=\"OrderCreated\"") {
  results {
    id
    type
    payload { type }
    resourceRef { id typeId }
    sequenceNumber
    resourceVersion
  }
}
```

**Limitation:** ChangeSubscription fires on *any* change to the resource — there is no filter by change type within a single ChangeSubscription. If you need filtering by event type (e.g., only `OrderStateChanged`), use a Message Subscription instead.
