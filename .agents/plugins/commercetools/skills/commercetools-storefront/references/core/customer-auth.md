---
name: customer-auth
description: Shared auth foundation covering commercetools login endpoint, server endpoint structure, client-state hooks, and logout cache-clearing patterns.
when_to_use:
  - "Implementing authentication in the storefront"
  - "Setting up login and logout flows"
  - "Configuring session management"
  - "Clearing the client state-manager/cache after auth state changes"
metadata:
  contentType: REFERENCE
  area:
    - auth
    - session
---

# Customer Authentication — Shared Foundation

**Impact: HIGH — The wrong login endpoint or incomplete logout cache-clearing causes silent failures on every auth operation.**

This reference covers the shared patterns: the correct commercetools login endpoint, server endpoint structure, the client-state hook for account data, and logout cache-clearing. Domain-specific auth patterns (B2C anonymous cart merge; B2B BU auto-selection and channel resolution) are documented in the respective skill's `customer-auth.md`.

## Table of Contents
- [Pattern 1: commercetools Login Endpoint](#pattern-1-commercetools-login-endpoint)
- [Pattern 2: Server Endpoint Structure](#pattern-2-server-endpoint-structure)
- [Pattern 3: useAccount Client State Hook](#pattern-3-useaccount-client-state-hook)
- [Pattern 4: Logout — Session and client state-manager/cache Clearing](#pattern-4-logout--session-and-client-state-managercache-clearing)
- [Checklist](#checklist)

---

## Pattern 1: commercetools Login Endpoint

**INCORRECT:** Using `apiRoot.customers().login()` — this endpoint does not exist in commercetools SDK v2:

```typescript
// WRONG — SDK v2 does not have this endpoint
const { body } = await apiRoot.customers().login().post({ body: { email, password } }).execute();
```

**CORRECT — `apiRoot.login().post()`:**

```typescript
// <server>/ct/auth
export async function loginCustomer(email: string, password: string) {
  const { body } = await apiRoot.login().post({ body: { email, password } }).execute();
  return body.customer;
}
```

This is the only valid login endpoint across all commercetools SDK v2 storefronts.

---

## Pattern 2: Server Endpoint Structure

Login, register, and logout are BFF server endpoints — never called client-side from components directly.

```
Browser component
  → client data hook (a per-domain auth hook or useAccount)  — calls fetch('/<api>/auth/...')
  → server endpoint                                          — server-only, reads/writes the session, calls <server>/ct/auth
  → <server>/ct/auth                                           — calls apiRoot
```

The **login endpoint** does four things, in order:

1. Validate that `email` and `password` are present (400 otherwise).
2. Call `loginCustomer(email, password)` (which uses `apiRoot.login().post()` — Pattern 1).
3. Build a server-managed session carrying at minimum `customerId`, `customerEmail`, `customerFirstName`, `customerLastName` and persist it. The storage mechanism (a signed token in a cookie, or a server-side session store) is a stack choice.
4. Return the customer object as JSON.

```typescript
// <server>/ct/auth — the commercetools call is portable
export async function loginCustomer(email: string, password: string) {
  const { body } = await apiRoot.login().post({ body: { email, password } }).execute();
  return body.customer;
}
```

> B2C login handlers also merge the anonymous cart. B2B login handlers also resolve BU/store/channel fields. Each domain's `customer-auth.md` shows the full handler with these additions.

> The concrete login server endpoint follows the BFF endpoint shell, find it in  `data-loading.md` of the adapter's.
---

## Pattern 3: useAccount Client State Hook

**INCORRECT:** Reading `customerId` from localStorage or a cookie on the client — not reactive, not server-safe.

**CORRECT — a `useAccount` client-state hook backed by a `/<api>/auth/me` (or `/<api>/account/profile`) server endpoint:** the hook is keyed by `KEY_ACCOUNT`, reads the current customer from the account-profile endpoint (`GET /<api>/account/profile`), and does not revalidate on focus. Its fetcher returns `null` when the response is not ok. It exposes the current `user` plus a way to update the cached value after a profile change.

The backing server endpoint reads the session and returns the customer object — or `null` if unauthenticated, or if `getCustomerById(session.customerId)` throws. It never throws to the client.

> Find the adapter's `concept-mapping.md` to see client state/cache implementation.

> B2B storefronts use `GET /<api>/auth/me` and an auth-context wrapper in addition to the hook — see B2B `customer-auth.md` for the full pattern.

---

## Pattern 4: Logout — Session and client state-manager/cache Clearing

**INCORRECT:** Clearing only the auth cache after logout — cart and other user data remain visible until next page load. Calling the logout endpoint and then evicting only `KEY_ACCOUNT` leaves stale cart/order data in the client state-manager/cache.

**CORRECT — clear all user-scoped client state-manager/caches and end the session.** The logout handler:

1. Calls the logout server endpoint (`POST /<api>/auth/logout`).
2. Evicts every user-scoped cache key from the client state-manager/cache, setting each to a safe empty value without a refetch — at minimum `KEY_ACCOUNT` and `KEY_CART` (B2B also evicts `KEY_BUSINESS_UNITS`).
3. Navigates to `/login` using the framework's client navigation.

The **logout endpoint** writes a fresh session that **preserves `locale`, `currency`, `country` and omits all user fields** (`customerId`, `cartId`, and any domain-specific fields), then returns success.

---

## Checklist

- [ ] `<server>/ct/auth` uses `apiRoot.login().post()` — NOT `apiRoot.customers().login()`
- [ ] Login endpoint writes the session with at minimum `customerId` and customer name fields
- [ ] `useAccount` hook uses `KEY_ACCOUNT` as its cache key and does not revalidate on focus
- [ ] Logout endpoint preserves `locale`, `currency`, `country` and clears user fields
- [ ] Logout clears both `KEY_ACCOUNT` and `KEY_CART` from the client state-manager/cache

**Domain extensions:**
- B2C: see [b2c/customer-auth.md](../b2c/customer-auth.md) for anonymous cart merge and protected layout
- B2B: see [b2b/customer-auth.md](../b2b/customer-auth.md) for BU auto-selection, channel resolution, and the auth-context wrapper
