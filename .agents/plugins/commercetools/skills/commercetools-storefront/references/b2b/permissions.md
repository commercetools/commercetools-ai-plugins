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

**Impact: HIGH — UI must gate all actions with `usePermissions()`. No app-level enforcement in Route Handlers — commercetools enforces everything via the as-associate chain. A 403 from commercetools means the associate lacks the permission.**

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

**INCORRECT:** Adding permission checks inside Route Handlers:

```typescript
// WRONG — duplicates commercetools enforcement; also fragile since it must be maintained manually
export async function POST() {
  const session = await getSession();
  const bu = await getBusinessUnitByKey(session.businessUnitKey!);
  const associate = bu.associates.find(a => a.customer.id === session.customerId);
  const hasPermission = associate?.associateRoleAssignments.some(r => r.key === 'CreateMyCarts');
  if (!hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // ...
}
```

**CORRECT — Route Handlers only check session existence; commercetools enforces permissions via the as-associate chain:**

```typescript
// app/api/cart/route.ts
export async function POST() {
  const session = await getSession();
  // Only check: is the user logged in with a valid BU?
  if (!session.customerId || !session.businessUnitKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // commercetools will 403 automatically if the associate lacks CreateMyCarts
  const cart = await createCart(
    session.customerId,
    session.customerId,   // associateId
    session.businessUnitKey,
    session.storeKey!,
    session.currency,
    session.country
  );
  return NextResponse.json({ cart });
}
```

> **The as-associate chain is the enforcement layer.** If commercetools returns 403, propagate it to the browser as-is (or return a generic error). Never try to replicate commercetools's permission logic in application code.

---

## Pattern 2: usePermissions Resolution

**INCORRECT:** Hardcoding role-to-permission mappings in the app:

```typescript
// WRONG — role definitions live in commercetools, not in code
const BUYER_PERMISSIONS = ['CreateMyCarts', 'ViewMyOrders'];
const isBuyer = currentUser.roles.includes('buyer');
const canCreateCart = isBuyer;
```

**CORRECT — `usePermissions` fetches associate roles from commercetools and resolves dynamically:**

```typescript
// hooks/usePermissions.ts
// Resolution logic (simplified):
// 1. Fetch all AssociateRole objects from /api/associate-roles (commercetools source of truth)
// 2. Find current associate in currentBusinessUnit.associates by customerId
// 3. Collect their role keys from associateRoleAssignments
// 4. Collect all permissions from those roles
// 5. Expose can(), hasAnyPermission(), roleKeys

export function usePermissions() {
  const { user } = useAuth();
  const { currentBusinessUnit } = useBusinessUnit();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [roleKeys, setRoleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !currentBusinessUnit) return;

    // Find the current user's associate record in the BU
    const associate = currentBusinessUnit.associates.find(
      (a) => a.customer.id === user.id
    );
    if (!associate) return;

    // Collect the associate's role keys
    const keys = new Set(associate.associateRoleAssignments.map((r) => r.associateRole.key));
    setRoleKeys(keys);

    // Fetch all roles from commercetools (module-level cache, fetched once per tab)
    fetchAssociateRoles().then((roles) => {
      const perms = new Set<string>();
      for (const role of roles) {
        if (keys.has(role.key)) {
          for (const p of role.permissions) perms.add(p);
        }
      }
      setPermissions(perms);
    });
  }, [user, currentBusinessUnit]);

  const can = (permission: string) => permissions.has(permission);
  const hasAnyPermission = (ps: string[]) => ps.some((p) => permissions.has(p));
  const hasAllPermissions = (ps: string[]) => ps.every((p) => permissions.has(p));

  return { can, hasAnyPermission, hasAllPermissions, roleKeys, permissions };
}
```

> Role definitions (which permissions a role has) are configured in commercetools Merchant Center, not in code. `usePermissions` fetches them at runtime — no permission mapping in the codebase.

---

## Pattern 3: UI Gating Patterns

### Pattern A — single permission

```typescript
const { can } = usePermissions();
if (!can('CreateApprovalRules')) return null;
```

### Pattern B — "either My or Others grants access" (feature visibility)

```typescript
const { hasAnyPermission } = usePermissions();
const canViewOrders = hasAnyPermission(['ViewMyOrders', 'ViewOthersOrders']);
if (!canViewOrders) return null;
```

Use `hasAnyPermission` for deciding whether to show a feature at all.

### Pattern C — dynamic My/Others dispatch (per-resource actions)

```typescript
const { can } = usePermissions();
const { user } = useAuth();

const isOwnQuote = quote.customer.id === user?.id;
const canAccept = isOwnQuote ? can('AcceptMyQuotes') : can('AcceptOthersQuotes');

{canAccept && <Button onClick={handleAccept}>Accept Quote</Button>}
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

{isEligibleApprover && canActOnCurrentTier && (
  <>
    <Button onClick={handleApprove}>Approve</Button>
    <Button onClick={handleReject}>Reject</Button>
  </>
)}
```

---

## Pattern 4: All Permission Strings

Defined as a TypeScript union in `lib/types.ts`:

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

**INCORRECT:** Rendering nav items and redirecting on access:

```typescript
// WRONG — user sees the link, clicks it, then gets an error
<Link href="/dashboard/approval-rules">Approval Rules</Link>
```

**CORRECT — `DashboardNav` hides items when the associate lacks the required permissions:**

```typescript
// components/layout/DashboardNav.tsx
const NAV_ITEMS = [
  { label: t('orders'), href: '/dashboard/orders',
    requiredPermissions: ['ViewMyOrders', 'ViewOthersOrders'] },
  { label: t('quotes'), href: '/dashboard/quotes',
    requiredPermissions: ['ViewMyQuotes', 'ViewOthersQuotes'] },
  { label: t('approvalRules'), href: '/dashboard/approval-rules',
    requiredPermissions: ['CreateApprovalRules', 'UpdateApprovalRules'] },
  { label: t('company'), href: '/dashboard/company',
    requiredPermissions: ['UpdateBusinessUnitDetails', 'UpdateAssociates'] },
];

// In the component:
{NAV_ITEMS
  .filter(item =>
    !item.requiredPermissions ||
    hasAnyPermission(item.requiredPermissions)
  )
  .map(item => <NavLink key={item.href} {...item} />)
}
```

---

## Checklist

- [ ] No permission checks in Route Handlers — commercetools enforces via as-associate chain
- [ ] All UI action buttons gated with `can()` or `hasAnyPermission()`
- [ ] "My vs Others" pattern used for resource-scoped actions (quotes, orders, carts)
- [ ] Approval flow actions gated with `roleKeys` (pattern D), not named permissions
- [ ] Nav items specify `requiredPermissions` — items not shown if associate lacks them
- [ ] New feature: check `lib/types.ts` for the correct `Permission` union strings
- [ ] Role definitions configured in commercetools Merchant Center — never hardcoded in the app
