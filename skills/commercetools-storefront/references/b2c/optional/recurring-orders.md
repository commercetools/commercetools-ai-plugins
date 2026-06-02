---
name: recurring-orders-b2c
description: B2C-specific recurring order patterns — customer scoping, originOrder expand, post-checkout creation with SDK cast, skip and setSchedule actions, single PUT route
when_to_use:
  - "Building the B2C account subscriptions page (list and detail)"
  - "Creating recurring orders inside the checkout route for subscription line items"
  - "Implementing skip-next-delivery or change-schedule actions"
  - "Normalising nextOrderAt to nextOrderDate at the API layer"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - subscriptions
    - orders
---

# Recurring Orders — B2C

Start from the shared [recurring orders reference](../../core/optional/recurring-orders.md) and implement Patterns 1–7 from there first. This file covers B2C-specific decisions layered on top.

## Table of Contents
- [B2C Extension: Scoping and Auth](#b2c-extension-scoping-and-auth)
- [B2C Extension: Line Items — originOrder Expand](#b2c-extension-line-items--originorder-expand)
- [B2C Extension: Create Post-Checkout](#b2c-extension-create-post-checkout)
- [B2C Extension: Additional State Actions](#b2c-extension-additional-state-actions)
- [B2C Extension: API Routes](#b2c-extension-api-routes)
- [B2C Extension: Account Pages](#b2c-extension-account-pages)
- [Checklist](#checklist)

---

## B2C Extension: Scoping and Auth

Extends **Pattern 2** from the shared reference.

Scope recurring order list fetches to the authenticated customer:

```
where: customer(id="${customerId}")
```

All route handlers validate `customerId` from the session. Always read `customerId` from `getSession()` on the server — never trust a client-supplied ID.

---

## B2C Extension: Line Items — originOrder Expand

Extends **Pattern 2** from the shared reference.

In B2C, recurring orders are created from a post-checkout order. Expand `originOrder` — not `cart` — to access the line items:

```
expand: ['originOrder']
```

Always fall back when reading items: `sub.lineItems?.length ? sub.lineItems : sub.originOrder?.obj?.lineItems ?? []`. The top-level `lineItems` on `RecurringOrder` is often empty even when the expand succeeds.

Normalise the next-order date at the API layer before returning to the client: map `nextOrderAt` → `nextOrderDate`. This ensures UI components use a consistent field name regardless of which commercetools API version returns which field name.

---

## B2C Extension: Create Post-Checkout

Extends **Pattern 4** from the shared reference.

B2C recurring orders are created inside the checkout route handler immediately after the order is placed. For each line item in the placed order that has `recurrenceInfo.recurrencePolicy` set, fetch the policy by ID and create one `RecurringOrder`.

**Draft shape** — note that `originOrder`, `nextOrderAt`, and top-level `schedule` are commercetools extension fields not in `RecurringOrderDraft`. Cast the entire body as `unknown`:

```
{
  originOrder: { typeId: 'order', id: orderId },
  cart: { typeId: 'cart', id: cartId },
  customer: { typeId: 'customer', id: customerId },
  startsAt: now.toISOString(),
  nextOrderAt: computedDate.toISOString(),
  recurringOrderState: 'Active',
  schedule: { type: 'standard', value, intervalUnit },
}
```

Compute `nextOrderAt` from the policy's `schedule.value` and `schedule.intervalUnit`: add N months or N×7 days to the current date. Fetch the full policy by ID at checkout time to get these values — do not trust the summary stored on the line item.

---

## B2C Extension: Additional State Actions

Extends **Pattern 3** from the shared reference.

B2C supports two additional update actions beyond pause / resume / cancel:

**Skip:** skips the next N deliveries without cancelling the subscription.
```
action: 'setOrderSkipConfiguration'
skipConfigurationInputDraft: { type: 'Counter', totalToSkip: N }
```

**Change schedule:** replaces the recurrence policy on the subscription.
```
action: 'setSchedule'
recurrencePolicy: { id: recurrencePolicyId }   // or pass a raw schedule object
```

Both go through the same single `PUT /api/account/subscriptions/[id]` endpoint, dispatched on an `action` field in the request body.

---

## B2C Extension: API Routes

Extends **Pattern 6** from the shared reference.

| Method | Path | Action | Auth |
|---|---|---|---|
| `GET` | `/api/account/subscriptions` | List customer's recurring orders | `customerId` |
| `GET` | `/api/account/subscriptions/[id]` | Single with `originOrder` expand | `customerId` |
| `PUT` | `/api/account/subscriptions/[id]` | All state actions (pause/resume/cancel/skip/setSchedule) | `customerId` |
| `GET` | `/api/recurrence-policies` | List all policies | Session |
| `POST` | `/api/cart/items` | Add line item; `recurrencePolicyId` optional | `customerId` |

State changes use a **single `PUT` endpoint** — not per-action routes. The `action` field in the request body dispatches to the correct commercetools update action. There is no separate `POST` creation route for subscriptions — creation happens post checkout..

---

## B2C Extension: Account Pages

Subscriptions are a personal account feature in B2C:

- `/account/subscriptions` — list with status badges (Active / Paused / Cancelled)
- `/account/subscriptions/[id]` — detail with pause / resume / cancel / skip actions

Protect both routes with a customer auth guard — unauthenticated requests redirect to login.

---

## Checklist

- [ ] List `where` clause uses `customer(id="${customerId}")` — not BU scoping
- [ ] All route handlers validate `customerId` only — no `businessUnitKey`
- [ ] `customerId` always read from `getSession()` — never from request body or query params
- [ ] Always `expand: ['originOrder']` — not `cart`
- [ ] Fall back to `originOrder?.obj?.lineItems` when top-level `lineItems` is empty
- [ ] Normalise `nextOrderAt` → `nextOrderDate` at the API layer, not in the UI
- [ ] Recurring orders created post-checkout, one per subscription line item
- [ ] `RecurringOrderDraft` body cast as `unknown` — extension fields not in SDK type
- [ ] `nextOrderAt` computed from policy schedule fetched at checkout time
- [ ] Order not rolled back if `createRecurringOrder` fails — log and continue
- [ ] Cancel uses `'canceled'` (single-l) as the commercetools state value
- [ ] Skip uses `setOrderSkipConfiguration`; schedule change uses `setSchedule`
- [ ] Single `PUT` route handles all state actions via `action` field dispatch
- [ ] No dedicated subscription creation route — creation is inside the checkout route
