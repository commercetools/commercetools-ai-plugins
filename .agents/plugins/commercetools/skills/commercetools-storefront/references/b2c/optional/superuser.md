---
name: superuser
description: B2C CSR impersonation covering dual identity in the session, CSR group membership detection, three-step login flow, and price override endpoint gating.
when_to_use:
  - "Implementing CSR agent impersonation for B2C"
  - "Detecting CSR membership via customer group"
  - "Building price override UI gated behind csrId"
  - "Displaying CSR status banner during active impersonation"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - csr
    - rbac
    - auth
---

# B2C Superuser (CSR Impersonation)

CSR agents authenticate with their own credentials, then impersonate a customer. The server-managed session carries both identities simultaneously. All price-override endpoints are hard-gated behind a `csrId` presence check — UI hiding the input is not sufficient.

## Key Takeaways

**Two identities in one session.** Normal session fields (`customerId`, `email`, etc.) hold the *impersonated* customer's data. CSR identity lives in `csrId`, `csrEmail`, `csrFirstName`, `csrLastName`.

**`CSR_GROUP_ID` is the membership gate.** Server-only env var — the commercetools Customer Group ID that marks CSR accounts. `POST /<api>/auth/login` checks this group before deciding whether to issue a normal session or return `{ requiresCsrEmail: true }`.

**Three-endpoint login flow.** Login → detect CSR group → return flag → UI calls `POST /<api>/auth/csr-login` with both credential sets → session holds dual identity. `GET /<api>/auth/superuser` exposes CSR state to client components.

**`csrId` guard is non-negotiable.** `PUT /<api>/cart/items/[itemId]/price` must return 403 when `session.csrId` is absent. A missing guard lets any authenticated customer override prices.

**`SuperUserContext` drives all CSR UI.** A client state hook reads the `<api>/auth/superuser` server endpoint with ~30 s deduping. `useSuperUser()` in any client component exposes CSR state without prop drilling — yellow banner in Header, `PriceOverrideInput` in CartItem.

## Anti-Patterns

| Anti-pattern | Correct approach |
|---|---|
| No `csrId` check on price override endpoint | Return 403 when `session.csrId` is absent — always, even if UI hides the input |
| Exposing `CSR_GROUP_ID` to the client bundle | Server-only env var — never exposed to the client |
| CSR state in localStorage or client component state | Server-managed session; expose via the `<api>/auth/superuser` server endpoint read by a client state hook |
| UI-only gate on price override | Server must enforce; UI visibility is a UX courtesy, not a security control |

## Reference

| Task | Reference |
|---|---|
| commercetools setup, session extension, login flow, price override endpoint, SuperUserContext, Header banner, CartItem PriceOverrideInput | [superuser.md](./superuser.md) |



# Superuser (CSR Impersonation)

**Impact: MEDIUM — CSR impersonation requires `csrId` session guard on the price override endpoint. Missing it lets any authenticated user override line item prices.**

CSR agents log in with their own credentials, then impersonate a customer. The session holds both identities. Price overrides are gated behind a `csrId` check.

