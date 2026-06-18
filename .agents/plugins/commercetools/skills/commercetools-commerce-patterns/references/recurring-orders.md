# Recurring Orders API — Patterns and Configuration

Covers the full lifecycle of recurring orders in commercetools: RecurrencePolicy setup, recurrence-specific pricing, cart configuration, the critical `/orders` vs `/recurring-orders` endpoint distinction, mixed cart behavior, discounting rules, and update/modification patterns.

---

## RecurrencePolicy

A RecurrencePolicy defines the schedule for recurring orders. It must exist before it can be assigned to a line item.

### Schedule types

**Standard interval** — recur every N days or months:
```json
{
  "key": "monthly-subscription",
  "schedule": {
    "type": "standard",
    "value": 1,
    "intervalUnit": "Months"
  }
}
```

**Day of month** — recur on a specific day each month:
```json
{
  "key": "first-of-month",
  "schedule": {
    "type": "dayOfMonth",
    "day": 1
  }
}
```

`intervalUnit` accepts `"Days"`, `"Weeks"` (e.g. for weekly subscriptions), or `"Months"`.

**Deletion constraint:** A RecurrencePolicy cannot be deleted if it is referenced by any line item or cart. Attempting to do so returns a 400 error. Remove all references first.

---

## Recurrence Policy-Specific Prices

Products can have prices tied to a specific RecurrencePolicy — the subscription price can differ from the one-time purchase price.

### Embedded price with recurrence policy

Use `addPrice` on the product with a `recurrencePolicy` reference:

```json
{
  "action": "addPrice",
  "variantId": 1,
  "price": {
    "value": { "type": "centPrecision", "currencyCode": "USD", "centAmount": 2000 },
    "recurrencePolicy": {
      "typeId": "recurrence-policy",
      "key": "monthly-subscription"
    }
  }
}
```

### Standalone price with recurrence policy

The same `recurrencePolicy` reference field is supported on standalone prices.

**Known limitation:** Product Discounts cannot target recurrence policy-specific prices. Apply subscription-specific discounts via Cart Discounts instead.

---

## Cart Configuration — Adding Recurring Line Items

Add a line item with `recurrenceInfo` to mark it as recurring:

```json
{
  "action": "addLineItem",
  "productId": "...",
  "variantId": 1,
  "quantity": 1,
  "recurrenceInfo": {
    "recurrencePolicy": {
      "typeId": "recurrence-policy",
      "key": "monthly-subscription"
    },
    "priceSelectionMode": "Fixed"
  }
}
```

### priceSelectionMode

| Mode | Behavior |
|------|----------|
| `"Fixed"` | Price is locked at subscription creation time, including any active discounts. The customer always pays the price that was in effect when they subscribed. |
| `"Dynamic"` | Platform fetches the current price at each recurrence interval. Price fluctuates with catalog changes. |

Mixed `Fixed` and `Dynamic` items are allowed in the same cart.

---

## Critical: `/orders` vs `/recurring-orders` Endpoint Behavior

This is the most important behavioral difference in the Recurring Orders feature:

| Endpoint | Result |
|----------|--------|
| `POST /orders` (with recurring line items) | Creates **both** a regular order (immediate fulfillment) **and** a recurring order (future recurrences) |
| `POST /recurring-orders` | Creates **only** a recurring order — no regular order is created |

Use `POST /orders` when the customer's first delivery should ship immediately (the normal subscription sign-up flow). Use `POST /recurring-orders` when you want to set up a future-dated subscription with no immediate fulfillment.

---

## Future-Dated Recurring Orders

To create a recurring order that starts in the future:

- Must use `POST /recurring-orders` (not `/orders`)
- Include `startsAt` field with the future ISO 8601 date
- **The first order is still created immediately** even when `startsAt` is set — it is not deferred
- All line items in the cart must share the same recurrence schedule; mixed schedules return a 400 error
- Cart must include a `customerId` — anonymous carts are not supported for recurring orders

---

## Mixed Cart Behavior — Multiple Orders Created

A single cart can contain:
- One-time (non-recurring) items
- Recurring items with different recurrence policies

**Example: one-time item + monthly subscription + yearly subscription**

When `POST /orders` is called on this mixed cart, CT creates **3 orders**:
1. A regular order containing all 3 items (for immediate fulfillment)
2. A recurring order for the monthly subscription items
3. A recurring order for the yearly subscription items

