---
name: promotions
description: Three discount types (Product, Cart, Discount Code), expansion requirements for discount names, the DiscountCodeForm component, and promotion banner options.
when_to_use:
  - "Displaying product discounts with strikethrough and badge"
  - "Adding discount code input and management to the cart"
  - "Creating promotion banners (static or CMS-driven)"
  - "Ensuring discount refs are expanded in search queries"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - discounts
    - cart
---

# B2C Promotions & Discounts

Three commercetools discount types each surface differently. Product Discounts change `variant.price.discounted` and require search expansion to show the name. Cart Discounts silently reduce totals. Discount Codes trigger Cart Discounts and are managed by the existing `DiscountCodeForm` component — don't re-implement it.

## Key Takeaways

**Expand discount refs in search, or `discountName` is always undefined.** Add `masterVariant.price.discounted.discount` and `variants[*].price.discounted.discount` to `productProjectionParameters.expand`. The mapper then reads `ctPrice.discounted.discount.obj.name` to surface the name.

**`DiscountCodeForm` already exists — import it, don't rewrite it.** It handles apply + remove + SWR `KEY_CART` invalidation via `POST /api/cart/discount` and `DELETE /api/cart/discount`. Just drop `<DiscountCodeForm />` where needed.

**Three types, three surfaces.** Product Discount → badge + strikethrough on ProductCard/PDP. Cart Discount → silently changes line item and cart totals (no explicit UI trigger). Discount Code → applied chip with remove button in cart.

**Promotion banners: static Header or CMS `content/message` section.** Static is simpler; CMS-driven via `lib/layout.ts` allows content changes without deploys and supports localized strings.

## Anti-Patterns

| Anti-pattern | Correct approach |
|---|---|
| No expand on discount refs in search | Add both `masterVariant` and `variants[*]` discount expand to search params |
| Custom discount code fetch/form | Import `<DiscountCodeForm />` from `components/cart/` — it already handles everything |
| Hardcoding discount name string | Map from expanded `ctPrice.discounted.discount.obj.name` in `lib/mappers/product.ts` |
| Product Discount badge without expand | Name is `undefined` without the expand — always expand before mapping |

## Reference

| Task | Reference |
|---|---|
| Discount types overview, product discount expand + mapper + ProductCard, DiscountCodeForm usage, promotion banner (static + CMS-driven) | [promotions.md](./promotions.md) |



# Promotions & Discounts

**Impact: LOW — Three discount types in commercetools each surface differently. Product discounts require search query expansion to show names. Cart discounts reduce totals silently.**

