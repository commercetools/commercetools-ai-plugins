---
name: payment-only-mode
description: Implementation guide for integrating the Checkout Browser SDK with payment-only mode (paymentFlow), full hosted checkout (checkoutFlow), and express payment buttons.
when_to_use:
  - "Integrating the Checkout into a headless or hosted storefront"
  - "Replacing only the payment step while keeping existing address and shipping flows"
  - "Setting up Stripe, Adyen, Mollie, or other PSP connectors via Checkout Applications"
  - "Implementing order creation via commercetools Sessions API and handling post-payment confirmation"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - sdk
---

# Checkout Integration

Adds payment processing via the [Checkout Browser SDK](https://docs.commercetools.com/checkout/browser-sdk).

---

## Before You Start — Ask the User Two Questions

**Always ask these before writing any code:**

1. **Which checkout mode?**
   - `paymentFlow` — payment-only: keep existing address/shipping steps, replace only `StepPayment.tsx` with the commercetools widget. Least invasive.
   - `checkoutFlow` — full page: replace the entire multi-step checkout with a single commercetools-hosted checkout page (addresses, shipping, and payment all handled by Checkout).
   - `expressPayment` — express buttons: add Apple Pay / Google Pay buttons to the cart or PDP. Can coexist with either of the above.

2. **Which PSP (Payment Service Provider)?**
   The user must configure a Connector in the commercetools Merchant Center that connects to their PSP (e.g., Stripe, Adyen, Mollie, PayPal). The skill does not set up the PSP connector — that is done in commercetools Merchant Center or via the Payment Integrations API. Just record the answer so it's clear in your implementation notes.

---

## Architecture Overview

```
Browser (SDK)  →  Checkout service  →  PSP
                       ↑
      /api/checkout/session  (creates Checkout Session from cart)
                       ↑
      commercetools Sessions API  (POST https://session.{region}.commercetools.com/{projectKey}/sessions)
```

The storefront creates a **Checkout Session** (server-side, via a new API route) and passes the returned `sessionId` to the browser SDK. The SDK handles all payment UI and communication with the PSP. After payment, commercetools creates the order automatically (full/express) or triggers a webhook/redirect (payment-only).

---

## Step 0 — Prerequisites

### 0a. Add environment variables to `site/.env`

```bash
# The key of your Checkout Application
CTP_CHECKOUT_APP_KEY=storefront-checkout
```

`CTP_PROJECT_KEY`, `CTP_API_URL`, and `CTP_SCOPES` are already in `site/.env`. The region is derived automatically from `CTP_API_URL` at startup — **do not add a separate `CT_REGION` variable**. `projectKey` and `region` are returned to the browser by `/api/checkout/session`, so **no `NEXT_PUBLIC_*` variables are needed**.

### 0b. Install the Browser SDK

```bash
cd site && npm install @commercetools/checkout-browser-sdk
```

---

## Step 1 — Session creation API route

Create `site/app/api/checkout/session/route.ts`. This route:
1. Reads the current cart ID from the session
2. Exchanges an OAuth token
3. POSTs to the commercetools Sessions API to create a Checkout Session
4. Returns the `sessionId` to the browser

```typescript
// site/app/api/checkout/session/route.ts

const APP_KEY = process.env.CTP_CHECKOUT_APP_KEY!;

// Derive region from CTP_API_URL — no separate CT_REGION variable needed.
// https://api.us-central1.gcp.commercetools.com → us-central1.gcp
const REGION = API_URL.replace(/^https?:\/\/api\./, '').replace(/\.commercetools\.com\/?$/, '');

async function getManageSessionsToken(): Promise<string> {
  // fetch token from oauth/token?grant_type=client_credentials
}

export async function POST() {
  // guard with session's cart ID

  try {
    const token = await getManageSessionsToken();
    const res = await fetch(
      `https://session.${REGION}.commercetools.com/${PROJECT_KEY}/sessions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cart: { cartRef: { id: session.cartId } },
          metadata: { applicationKey: APP_KEY },
        }),
      },
    );
    // handle errors here
    const data = await res.json();
    // Return projectKey and region so the client component needs no NEXT_PUBLIC_ vars
    return NextResponse.json({ sessionId: data.id, projectKey: PROJECT_KEY, region: REGION });
  } catch (e: unknown) {
   // handle error
  }
}
```

---

## Step 2 — Integration by mode

### Mode A: `paymentFlow` (payment-only — recommended starting point)

This is the least invasive change. Keep the existing address and shipping steps. Only the payment step.

#### 2A-1. Implement `StepPayment.tsx`

```typescript
// site/components/checkout/StepPayment.tsx
'use client';
...
import { paymentFlow } from '@commercetools/checkout-browser-sdk';

