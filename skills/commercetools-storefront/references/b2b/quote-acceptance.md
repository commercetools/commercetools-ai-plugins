---
name: quote-acceptance
description: Quote acceptance checkout covering quote state guards, two-step acceptance and order creation, version sequencing, and confirmation.
when_to_use:
  - "Implementing quote acceptance flow"
  - "Handling quote-to-order conversion"
  - "Managing quote state transitions"
  - "Building quote confirmation pages"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - quotes
    - checkout
---

# Quote Acceptance Checkout

Navigate to `app/[locale]/checkout-quote/page.tsx` with `?quoteId=<id>` after a quote is approved.

## Steps

1. Load the quote by `quoteId`
2. Guard: only proceed if `quote.quoteState === 'Pending'` or `'RenegotiationAddressed'` — show an error otherwise
3. User clicks **Accept & Place Order**:
   - `acceptQuoteRequest(quoteId, quote.version)` → transitions quote to `Accepted`
   - `createOrderFromQuoteRequest(quoteId, acceptedQuote.version)` → creates the order using the accepted version
4. Clear `cartId` from session (if set) and redirect to `/checkout/confirmation?orderId=<id>`

**Why two steps:** commercetools requires the quote to be explicitly `Accepted` before an order can be created from it. The accept and create-order calls must happen sequentially — use the `version` returned from the accept call for the order creation call, not the original quote version.

```typescript
// hooks/useQuotesApi.ts
export async function acceptQuoteRequest(quoteId: string, version: number) {
  const res = await fetch(`/api/quotes/${quoteId}/accept`, { method: 'POST', body: JSON.stringify({ version }) });
  if (!res.ok) throw new Error('Failed to accept quote');
  return res.json();
}

export async function createOrderFromQuoteRequest(quoteId: string, version: number) {
  const res = await fetch(`/api/quotes/${quoteId}/order`, { method: 'POST', body: JSON.stringify({ version }) });
  if (!res.ok) throw new Error('Failed to create order from quote');
  return res.json();
}
```

The quote checkout page does not go through the multi-step checkout shell — it is a single confirmation screen. Payment for quote orders is agreed at quote time; no payment SDK step is needed here.

## Checklist

- [ ] Guard rejects quotes not in `Pending` or `RenegotiationAddressed` state
- [ ] Accept call fires first; order creation uses the version from the accept response
- [ ] `cartId` cleared from session after order creation
- [ ] Redirects to `/checkout/confirmation?orderId=<id>` on success
