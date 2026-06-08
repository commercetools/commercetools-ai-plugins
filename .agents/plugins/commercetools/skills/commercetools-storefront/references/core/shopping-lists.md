---
name: shopping-lists
description: Shopping list CRUD, two API chains (project-level vs as-associate), Route Handlers, SWR hooks, and shared mapper patterns.
when_to_use:
  - "Implementing wishlists or purchase lists"
  - "Deciding between personal vs BU-scoped lists"
  - "Handling list ownership and permissions"
  - "Managing list item additions and removals"
metadata:
  contentType: REFERENCE
  area:
    - shopping-lists
    - session
---

# Shopping Lists

**Impact: MEDIUM — Shopping lists (wishlists and purchase lists) are both backed by the commercetools `ShoppingList` resource. The critical difference is the API chain used to access them: project-level vs. as-associate. Using the wrong chain is a security and scoping bug, not just a style issue.**

Shopping lists let customers save products for later. In B2C they are personal (a wishlist). In B2B they are BU-shared (a purchase list). Both use the same commercetools resource and the same action vocabulary — `addLineItem`, `removeLineItem` — so most patterns are identical once you pick the right API chain.

## Table of Contents
- [Pattern 1: The Two API Chains](#pattern-1-the-two-api-chains)
- [Pattern 2: commercetools Helper Functions](#pattern-2-commercetools-helper-functions)
- [Pattern 3: Route Handlers](#pattern-3-route-handlers)
- [Pattern 4: SWR Hook](#pattern-4-swr-hook)
- [Pattern 5: Mapper](#pattern-5-mapper)
- [Tips and Tricks](#tips-and-tricks)

---

## Pattern 1: The Two API Chains

| Context | commercetools chain | Ownership enforced by |
|---|---|---|
| B2C personal wishlist | `apiRoot.shoppingLists()` (project-level) | App code — verify `list.customer.id === customerId` after a by-ID fetch |
| B2B purchase list | `apiRoot.asAssociate()...shoppingLists()` (as-associate) | commercetools itself — non-members receive a 403 |

Never mix the chains. A wishlist fetched through the as-associate chain would inherit BU scoping it should not have. A purchase list fetched through the project-level chain would bypass associate-permission enforcement entirely.

---

## Pattern 2: commercetools Helper Functions

`lib/ct/shopping-lists.ts` (or `lib/ct/wishlists.ts` / `lib/ct/purchase-lists.ts`) should export:

- **List all** for the current owner (customer or BU) — paginated, sorted by `lastModifiedAt desc`
- **Get by ID** — includes an ownership check before returning
- **Create** — accepts a `name` and any context-specific fields (see B2B/B2C extensions)
- **Rename** — single `changeName` update action
- **Add item** — `addLineItem` with `productId`, `variantId`, and `quantity`
- **Remove item** — `removeLineItem` by `lineItemId`
- **Delete** — by ID and version

All write operations need the current `version`. Fetch it fresh before sending the update if the caller does not already hold it — stale versions cause 409 conflicts.

commercetools `ShoppingList` responses must be mapped to an app type (`Wishlist` or `PurchaseList`) before leaving `lib/ct/`. Components must never import from `@commercetools/platform-sdk`.

---

## Pattern 3: Route Handlers

Shopping list route handlers follow the standard BFF shape: validate session → call commercetools helper → return mapped result. The session fields required differ by context:

| Context | Required session fields |
|---|---|
| B2C wishlist | `customerId` |
| B2B purchase list | `customerId` + `businessUnitKey` |

Route structure is symmetric in both cases:

| Method | Path | Intent |
|---|---|---|
| `GET` | `/api/[resource]` | List all for current owner |
| `POST` | `/api/[resource]` | Create a new list |
| `GET` | `/api/[resource]/[id]` | Fetch a single list by ID |
| `PUT` | `/api/[resource]/[id]` | Rename the list |
| `DELETE` | `/api/[resource]/[id]` | Delete the list |
| `POST` | `/api/[resource]/[id]/items` | Add an item |
| `DELETE` | `/api/[resource]/[id]/items` | Remove an item |

---

## Pattern 4: SWR Hook

Shopping lists change only on explicit user action (create, rename, add item, remove item, delete), so they are a good fit for SWR with `revalidateOnFocus: false`.

The SWR cache key must encode the ownership scope:

| Context | Cache key tuple |
|---|---|
| B2C wishlist | `[KEY, customerId]` |
| B2B purchase list | `[KEY, businessUnitKey]` |

After any mutation (create, rename, add item, remove item, delete), call `mutate(key)` — where `key` uses the same tuple as above — so the list refreshes without a full page reload. Do not optimistically update the cache for list creation; let the re-fetch confirm the new ID and version.

---

## Pattern 5: Mapper

The mapper converts a commercetools `ShoppingList` to the app type. At minimum it should resolve:

- `id`, `version`
- `name` — resolved from `LocalizedString` via `getLocalizedString(list.name, locale)`
- `lineItems` — mapped to an array of `{ lineItemId, productId, variantId, quantity, name, image, price }` where `image` and `price` come from the expanded variant

Request `expand: ['lineItems[*].variant']` on list fetches so the mapper has the variant data it needs.

---

## Tips and Tricks

**Stale version conflicts (409):** Always re-fetch the list and send the version you fetched.

**Ownership check on by-ID fetch:** The project-level endpoint does not filter by customer. After fetching a wishlist by ID, verify the returned `list.customer?.id` matches the session `customerId` in app code. Return a generic 404 — not a 403 — to avoid confirming that the ID exists for a different customer.

**Empty wishlist vs. deleted wishlist:** Do not auto-delete a list when the last item is removed. Users expect the empty list to remain so they can add to it again without recreating it.

**`expand` on list fetches:** Without `expand: ['lineItems[*].variant']` the line items contain only IDs. Always include this expansion so image, price, and display name are available without a second round-trip.

**Locale in list name:** Store the list name as a `LocalizedString` even for single-locale projects. This avoids a data migration later and is what commercetools expects on the create draft.