Each unique recurrence policy in the cart generates a separate recurring order. Plan the order confirmation UI to handle multiple order IDs being returned from a single checkout.

---

## Discounting Recurring Orders

Cart discounts include a `recurringOrderScope` field that controls whether a discount applies to recurring order generations:

| `recurringOrderScope` value | Behavior |
|-----------------------------|----------|
| `"NonRecurringOrdersOnly"` | Discount applies to the initial regular order and the initial line items, but **not** to future recurring order generations |
| `"AnyOrder"` | Discount applies to both the initial order and all future recurring order generations |

Use `"NonRecurringOrdersOnly"` for welcome/sign-up promotions. Use `"AnyOrder"` for standing loyalty discounts.

**Cart discount JSON — NonRecurringOrdersOnly (10% welcome discount):**
```json
{
  "value": { "type": "relative", "permyriad": 1000 },
  "cartPredicate": "1 = 1",
  "target": { "type": "lineItems", "predicate": "1 = 1" },
  "stackingMode": "Stacking",
  "recurringOrderScope": { "type": "NonRecurringOrdersOnly" }
}
```
Result: Applies to all line items in the initial cart order (both one-time and recurring line items), plus recurring order line items in the first generation — but NOT to future recurring order generations.

**Cart discount JSON — AnyOrder (standing 10% loyalty discount):**
```json
{
  "value": { "type": "relative", "permyriad": 1000 },
  "cartPredicate": "1 = 1",
  "target": { "type": "lineItems", "predicate": "1 = 1" },
  "stackingMode": "Stacking",
  "recurringOrderScope": { "type": "AnyOrder" }
}
```
Result: Applies to all line items in every order generation (initial and all subsequent recurring orders).

---

## Recurring Order Update Actions

### Skip configuration

Set the number of recurrence cycles to skip:

```json
{
  "action": "setOrderSkipConfiguration",
  "skipConfiguration": {
    "type": "Counter",
    "totalToSkip": 3
  }
}
```

To change the subscription expiry, use the dedicated `setExpiresAt` action:

```json
{
  "action": "setExpiresAt",
  "expiresAt": "2026-12-31T00:00:00.000Z"
}
```

### Pause a recurring order

```json
{
  "action": "setRecurringOrderState",
  "recurringOrderState": "paused"
}
```

### Change the schedule

```json
{
  "action": "setSchedule",
  "schedule": {
    "type": "standard",
    "value": 2,
    "intervalUnit": "Months"
  }
}
```

---

## Recurring Cart Modifications

To modify shipping, payment, or add a one-time item to an upcoming recurring order:

1. Fetch the recurring order: `GET /recurring-orders/{id}` — the response contains a `cart.id` field
2. Apply Cart Update Actions to that cart ID directly (standard cart update endpoint)

**Behavior when adding a line item with a different recurrence schedule:**
- The **original recurring order is paused** automatically
- A **new recurring order** is created with the new schedule applied
- This is a permanent split — the original order does not resume automatically

This pattern is useful for upgrading/downgrading a subscription tier where the new tier has a different billing cadence.

---

## Platform Behavior — Edge Cases

**Adding items to an existing recurring order cart:**
- Only line items with a `recurrenceInfo` (associated with a recurrence policy) can be added
- Adding a line item with a **different recurrence schedule** than the existing recurring order causes:
  1. The original recurring order → **paused** automatically
  2. A **new recurring order** is created immediately with the combined schedule
- This split is permanent — the paused order does not resume automatically

**Changing shipping address or shipping method on a recurring cart:**
- Safe operation — does NOT create a new recurring order

**Adding payment to a recurring cart:**
- Safe operation — does NOT create a new recurring order

## Cart Lifecycle for Recurring Orders

Carts created as part of the Recurring Orders flow have a special `CartOrigin` value of `RecurringOrder`. These carts are **exempt from the automatic 90-day cart cleanup** that applies to standard carts:
- Standard carts are automatically deleted after 90 days of inactivity (based on `lastModifiedAt`)
- Recurring Order carts persist indefinitely — they serve as templates for future order generation
- This means you do not need to implement keep-alive pings or artificial updates to preserve recurring cart templates
- For GDPR purposes: if a recurring order is cancelled and the associated cart is no longer needed, explicitly delete it — it will not auto-expire
