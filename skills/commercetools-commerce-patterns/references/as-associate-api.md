# As-Associate API

**Source:** Cross-reference from commercetools B2B documentation

---

## Overview

The **As-Associate API** is a special API path prefix in commercetools that enforces Business Unit–scoped permission checks on behalf of a buyer (associate). Any operation that a buyer performs within the context of a Business Unit — reading orders, creating carts, placing orders, managing quotes, approving flows — **must** go through this API path. Calling the standard API paths bypasses the BU permission layer and is only appropriate for merchant/admin contexts.

---

## The API Chain Pattern

The TypeScript SDK exposes the As-Associate API through a fluent builder chain:

```typescript
apiRoot
  .asAssociate()
  .withAssociateIdValue({ associateId: "customer-id-here" })
  .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey: "bu-key-here" })
  .<resource>()
  .<action>()
  .execute();
```

### Breaking Down the Chain

| Segment | Purpose |
|---|---|
| `.asAssociate()` | Switches the SDK into the as-associate routing context. |
| `.withAssociateIdValue({ associateId })` | Identifies which customer (associate) is performing the action. The platform validates that this customer is an associate of the target BU. |
| `.inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey })` | Scopes the operation to a specific Business Unit. |
| `.<resource>()` | The resource type (e.g. `.carts()`, `.orders()`, `.quoteRequests()`, `.me()`). |

### Example: Create a Cart as an Associate

```typescript
const cart = await apiRoot
  .asAssociate()
  .withAssociateIdValue({ associateId: customerId })
  .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey: "acme-uk" })
  .carts()
  .post({
    body: {
      currency: "GBP",
      country: "GB",
      businessUnit: { key: "acme-uk", typeId: "business-unit" },
      store: { key: "acme-uk-store", typeId: "store" },
    },
  })
  .execute();
```

### Example: Place an Order as an Associate

```typescript
const order = await apiRoot
  .asAssociate()
  .withAssociateIdValue({ associateId: customerId })
  .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey: "acme-uk" })
  .orders()
  .post({
    body: {
      cart: { id: cart.body.id, typeId: "cart" },
      version: cart.body.version,
    },
  })
  .execute();
```

---

## Why the As-Associate Path Is Required

### Platform Permission Enforcement

commercetools enforces B2B permissions **at the API layer** using the as-associate path. When a request arrives via this path, the platform:

1. Verifies the `associateId` is an active associate of the named Business Unit.
2. Checks whether that associate holds the required `associateRole` permission for the requested operation (e.g. `createMyCarts`, `createOrders`, `viewOrders`, `updateApprovalFlows`).
3. Rejects the request with `403 Forbidden` if the permission is absent.

Calling `/carts`, `/orders`, etc. directly (without `asAssociate`) uses project-level OAuth scopes only and does not apply associate-role permission logic. This means:
- A buyer could see or modify another BU's data if project scopes are broad.
- Approval rule enforcement is bypassed.
- Audit trail (who did what, in which BU) is lost.

**Always use the as-associate path for buyer-facing operations.**

---

## Operations Covered

The as-associate path supports the following resource types (non-exhaustive):

| Resource | Typical Operations |
|---|---|
| `carts` | Create, read, update, replicate carts scoped to the BU |
| `orders` | Place orders from cart, read orders |
| `orders/quotes` | Create an order from an accepted Quote |
| `quote-requests` | Create and manage QuoteRequests |
| `quotes` | Read, accept, decline Quotes |
| `order-approval-flows` | Approve or reject pending orders |
| `business-units` | Read BU details, update associates (where permitted) |
| `me` (associate context) | Read the associate's own profile and BU memberships |

---

## REST Equivalent

The SDK chain maps to the following REST path structure:

```
POST /as-associate/{associateId}/in-business-unit/key={businessUnitKey}/carts
GET  /as-associate/{associateId}/in-business-unit/key={businessUnitKey}/orders
POST /as-associate/{associateId}/in-business-unit/key={businessUnitKey}/orders
POST /as-associate/{associateId}/in-business-unit/key={businessUnitKey}/quote-requests
POST /as-associate/{associateId}/in-business-unit/key={businessUnitKey}/orders/quotes
```

---

## Common Mistakes

| Mistake | Consequence |
|---|---|
| Using `/carts` instead of `asAssociate().*.carts()` | No associate permission check; any authenticated customer could access any BU's carts if scopes allow. |
| Omitting `businessUnitKey` from the cart body | Cart may not be associated with the BU, breaking approval rule evaluation. |
| Using a merchant/admin token for buyer flows | Bypasses all associate-role enforcement; creates audit and security gaps. |
| Calling approval actions via the standard orders path | Not supported — approval transitions are only available through the as-associate path. |

---

## OAuth Scope

The OAuth token used in as-associate requests should carry:
- `manage_my_orders:{projectKey}` or `manage_orders:{projectKey}` (depending on whether you use customer tokens or merchant tokens acting on behalf of a customer).
- For customer-token flows (recommended for buyer-facing apps): use the `customer` OAuth flow so the token is bound to the specific customer, and the platform cross-checks `associateId` against the token's subject.
