# Approval Rules

**Source:** Cross-reference from commercetools B2B documentation

---

## Overview

Approval Rules are predicates defined on a Business Unit that gate Order creation behind a human approval step. When an order being placed by a buyer matches an Approval Rule's predicate, the platform intercepts the `order from cart` action and places the resulting Order in a `Pending` state instead of immediately confirming it.

---

## Core Concepts

### Approval Rules Are Predicates

An Approval Rule contains a `predicate` string written in the [commercetools query predicate syntax](https://docs.commercetools.com/api/predicates/query). The predicate is evaluated against the **Order** at creation time.

Common predicate fields include:

| Field | Example use case |
|---|---|
| `totalPrice.centAmount` | Orders above a spend threshold require approval |
| `lineItems(quantity > X)` | Large quantity orders trigger approval |
| `lineItems(totalPrice.centAmount > X)` | High-value individual line items |
| Custom fields | Business-specific rules (e.g. product category, custom flags) |

Example predicate: `totalPrice.centAmount > 1000000` (orders over €10,000 at centAmount scale).

### Approvers

Each Approval Rule specifies one or more **approver tiers** — sets of associate roles that must approve the order. Tiers are evaluated sequentially:

- All required approvers in a tier must act before the next tier is evaluated.
- An Approval Rule can have multiple tiers to model multi-level approval chains (e.g. line manager → finance director).

### Requesters

Rules can also restrict which associate roles the rule applies to (i.e. which buyers' orders are subject to the rule). This allows different rules for different buyer roles within the same BU.

---

## Approval Flow State Machine

When an Order matches an Approval Rule, it enters the **approval flow** lifecycle:

```
Order created → Pending
                  │
          ┌───────┴───────┐
          │               │
       Approved        Rejected
          │
       Order confirmed / fulfilment continues
```

| State | Description |
|---|---|
| `Pending` | Order is awaiting approval from one or more approver tiers. |
| `Approved` | All required approver tiers have approved. Order proceeds normally. |
| `Rejected` | At least one required approver has rejected. Order is declined. |

The state transitions are driven by the `approveOrderApprovalFlow` and `rejectOrderApprovalFlow` update actions, which must be called via the `asAssociate` API path.

---

## Evaluation at Order Creation

1. Buyer calls `POST /orders` (or the as-associate equivalent).
2. The platform evaluates all active Approval Rules on the buyer's Business Unit (and inherited from parent BUs).
3. If **any** rule's predicate matches the order, an **Approval Flow** is created and the Order is placed in `Pending` state.
4. If **no** rule matches, the Order is confirmed immediately.

Rules from parent BUs are inherited by child BUs unless overridden.

---

## Key API Resources

| Resource | Endpoint |
|---|---|
| Approval Rules | `GET/POST /business-units/{id}/approval-rules` |
| Approval Flows | `GET /orders/order-approval-flows` |
| Approve an Order | `POST /as-associate/{associateId}/in-business-unit/key={buKey}/orders/{orderId}/approval-flows/{flowId}` with action `approveOrderApprovalFlow` |
| Reject an Order | Same path with action `rejectOrderApprovalFlow` |

---

## Implementation Notes

- Only associates with an `approveOrder` permission can call approve/reject actions.
- An order can match multiple Approval Rules simultaneously; the platform creates one Approval Flow that merges all required approver tiers.
- Approval Rules are managed by associates with the `updateApprovalRules` permission (typically a BU admin).
- Approval Rule predicates are validated at creation time — an invalid predicate is rejected with a `400` error.
