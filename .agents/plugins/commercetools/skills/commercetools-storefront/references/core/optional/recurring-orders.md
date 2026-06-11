---
name: recurring-orders
description: Shared patterns for fetching, displaying, and managing the recurring order lifecycle — scoping, state transitions, post-checkout creation, and recurrence policies
when_to_use:
  - "Building a subscription management page (list, detail, pause, resume, cancel)"
  - "Creating recurring orders post-checkout for subscription line items"
  - "Fetching and displaying recurrence policies in a selector or order table"
  - "Implementing client state hooks and cache invalidation for subscription state"
metadata:
  contentType: REFERENCE
  area:
    - subscriptions
    - orders
---

# Recurring Orders

**Impact: HIGH — Recurring orders are the backbone of a subscription feature. The `RecurringOrder` resource does not carry its own line items, which surprises most implementers. Always expand `originOrder` or the subscription management UI will have nothing to display.**

A `RecurringOrder` represents an active subscription. It references the originating order, a `RecurrencePolicy` (the schedule), and the customer or business unit that owns it. commercetools handles the actual re-ordering on schedule; the storefront manages the lifecycle (pause, resume, cancel) and displays the subscription status to the user.

## Table of Contents
- [Pattern 1: Resources and SDK Accessors](#pattern-1-resources-and-sdk-accessors)
- [Pattern 2: Fetching Recurring Orders](#pattern-2-fetching-recurring-orders)
- [Pattern 3: State Transitions](#pattern-3-state-transitions)
- [Pattern 4: Creating a Recurring Order](#pattern-4-creating-a-recurring-order)
- [Pattern 5: Recurrence Policies](#pattern-5-recurrence-policies)
- [Pattern 6: Server Endpoints](#pattern-6-server-endpoints)
- [Pattern 7: Client State and Cache](#pattern-7-client-state-and-cache)
- [Tips and Tricks](#tips-and-tricks)

---

## Pattern 1: Resources and SDK Accessors

| Resource | SDK Accessor | Notes |
|---|---|---|
| `RecurringOrder` | `apiRoot.recurringOrders()` | Project-level — not under as-associate |
| `RecurrencePolicy` | `apiRoot.recurrencePolicies()` | Project-level; defines schedule |

Both are accessed through the project-level `apiRoot`. commercetools does not yet expose recurring orders under the as-associate endpoint; authorization is enforced in the app via scoped `where` clauses.

---

## Pattern 2: Fetching Recurring Orders

### Scoping

Always scope recurring order queries to the owner using a `where` clause. Without scoping, an admin-credential client returns all recurring orders in the project.

- B2C: `customer(id="${customerId}")`
- B2B: `businessUnit(key="${businessUnitKey}")`

See the context-specific files for the full `where` clause.

### The line items problem

`RecurringOrder` does not carry its own `lineItems` array. Always expand `originOrder`:

```
expand: ['originOrder']
```

Omitting the expand means the subscription UI has no items to display.

After expanding, fall back defensively: the top-level `lineItems` field on `RecurringOrder` is often empty even when the expand succeeds. Always read from `originOrder.obj.lineItems` as the authoritative source.

---

## Pattern 3: State Transitions

All state changes use the `setRecurringOrderState` update action with a **read-then-write** pattern:

1. Fetch the recurring order to get its current `version`
2. POST with that `version` and the `setRecurringOrderState` action

| Intent | `recurringOrderState` value |
|---|---|
| Pause | `{ type: 'paused' }` |
| Resume | `{ type: 'active' }` |
| Cancel | `{ type: 'canceled' }` |

There is no optimistic locking retry in the standard implementation — a 409 version conflict surfaces to the user as an error.

Context-specific files may add additional update actions (e.g. `skip`, `setSchedule` in B2C).

---

## Pattern 4: Creating a Recurring Order

Recurring orders are created as a consequence of checkout, not from a dedicated create form. After an order is placed that contains subscription line items, create one `RecurringOrder` per subscription line item — not one per order.

**Failure handling:** if `createRecurringOrder` fails, log the error but do not roll back the placed order. The customer completed their purchase; the subscription record can be re-created or investigated separately. Rolling back the order would be a worse outcome.

The schedule is derived from the `recurrenceInfo` attached to the cart's line items when they were added — it does not need to be re-specified on the draft body. See the context-specific files for the exact draft shape.

---

## Pattern 5: Recurrence Policies

Policies are defined in commercetools — never hardcode schedule options in the app. Fetch them project-level:

```
apiRoot.recurrencePolicies().get({ queryArgs: { limit: 20 } })
```

Two client state hooks serve different consumers:

- one returns `Map<policyId, humanLabel>` for inline display in cart items and mini cart
- one returns the full `RecurrencePolicy[]` for the PDP selector and subscription pages

Both hooks must share the same client state-manager/cache key so only one HTTP request is made.

A `formatInterval(schedule)` helper converts `{ intervalUnit, value }` to a human label (e.g. "Every 2 months"). It must handle both singular (`'month'`) and plural (`'months'`) forms of `intervalUnit` — commercetools data uses both.

---

## Pattern 6: Server Endpoints

Standard server-endpoint structure:

| Method | Path | Action | Notes |
|---|---|---|---|
| `GET` | `/<api>/[prefix]` | List recurring orders | Scoped by owner; auth fields differ by context |
| `GET` | `/<api>/[prefix]/[id]` | Fetch single order | Always `expand: ['originOrder']` |
| `PUT` or `POST` | `/<api>/[prefix]/[id]` | State transitions | See context-specific for endpoint style |
| `GET` | `/<api>/recurrence-policies` | List all policies | No owner scoping needed |

There is no `POST /<api>/[prefix]` for creation — recurring orders are created from within the checkout server endpoint.

---

## Pattern 7: Client State and Cache

Use a client state cache for recurring order data — it changes only on explicit user action (pause, resume, cancel).

After any state-change action, invalidate (or update from the response) both the list and the individual item so both the list view and the detail view reflect the change without a full page reload.

The client state-manager/cache key for the list should encode the ownership scope (include `customerId` or `businessUnitKey`) so the cache auto-invalidates when the user switches context.

> Find the stack's `concept-mapping.md` for concrete state and cache implementation.

---

## Tips and Tricks

**`canceled` not `cancelled`:** commercetools expects single-l. The UI may display "Cancelled" with double-l but the API value must be `'canceled'`. Sending `'cancelled'` causes a silent 400 or an unexpected state.

**`recurrencePolicyId` is not a first-class field:** `RecurringOrder` does not have a top-level `recurrencePolicyId`. Derive it by inspecting `originOrder.obj.lineItems` for `recurrenceInfo.recurrencePolicy.id`. This derivation belongs in the mapper.

**Storefront client scope:** the storefront's commercetools credentials need `manage_recurring_orders` scope separately from the admin/tools client. Do not assume admin scopes cover storefront calls.