## Table of Contents
- [Pattern 1: commercetools Setup](#pattern-1-commercetools-setup)
- [Pattern 2: Session Extension](#pattern-2-session-extension)
- [Pattern 3: Login Flow](#pattern-3-login-flow)
- [Pattern 4: Price Override](#pattern-4-price-override)
- [Pattern 5: SuperUserContext](#pattern-5-superusercontext)
- [Pattern 6: UI](#pattern-6-ui)


## Pattern 1: commercetools Setup

Add `CSR_GROUP_ID` to the server environment. This is the commercetools Customer Group that identifies CSR agents. It is a server-only env var — never expose it to the client bundle.

```bash
CSR_GROUP_ID=<customer-group-id-from-ct>
```

In commercetools Merchant Center:
1. Customers → Customer Groups → Create "CSR Agents" group
2. Copy the group ID to `CSR_GROUP_ID`
3. Assign CSR agent customer accounts to that group


## Pattern 2: Session Extension

Extend the `Session` interface with CSR fields. Normal customer fields (`customerId`, `email`, etc.) hold the **impersonated** customer's data when a CSR is active.

```typescript
// <root-dir>/<server>/session
export interface Session {
  // Impersonated customer (or real customer when no CSR)
  customerId?:    string;
  email?:         string;
  firstName?:     string;
  lastName?:      string;
  cartId?:        string;

  // CSR agent identity (present only during active impersonation)
  csrId?:         string;
  csrEmail?:      string;
  csrFirstName?:  string;
  csrLastName?:   string;
}
```


## Pattern 3: Login Flow

Three server endpoints collaborate. Each reads its inputs from the request and the current session, and writes the session via the stack's session storage.

**`POST <api>/auth/login`** — authenticate, then branch on CSR group membership:
- `loginCustomer(email, password)`.
- Check whether the customer belongs to the CSR group — i.e. `customerGroup.id` or any `customerGroupAssignments[*].customerGroup.id` equals `CSR_GROUP_ID`.
- If so, do **not** create a session yet (the CSR must still supply a customer to impersonate) — respond `{ requiresCsrEmail: true }`.
- Otherwise write a normal session (`{ customerId, email, ... }`) and return.

**`POST <api>/auth/csr-login`** — called after `/login` returns `requiresCsrEmail: true`; body `{ csrEmail, csrPassword, impersonatedEmail }`:
- `loginCustomer(csrEmail, csrPassword)` for the agent and `getCustomerByEmail(impersonatedEmail)` for the target.
- Write a **dual-identity** session: the impersonated customer in the normal fields (`customerId`, `email`, `firstName`, `lastName`) and the agent in the CSR fields (`csrId`, `csrEmail`, `csrFirstName`, `csrLastName`).

**`GET <api>/auth/superuser`** — read the session and return `{ csrId, csrEmail, csrFirstName, csrLastName }` when `session.csrId` is present, otherwise `{}`.

> Find the stack's `data-loading.md` for concrete server endpoints (auth, session read/write) pattern implementation.


## Pattern 4: Price Override

The price-override server endpoint (`PUT` on a cart line item, e.g. `<api>/cart/items/:itemId/price`) reads the session and **guards on `session.csrId` first** — returning a 403 forbidden response when it is absent (only CSR agents may override prices). It then reads `{ centAmount, currencyCode }` from the request and applies the commercetools cart update:

```typescript
const cart = await applyCartAction(session.cartId!, session.customerId, [
  {
    action: 'setLineItemPrice',
    lineItemId: itemId,
    externalPrice: { currencyCode, centAmount },
  },
]);
// return mapCart(cart)
```
> Find the stack's `data-loading.md` for concrete server endpoints endpoint (with the `csrId` 403 guard).

## Pattern 5: SuperUserContext

A client-side context exposes the CSR state (`{ csrId?, csrEmail?, csrFirstName?, csrLastName? }`) to any client component without prop drilling:

- A `SuperUserProvider` uses a client state hook to fetch the `<api>/auth/superuser` server endpoint (with ~30 s deduping), defaulting to `{}`, and provides the result through the context.
- A `useSuperUser()` accessor reads that context.

Mount `SuperUserProvider` in the root/locale layout (server-rendered), wrapping the page children, so CSR state is available app-wide.

> Find the stack's `concept-mapping.md` for concrete client-state context + provider.



## Pattern 6: UI

**Yellow banner in Header when CSR is active:**

The Header reads `{ csrId, csrFirstName, csrLastName }` from `useSuperUser()` and, when `csrId` is set, renders a yellow banner above the rest of the header (e.g. "CSR Mode — {csrFirstName} {csrLastName} impersonating customer").


**PriceOverrideInput in cart line item (shown only to CSR):**

The cart line-item component reads `csrId` from `useSuperUser()` and renders `<PriceOverrideInput lineItemId={item.id} currentPrice={item.price} />` only when `csrId` is set — alongside the usual quantity, name, etc.



## Checklist
- [ ] `CSR_GROUP_ID` set as a server-only env var (never exposed to the client bundle)
- [ ] `Session` interface extended with `csrId`, `csrEmail`, `csrFirstName`, `csrLastName`
- [ ] `POST <api>/auth/login` returns `{ requiresCsrEmail: true }` for CSR group members
- [ ] `POST <api>/auth/csr-login` writes dual identity to the session
- [ ] `GET <api>/auth/superuser` returns CSR fields or `{}`
- [ ] The price-override endpoint (`PUT` on a cart line item) returns 403 when `session.csrId` is absent
- [ ] `SuperUserProvider` mounted in the root layout wrapping children
- [ ] Yellow banner visible in Header during active impersonation
- [ ] `PriceOverrideInput` rendered in CartItem only when `csrId` is set