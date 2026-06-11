---
name: recurring-orders-b2b
description: B2B-specific recurring order patterns — BU where clause, originOrder expand for line items, create-from-cart draft, duplicate, and per-action POST routes under the dashboard
when_to_use:
  - "Building the B2B subscription management dashboard (list with state tabs, detail page)"
  - "Scoping recurring order queries to a business unit"
  - "Creating a recurring order post-checkout for subscription line items"
  - "Duplicating a cancelled subscription"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - subscriptions
    - orders
---

# Recurring Orders — B2B

Start from the shared [recurring orders reference](../../core/optional/recurring-orders.md) and implement Patterns 1–7 from there first. This file covers B2B-specific decisions layered on top.

## Table of Contents
- [B2B Extension: Scoping and Auth](#b2b-extension-scoping-and-auth)
- [B2B Extension: Line Items — originOrder Expand](#b2b-extension-line-items--originorder-expand)
- [B2B Extension: Create Post-Checkout](#b2b-extension-create-post-checkout)
- [B2B Extension: Duplicate](#b2b-extension-duplicate)
- [B2B Extension: API Routes](#b2b-extension-api-routes)
- [B2B Extension: Dashboard Pages](#b2b-extension-dashboard-pages)
- [Checklist](#checklist)

---

## B2B Extension: Scoping and Auth

Extends **Pattern 2** from the shared reference.

Scope the list query to the active business unit:

```
where: businessUnit(key="${businessUnitKey}")
```

The list server endpoint requires both `customerId` AND `businessUnitKey` from the session. Single-order fetch and state-change routes require `customerId` only — the BU filter is only needed on the list.

commercetools admin credentials do not scope by business unit automatically. The `where` clause is the only enforcement mechanism — omitting it returns all recurring orders across the entire project.

---

## B2B Extension: Line Items — originOrder Expand

Extends **Pattern 2** from the shared reference.

Expand `originOrder` to access line items:

```
expand: ['originOrder']
```

`recurrencePolicyId` is not a first-class field on `RecurringOrder`. Derive it by walking the expanded originOrder's line items in the mapper:

```
originOrder.obj?.lineItems?.find(li => li.recurrenceInfo?.recurrencePolicy?.id)
  ?.recurrenceInfo?.recurrencePolicy?.id
```

This derivation belongs in `<server>/mappers/recurring-order`, not in server endpoints.

---

## B2B Extension: Create Post-Checkout

Extends **Pattern 4** from the shared reference.

B2B recurring orders are created post-checkout, the same as B2C — inside the checkout server endpoint, once per subscription line item in the placed order. The draft can optionally include `startsAt` and `expiresAt` to control when the subscription becomes active and expires:

```
{
  originOrder: { typeId: 'order', id: orderId },
  cart: { typeId: 'cart', id: cartId },
  customer: { typeId: 'customer', id: customerId },
  startsAt?: string,    // ISO 8601 — optional
  expiresAt?: string,   // ISO 8601 — optional
}
```

The schedule is not in the draft — commercetools derives it from the `recurrenceInfo` attached to the cart's line items. There is no need to pass a `schedule` or `recurrencePolicyId` in the body.

---

## B2B Extension: Duplicate

Extends **Pattern 4** from the shared reference.

Duplicate re-uses the **same cart** from the original recurring order — it does not clone the cart. Fetch the original with `expand: ['originOrder']` to get line item context, then call `createRecurringOrder` with the same `cartId` and `cartVersion`.

This is useful for re-activating a cancelled subscription with the same items without rebuilding the cart from scratch.

---

## B2B Extension: API Routes

Extends **Pattern 6** from the shared reference.

| Method | Path | Action | Auth required |
|---|---|---|---|
| `GET` | `/<api>/recurring-orders` | List, filtered by BU | `customerId` + `businessUnitKey` |
| `GET` | `/<api>/recurring-orders/[id]` | Fetch single with originOrder expand | `customerId` |
| `POST` | `/<api>/recurring-orders/[id]/pause` | State → `paused` | `customerId` |
| `POST` | `/<api>/recurring-orders/[id]/resume` | State → `active` | `customerId` |
| `POST` | `/<api>/recurring-orders/[id]/cancel` | State → `canceled` | `customerId` |
| `POST` | `/<api>/recurring-orders/[id]/duplicate` | Clone from same cart | `customerId` |
| `GET` | `/<api>/recurrence-policies` | List all policies | Session |

State changes use per-action `POST` routes (not a single `PUT`). The list route is the only one that requires `businessUnitKey`.

---

## B2B Extension: Dashboard Pages

Recurring orders are a procurement management feature and live under the B2B dashboard:

- `/[locale]/dashboard/recurring-orders` — list with state filter tabs (All / Active / Paused / Cancelled)
- `/[locale]/dashboard/recurring-orders/[id]` — detail with pause / resume / cancel actions and order snapshot

Protect both routes with the B2B auth guard (`customerId` + `businessUnitKey` in session).

---

## Checklist

- [ ] List `where` clause uses `businessUnit(key="${businessUnitKey}")` — not customer scoping
- [ ] List route validates both `customerId` AND `businessUnitKey`; all other routes validate `customerId` only
- [ ] Always `expand: ['originOrder']`
- [ ] `recurrencePolicyId` derived from `originOrder.obj.lineItems[].recurrenceInfo.recurrencePolicy.id` in the mapper
- [ ] Create draft includes `originOrder`, `cart`, `customer` + optional `startsAt`/`expiresAt` — no `schedule` in body
- [ ] Duplicate fetches with `expand: ['originOrder']` and reuses the same `cartId` and `cartVersion`
- [ ] No `POST /<api>/recurring-orders` creation route — creation happens from checkout
- [ ] State-change routes are separate per-action `POST` routes
- [ ] Pages under `/[locale]/dashboard/recurring-orders/`
- [ ] `priceSelectionMode: 'Fixed'` on all cart line items with recurrence
