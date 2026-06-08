---
name: superuser
description: B2C CSR impersonation covering dual identity in JWT, CSR group membership detection, three-step login flow, and price override endpoint gating.
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

CSR agents authenticate with their own credentials, then impersonate a customer. The JWT session carries both identities simultaneously. All price-override endpoints are hard-gated behind a `csrId` presence check — UI hiding the input is not sufficient.

## Key Takeaways

**Two identities in one JWT cookie.** Normal session fields (`customerId`, `email`, etc.) hold the *impersonated* customer's data. CSR identity lives in `csrId`, `csrEmail`, `csrFirstName`, `csrLastName`.

**`CSR_GROUP_ID` is the membership gate.** Server-only env var — the commercetools Customer Group ID that marks CSR accounts. `POST /api/auth/login` checks this group before deciding whether to issue a normal session or return `{ requiresCsrEmail: true }`.

**Three-endpoint login flow.** Login → detect CSR group → return flag → UI calls `POST /api/auth/csr-login` with both credential sets → session holds dual identity. `GET /api/auth/superuser` exposes CSR state to client components.

**`csrId` guard is non-negotiable.** `PUT /api/cart/items/[itemId]/price` must return 403 when `session.csrId` is absent. A missing guard lets any authenticated customer override prices.

**`SuperUserContext` drives all CSR UI.** SWR hook reads `/api/auth/superuser` with 30 s deduping. `useSuperUser()` in any client component exposes CSR state without prop drilling — yellow banner in Header, `PriceOverrideInput` in CartItem.

## Anti-Patterns

| Anti-pattern | Correct approach |
|---|---|
| No `csrId` check on price override route | Return 403 when `session.csrId` is absent — always, even if UI hides the input |
| `NEXT_PUBLIC_CSR_GROUP_ID` env var | Server-only — no `NEXT_PUBLIC_` prefix |
| CSR state in localStorage or React state | JWT session cookie; expose via `/api/auth/superuser` SWR |
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

Add `CSR_GROUP_ID` to `site/.env`. This is the commercetools Customer Group that identifies CSR agents. Server-only — no `NEXT_PUBLIC_` prefix.

```bash
# site/.env
CSR_GROUP_ID=<customer-group-id-from-ct>
```

In commercetools Merchant Center:
1. Customers → Customer Groups → Create "CSR Agents" group
2. Copy the group ID to `CSR_GROUP_ID`
3. Assign CSR agent customer accounts to that group


## Pattern 2: Session Extension

Extend the `Session` interface with CSR fields. Normal customer fields (`customerId`, `email`, etc.) hold the **impersonated** customer's data when a CSR is active.

```typescript
// site/lib/session.ts
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

Three endpoints collaborate:

```typescript
// POST /api/auth/login
// Authenticates; if the customer is in CSR_GROUP_ID → returns flag
export async function POST(request: Request) {
  const { email, password } = await request.json();
  const customer = await loginCustomer(email, password);

  // check customer's customerGroup.id or customerGroupAssignments[*].customerGroup.id to include process.env.CSR_GROUP_ID

  if (includes) {
    // Don't create session yet — CSR must supply a customer email to impersonate
    return NextResponse.json({ requiresCsrEmail: true });
  }
  // Normal login: write session and return
  await writeSession(response, { customerId: customer.id, email: customer.email, ... });
  return response;
}

// POST /api/auth/csr-login
// Called after /login returns requiresCsrEmail: true
// Body: { csrEmail, csrPassword, impersonatedEmail }
export async function POST(request: Request) {
  const { csrEmail, csrPassword, impersonatedEmail } = await request.json();
  const csr = await loginCustomer(csrEmail, csrPassword);
  const target = await getCustomerByEmail(impersonatedEmail);

  await writeSession(response, {
    // Impersonated customer in the normal fields
    customerId: target.id,
    email:      target.email,
    firstName:  target.firstName,
    lastName:   target.lastName,
    // CSR identity in csr* fields
    csrId:       csr.id,
    csrEmail:    csr.email,
    csrFirstName: csr.firstName,
    csrLastName:  csr.lastName,
  });
  return response;
}