## Table of Contents
- [Pattern 1: Discount Types Overview](#pattern-1-discount-types-overview)
- [Pattern 2: Product Discount Display](#pattern-2-product-discount-display)
- [Pattern 3: Discount Code Form](#pattern-3-discount-code-form)
- [Pattern 4: Promotion Banner](#pattern-4-promotion-banner)


## Pattern 1: Discount Types Overview

| Type | How it works | Where it surfaces |
|---|---|---|
| **Product Discount** | Changes `variant.price.discounted` on matching products | Badge + strikethrough on `ProductCard` and `PDPPrice` |
| **Cart Discount** | Reduces `lineItem.totalPrice` and/or `cart.totalPrice` silently | Line item price difference, cart total reduction |
| **Discount Code** | Customer-entered code that triggers a Cart Discount | Applied chip in cart, `cart.discountCodes[]` |

All three are created in commercetools Merchant Center under **Discounts**.


## Pattern 2: Product Discount Display

**INCORRECT:** not expanding the discount reference — `discountName` is `undefined`.

```typescript
// BAD — discount ref not expanded
const productProjectionParameters = {
  body: {
    // No expand — variant.price.discounted.discount is just { id: '...' }
  },
};
// In component: product.price.discounted?.discountName → undefined
```

**CORRECT — expand both `masterVariant` and `variants` discount references:**

> See [product-search.md — Pattern 6: Discount Expansion](../../b2c/product-listing.md#pattern-6-discount-expansion) for the full explanation and mapper code.

```typescript
// site/lib/ct/products.ts
const productProjectionParameters = {
  body: {
    query: { ... },
    productProjectionParameters: {
      expand: [
        'masterVariant.price.discounted.discount',
        'variants[*].price.discounted.discount',
      ],
    },
  },
};
```

```typescript
// site/lib/mappers/product.ts
function mapPrice(ctPrice: CtPrice): Price {
  return {
    value:     mapMoney(ctPrice.value),
    discounted: ctPrice.discounted
      ? {
          value:        mapMoney(ctPrice.discounted.value),
          discountName: (ctPrice.discounted.discount?.obj as any)?.name?.[locale],
        }
      : undefined,
  };
}
```

```typescript
// site/components/product/ProductCard.tsx
{product.price.discounted && (
  <>
    <span className="line-through text-gray-400">{formatMoney(product.price.value)}</span>
    <span className="text-red-600">{formatMoney(product.price.discounted.value)}</span>
    {product.price.discounted.discountName && (
      <span className="rounded bg-red-100 px-1 text-xs text-red-700">
        {product.price.discounted.discountName}
      </span>
    )}
  </>
)}
```


## Pattern 3: Discount Code Form

Already implemented — import `<DiscountCodeForm />` wherever needed. Do not write a custom fetch.

```typescript
// site/components/cart/DiscountCodeForm.tsx  (already exists)
// Reads and mutates KEY_CART automatically via useSWR.
// POST /api/cart/discount  { code: string }
// DELETE /api/cart/discount  { code: string }
```

Usage in cart page:

```typescript
import DiscountCodeForm from '@/components/cart/DiscountCodeForm';

// Inside CartPage or CartDrawer:
<DiscountCodeForm />
```

The form:
- Shows an input for entering a code
- On submit: calls `POST /api/cart/discount`, revalidates cart SWR key
- Shows applied codes as chips with a remove button (calls `DELETE /api/cart/discount`)
- Displays commercetools error messages (e.g. "Code not found", "Already applied")

Route handlers (already exist):

```typescript
// site/app/api/cart/discount/route.ts

// POST — apply code
export async function POST(request: Request) {
  const { code } = await request.json();
  const cart = await applyCartAction(session.cartId!, session.customerId, [
    { action: 'addDiscountCode', code },
  ]);
  return NextResponse.json(mapCart(cart));
}

// DELETE — remove code
export async function DELETE(request: Request) {
  const { code } = await request.json();
  const cart = await applyCartAction(session.cartId!, session.customerId, [
    { action: 'removeDiscountCode', discountCode: { typeId: 'discount-code', id: codeId } },
  ]);
  return NextResponse.json(mapCart(cart));
}
```


## Pattern 4: Promotion Banner

Two options — choose one:

**Option A: Static banner in `Header.tsx`:**

```typescript
// site/components/layout/Header.tsx
export default function Header() {
  return (
    <>
      {/* Promotion banner — hardcoded or from environment variable */}
      <div className="bg-sage-100 py-2 text-center text-sm font-medium">
        Free shipping on orders over $50 — Use code FREESHIP
      </div>
      {/* rest of header */}
    </>
  );
}
```

**Option B: CMS-driven via `content/message` section in `lib/layout.ts`:**

```typescript
// site/lib/layout.ts  (inside getHomeSections)
{
  type: 'content/message',
  config: {
    text: {
      'en-US': 'Free shipping on orders over $50 — Use code FREESHIP',
      'de-DE': 'Kostenloser Versand ab 50 € — Code: FREESHIP',
    },
  },
  size: { xs: 12 },
  background: 'Sage',
},
```

```typescript
// site/components/home/MessageBanner.tsx
import type { ItemProps } from '@/lib/layout';

interface MessageBannerProps { text: string }

export default function MessageBanner({ config }: ItemProps<MessageBannerProps>) {
  return (
    <div className="py-2 text-center text-sm font-medium">
      {config.text}
    </div>
  );
}
```

Then register `'content/message': dynamic(() => import('../home/MessageBanner'))` in `Item.tsx`.


## Checklist
- [ ] When showing discount badge/name: expand `masterVariant.price.discounted.discount` and `variants[*].price.discounted.discount` in search params
- [ ] `DiscountCodeForm` imported (not custom fetch) wherever discount codes are entered
- [ ] commercetools Merchant Center: Product Discount created and active (if using product-level discounts)
- [ ] commercetools Merchant Center: Cart Discount created and active (if using cart-level discounts)
- [ ] commercetools Merchant Center: Discount Code created and linked to a Cart Discount (if using codes)
- [ ] Promotion banner added via Header (static) or layout sections (CMS-driven)
