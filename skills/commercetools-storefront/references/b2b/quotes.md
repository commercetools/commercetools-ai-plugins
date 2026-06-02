---
name: quotes
description: B2B quotes dashboard — CT data model for QuoteRequest/StagedQuote/Quote, unified list with thread grouping per BU, as-associate API constraint, status labels, and SWR hooks.
when_to_use:
  - "Building the quotes list or dashboard page"
  - "Displaying quote activity grouped by negotiation thread"
  - "Fetching quotes via as-associate chain"
  - "Understanding the three-resource quote data model"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - quotes
---

# Quotes Dashboard

**Impact: HIGH — `Quote.sellerComment` is a per-round snapshot; `StagedQuote.sellerComment` is the latest-only mutable value. Always use `Quote.sellerComment` when displaying individual rounds in a thread.**

This reference covers the CT quote data model, as-associate API constraint, unified list display with thread grouping, status labels, and SWR hooks. For buyer actions (accept, decline, renegotiate) see [quote-actions.md](./quote-actions.md). For how a quote request is submitted from the cart see [checkout.md](./checkout.md).

## Table of Contents
- [Pattern 1: CT Data Model — Three Resources](#pattern-1-ct-data-model--three-resources)
- [Pattern 2: as-associate API Constraint](#pattern-2-as-associate-api-constraint)
- [Pattern 3: Unified List — Thread Grouping](#pattern-3-unified-list--thread-grouping)
- [Pattern 4: Status Labels](#pattern-4-status-labels)
- [Pattern 5: SWR Hooks](#pattern-5-swr-hooks)
- [Checklist](#checklist)

---

## Pattern 1: CT Data Model — Three Resources

```
QuoteRequest  →  StagedQuote  →  Quote (round 1)
                                  ↓ renegotiate
                              Quote (round 2)  [same StagedQuote]
```

| Resource | Who creates it | Key fields |
|---|---|---|
| `QuoteRequest` | Buyer (from active cart) | `comment`, `purchaseOrderNumber`, `lineItems`, `totalPrice` |
| `StagedQuote` | commercetools automatically | `sellerComment` (mutable — always latest seller edit) |
| `Quote` | Seller (in Merchant Center) | `sellerComment` (snapshot per round), `buyerComment`, `validTo`, `quoteState` |

One negotiation thread = one `StagedQuote` + one or more `Quote` rounds sharing the same `stagedQuote.id`. The `QuoteRequest` is the thread's origin.

---

## Pattern 2: as-associate API Constraint

All quote operations — list, detail, actions — must go through the as-associate chain:

```
apiRoot.asAssociate().withAssociateIdValue(associateId)
  .inBusinessUnitKeyWithBusinessUnitKeyValue(buKey)
  .quotes()
```

Using the project-level `apiRoot.quotes()` bypasses BU scoping and associate permission enforcement.

Always expand `['quoteRequest', 'stagedQuote']` on every fetch — required for the `sellerComment` per-round snapshot fallback and for reading the buyer's original `quoteRequestComment`.

---

## Pattern 3: Unified List — Thread Grouping

The dashboard shows **one row per negotiation thread**, not one row per `Quote` object.

**Grouping rule:** group all `Quote` objects by `stagedQuote.id`. Each group represents one thread. Display the `QuoteRequest` details (date, buyer comment) as the thread's origin row, then the most recent `Quote` round's state and seller comment as the thread summary.

**Thread state rule:** use the most recent `Quote.quoteState` as the row's state. If no `Quote` exists yet for a `QuoteRequest`, fall back to `QuoteRequest.quoteRequestState`.

**Multi-round indicator:** show a visual badge or count when a thread has more than one `Quote` round.

**Thread timeline (detail view, top to bottom = oldest to newest):**

1. Buyer request comment — shown once above all rounds, from `thread[0].quoteRequestComment`
2. Per round:
   - Seller comment — `Quote.sellerComment` (per-round snapshot, not `StagedQuote.sellerComment`)
   - Buyer counter-comment — `Quote.buyerComment`, only shown when present (set on renegotiate)
   - Expiry date — info line when `quote.validTo` is present
3. Sort quotes within a thread by `createdAt` ascending to maintain chronological order

All comment text must use `whitespace-pre-wrap` to preserve line breaks.

On the detail page, fetch the full thread by querying all `Quote` objects with the same `stagedQuote.id`. Defer this fetch until `stagedQuote.id` is known (pass `null` to the SWR hook to skip until available).

---

## Pattern 4: Status Labels

Map the entity state to a user-facing display label:

| Entity | State | Display label |
|---|---|---|
| `QuoteRequest` | `Submitted` | Pending review |
| `QuoteRequest` | `Accepted` | In negotiation |
| `Quote` | `Pending` | Quote ready |
| `Quote` | `RenegotiationRequested` | Renegotiation in progress |
| `Quote` | `RenegotiationAddressed` | Updated quote ready |
| `Quote` | `Accepted` | Accepted |
| `Quote` | `Declined` | Declined |
| `QuoteRequest` | `Withdrawn` | Withdrawn |

---

## Pattern 5: SWR Hooks

| Hook | Returns |
|---|---|
| `useQuotes()` | Paginated list of quotes for the active BU |
| `useQuote(id)` | Single quote detail; pass `null` to skip |
| `useQuoteThread(stagedQuoteId)` | All rounds sharing the same `stagedQuote.id`; pass `null` to skip |
| `useQuotesByQuoteRequest(qrId)` | Quotes linked to a specific quote request |
| `useQuoteRequests()` | Paginated list of quote requests for the active BU |
| `useQuoteRequest(id)` | Single quote request detail; pass `null` to skip |

All hooks scope the SWR cache key to `[KEY, businessUnitKey]` so data is isolated per BU. Pass `null` as the key to defer fetching until the required ID is available.

---

## Checklist

- [ ] `Quote.sellerComment` used (not `StagedQuote.sellerComment`) for per-round display
- [ ] Always `expand: ['quoteRequest', 'stagedQuote']` when fetching quotes
- [ ] All quote API calls via as-associate chain
- [ ] Dashboard groups quotes by `stagedQuote.id` — one row per thread
- [ ] Thread state driven by most recent `Quote.quoteState`; falls back to `QuoteRequest.quoteRequestState`
- [ ] SWR hooks use `[KEY, businessUnitKey]` tuple for cache isolation
- [ ] Actions (accept, decline, renegotiate) handled by [quote-actions.md](./quote-actions.md)
