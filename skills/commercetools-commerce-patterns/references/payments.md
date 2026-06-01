# Payments — Object Model, Transactions, and Integration Patterns

**Source:** 2026 Payments and Taxes deck (Expert Services)

---

## Key Principles

- **CT records payment state; the PSP does the actual financial processing.** commercetools is not a payment processor. The Payment object is a ledger that tracks the state of funds received/refunded. The actual charge flows through a PSP (Stripe, Adyen, Braintree, etc.) via a PSP-specific integration.
- **Transactions should only be set to Success after PSP confirmation.** Never optimistically mark a transaction as `Success` — wait for the PSP callback/webhook before updating the transaction state.
- **`interfaceId` is immutable once set.** The `interfaceId` field links the CT Payment to the PSP's transaction identifier. It cannot be changed after it is first recorded. Store it correctly on first write.
- **Payments are referenced by Order or Cart via `PaymentInfo`.** A Payment object exists independently — it is linked to a cart/order through the `addPayment` update action, which creates a reference in the cart/order's `paymentInfo.payments` array.

---

## Payment Object Model

```
Order / Cart
  └─ paymentInfo.payments[] → Payment
                                  ├─ amountPlanned (Money)
                                  ├─ interfaceId (String, optional, immutable once set)
                                  ├─ paymentMethodInfo (optional)
                                  │     ├─ paymentInterface: "CreditCardPayment"
                                  │     ├─ method: "creditCard"
                                  │     └─ name: { "en": "creditCard" }
                                  ├─ paymentStatus (optional)
                                  │     ├─ interfaceCode
                                  │     ├─ interfaceText
                                  │     └─ state (optional)
                                  ├─ transactions[] (array)
                                  └─ custom (CustomFields, optional)
```

**`amountPlanned`** — the amount this payment intends to receive from the customer. Usually matches the cart or order gross total.

**`interfaceId`** — the identifier used by the PSP to track this payment. Should be set when the PSP transaction identifier is known. Immutable once set — do not update.

**`paymentMethodInfo`** — stores the payment interface name, method (e.g., `creditCard`, `paypal`), and a localized display name.

**`paymentStatus`** — records PSP-specific status codes (`interfaceCode`, `interfaceText`) and optionally a CT state machine state.

---

## Transactions

Transactions are an array on the Payment object that tracks the full lifecycle of a payment:

### Transaction Types

| Type | Description |
|------|-------------|
| `Authorization` | Funds reserved with PSP (hold) |
| `CancelAuthorization` | Authorization voided before capture |
| `Charge` | Funds captured / debited |
| `Refund` | Funds returned to customer |
| `Chargeback` | Customer-initiated reversal via bank/card network |

### Transaction States

| State | Description |
|-------|-------------|
| `Initial` | Transaction created, not yet submitted to PSP |
| `Pending` | Submitted to PSP, awaiting confirmation |
| `Success` | PSP confirmed the transaction completed |
| `Failure` | PSP confirmed the transaction failed |

### Transaction Fields

- `type` — TransactionType (see above)
- `amount` — Money
- `interactionId` — PSP's transaction identifier for this specific transaction (optional; helps correlate `interfaceInteractions`)
- `state` — TransactionState (see above)
- `custom` — CustomFields for additional PSP-specific data (masked card number, card brand, etc.)

```json
"transactions": [
  {
    "id": "0708a1d3-7055-...",
    "timestamp": "2021-06-21T16:13:02.667Z",
    "type": "Authorization",
    "amount": {
      "type": "centPrecision",
      "currencyCode": "USD",
      "centAmount": 7397,
      "fractionDigits": 2
    },
    "interactionId": "psp-txn-id",
    "state": "Success"
  }
]
```

---

## My Payments Endpoint

The `/me/payments` endpoint creates and provides access to payments **scoped to a specific customer**.

- Requires an access token from the **password flow** or **anonymous session flow** — not a client credentials token
- Returns a limited subset of Payment fields (`MyPayment` type): `id`, `version`, `customer` reference, `anonymousId`, `amountPlanned`, `paymentMethodInfo`, `transactions`, `custom`
- `MyPaymentDraft` auto-populates the `customer` field (password flow) or `anonymousId` (anonymous flow)

**Use `/me/payments` for customer-facing checkout flows.** Use the full Payment API (with client credentials) for backend/admin operations.

---

## Payment Flow

The standard PSP integration flow:

```
Customer → Shop → CTP (create/update Payment) → PSP (send/get Payment Info)
                     ↑                                        |
                     └────────────────────────────────────────┘
                         Transaction state (type, state update)
```

1. Customer enters checkout and selects payment method
2. Shop calls CT to create initial Payment resource
3. CT returns Payment with `id` and optional PSP transaction identifier
4. Shop sends payment info to PSP (card details via PCI-compliant iframe/element)
5. PSP processes and returns confirmation
6. Shop (or PSP webhook) updates CT Payment with final transaction state

---

## API Extension Flow for Payments

A more secure pattern using an API Extension to handle PSP token creation server-side:

1. Customer enters checkout, begins payment option selection
2. API request sent to create initial Payment resource in CT
3. API Extension is triggered by Payment creation event
4. Extension calls custom cloud function (AWS Lambda, GCP Function, etc.)
5. Cloud function calls PSP to create new transaction / obtain PCI-compliant token
6. PSP returns response with transaction identifier
7. Extension updates CT Payment with PSP transaction identifier via `updateActions`
8. Updated Payment resource (with PSP identifier) returned to shop
9. Customer enters card details — auth/capture sent directly to PSP via PCI-compliant form
10. PSP processes and returns transaction response to shop
11. PSP asynchronously pushes payment update events to a PSP Notification Microservice
12. Notification Microservice calls CT Payment API to update transaction states

**Why the Extension approach:** The PSP transaction token is created server-side (in the cloud function), never exposing PSP credentials to the browser. PCI compliance is maintained because card details go directly from the customer's browser to the PSP.

---

## commercetools Checkout (Out-of-the-Box UI)

commercetools offers a **Checkout** product — a hosted UI component that handles the full checkout flow including PSP integration.

**High-level flow:**
1. Cart and customer token are created/updated in your storefront
2. Initialize the CA SDK with cart and token
3. Checkout UI opens in context (embedded or redirect)
4. Checkout UI handles all communication with CT and PSPs
5. After successful transaction, control is returned to the seller site

**Two modes:**
- **Checkout Mode** — full address + payment flow
- **Payment Only Mode** — payment widget only (for storefronts that handle address collection separately)

**Supported PSPs:** Stripe, PayPal, Apple Pay, and others (via CT Checkout native integrations). The Checkout component handles PCI-compliant card collection, PSP communication, and updates CT Payment objects automatically.

Use CT Checkout when you want to minimize custom PSP integration work. Build a custom payment integration when you need full control over the checkout UX or use a PSP not natively supported.
