---
name: dashboard
description: Dashboard shell, BU-keyed SWR hooks, stat widgets, adding dashboard pages, sidebar nav with permission gates, and shared UI primitives.
when_to_use:
  - "Building the B2B dashboard"
  - "Adding new dashboard pages"
  - "Implementing stat widgets"
  - "Gating nav items and pages by associate permission"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - dashboard
    - ui
    - permissions
---

# Dashboard — Shell, Widgets, Pages, Nav

**Impact: MEDIUM — All dashboard hooks must include `businessUnitKey` in the SWR cache key or the cache won't invalidate when the user switches business units.**

This reference covers the dashboard layout, stat card widgets, adding new pages, sidebar nav items, and the shared UI primitives.

## Table of Contents
- [Pattern 1: Dashboard Shell](#pattern-1-dashboard-shell)
- [Pattern 2: BU-Keyed SWR Hook](#pattern-2-bu-keyed-swr-hook)
- [Pattern 3: Adding a Stat Widget](#pattern-3-adding-a-stat-widget)
- [Pattern 4: Adding a Dashboard Page](#pattern-4-adding-a-dashboard-page)
- [Pattern 5: Sidebar Nav Items](#pattern-5-sidebar-nav-items)
- [Shared UI Primitives](#shared-ui-primitives)
- [Checklist](#checklist)

---

## Pattern 1: Dashboard Shell

`app/[locale]/dashboard/layout.tsx` is a `'use client'` component that:
1. Redirects to `/login` when `!isLoggedIn` (via `useAuth`)
2. Shows a BU-selection screen when `!currentBusinessUnit` (via `useBusinessUnit`)
3. Renders two-column: `<aside>DashboardNav</aside>` + `<main>{children}</main>`

Inside any dashboard page, these contexts are always available:
- `useAuth()` — `user`, `isLoggedIn`
- `useBusinessUnit()` — `currentBusinessUnit`, `currentStore`, `businessUnits`
- `usePermissions()` — `can`, `hasAnyPermission`, `roleKeys`
- `useToast()` — `addToast(message)`
- `useFormatters()` — `formatMoney(centAmount, currency)`, `formatDate(isoString)`

---

## Pattern 2: BU-Keyed SWR Hook

**INCORRECT:** Using a static key for BU-scoped data:

```typescript
// WRONG — stale data persists when user switches business units
return useSWR(KEY_ORDERS, ordersFetcher, { revalidateOnFocus: false });
```

**CORRECT — include `businessUnitKey` in the SWR key tuple:**

```typescript
// hooks/useOrders.ts
export function useOrders() {
  const { currentBusinessUnit } = useBusinessUnit();
  const buKey = currentBusinessUnit?.key ?? null;

  return useSWR(
    buKey ? [KEY_ORDERS, buKey] : null,  // null = skip fetch until BU is selected
    ([, bk]) => fetchOrders(bk),
    { revalidateOnFocus: false }
  );
}
```

> `null` key skips the SWR fetch — use it when `businessUnitKey` is not yet known. SWR automatically re-fetches when the key changes (BU switch).

---

## Pattern 3: Adding a Stat Widget

The overview page (`app/[locale]/dashboard/page.tsx`) renders a `statCards` array.

**Step 1 — Create the hook (BU-keyed):**

```typescript
// hooks/useMyStats.ts
const KEY_MY_STATS = 'my-stats';

export function useMyStats() {
  const { currentBusinessUnit } = useBusinessUnit();
  const buKey = currentBusinessUnit?.key ?? null;
  return useSWR(
    buKey ? [KEY_MY_STATS, buKey] : null,
    ([, bk]) => fetch(`/api/my-stats?buKey=${bk}`).then(r => r.json()),
    { revalidateOnFocus: false }
  );
}
```

**Step 2 — Add the card to `dashboard/page.tsx`:**

```typescript
const { data: myStats } = useMyStats();
const { can } = usePermissions();

const statCards = [
  // ... existing cards
  {
    label: t('myMetric'),
    value: myStats?.total ?? 0,
    href: '/dashboard/my-section',
    enabled: can('SomePermission'),  // disabled cards show lock icon + opacity-50
  },
];
```

**Step 3 — Add translation key** to `messages/en.json` under `"dashboard"`.

---

## Pattern 4: Adding a Dashboard Page

```typescript
// app/[locale]/dashboard/my-section/page.tsx
'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { usePermissions } from '@/hooks/usePermissions';
import { useMyData } from '@/hooks/useMyData';

function MySectionContent() {
  const t = useTranslations('mySection');
  const { can } = usePermissions();
  const { data, isLoading } = useMyData();

  // Gate the entire page — shows nothing if permission is missing
  if (!can('SomePermission')) return null;
  if (isLoading) return <div>{t('loading')}</div>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
      <div className="rounded-xl border border-gray-100 bg-white p-6">
        {/* content */}
      </div>
    </div>
  );
}

// Always wrap in Suspense — required when useSearchParams is used inside
export default function MySectionPage() {
  return (
    <Suspense>
      <MySectionContent />
    </Suspense>
  );
}
```

**For pages that need server-side pre-fetch (no loading state):**

Follow the `company/page.tsx` pattern — make `page.tsx` an async Server Component that calls `getSession()` + commercetools functions, then passes `initialData` to a `*Client.tsx` sibling component.

---

## Pattern 5: Sidebar Nav Items

Add to the `NAV_ITEMS` array in `components/layout/DashboardNav.tsx`:

```typescript
const NAV_ITEMS = [
  // existing items...
  {
    label: t('mySection'),              // from 'nav' translation namespace
    href: '/dashboard/my-section',      // locale prefix added by Link automatically
    requiredPermissions: ['SomePermission', 'AnotherPermission'],
    // omit requiredPermissions to show always
  },
];
```

Items are **hidden** (not just disabled) when `hasAnyPermission(item.requiredPermissions)` returns false.

Add translation key to every `messages/*.json` under `"nav"`:
```json
{ "nav": { "mySection": "My Section" } }
```

---

## Shared UI Primitives

Located in `components/ui/`:

| Component | Key props |
|---|---|
| `Table` | `columns`, `data`, `loading`, `emptyMessage`, optional `onRowClick` |
| `Pagination` | `total`, `limit`, `offset`, `onChange` |
| `Button` | `variant` (primary/secondary/ghost/danger), `href` (renders as `<Link>`), `loading`, `disabled` |
| `Badge` | `variant` (success/warning/error/info/neutral) |
| `Modal` | `isOpen`, `onClose`, `title`, `footer`, `size` |
| `Input` / `Select` | standard labeled form controls with `error` prop |

---

## Checklist

- [ ] New hook uses `[KEY, businessUnitKey]` tuple — `null` when BU not yet selected
- [ ] Stat card has `enabled: can('SomePermission')` — disabled cards render with lock icon automatically
- [ ] Dashboard page wrapped in `<Suspense>` (prevents static rendering errors)
- [ ] Permission check at top of page content — `if (!can(...)) return null`
- [ ] Nav item specifies `requiredPermissions` (or omits it to show always)
- [ ] Translation keys added to all `messages/*.json` files
