---
name: shopping-lists
description: B2B shopping lists covering wishlists (personal) vs purchase lists (BU-scoped), API chains, client state hooks, and PDP add-to-list modal.
when_to_use:
  - "Implementing B2B purchase lists"
  - "Distinguishing wishlists from BU-scoped purchase lists"
  - "Building the save-to-list modal on PDP"
  - "Managing BU-shared purchase lists"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - shopping-lists
    - permissions
    - ui
---

# Shopping Lists — B2B (Wishlists + Purchase Lists)

Start from the shared [shopping lists reference](../core/shopping-lists.md) and implement Patterns 1–5 from there first. This file covers B2B-specific decisions for both types of list that exist in a B2B storefront:

| Type | Scope | Who sees it |
|---|---|---|
| **Wishlist** | Personal (customer-owned) | Only the customer |
| **Purchase List** | BU-shared | All associates in the business unit |

Both are backed by commercetools `ShoppingList`. The separation is entirely in which API chain you use and which session fields you require. Implement them as two separate namespaces (`<server>/ct/wishlists` and `<server>/ct/purchase-lists`) — do not try to unify them in one file.

## Table of Contents
- [B2B Extension: Wishlists (Personal)](#b2b-extension-wishlists-personal)
- [B2B Extension: Purchase Lists (BU-Scoped)](#b2b-extension-purchase-lists-bu-scoped)
- [B2B Extension: Client State and Mutation](#b2b-extension-client-state-and-mutation)
- [B2B Extension: UI — Header Icon](#b2b-extension-ui--header-icon)
- [B2B Extension: UI — PDP Add-to-List Flow](#b2b-extension-ui--pdp-add-to-list-flow)
- [Checklist](#checklist)

---

## B2B Extension: Wishlists (Personal)

Extends **Pattern 1** from the shared reference.

B2B wishlists behave identically to B2C wishlists — use the project-level `apiRoot.shoppingLists()` chain, enforce ownership with `list.customer?.id === customerId` in app code, and do not include a `store` field in the create draft. Server endpoints validate `customerId` only. The client state-manager/cache key is `[KEY_WISHLISTS, customerId]`.

The only B2B-specific consideration is that wishlist pages live at `/wishlists/` (personal space), not under `/dashboard/` (BU space). This boundary makes the scoping visible in the URL.

---

## B2B Extension: Purchase Lists (BU-Scoped)

Extends **Pattern 1** from the shared reference.

### API Chain

All purchase list operations go through the as-associate chain. commercetools enforces BU membership at the API layer — an associate without access receives a 403, so app-level ownership checks are not needed.

```
apiRoot
  .asAssociate()
  .withAssociateIdValue({ associateId })
  .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey })
  .shoppingLists()
```

`associateId` is always `session.customerId`. `businessUnitKey` is always `session.businessUnitKey`. Both are mandatory — never make them optional or fall back to a default.

### Create Draft

The create draft must include both `customer` and `store`:

```
name: { [locale]: name }
customer: { id: customerId, typeId: 'customer' }
store: { typeId: 'store', key: storeKey }
```

The `store` field ties the list to the active store so pricing and availability stay consistent when items are moved to cart.

### Permissions

The purchase list UI must respect associate permissions. Gate write actions (`Create`, `Add item`, `Remove item`, `Rename`, `Delete`) on `CreatePurchaseLists` / `UpdatePurchaseLists` via `usePermissions()`. Hide the purchase lists nav item when the associate lacks `ViewPurchaseLists`.

---

## B2B Extension: Client State and Mutation

Extends **Pattern 4** from the shared reference.

| List type | client state-manager/cache key | Fires when |
|---|---|---|
| Wishlist | `[KEY_WISHLISTS, customerId]` | `customerId` is resolved |
| Purchase list | `[KEY_PURCHASE_LISTS, businessUnitKey]` | `businessUnitKey` is resolved |

For purchase lists, passing an empty/null key when `businessUnitKey` is not yet available is critical — it prevents fetching as the wrong BU or before context is ready.

After any mutation, invalidate the same key tuple used by the hook. For purchase lists this means invalidating `[KEY_PURCHASE_LISTS, businessUnitKey]`. The `businessUnitKey` in the invalidation must come from the same source as the hook — usually `currentBusinessUnit.key` from `useBusinessUnit()` — so the state-manager/cache entry matches exactly.

When the user switches business unit, the purchase lists cache auto-invalidates because the key tuple changes. Wishlist caches are unaffected by BU switches.

> Find the stack's `concept-mapping.md` for concrete client-state and cache implementation.


---

## B2B Extension: UI — Header Icon

A single header icon covers wishlists (personal). It should follow the same behaviour as the B2C wishlist icon: item count badge, navigate to `/wishlists`, empty state for unauthenticated users.

Purchase lists are a procurement tool and belong in the dashboard navigation, not the header icon. The dashboard nav item for purchase lists should be hidden when the associate lacks `ViewPurchaseLists`.

---

## B2B Extension: UI — PDP Add-to-List Flow

In B2B, clicking "Save" or "Add to list" on a PDP opens a modal or popover rather than a heart toggle. The flow supports both wishlists and purchase lists from the same entry point.

**Modal behaviour:**

1. Show two sections: "My Wishlists" (personal) and "Purchase Lists" (BU-shared, only if the associate has `ViewPurchaseLists`)
2. Each section lists existing lists with a checkbox — checking one adds the current product/variant to that list
3. A "+ New wishlist" inline input at the bottom of the "My Wishlists" section lets the customer create and add in one step
4. A "+ New purchase list" inline input (gated on `CreatePurchaseLists` permission) at the bottom of the purchase list section does the same
5. On confirm, fire all selected add-item mutations in parallel; show a single success toast when all resolve

**Trigger:** A secondary button on the PDP near the Add to Cart CTA — labelled "Save to list" or represented by a bookmark/heart icon. The button is always visible (not hover-only) because B2B users are intentional about list management.

**State:** The modal should open with checkboxes pre-filled for any list that already contains this `variantId`. This lets associates see at a glance where the product is saved and toggle membership.

---

## Checklist

**Wishlists (personal)**
- [ ] commercetools calls use project-level `apiRoot.shoppingLists()` — not the as-associate chain
- [ ] Ownership check in app code after single-list fetch: `list.customer?.id === customerId` → 404 on mismatch
- [ ] Create draft has no `store` field
- [ ] Server endpoints validate `customerId` only
- [ ] client state-manager/cache key is `[KEY_WISHLISTS, customerId]`
- [ ] Pages at `/wishlists/` — not under `/dashboard/`

**Purchase lists (BU-scoped)**
- [ ] All commercetools calls use `asAssociateInStore(associateId, businessUnitKey)` — not project-level
- [ ] `store: { key: storeKey }` included in create draft
- [ ] Server endpoints validate `customerId` AND `businessUnitKey`
- [ ] client state-manager/cache key is `[KEY_PURCHASE_LISTS, businessUnitKey]`; fires only when `businessUnitKey` is resolved
- [ ] All mutations invalidate `[KEY_PURCHASE_LISTS, businessUnitKey]` after completing
- [ ] Permission gates: `ViewPurchaseLists` for nav, `CreatePurchaseLists` / `UpdatePurchaseLists` for write actions
- [ ] Dashboard nav item hidden when associate lacks `ViewPurchaseLists`
- [ ] Pages under `/dashboard/purchase-lists/`

**PDP UI**
- [ ] "Save to list" button opens modal (not a simple heart toggle)
- [ ] Modal shows both wishlists and purchase lists in separate sections
- [ ] Existing membership pre-fills checkboxes
- [ ] Inline create for both list types within the modal
- [ ] Add-item mutations fire in parallel on confirm
- [ ] `expand: ['lineItems[*].variant']` on all list fetches
