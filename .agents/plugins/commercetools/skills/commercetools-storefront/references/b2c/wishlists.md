---
name: wishlists
description: B2C wishlists covering API chains, ownership checks, client state hooks, header icon, heart icons on PDP/PLP, and wishlist pages.
when_to_use:
  - "Implementing B2C wishlists"
  - "Building heart icon save-to-list functionality on PDP and PLP"
  - "Creating wishlist pages"
  - "Managing wishlist ownership"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - shopping-lists
    - ui
---

# Wishlists — B2C

Start from the shared [shopping lists reference](../core/shopping-lists.md) and implement Patterns 1–5 from there first. This file covers only the B2C-specific decisions layered on top.

## Table of Contents
- [B2C Extension: API Chain and Ownership](#b2c-extension-api-chain-and-ownership)
- [B2C Extension: Create Draft](#b2c-extension-create-draft)
- [B2C Extension: Client State Hook and Mutation](#b2c-extension-client-state-hook-and-mutation)
- [B2C Extension: UI — Header Icon](#b2c-extension-ui--header-icon)
- [B2C Extension: UI — Heart Icon on PDP and PLP](#b2c-extension-ui--heart-icon-on-pdp-and-plp)
- [B2C Extension: Pages](#b2c-extension-pages)
- [Checklist](#checklist)

---

## B2C Extension: API Chain and Ownership

Extends **Pattern 1** from the shared reference.

Use the project-level `apiRoot.shoppingLists()` — not the as-associate chain. commercetools does not restrict this endpoint by customer, so ownership must be enforced in app code on single-item fetches: after retrieving a list by ID, check that `list.customer?.id === customerId` and return 404 if it does not match. This prevents ID-guessing attacks where one customer could read another's wishlist.

The `where: customer(id="${customerId}")` filter on list fetches scopes the results to the authenticated customer without needing the as-associate chain.

---

## B2C Extension: Create Draft

Extends **Pattern 2** (create helper) from the shared reference.

The create draft requires only `name` and `customer`. Do not include a `store` field — B2C wishlists are not store-scoped and should be visible regardless of which storefront the customer visits.

```
name: { [locale]: name }
customer: { id: customerId, typeId: 'customer' }
```

---

## B2C Extension: Client State Hook and Mutation

Extends **Pattern 4** from the shared reference.

The client state-manager/cache key uses `[KEY_WISHLISTS, customerId]`. The hook should only fire when `customerId` is available — pass `null` as the key when the customer is not yet resolved to avoid fetching as anonymous.

After every mutation (create, rename, add item, remove item, delete) re-fetch (or invalidate) the `[KEY_WISHLISTS, customerId]` entry. Scope the invalidation to that key tuple explicitly — do not invalidate the entire client state-manager/cache, to avoid touching unrelated entries.

For the add/remove heart icon, the mutation should feel instant. Apply an optimistic update: immediately toggle the local state, fire the request in the background, and revert only on error.

> Find the stack's `concept-mapping.md` for concrete state and cache implementation.


---

## B2C Extension: UI — Header Icon

A wishlist icon in the global header gives customers persistent access to their saved items. It should:

- Show the count of total items across all wishlists as a badge (sum of `lineItems.length` across all lists)
- Navigate to `/wishlists` on click
- Render as an empty icon when the customer is not logged in (no badge, click redirects to login)
- Use the same icon weight and size as the cart icon in the header for visual consistency

The count should come from the same client state hook used by the wishlist pages — no separate fetch needed.

---

## B2C Extension: UI — Heart Icon on PDP and PLP

The heart icon is the primary entry point for adding or removing a product from a wishlist.

**Behaviour:**

- Filled heart = product is already in at least one wishlist
- Outline heart = product is not in any wishlist
- Clicking an outline heart adds the product to the customer's default (or only) wishlist
- Clicking a filled heart removes the product from all wishlists it appears in
- If the customer has no wishlists yet, the first click creates a default one named "My Wishlist" and adds the item
- If the customer is not logged in, clicking the heart redirects to login (with a `?redirect` param to come back)

**Placement:**

- PDP: prominent button or icon near the Add to Cart CTA — visually secondary to it
- PLP: overlaid icon in the top-right corner of the product card, visible on hover (desktop) or always visible (mobile)

**Optimistic update:** toggle the filled/outline state immediately on click; revert on API error and show a toast.

The heart icon component needs access to the full wishlist client state data to compute the `isSaved` state. Pass `variantId` (or `productId` as fallback) as the lookup key.

---

## B2C Extension: Pages

Wishlists are personal and not part of the account dashboard. They live at `/wishlists/`:

- `/wishlists` — list all of the customer's wishlists with item count and thumbnail preview
- `/wishlists/[id]` — detail view with item cards, add-to-cart per item, and remove-from-list action

Protect both routes with an auth guard — unauthenticated requests redirect to login.

---

## Checklist

- [ ] commercetools calls use project-level `apiRoot.shoppingLists()` — not the as-associate chain
- [ ] Ownership check in app code after single-list fetch: `list.customer?.id === customerId` → 404 on mismatch
- [ ] Create draft has no `store` field
- [ ] Server endpoints validate `customerId` only (not `businessUnitKey`)
- [ ] client state-manager/cache key is `[KEY_WISHLISTS, customerId]`; fires only when `customerId` is resolved
- [ ] All mutations re-fetch/invalidate `[KEY_WISHLISTS, customerId]` after completing
- [ ] Heart icon on PDP and PLP with optimistic toggle
- [ ] Auto-creates default wishlist on first heart click if customer has none
- [ ] Heart redirects unauthenticated users to login with `?redirect` param
- [ ] Header icon shows total item count badge from the same client state hook
- [ ] Pages at `/wishlists/` — not under `/dashboard/`
- [ ] `expand: ['lineItems[*].variant']` on all list fetches
