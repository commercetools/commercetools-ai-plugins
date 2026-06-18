# Quote Lifecycle

**Source:** https://docs.commercetools.com/api/projects/quotes

---

## Overview

commercetools implements B2B quoting as a **four-entity pipeline**, each with its own resource type and state machine. The pipeline converts a buyer's intent into a negotiated, finalised price that can be checked out as an Order.

```
QuoteRequest  →  StagedQuote  →  Quote  →  Order
  (buyer)          (sales rep)   (sales rep)  (buyer)
```

---

## The Four Entities

### 1. QuoteRequest

**Who creates it:** The buyer (associate acting on behalf of a Business Unit).

**What it is:** The buyer's initial request for a custom price. It is created from an existing **Cart** and carries all line items, quantities, and any buyer notes or comments.

**State machine:**

| State | Description |
|---|---|
| `Submitted` | Initial state. The buyer has submitted the request. |
| `Accepted` | The sales rep has accepted the request and is working on it (a StagedQuote will be created). |
| `Closed` | The request is closed (either superseded by a final Quote or abandoned). |
| `Rejected` | The sales rep has rejected the request without creating a quote. |
| `Cancelled` | The buyer has cancelled their own request before it was acted on. |

**Key fields:** `quoteRequestState`, `comment` (buyer notes), `customer`, `businessUnit`, `lineItems` (inherited from the source cart).

---

### 2. StagedQuote

**Who creates it:** The sales representative (merchant-side actor).

**What it is:** The sales rep's working draft of the negotiated quote. Created from a QuoteRequest. The sales rep modifies line item prices, applies discounts, or adjusts quantities on a new **Quote Cart** associated with the StagedQuote.

**State machine:**

| State | Description |
|---|---|
| `InProgress` | The sales rep is actively working on the quote draft. |
| `Sent` | The draft has been finalised and a Quote has been created and sent to the buyer. |
| `Closed` | No longer active (e.g. the associated Quote was accepted, rejected, or withdrawn). |

**Key fields:** `stagedQuoteState`, `quotationCart` (the cart used to draft the negotiated pricing), `sellerComment`.

---

### 3. Quote

**Who creates it:** The sales representative, when the StagedQuote is marked `Sent`.

**What it is:** The formal, binding quote presented to the buyer. Contains the final negotiated prices. The buyer reviews the Quote and either accepts or rejects it.

**State machine:**

| State | Description |
|---|---|
| `Pending` | The quote has been sent to the buyer and is awaiting their response. |
| `Accepted` | The buyer has accepted the quote (ready to be converted to an Order). |
| `Declined` | The buyer has declined the quote. |
| `DeclinedForRenegotiation` | The buyer has declined but requested a renegotiation (opens a new cycle). |
| `RenegotiationAddressed` | The seller has acknowledged the renegotiation request. |
| `Withdrawn` | The seller has withdrawn the quote before the buyer acted on it. |

**Key fields:** `quoteState`, `validTo` (expiry date), `buyerComment` (on decline/renegotiation), `sellerComment`.

---

### 4. Order (from Quote)

**Who creates it:** The buyer, after accepting the Quote.

**What it is:** A standard commercetools Order, created by calling `POST /orders/quotes` with the accepted Quote's ID. The Order is created with the negotiated prices locked in from the Quote.

Once created, the Order follows the normal Order state machine (`Open` → `Confirmed` → `Complete`, etc.) and fulfilment process.

---

## End-to-End Flow

```
1. Buyer builds a Cart and submits a QuoteRequest (state: Submitted)
2. Sales rep accepts the QuoteRequest (state: Accepted)
   → Sales rep creates a StagedQuote (state: InProgress)
3. Sales rep adjusts pricing on the StagedQuote's quotation cart
4. Sales rep sends the quote → StagedQuote (state: Sent) + Quote created (state: Pending)
5a. Buyer accepts the Quote (state: Accepted)
    → Buyer creates an Order from the Quote
5b. Buyer declines the Quote (state: Declined / DeclinedForRenegotiation)
    → Quote is closed or renegotiation cycle restarts
```

---

## Role Summary

| Actor | Actions |
|---|---|
| Buyer / Associate | Create QuoteRequest, cancel QuoteRequest, accept/decline Quote, create Order from accepted Quote |
| Sales Rep / Merchant | Accept/reject QuoteRequest, create & edit StagedQuote, create Quote (send to buyer), withdraw Quote |

---

## Key API Endpoints

| Action | Endpoint |
|---|---|
| Create QuoteRequest | `POST /as-associate/{associateId}/in-business-unit/key={buKey}/quote-requests` |
| Create StagedQuote | `POST /staged-quotes` |
| Create Quote | `POST /quotes` |
| Create Order from Quote | `POST /orders/quotes` |
| Transition Quote state | `POST /quotes/{id}` with `changeQuoteState` action |

---

## Implementation Notes

- All buyer-facing mutations (create QuoteRequest, accept/decline Quote, create Order from Quote) must go through the `asAssociate` API path to enforce BU-scoped permission checks.
- Quote expiry (`validTo`) is enforced by the platform: an expired Quote cannot be accepted.
- A QuoteRequest is always tied to a specific Business Unit; this scopes the quote workflow to that BU's context.
