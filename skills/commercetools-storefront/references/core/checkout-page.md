---
name: checkout-page
description: Multi-step checkout structure, address step, shipping method selection, payment via commercetools SDK, and confirmation page patterns.
when_to_use:
  - "Building the checkout flow"
  - "Implementing shipping method selection"
  - "Integrating the payment step with commercetools checkout SDK"
  - "Handling order confirmation pages"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - session
---

# Checkout Page

**Impact: HIGH — The checkout route is the revenue path. A failed order placement or stale cart version drops the conversion entirely.**

This reference covers the shared checkout structure used by both B2C and B2B storefronts: the multi-step page shell, shipping method selection, payment via the commercetools checkout frontend SDK, and the confirmation page. Address step details and order placement are storefront-specific — see the relevant extension file.

## Table of Contents
- [Pattern 1: Multi-Step Checkout Page Structure](#pattern-1-multi-step-checkout-page-structure)
- [Pattern 2: Address Step](#pattern-2-address-step)
- [Pattern 3: Shipping Method Selection](#pattern-3-shipping-method-selection)
- [Pattern 4: Payment Step — commercetools Checkout Frontend SDK](#pattern-4-payment-step--commercetools-checkout-frontend-sdk)
- [Pattern 5: Confirmation Page](#pattern-5-confirmation-page)
- [Checklist](#checklist)

---

## Pattern 1: Multi-Step Checkout Page Structure

The checkout is URL-based with three steps: `addresses`, `shipping`, `payment`. The index page reads the cart state and redirects to the furthest step the user can access.

```typescript
// app/[locale]/checkout/page.tsx  ← redirect index
'use client';

export default function CheckoutIndexPage() {
  const router = useRouter();
  const { data: cart } = useCartSWR();

  useEffect(() => {
    if (cart === undefined) return; // still loading

    const hasAddr = !!(cart?.shippingAddress?.streetName && cart?.billingAddress?.streetName);
    const hasMethod = !!cart?.shippingInfo;

    if (hasAddr && hasMethod) {
      router.replace('/checkout/payment');
    } else if (hasAddr) {
      router.replace('/checkout/shipping');
    } else {
      router.replace('/checkout/addresses');
    }
  }, [cart]);

  return null;
}
```

Each step has a guard that redirects back if prerequisites are not met:

```typescript
useEffect(() => {
  if (cart === undefined) return;
  const hasAddr = !!(cart?.shippingAddress?.streetName && cart?.billingAddress?.streetName);
  const hasMethod = !!cart?.shippingInfo;
  if (step === 'shipping' && !hasAddr) router.replace('/checkout/addresses');
  if (step === 'payment' && (!hasAddr || !hasMethod)) router.replace('/checkout/addresses');
}, [cart]);
```

Layout: two-column grid — steps on the left (3 cols), sticky order summary on the right (2 cols).

---

## Pattern 2: Address Step

Address step details differ between storefronts — saved address sources and validation rules vary. See the storefront-specific extension for the full address step implementation.

- Only store address details when moving to the next step
- Display the "State" field only when the selected country requires it

---

## Pattern 3: Shipping Method Selection

Shipping methods are fetched via a Route Handler that filters by the session currency. A shipping method with no rate for the current currency must never appear.

```typescript
// app/api/shipping-methods/route.ts
export async function GET() {
  const { currency } = await getLocale();

  try {
    const result = await getShippingMethods();
    // Filter to methods that have a matching rate for the session currency
    return NextResponse.json({ shippingMethods });
  } catch {
    return NextResponse.json({ shippingMethods: [] });
  }
}
```

```typescript
// hooks/useShippingMethods.ts
'use client';

export function useShippingMethods() {
  const { country, currency } = useLocale();
  const key = country && currency ? [keyShippingMethods(country, currency), country, currency] : null;
  return useSWR<ShippingMethod[]>(key, shippingMethodsFetcher, { revalidateOnFocus: false });
}
```

> `revalidateOnFocus: false` — shipping methods change rarely; no need to re-fetch on tab switch.

When the user selects a method, `PATCH /api/cart` with `shippingMethodId` and update the SWR cache from the response.

---

## Pattern 4: Payment Step — commercetools Checkout Frontend SDK

The payment step is handled entirely by the commercetools checkout frontend SDK, which renders the full payment UI and drives order placement.

> **Reference:** See the [commercetools checkout frontend SDK](../../../commercetools-checkout/references/payment-only-mode.md) implementation skill for full setup, component mounting, and event handling.

Key rules:
- Do not implement a custom payment form — mount the SDK component and let it manage the flow.
- The SDK handles order creation internally; do not create a method/call to handle order creation.
- After the SDK signals order completion, clear `cartId` from the session and redirect to the confirmation page.

---

## Pattern 5: Confirmation Page

The confirmation page is a Server Component that fetches the order directly from commercetools by `orderId` from the URL. Do not rely on client-side SWR here — the order may not yet appear in a freshly revalidated client cache.

```typescript
// app/[locale]/checkout/confirmation/[orderId]/page.tsx
export default async function ConfirmationPage({ params }: PageProps) {
  const { locale } = await getLocale();
  const { orderId } = await params;

  let order = null;
  try {
    order = await getOrderById(orderId);
  } catch {
    // Order not found — show minimal confirmation without line items
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      {/* Success indicator, order number, line items summary, CTA links */}
    </div>
  );
}
```

Both flows (cart checkout and quote checkout) redirect to `/checkout/confirmation?orderId=<id>` on success.

---

## Checklist

- [ ] Checkout index redirects to the correct step based on cart state
- [ ] Step skip guards redirect back if prerequisites are not met
- [ ] `GET /api/shipping-methods` filters by session currency
- [ ] Address changes debounced to update cart address method
- [ ] Payment step mounts the commercetools checkout frontend SDK — no custom payment form
- [ ] `cartId` cleared from session after the SDK signals order completion
- [ ] Confirmation page is a Server Component that fetches order by ID from commercetools
