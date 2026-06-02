---
name: approval-workflows
description: Approval rule creation, approval flow approval/rejection with read-then-write pattern, eligibility checks, predicate builder, and graceful degradation.
when_to_use:
  - "Implementing approval workflows for B2B orders"
  - "Creating or editing approval rules"
  - "Building the approval flows UI"
  - "Handling approval and rejection actions"
  - "Adding new predicate conditions to approval rules"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - approval-workflows
    - permissions
---

# Approval Workflows

**Impact: MEDIUM — The app never creates approval flows — commercetools does automatically when an order matches a rule. The app only reads, approves, and rejects them. Approval/reject always requires a read-then-write to get the current version.**

This reference covers approval rules (create/edit), approval flows (read/approve/reject), the predicate builder, and the tier model.

## Table of Contents
- [Pattern 1: How Approval Flows Work](#pattern-1-how-approval-flows-work)
- [Pattern 2: Approval Rule Draft Structure](#pattern-2-approval-rule-draft-structure)
- [Pattern 3: Approve/Reject — Read-Then-Write](#pattern-3-approvereject--read-then-write)
- [Pattern 4: Eligibility Check Before Showing Approve/Reject Buttons](#pattern-4-eligibility-check-before-showing-approvereject-buttons)
- [Pattern 5: PredicateBuilder — Adding a New Condition Type](#pattern-5-predicatebuilder--adding-a-new-condition-type)
- [Pattern 6: Graceful Degradation on 403](#pattern-6-graceful-degradation-on-403)
- [Checklist](#checklist)

---

## Pattern 1: How Approval Flows Work

1. An admin creates an **approval rule** with a predicate and a tier chain of approver roles.
2. When any associate places an order, commercetools evaluates all active rules automatically — **no app code triggers this**.
3. If a rule matches, commercetools creates an **approval flow** linked to the order.
4. Associates with eligible roles see the flow on the order detail page.

**The app never creates flows.** It only:
- Creates/edits approval rules
- Lists and displays approval flows
- Approves or rejects flows via `{ action: 'approve' }` / `{ action: 'reject' }`

---

## Pattern 2: Approval Rule Draft Structure

**INCORRECT:** Passing a flat list of approvers without the nested tier structure:

```typescript
// WRONG — commercetools requires the nested tiers/and/or structure
approvers: [{ associateRole: { key: 'approver', typeId: 'associate-role' } }]
```

**CORRECT — tiers are sequential; each tier is `and: [{ or: [roles] }]`:**

```typescript
// lib/ct/approval-rules.ts
export async function createApprovalRule(
  associateId: string,
  businessUnitKey: string,
  draft: {
    name: string;
    description?: string;
    status: 'Active' | 'Inactive';
    predicate: string;
    requesters: Array<{ associateRole: { key: string; typeId: 'associate-role' } }>;
    approvers: {
      tiers: Array<{
        and: Array<{
          or: Array<{ associateRole: { key: string; typeId: 'associate-role' } }>;
        }>;
      }>;
    };
  }
) {
  const { body } = await apiRoot
    .asAssociate()
    .withAssociateIdValue({ associateId })
    .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey })
    .approvalRules()
    .post({ body: draft })
    .execute();
  return body;
}
```

**Example: two-tier rule — buyer requests, approver tier 1, admin tier 2:**

```typescript
const draft = {
  name: 'Large Order Approval',
  status: 'Active',
  predicate: 'totalPrice.centAmount > 500000',
  requesters: [{ associateRole: { key: 'buyer', typeId: 'associate-role' } }],
  approvers: {
    tiers: [
      {
        // Tier 1: any associate with 'approver' role must approve first
        and: [{ or: [{ associateRole: { key: 'approver', typeId: 'associate-role' } }] }],
      },
      {
        // Tier 2: any associate with 'admin' role must approve after tier 1
        and: [{ or: [{ associateRole: { key: 'admin', typeId: 'associate-role' } }] }],
      },
    ],
  },
};
```

**Predicate syntax:**

| Field | commercetools predicate | Value |
|---|---|---|
| Total price | `totalPrice.centAmount > 500000` | Integer (display × 100) |
| Line item count | `lineItemCount > 5` | Integer |
| Currency | `totalPrice.currencyCode = "USD"` | ISO 4217 |

Conditions are joined with ` and `. `parsePredicate` in `PredicateBuilder.tsx` handles the `order.` prefix as well.

---

## Pattern 3: Approve/Reject — Read-Then-Write

**INCORRECT:** Using a cached version number from SWR state:

```typescript
// WRONG — version may be stale if another approver acted concurrently
await performApprovalAction(flowId, cachedFlow.version, 'approve');
```

**CORRECT — always fetch the current version immediately before posting the action:**

```typescript
// lib/ct/approval-flows.ts
async function fetchApprovalFlowRaw(
  associateId: string, businessUnitKey: string, flowId: string
) {
  const { body } = await apiRoot
    .asAssociate()
    .withAssociateIdValue({ associateId })
    .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey })
    .approvalFlows()
    .withId({ ID: flowId })
    .get()
    .execute();
  return body; // raw commercetools response — has current .version
}

export async function approveFlow(
  associateId: string, businessUnitKey: string, flowId: string
) {
  // Read-then-write: get current version before posting
  const raw = await fetchApprovalFlowRaw(associateId, businessUnitKey, flowId);
  const { body } = await apiRoot
    .asAssociate()
    .withAssociateIdValue({ associateId })
    .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey })
    .approvalFlows()
    .withId({ ID: flowId })
    .post({ body: { version: raw.version, actions: [{ action: 'approve' }] } })
    .execute();
  return mapApprovalFlow(body);
}

export async function rejectFlow(
  associateId: string, businessUnitKey: string, flowId: string, reason?: string
) {
  const raw = await fetchApprovalFlowRaw(associateId, businessUnitKey, flowId);
  const { body } = await apiRoot
    .asAssociate()
    .withAssociateIdValue({ associateId })
    .inBusinessUnitKeyWithBusinessUnitKeyValue({ businessUnitKey })
    .approvalFlows()
    .withId({ ID: flowId })
    .post({ body: { version: raw.version, actions: [{ action: 'reject', reason }] } })
    .execute();
  return mapApprovalFlow(body);
}
```

---

## Pattern 4: Eligibility Check Before Showing Approve/Reject Buttons

**INCORRECT:** Showing approve/reject buttons to all associates:

```typescript
// WRONG — shows buttons to associates who are not eligible or not in the active tier
{flow.status === 'Pending' && (
  <Button onClick={handleApprove}>Approve</Button>
)}
```

**CORRECT — gate on both `eligibleApprovers` and `currentTierPendingApprovers`:**

```typescript
// app/[locale]/dashboard/orders/[id]/page.tsx
const { roleKeys } = usePermissions();

// Check 1: user's role is listed as eligible for this flow
const isEligibleApprover = flow.eligibleApprovers.some(
  (a) => roleKeys.has(a.associateRole.key)
);

// Check 2: user's role is in the currently active tier (not a future tier)
const canActOnCurrentTier = flow.currentTierPendingApprovers.some(
  (a) => roleKeys.has(a.associateRole.key)
);

// Only show buttons when BOTH conditions are true
{isEligibleApprover && canActOnCurrentTier && flow.status === 'Pending' && (
  <>
    <Button onClick={() => handleAction('approve')}>Approve</Button>
    <Button variant="danger" onClick={() => setShowRejectModal(true)}>Reject</Button>
  </>
)}
```

> This uses `roleKeys` (role keys from associate role assignments), not named permissions. Approval eligibility is role-based, not permission-based.

---

## Pattern 5: PredicateBuilder — Adding a New Condition Type

Touch exactly these five things in `components/approval-rules/PredicateBuilder.tsx`:

1. **`fieldOptions` array** — add `{ value: 'myField', label: 'Display Name', description: '...' }`

2. **`handleFieldChange`** — add an `else if (field === 'myField')` branch with default operator/value

3. **Input JSX** — add `{condition.field === 'myField' && (...)}` inside the conditions map

4. **`buildPredicateString`** — add `if (c.field === 'myField')` branch with commercetools syntax:
   ```typescript
   if (c.field === 'myField') return `myField ${c.operator} ${c.value}`;
   ```

5. **`parsePredicate`** — add a regex branch to recognize the new field:
   ```typescript
   const myFieldMatch = str.match(/(?:order\.)?myField\s*(>|>=|<|<=|=|!=)\s*(.+)/);
   if (myFieldMatch) return { field: 'myField', operator: myFieldMatch[1], value: myFieldMatch[2].trim() };
   ```

**Currently supported predicate fields:** `totalPrice.centAmount`, `lineItemCount`, `totalPrice.currencyCode`.

---

## Pattern 6: Graceful Degradation on 403

**INCORRECT:** Returning 403 to the browser when commercetools returns 403 on the approval flows list:

```typescript
// WRONG — causes an error page for associates who just can't see flows
if (response.status === 403) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

**CORRECT — silently return empty results on commercetools 403 for the flows list:**

```typescript
// app/api/approval-flows/route.ts
export async function GET() {
  const session = await getSession();
  if (!session.customerId || !session.businessUnitKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const flows = await getApprovalFlows(session.customerId, session.businessUnitKey);
    return NextResponse.json({ results: flows, total: flows.length });
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    // commercetools 403 = associate lacks UpdateApprovalFlows — return empty list, not an error
    if (statusCode === 403) {
      return NextResponse.json({ results: [], total: 0 });
    }
    return NextResponse.json({ error: 'Failed to fetch approval flows' }, { status: 500 });
  }
}
```

---

## Checklist

- [ ] App never creates approval flows — commercetools creates them automatically on order placement
- [ ] Approval rule draft uses nested `tiers → and → or` structure
- [ ] Approve/reject always calls `fetchApprovalFlowRaw` first to get current version
- [ ] Approve/reject buttons gated on both `eligibleApprovers` AND `currentTierPendingApprovers`
- [ ] `GET /api/approval-flows` returns empty list on commercetools 403 (no error to browser)
- [ ] Always expand `order`, `approvals[*].approver.customer`, `rejection.rejecter.customer` when fetching flow detail
- [ ] New predicate field: touch all 5 locations in `PredicateBuilder.tsx`
