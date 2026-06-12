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

B2C-specific auth patterns that extend the shared foundation in [reference](../core/customer-auth.md). Read that reference first for the commercetools login endpoint, server endpoint structure, client state hook, and logout patterns.

---

## Anonymous Cart Merge

Pass `anonymousCartId` and `anonymousCartSignInMode` to `apiRoot.login().post()` when a guest cart exists:

```typescript
// <server>/ct/auth
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

The login server endpoint reads `session.cartId` as `anonymousCartId`, calls `signIn`, then writes `body.cart.id` back into the session as the new `cartId`.

---

## Register

`apiRoot.customers().post()` creates the account but does not log the customer in. Immediately call `signIn` after registration so the session is populated and the anonymous cart is merged.

---

## Protected Account Layout

A client component that wraps the account section and redirects to `/login?redirect=<path>` when the current account state resolves to `null` (signed out). While the account state is still loading (undefined), render nothing to avoid a layout flash; render the children once a customer is confirmed.

- Read the current account from the client state hook (see the [reference](../core/customer-auth.md)).
- Three states: `undefined` (loading) → render nothing; `null` (signed out) → issue a client-side redirect to `/login?redirect=<encoded current path>` using the framework's client navigation and current-path access; a resolved customer → render the children.

> Find the adapter's `concept-mapping` file for Concrete protected-layout component. Example: see the Next.js stack → [Client state hooks](../stack/nextjs/concept-mapping.md).

---

## Checklist

- [ ] `signIn` passes `anonymousCartId` + `anonymousCartSignInMode: 'MergeWithExistingCustomerCart'` when a guest cart exists
- [ ] Login server endpoint writes `cart.id` from the commercetools response back into the session
- [ ] Register calls `signIn` immediately after `apiRoot.customers().post()`
- [ ] Account layout redirects to `/login?redirect=<path>` on `null`; returns `null` while loading
