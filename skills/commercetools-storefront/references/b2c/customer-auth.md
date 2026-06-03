---
name: customer-auth
description: B2C auth extensions covering anonymous cart merge, register flow, and protected account layout with redirect to login.
when_to_use:
  - "Implementing B2C authentication"
  - "Merging anonymous carts after login"
  - "Protecting account pages with redirect"
  - "Building register flows"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - auth
    - cart
---

# Customer Authentication — B2C Extensions

**Impact: HIGH — Missing anonymous cart merge silently loses the customer's cart on every login.**

B2C-specific auth patterns that extend the shared foundation in [reference](../core/customer-auth.md). Read that reference first for the commercetools login endpoint, Route Handler structure, SWR hook, and logout patterns.

---

## Anonymous Cart Merge

Pass `anonymousCartId` and `anonymousCartSignInMode` to `apiRoot.login().post()` when a guest cart exists:

```typescript
// lib/ct/auth.ts
export async function signIn(email: string, password: string, anonymousCartId?: string) {
  const { body } = await apiRoot.login().post({
    body: {
      email,
      password,
      ...(anonymousCartId && {
        anonymousCartId,
        anonymousCartSignInMode: 'MergeWithExistingCustomerCart',
      }),
    },
  }).execute();
  return body; // body.cart is the merged cart when merge occurred
}
```

The login Route Handler reads `session.cartId` as `anonymousCartId`, calls `signIn`, then writes `body.cart.id` back into the session as the new `cartId`.

---

## Register

`apiRoot.customers().post()` creates the account but does not log the customer in. Immediately call `signIn` after registration so the session is populated and the anonymous cart is merged.

---

## Protected Account Layout

Client Component that redirects to `/login?redirect=<path>` when `useAccount` resolves to `null`. Return `null` while loading (`user === undefined`) to avoid a layout flash.

```typescript
// app/[locale]/account/layout.tsx
'use client';
export default function AccountLayout({ children }) {
  const { user } = useAccount();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (user === null) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
  }, [user, router, pathname]);

  if (!user) return null;
  return <div>{children}</div>;
}
```

---

## Checklist

- [ ] `signIn` passes `anonymousCartId` + `anonymousCartSignInMode: 'MergeWithExistingCustomerCart'` when a guest cart exists
- [ ] Login Route Handler writes `cart.id` from the commercetools response back into the session
- [ ] Register calls `signIn` immediately after `apiRoot.customers().post()`
- [ ] Account layout redirects to `/login?redirect=<path>` on `null`; returns `null` while loading