export default function StepPayment() {
  // fetch checkout session
  useEffect(() => {
   // handle loading and single initialization

    (async () => {
      try {
        const { sessionId, projectKey, region } = await getCheckoutSession();
        

        paymentFlow({
          projectKey,
          region,
          sessionId,
          locale,           // from useLocale() — never hardcode
          onInfo: (msg) => {
            if (msg.code === 'checkout_completed') {
              router.push(<checkout-confirmation-path>);
            }
          },
          onError: (err) => {
            // SDK Message type has payload/code, not message
            setError(String(err.payload ?? err.code ?? 'Payment error'));
          },
        });
      } catch (e: unknown) {
       // handle errors
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      // display loading DOM 
      {/* Required mount point — without this the widget occupies the full page */}
      <div data-ctc />
      // display errors
    </div>
  );
}
```

**No `NEXT_PUBLIC_*` env vars are needed.** `projectKey` and `region` are returned by `/api/checkout/session` alongside the `sessionId` and read from the response in the client component.

#### 2A-2. Integrate into the checkout step page

In Checkout page, the payment step should render the PaymentStep.tsx

> **Note**: With `paymentFlow`, Checkout handles the payment AND the **order is created by commercetools** automatically when payment succeeds (via the `paymentReturnUrl` configured in the Application). 

---

## Step 3 — Order confirmation after Checkout

Checkout navigates the browser to `paymentReturnUrl` after a successful payment, appending `?orderId=<id>` (or `?orderNumber=<n>`). Update the confirmation page to read these params:

---

## Step 5 — Styling

Optional: Override Checkout widget styles via the `styles` option (CSS custom properties):

```typescript
checkoutFlow({
  // ...
  styles: {
    '--font-family': 'var(--font-sans)',
    '--color-primary': '#2d2d2d',       // charcoal
    '--color-primary-hover': '#4a4a4a',
    '--border-radius': '0.125rem',      // rounded-sm
  },
});
```

Available CSS variables are listed in the Checkout theming docs.

---

## Environment Variable Summary

| Variable | Secret? | Purpose |
|---|---|---|
| `CTP_CHECKOUT_APP_KEY` | No | **New** — key of the Checkout Application |


No `CT_REGION`, `NEXT_PUBLIC_CT_PROJECT_KEY`, or `NEXT_PUBLIC_CT_REGION` variables are needed. The session API derives the region from `CTP_API_URL` and returns `{ sessionId, projectKey, region }` to the browser.

---

## Checklist

### Prerequisites
- [ ] `CTP_CHECKOUT_APP_KEY` added to `site/.env` (the only new variable required)
- [ ] `@commercetools/checkout-browser-sdk` installed

### Session API
- [ ] Create `site/app/api/checkout/session/route.ts`

### SDK integration (per mode)
- [ ] **paymentFlow**: Replace `StepPayment.tsx` with commercetools widget mount; remove payment actions from `/api/checkout/route.ts`

### Order confirmation
- [ ] Update confirmation page to read `?orderId=` from commercetools redirect URL or `onInfo` callback

---

## Key Engineering Notes

**Session expiry** — Checkout Sessions expire. Create the session as late as possible (when the user lands on the payment step / checkout page), not when the cart is created.

**`<div data-ctc />`** — For `paymentFlow`, always render `<div data-ctc />` in the component's JSX. Without it the commercetools widget mounts at the document root and occupies the full page. 

**No `NEXT_PUBLIC_*` vars** — `projectKey` and `region` are server-side config. Return them from `/api/checkout/session` alongside `sessionId` so the browser never needs `NEXT_PUBLIC_` prefixed variables for these values.

**`paymentReturnUrl` must be registered** — Only one return URL per Connector. The URL must exactly match what's registered in the commercetools Application `paymentsConfiguration.paymentReturnUrl`.