// GET /api/auth/superuser  → { csrId, csrEmail, csrFirstName, csrLastName } | {}
export async function GET(request: Request) {
  const session = await readSession(request);
  if (!session?.csrId) return NextResponse.json({});
  return NextResponse.json({
    csrId:       session.csrId,
    csrEmail:    session.csrEmail,
    csrFirstName: session.csrFirstName,
    csrLastName:  session.csrLastName,
  });
}
```


## Pattern 4: Price Override

`PUT /api/cart/items/[itemId]/price` checks `session.csrId` first — returns 403 if absent.

```typescript
// site/app/api/cart/items/[itemId]/price/route.ts
export async function PUT(request: Request, { params }: { params: { itemId: string } }) {
  const session = await readSession(request);

  // CRITICAL: guard — only CSR agents may override prices
  if (!session?.csrId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { centAmount, currencyCode } = await request.json();
  const cart = await applyCartAction(session.cartId!, session.customerId, [
    {
      action: 'setLineItemPrice',
      lineItemId: params.itemId,
      externalPrice: { currencyCode, centAmount },
    },
  ]);
  return NextResponse.json(mapCart(cart));
}
```


## Pattern 5: SuperUserContext

```typescript
// site/contexts/SuperUserContext.tsx
'use client';
import useSWR from 'swr';
import { createContext, useContext } from 'react';

interface CsrState {
  csrId?:        string;
  csrEmail?:     string;
  csrFirstName?: string;
  csrLastName?:  string;
}

const SuperUserContext = createContext<CsrState>({});

const csrFetcher = (url: string) => fetch(url).then((r) => r.json());

export function SuperUserProvider({ children }: { children: React.ReactNode }) {
  const { data = {} } = useSWR<CsrState>('/api/auth/superuser', csrFetcher, {
    dedupingInterval: 30_000,
  });
  return <SuperUserContext.Provider value={data}>{children}</SuperUserContext.Provider>;
}

export function useSuperUser() {
  return useContext(SuperUserContext);
}
```

Add `<SuperUserProvider>` to `app/[locale]/layout.tsx` wrapping the children.


## Pattern 6: UI

**Yellow banner in Header when CSR is active:**

```typescript
// site/components/layout/Header.tsx
import { useSuperUser } from '@/contexts/SuperUserContext';

export default function Header() {
  const { csrId, csrFirstName, csrLastName } = useSuperUser();

  return (
    <>
      {csrId && (
        <div className="bg-yellow-400 py-1 text-center text-xs font-semibold text-yellow-900">
          CSR Mode — {csrFirstName} {csrLastName} impersonating customer
        </div>
      )}
      {/* ... rest of header */}
    </>
  );
}
```

**PriceOverrideInput in cart line item (shown only to CSR):**

```typescript
// site/components/cart/CartItem.tsx
import { useSuperUser } from '@/contexts/SuperUserContext';
import PriceOverrideInput from '@/components/ui/PriceOverrideInput';

export default function CartItem({ item }: { item: CartLineItem }) {
  const { csrId } = useSuperUser();

  return (
    <div>
      {/* ... quantity, name, etc. */}
      {csrId && (
        <PriceOverrideInput lineItemId={item.id} currentPrice={item.price} />
      )}
    </div>
  );
}
```


## Checklist
- [ ] `CSR_GROUP_ID` set in `site/.env` (server-only, no `NEXT_PUBLIC_`)
- [ ] `Session` interface extended with `csrId`, `csrEmail`, `csrFirstName`, `csrLastName`
- [ ] `POST /api/auth/login` returns `{ requiresCsrEmail: true }` for CSR group members
- [ ] `POST /api/auth/csr-login` writes dual identity to session
- [ ] `GET /api/auth/superuser` returns CSR fields or `{}`
- [ ] `PUT /api/cart/items/[itemId]/price` returns 403 when `session.csrId` is absent
- [ ] `SuperUserProvider` added to root layout wrapping children
- [ ] Yellow banner visible in Header during active impersonation
- [ ] `PriceOverrideInput` rendered in CartItem only when `csrId` is set
