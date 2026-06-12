---
name: permissions
description: Permission architecture, usePermissions hook, UI gating patterns, and all B2B permission strings such as CreateMyCarts and ViewOthersOrders.
when_to_use:
  - "Gating cart, order, quote, and approval UI behind associate permissions"
  - "Understanding My vs Others permission semantics"
  - "Hiding nav items from associates lacking access"
  - "Implementing role-based approval flow logic"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - rbac
    - permissions
    - auth
---

# Permissions & RBAC

**Impact: HIGH — UI must gate all actions with `usePermissions()` (the client-state permission hook). No app-level enforcement in server endpoints — commercetools enforces everything via the as-associate chain. A 403 from commercetools means the associate lacks the permission.**

This reference covers all permission strings, how `usePermissions` resolves them, UI gating patterns, and "My vs Others" semantics.

## Table of Contents
- [Pattern 1: Permission Architecture](#pattern-1-permission-architecture)
- [Pattern 2: usePermissions Resolution](#pattern-2-usepermissions-resolution)
- [Pattern 3: UI Gating Patterns](#pattern-3-ui-gating-patterns)
- [Pattern 4: All Permission Strings](#pattern-4-all-permission-strings)
- [Pattern 5: Nav Item Gating](#pattern-5-nav-item-gating)
- [Checklist](#checklist)

---

## Pattern 1: Permission Architecture

**INCORRECT:** Re-deriving and enforcing permissions inside a server endpoint — loading the business unit, finding the associate, and checking `associateRoleAssignments` for `CreateMyCarts` before proceeding. This duplicates commercetools enforcement and is fragile because it must be maintained by hand against the role config.

**CORRECT — server endpoints only check session existence; commercetools enforces permissions via the as-associate chain.** The endpoint confirms there is a logged-in associate with a business unit, then delegates straight to the as-associate call. commercetools returns 403 automatically if the associate lacks `CreateMyCarts`:

```typescript
// commercetools will 403 automatically if the associate lacks CreateMyCarts
const cart = await createCart(
  session.customerId,
  session.customerId,   // associateId
  session.businessUnitKey,
  session.storeKey!,
  session.currency,
  session.country
);
```

> **The as-associate chain is the enforcement layer.** If commercetools returns 403, propagate it to the browser as-is (or return a generic error). Never try to replicate commercetools's permission logic in application code.

> Find the stack's `data-loading.md` for concrete server endpoint implementation patterns.


---

## Pattern 2: usePermissions Resolution

**INCORRECT:** Hardcoding role-to-permission mappings in the app:

```typescript
// WRONG — role definitions live in commercetools, not in code
const BUYER_PERMISSIONS = ['CreateMyCarts', 'ViewMyOrders'];
const isBuyer = currentUser.roles.includes('buyer');
const canCreateCart = isBuyer;
```

**CORRECT — `usePermissions` fetches associate roles from commercetools and resolves dynamically.** It is a client-state hook backed by the current user and the active business unit. Its resolution is:

1. Fetch all `AssociateRole` objects from the associate-roles endpoint (commercetools source of truth; cached once per tab)
2. Find the current associate in `currentBusinessUnit.associates` by `customer.id`
3. Collect that associate's role keys from `associateRoleAssignments` → `roleKeys`
4. Union the `permissions` of every role whose key is in `roleKeys`
5. Expose `can(permission)`, `hasAnyPermission(ps)`, `hasAllPermissions(ps)`, and `roleKeys`

```typescript
// Core resolution — framework-neutral
const keys = new Set(
  associate.associateRoleAssignments.map((r) => r.associateRole.key)
); // → roleKeys

const permissions = new Set<string>();
for (const role of allAssociateRoles) {
  if (keys.has(role.key)) {
    for (const p of role.permissions) permissions.add(p);
  }
}

const can = (permission: string) => permissions.has(permission);
const hasAnyPermission = (ps: string[]) => ps.some((p) => permissions.has(p));
const hasAllPermissions = (ps: string[]) => ps.every((p) => permissions.has(p));
```

> Role definitions (which permissions a role has) are configured in commercetools Merchant Center, not in code. `usePermissions` fetches them at runtime — no permission mapping in the codebase.
> Find the stack's `concept-mapping.md` for concrete client-state and cache implementation.


---

## Pattern 3: UI Gating Patterns

All four patterns read from `usePermissions()`; the snippets below show the decision logic only. Render the gated control when the resulting boolean is true (and hide it otherwise).

### Pattern A — single permission

```typescript
const { can } = usePermissions();
const canCreateRules = can('CreateApprovalRules');
```

### Pattern B — "either My or Others grants access" (feature visibility)

```typescript
const { hasAnyPermission } = usePermissions();
const canViewOrders = hasAnyPermission(['ViewMyOrders', 'ViewOthersOrders']);
```

Use `hasAnyPermission` for deciding whether to show a feature at all.

### Pattern C — dynamic My/Others dispatch (per-resource actions)

Resolve the current user (id) from auth/session, then pick the My vs Others permission per resource:

```typescript
const { can } = usePermissions();

const isOwnQuote = quote.customer.id === currentUserId;
const canAccept = isOwnQuote ? can('AcceptMyQuotes') : can('AcceptOthersQuotes');
```

Use this for action buttons on specific resources.

### Pattern D — role-key based approval tier check

```typescript
const { roleKeys } = usePermissions();

const isEligibleApprover = flow.eligibleApprovers.some(
  (a) => roleKeys.has(a.associateRole.key)
);
const canActOnCurrentTier = flow.currentTierPendingApprovers.some(
  (a) => roleKeys.has(a.associateRole.key)
);

const canApprove = isEligibleApprover && canActOnCurrentTier;
```

---

## Pattern 4: All Permission Strings

Defined as a TypeScript union in `<server>/types`:

**Business Unit**
- `AddChildUnits` — create sub-divisions
- `UpdateBusinessUnitDetails` — edit BU name, email, addresses
- `UpdateAssociates` — add/remove/change roles of associates

**Carts**
- `CreateMyCarts` / `CreateOthersCarts`
- `UpdateMyCarts` / `UpdateOthersCarts`
- `DeleteMyCarts` / `DeleteOthersCarts`
- `ViewMyCarts` / `ViewOthersCarts`

**Orders**
- `CreateMyOrdersFromMyCarts` / `CreateOrdersFromOthersCarts`
- `CreateMyOrdersFromMyQuotes` / `CreateOrdersFromOthersQuotes`
- `ViewMyOrders` / `ViewOthersOrders`
- `UpdateMyOrders` / `UpdateOthersOrders`

**Quotes**
- `CreateMyQuoteRequestsFromMyCarts` / `CreateQuoteRequestsFromOthersCarts`
- `AcceptMyQuotes` / `AcceptOthersQuotes`
- `DeclineMyQuotes` / `DeclineOthersQuotes`
- `RenegotiateMyQuotes` / `RenegotiateOthersQuotes`
- `ReassignMyQuotes` / `ReassignOthersQuotes`
- `ViewMyQuotes` / `ViewOthersQuotes`

**Approvals**
- `CreateApprovalRules`
- `UpdateApprovalRules`
- `UpdateApprovalFlows`

**Shopping Lists (Purchase Lists)**
- `ViewMyShoppingLists` / `ViewOthersShoppingLists`
- `CreateMyShoppingLists` / `CreateOthersShoppingLists`
- `UpdateMyShoppingLists` / `UpdateOthersShoppingLists`
- `DeleteMyShoppingLists` / `DeleteOthersShoppingLists`

> **"My" vs "Others":** `My*` = resources where `resource.customer.id === user.id`. `Others*` = resources owned by any other associate in the BU. commercetools enforces this at the data level — an associate with only `ViewMyOrders` only receives their own orders from the as-associate endpoint.

---

## Pattern 5: Nav Item Gating

**INCORRECT:** Always rendering a nav link (e.g. to `/dashboard/approval-rules`) and only failing once the associate clicks through — the user sees the link, clicks it, then hits an error.

**CORRECT — the dashboard nav hides items when the associate lacks the required permissions.** Declare each nav item with the permissions that make it visible, then filter the list through `hasAnyPermission` before rendering:

```typescript
const NAV_ITEMS = [
  { label: 'orders', href: '/dashboard/orders',
    requiredPermissions: ['ViewMyOrders', 'ViewOthersOrders'] },
  { label: 'quotes', href: '/dashboard/quotes',
    requiredPermissions: ['ViewMyQuotes', 'ViewOthersQuotes'] },
  { label: 'approvalRules', href: '/dashboard/approval-rules',
    requiredPermissions: ['CreateApprovalRules', 'UpdateApprovalRules'] },
  { label: 'company', href: '/dashboard/company',
    requiredPermissions: ['UpdateBusinessUnitDetails', 'UpdateAssociates'] },
];

// Visible items only:
const visibleItems = NAV_ITEMS.filter(
  (item) => !item.requiredPermissions || hasAnyPermission(item.requiredPermissions)
);
```

Render each visible item with the framework's locale-aware link primitive; labels go through the framework's i18n/locale routing.

---

## Checklist

- [ ] No permission checks in server endpoints — commercetools enforces via as-associate chain
- [ ] All UI action buttons gated with `can()` or `hasAnyPermission()`
- [ ] "My vs Others" pattern used for resource-scoped actions (quotes, orders, carts)
- [ ] Approval flow actions gated with `roleKeys` (pattern D), not named permissions
- [ ] Nav items specify `requiredPermissions` — items not shown if associate lacks them
- [ ] New feature: check `<server>/types` for the correct `Permission` union strings
- [ ] Role definitions configured in commercetools Merchant Center — never hardcoded in the app
