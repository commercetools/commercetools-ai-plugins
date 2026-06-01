# Shopping Lists — Overview, Use Cases, and Patterns

**Source:** 2022 Shopping Lists Deepdive deck (Expert Services / Customer Success Engineering)

---

## What Are Shopping Lists

Shopping Lists are a container of Line Items and Text Line Items. They allow customers (or anonymous users) to save product variant references outside of a cart — persisted on the platform and retrievable later.

Line Items reference Product Variants by product ID or SKU. Text Line Items are free-form entries with no connection to the product catalog — they carry a name, optional description, quantity, and custom fields.

**Common use cases:**
- Save-for-later / wishlist
- Shareable wishlists (via slug as a deep-link URL)
- Gift registries
- Subscribe & Save automation (shopping list as a recurring order template)

---

## Resource Model

```
ShoppingList
  ├─ key (String, optional)
  ├─ slug (LocalizedString, optional) — usable as a deep-link URL
  ├─ name (LocalizedString, required)
  ├─ customer (Reference to Customer, optional)
  ├─ anonymousId (String, optional) — anonymous session or external customer ID
  ├─ lineItems[] — references to Product Variants
  │     ├─ productId (or SKU)
  │     ├─ variantId
  │     ├─ quantity
  │     ├─ name (LocalizedString) — synchronized from the product, not a static copy
  │     └─ deactivatedAt (timestamp) — set when the variant can no longer be sold
  ├─ textLineItems[] — free-form items not tied to the catalog
  │     ├─ name (LocalizedString, required)
  │     ├─ description (LocalizedString, optional)
  │     ├─ quantity
  │     └─ custom (CustomFields, optional)
  ├─ deleteDaysAfterLastModification (Number, optional)
  └─ custom (CustomFields, optional)
```

---

## Line Item Behavior

**`name` is eventually consistent with the product catalog.** The line item `name` reflects the referenced product's current name — it is not a static snapshot. Updates to the product name propagate to shopping list line items eventually.

**`deactivatedAt` signals a no-longer-available item.** When a product or variant can no longer be sold (discontinued, deleted), the platform sets `deactivatedAt` on the shopping list line item. Use this field in your UI to display "no longer available" messaging rather than silently hiding the item.

**Custom reference expansions are supported** on `productSlug` and `variant` fields, allowing you to expand current product data when fetching the list.

---

## Platform Limits

| Limit | Value |
|-------|-------|
| Line Items per list | 100 |
| Text Line Items per list | 100 |
| Shopping Lists per project | 10,000,000 (soft limit — contactable for increase) |

**Auto-deletion:** When the 10M soft limit is reached, the least recently modified lists are automatically deleted. Use `deleteDaysAfterLastModification` to proactively expire stale lists (similar to cart expiry). The project-level default can be overridden per list.

---

## Converting a Shopping List to a Cart

There are two patterns:

**Add individual items** — use `addLineItem` or `addCustomLineItem` cart update actions, referencing each shopping list line item individually. Use this when you need to selectively migrate items or apply per-item logic.

**Add the entire list at once** — use the `addShoppingList` cart update action. This migrates all line items from the shopping list into the cart in a single request. Text Line Items are not added (they have no product catalog reference).

Note: Text Line Items cannot be converted to standard cart line items. If your shopping list contains text items that should be represented in the cart, you must use `addCustomLineItem` manually.

---

## Customer vs Anonymous Shopping Lists

| Scope | How |
|-------|-----|
| Registered customer | Set `customer` reference on `ShoppingListDraft` |
| Anonymous session | Set `anonymousId` on `ShoppingListDraft` |
| No user reference | Omit both — list exists independently |

A shopping list can be associated with a **Store** in addition to a customer or anonymous session, enabling store-scoped wishlist experiences.

---

## My Shopping Lists Endpoint (`/me/shopping-lists`)

The `/me/shopping-lists` endpoint provides shopping lists **scoped to the authenticated customer**.

- Requires a Bearer token from the **Password Flow** or **Anonymous Session Flow** — client credentials tokens are not accepted
- When a list is created through this endpoint, the `customer` field is automatically populated from the token
- The `key` and `slug` fields **cannot be set** via the `me/` endpoint — they are managed server-side only
- Returns a subset of Shopping List attributes (intentionally limited to what a customer context should see)

Use `/me/shopping-lists` for customer-facing storefront operations. Use the full Shopping Lists API (with client credentials) for backend/admin operations.

---

## Subscribe & Save Pattern

Shopping lists work well as a recurring order template for subscription models:

1. Subscription items and delivery preferences are stored in a Shopping List per customer
2. A scheduled service (cron job or workflow) reads the shopping lists and generates carts on the configured cadence
3. Service logic selects items as needed based on delivery data and availability
4. Generated carts are of a specific type with a custom state flow (e.g., `new → confirmed → submitted`)
5. Cart discounts can target the subscription cart type, enabling subscription-specific pricing alongside standard promotions

This pattern allows customers to pause, modify, or cancel their subscription by updating the shopping list, without requiring changes to the order or payment integration.

---

## Key Gotchas

- **Line item `name` is not a static snapshot** — it reflects the live product name and updates eventually. Do not rely on it as an audit trail of what the customer originally saw.
- **The `me/` endpoint cannot set `key` or `slug`.** If your application needs slugs for deep-linking, create the list via the backend (client credentials) and use the `key`/`slug` for sharing.
- **`addShoppingList` skips Text Line Items.** Only catalog-linked line items are added to the cart. Handle text items explicitly if they need cart representation.
- **`deleteDaysAfterLastModification` defaults to the project setting** — but any customer action on the list (adding/removing an item) resets the clock. Lists that are never touched after creation will be deleted after the project default expires.
- **Shopping Lists can be extended with Custom Types** — add custom fields to the list or to individual line items for application-specific metadata (e.g., priority, notes, gift message).

---

## API References

- Shopping Lists API: https://docs.commercetools.com/api/projects/shoppingLists
- My Shopping Lists: https://docs.commercetools.com/api/projects/me-shoppingLists
- Add Shopping List to Cart: https://docs.commercetools.com/api/projects/carts#add-shopping-list
