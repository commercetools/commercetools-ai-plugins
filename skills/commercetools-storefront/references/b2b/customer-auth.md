---
name: customer-auth
description: B2B auth extensions covering BU auto-selection at login, session B2B fields, AuthContext, and logout with B2B cache clearing.
when_to_use:
  - "Implementing B2B authentication"
  - "Auto-selecting BU and store at login"
  - "Populating B2B session fields after login"
  - "Clearing B2B caches on logout"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - auth
    - session
    - permissions
---

# Customer Authentication — B2B Extensions

**Impact: HIGH — Missing BU auto-selection at login leaves the user without a business unit context and breaks all B2B operations.**

B2B-specific auth patterns that extend the [shared foundation](../core/customer-auth.md). Read that reference first for the commercetools login endpoint, Route Handler structure, SWR hook, and logout patterns.

---

## BU Auto-Selection at Login

Immediately after `loginCustomer`, fetch all business units the customer is an associate of and auto-select the first BU and its first store. This must happen in the same login Route Handler — never leave the session without a `businessUnitKey`.

BU discovery uses a project-level call (`apiRoot.businessUnits()` filtered by associate ID), not the as-associate chain. The as-associate chain is used for all subsequent operations once `businessUnitKey` is in the session.

Once the first store is identified, call `getStoreChannelData(storeKey)` to resolve the channel IDs needed for pricing and inventory.

---

## Session Fields Written at Login

The login Route Handler writes all B2B context fields in a single `setSession()` call alongside the base auth fields:

- **Auth:** `customerId`, `customerEmail`, `customerFirstName`, `customerLastName`
- **B2B context:** `businessUnitKey`, `storeKey`, `storeId`, `distributionChannelId`, `supplyChannelId`, `productSelectionId`
- **Locale:** preserve existing `locale`, `currency`, `country` from the prior session if present; fall back to defaults

Writing these atomically ensures no intermediate state where auth fields exist but B2B context does not.

---

## AuthContext and `useAccount`

Same SWR-backed pattern as the shared reference — `AuthContext` reads from `GET /api/auth/me`, `useAccount` exposes the same key. No B2B-specific changes needed here.

---

## Logout

On logout, clear `KEY_AUTH_ME`, `KEY_CART`, and `KEY_BUSINESS_UNITS` from the SWR cache. The logout Route Handler preserves `locale`, `currency`, `country` but strips all user and B2B context fields from the session.

---

## Checklist

- [ ] Login calls `getBusinessUnitsForAssociate(customer.id)` immediately after authentication
- [ ] First BU's first store is auto-selected; `getStoreChannelData(storeKey)` populates channel IDs
- [ ] All B2B session fields written atomically in one `setSession()` call
- [ ] Logout clears `KEY_AUTH_ME`, `KEY_CART`, and `KEY_BUSINESS_UNITS` from SWR cache
- [ ] Logout preserves `locale`, `currency`, `country` in the session
