---
name: quotes
description: Multi-round quote negotiation model, distinction between Quote and StagedQuote comments, as-associate API calls, and thread display logic.
when_to_use:
  - "Displaying quote threads with multi-round comments"
  - "Creating quote requests with shipping address requirements"
  - "Clearing the cart after successful quote request creation"
  - "Implementing quote actions such as accept, decline, renegotiate, or withdraw"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - quotes
    - approval-workflows
---

# Quotes Feature

**Impact: HIGH — `Quote.sellerComment` is a per-round snapshot; `StagedQuote.sellerComment` is mutable. Using the wrong field makes all rounds in a thread show the same seller comment.**

This reference covers the commercetools quote data model, multi-round negotiation, the as-associate API calls, SWR hooks, and the thread timeline UI.

## Table of Contents
- [Pattern 1: commercetools Data Model — Three Resources](#pattern-1-ct-data-model--three-resources)
- [Pattern 2: Quote API Calls — as-associate Chain](#pattern-2-quote-api-calls--as-associate-chain)
- [Pattern 3: Quote Request Creation — Cart Must Have Shipping Address](#pattern-3-quote-request-creation--cart-must-have-shipping-address)
- [Pattern 4: Multi-Round Thread Display](#pattern-4-multi-round-thread-display)
- [Pattern 5: SWR Hooks](#pattern-5-swr-hooks)
- [Checklist](#checklist)

---

## Pattern 1: commercetools Data Model — Three Resources

```
QuoteRequest  →  StagedQuote  →  Quote (round 1)
                                  ↓ renegotiate
                              Quote (round 2)  [same StagedQuote]
```

| Resource | Who creates it | Key fields |
|---|---|---|
| `QuoteRequest` | Buyer (from active cart) | `comment`, `purchaseOrderNumber`, `lineItems`, `totalPrice` |
| `StagedQuote` | commercetools automatically | `sellerComment` (mutable — always latest seller edit) |
| `Quote` | Seller (in Merchant Center) | `sellerComment` (snapshot), `buyerComment`, `validTo`, `quoteState` |

**Multi-round negotiation:** Multiple `Quote` objects share the same `stagedQuote.id`. This forms a thread. `Quote.sellerComment` is a per-round snapshot — it differs between rounds. `StagedQuote.sellerComment` is always the latest value.

**INCORRECT — using StagedQuote.sellerComment for thread display:**

```typescript
// WRONG — all rounds show the same (latest) seller comment
const sellerComment = quote.stagedQuote?.sellerComment;
```

**CORRECT — use Quote.sellerComment (snapshot at creation time):**

```typescript
// lib/mappers/quote.ts
export function mapQuote(obj: CtQuote): Quote {
  const stagedQuoteObj = (obj.stagedQuote as { obj?: CtStagedQuote })?.obj;

  return {
    // ...
    // Quote.sellerComment is the per-round snapshot — primary source
    sellerComment: obj.sellerComment ?? stagedQuoteObj?.sellerComment,
    // quoteRequestComment comes from the QuoteRequest (via expand)
    quoteRequestComment:
      (obj.quoteRequest as { obj?: { comment?: string } })?.obj?.comment,
  };
}
```

---

## Pattern 2: Quote API Calls — as-associate Chain

**INCORRECT:** Using project-level `apiRoot.quotes()`:

```typescript
// WRONG — bypasses BU scoping and associate permission enforcement
const { body } = await apiRoot.quotes().get().execute();
```

**CORRECT — all quote operations via as-associate chain:**

```typescript
// lib/ct/quotes.ts (key excerpt)
function asAssociate(associateId: string, businessUnitKey: string) {
  return apiRoot
    .asAssociate()
    .withAssociateIdValue({ associateId })
    .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey });
}

export async function getQuotes(associateId: string, businessUnitKey: string, locale: string) {
  const { body } = await asAssociate(associateId, businessUnitKey)
    .quotes()
    .get({
      queryArgs: {
        expand: ['quoteRequest', 'stagedQuote'],
        sort: 'createdAt desc',
        limit: 20,
      },
    })
    .execute();
  return body.results.map((q) => mapQuote(q, locale));
}

// Always expand both quoteRequest and stagedQuote —
// needed for sellerComment fallback and quoteRequestComment
export async function getQuotesByFilter(
  associateId: string,
  businessUnitKey: string,
  where: string,
  locale: string
) {
  const { body } = await asAssociate(associateId, businessUnitKey)
    .quotes()
    .get({
      queryArgs: {
        where,
        expand: ['quoteRequest', 'stagedQuote'],
        sort: 'createdAt asc', // chronological for thread display
      },
    })
    .execute();
  return body.results.map((q) => mapQuote(q, locale));
}

// Quote actions: accept, decline, renegotiate, withdraw
export async function performQuoteAction(
  associateId: string, businessUnitKey: string, quoteId: string,
  version: number, action: string, buyerComment?: string
) {
  const actions = action === 'accept'
    ? [{ action: 'changeQuoteState', quoteState: 'Accepted' }]
    : action === 'decline'
    ? [{ action: 'changeQuoteState', quoteState: 'Declined' }]
    : action === 'renegotiate'
    ? [{ action: 'requestQuoteRenegotiation', buyerComment }]
    : [{ action: 'changeQuoteState', quoteState: 'Withdrawn' }];

  const { body } = await asAssociate(associateId, businessUnitKey)
    .quotes().withId({ ID: quoteId })
    .post({ body: { version, actions } })
    .execute();
  return mapQuote(body);
}
```

---

## Pattern 3: Quote Request Creation — Cart Must Have Shipping Address

**INCORRECT:** Creating a quote request from a cart without a shipping address:

```typescript
// WRONG — commercetools requires a shipping address; throws 400 if absent
const { body } = await asAssociate(...).quoteRequests()
  .post({ body: { cart: { id: cartId, typeId: 'cart' }, version, comment } })
  .execute();
```

**CORRECT — set a placeholder shipping address if the cart has none:**

```typescript
// lib/ct/quotes.ts
export async function createQuoteRequest(
  associateId: string, businessUnitKey: string, storeKey: string,
  cartId: string, cartVersion: number, comment?: string, purchaseOrderNumber?: string
) {
  // commercetools requires shipping address — add placeholder if absent
  let currentVersion = cartVersion;
  const cart = await getCartById(cartId, associateId, businessUnitKey, storeKey);
  if (!cart.shippingAddress) {
    const updated = await updateCart(
      cartId, currentVersion,
      [{ action: 'setShippingAddress', address: { country: cart.country || 'US' } }],
      associateId, businessUnitKey, storeKey
    );
    currentVersion = updated.version;
  }

  const { body } = await asAssociate(associateId, businessUnitKey)
    .quoteRequests()
    .post({
      body: {
        cart: { id: cartId, typeId: 'cart' },
        version: currentVersion,
        comment,
        purchaseOrderNumber,
      },
    })
    .execute();

  return body;
}
```

> After a successful quote request creation, clear `session.cartId` — the cart is now locked to the quote request and should not be used for normal shopping.

---

## Pattern 4: Multi-Round Thread Display

**Thread grouping on the quotes list page:**

```typescript
// Group quotes that share the same stagedQuote.id
type QuoteGroup = { stagedQuoteId: string; quotes: Quote[]; isThread: boolean };

function groupQuotesByStagedQuote(quotes: Quote[]): QuoteGroup[] {
  const map = new Map<string, Quote[]>();
  for (const q of quotes) {
    const key = q.stagedQuote?.id ?? q.id; // singles use their own id as key
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(q);
  }
  return Array.from(map.entries()).map(([id, qs]) => ({
    stagedQuoteId: id,
    quotes: qs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    isThread: qs.length > 1,
  }));
}
```

**Thread timeline — comment bubble order (top to bottom = oldest to newest):**

1. **Quote request comment** (blue bubble) — shown once above all rounds, from `thread[0].quoteRequestComment`
2. Per round:
   - **Seller comment** (grey bubble, `quote.createdAt`) — `Quote.sellerComment` (snapshot)
   - **Buyer comment** (red bubble, `quote.lastModifiedAt`) — `Quote.buyerComment` (set on renegotiate)
3. **Expiry date** — amber info line below round header when `quote.validTo` is present

> All comment bubbles use `whitespace-pre-wrap` to preserve `\n` characters.

**Thread detail page fetch:**

```typescript
// Fetch the thread: all quotes with the same stagedQuote.id
function QuoteDetailPage({ quoteId }) {
  const { data: quote } = useQuote(quoteId);
  const { data: thread } = useQuoteThread(quote?.stagedQuote?.id ?? null);
  // null key → SWR skips the fetch until stagedQuote.id is known

  if (thread && thread.length > 1) {
    return <ThreadTimeline quotes={thread} />;
  }
  return <SingleQuoteView quote={quote} />;
}
```

---

## Pattern 5: SWR Hooks

```typescript
// hooks/useQuotes.ts — available hooks
useQuotes()                                    // paginated quote list
useQuote(id: string | null)                    // single quote detail (null = skip)
useQuoteThread(stagedQuoteId: string | null)   // all rounds in a thread
useQuotesByQuoteRequest(qrId: string | null)   // quotes linked to a quote request
useQuoteRequests()                             // paginated quote request list
useQuoteRequest(id: string | null)             // single quote request detail

// Mutations
const { performQuoteAction } = useQuoteMutations();
await performQuoteAction(quoteId, 'accept');
await performQuoteAction(quoteId, 'renegotiate', buyerComment);
```

**All quote hooks use the BU key in the SWR cache tuple:**

```typescript
export function useQuotes() {
  const { currentBusinessUnit } = useBusinessUnit();
  const buKey = currentBusinessUnit?.key ?? null;
  return useSWR(
    buKey ? [KEY_QUOTES, buKey] : null,
    ([, bk]) => fetchQuotes(bk),
    { revalidateOnFocus: false }
  );
}
```

---

## Checklist

- [ ] `Quote.sellerComment` used (not `StagedQuote.sellerComment`) for per-round display
- [ ] Always `expand: ['quoteRequest', 'stagedQuote']` when fetching quotes
- [ ] Quote requests always set shipping address on cart before creating
- [ ] `session.cartId` cleared after successful quote request creation
- [ ] All quote API calls via as-associate chain
- [ ] SWR hooks use `[KEY, businessUnitKey]` tuple keys for cache isolation
- [ ] Quote actions gate on `AcceptMyQuotes`/`AcceptOthersQuotes` based on `quote.customer.id === user.id`
