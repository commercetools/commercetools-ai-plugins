---
name: quote-actions
description: Buyer-side quote state transitions — accept and place order, decline, and renegotiate — with state guards and version sequencing rules.
when_to_use:
  - "Implementing quote acceptance and order creation"
  - "Adding decline or renegotiation actions to the quote detail page"
  - "Handling quote state guards before allowing buyer actions"
  - "Building the quote confirmation checkout page"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - quotes
    - checkout
---

# Quote Actions

Acceptance is initiated from the quote-checkout view, reached with a `?quoteId=<id>` query parameter. Decline and renegotiate are triggered from the quote detail page.

## Table of Contents
- [State Guard](#state-guard)
- [Accept & Place Order](#accept--place-order)
- [Decline](#decline)
- [Renegotiate](#renegotiate)
- [Associate Permission Guard](#associate-permission-guard)
- [Checklist](#checklist)

---

## State Guard

Before rendering any action button, check `quote.quoteState`:

| Action | Allowed states |
|---|---|
| Accept | `Pending`, `RenegotiationAddressed` |
| Decline | `Pending`, `RenegotiationAddressed` |
| Renegotiate | `Pending` only |

Show an error and no action buttons if the quote is not in an allowed state.

---

## Accept & Place Order

The acceptance flow is a **single confirmation screen** — not the multi-step checkout shell. Payment is agreed at quote time; no payment SDK step is needed.

**Sequence:**

1. Guard: quote must be `Pending` or `RenegotiationAddressed`
2. User clicks **Accept & Place Order**
3. Transition the quote to `Accepted` via `changeQuoteState`
4. Create the order using `createOrderFromQuote` — use the **version returned from step 3**, not the original quote version
5. Clear `cartId` from session and redirect to `/checkout/confirmation?orderId=<id>`

Steps 3 and 4 are sequential and must not be parallelised. The order creation call will fail if the quote is not yet in `Accepted` state when it fires.

---

## Decline

1. Guard: quote must be `Pending` or `RenegotiationAddressed`
2. User clicks **Decline**
3. Transition the quote to `Declined` via `changeQuoteState`
4. Redirect to the quotes dashboard

No order is created. The thread remains visible in the dashboard with state "Declined".

---

## Renegotiate

1. Guard: quote must be `Pending`
2. Present a textarea for the buyer's counter-comment
3. User submits — call `requestQuoteRenegotiation` with the `buyerComment`
4. The quote transitions to `RenegotiationRequested`; the `buyerComment` is stored on the `Quote`
5. Redirect to the quote detail page

This opens a new negotiation round. The seller responds by updating the `StagedQuote` and publishing a new `Quote` (round N+1). That new `Quote` shares the same `stagedQuote.id` and will appear as the next entry in the thread timeline. The buyer then sees state `RenegotiationAddressed` and can accept, decline, or renegotiate again.

---

## Associate Permission Guard

Before rendering any action button, also check that the associate has the appropriate permission:
- `AcceptMyQuotes` — when `quote.customer.id === currentUser.id`
- `AcceptOthersQuotes` — when acting on another associate's quote

---

## Checklist

- [ ] State guard shown before any action button; error displayed for invalid states
- [ ] Accept and order creation are sequential — order creation uses the version from the accept response
- [ ] No payment SDK step on the quote acceptance page
- [ ] `cartId` cleared from session after order creation
- [ ] Redirects to `/checkout/confirmation?orderId=<id>` on order success
- [ ] Decline redirects to the quotes dashboard with `Declined` state visible
- [ ] Renegotiate stores `buyerComment` on the Quote; thread gains a new round after seller responds
- [ ] Associate permission (`AcceptMyQuotes` / `AcceptOthersQuotes`) checked before rendering actions
