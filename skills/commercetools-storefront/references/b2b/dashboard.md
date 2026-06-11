---
name: dashboard
description: Dashboard shell, BU-keyed client state hooks, stat widgets, adding dashboard pages, sidebar nav with permission gates, and shared UI primitives.
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

**Impact: MEDIUM — All dashboard hooks must include `businessUnitKey` in the client state-manager/cache key or the cache won't invalidate when the user switches business units.**

This reference covers the dashboard layout, stat card widgets, adding new pages, sidebar nav items, and the shared UI primitives.

## Table of Contents
- [Pattern 1: Dashboard Shell](#pattern-1-dashboard-shell)
- [Pattern 2: BU-Keyed Client State Hook](#pattern-2-bu-keyed-client-state-hook)
- [Pattern 3: Adding a Stat Widget](#pattern-3-adding-a-stat-widget)
- [Pattern 4: Adding a Dashboard Page](#pattern-4-adding-a-dashboard-page)
- [Pattern 5: Sidebar Nav Items](#pattern-5-sidebar-nav-items)
- [Shared UI Primitives](#shared-ui-primitives)
- [Checklist](#checklist)

---

## Pattern 1: Dashboard Shell

The dashboard layout is a client component that:
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

## Pattern 2: BU-Keyed Client State Hook

**INCORRECT:** Using a static key for BU-scoped data:

```
WRONG — a static client state-manager/cache key (e.g. just `KEY_ORDERS`) leaves stale data in place
when the user switches business units.
```

**CORRECT — include `businessUnitKey` in the client state-manager/cache key tuple:**

A BU-scoped client-state hook (e.g. `useOrders`) reads `currentBusinessUnit.key` from the BU context and uses it in the cache key:

- **Cache key:** `[KEY_ORDERS, businessUnitKey]` tuple, or an empty/null key to skip the fetch until a BU is selected.
- **Endpoint:** the fetcher calls the BU-scoped endpoint with the resolved `businessUnitKey`.
- **Refetch:** the client state-manager/cache automatically re-fetches when the key changes (BU switch).


> Find the stack's `concept-mapping.md` for concrete client-state and cache implementation.

> An empty/null key skips the fetch — use it when `businessUnitKey` is not yet known.

---

## Pattern 3: Adding a Stat Widget

The dashboard overview page renders a `statCards` array.

**Step 1 — Create the BU-keyed client-state hook:** a hook (e.g. `useMyStats`) reads `currentBusinessUnit.key` and uses cache key `[KEY_MY_STATS, businessUnitKey]` (empty/null when no BU), with a fetcher that calls `GET /<api>/my-stats?buKey=<buKey>`.


**Step 2 — Add the card to the overview page.** Read `myStats` from the hook and `can` from `usePermissions()`, then append to the `statCards` config:

```typescript
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

**Step 3 — Add translation key** to the default locale messages under `"dashboard"`.

---

## Pattern 4: Adding a Dashboard Page

A client-rendered dashboard page is a client component that:

- Reads its translations via the framework's i18n API and `can` from `usePermissions()`, and loads its data via a BU-keyed client-state hook (e.g. `useMyData`).
- **Gates the entire page on permission** — renders nothing (`return null`) when `can('SomePermission')` is false; shows a loading state while the data is loading.
- Wraps the content so query-param access (the framework's query-param API) is available — in Next.js this means a `<Suspense>` boundary to avoid static-rendering errors.


**For pages that need server-side pre-fetch (no loading state):**

Follow the company-page pattern — make the page a server-rendered load that calls `getSession()` + commercetools functions, then passes `initialData` to a client child component.

---

## Pattern 5: Sidebar Nav Items

Add to the `NAV_ITEMS` array in the dashboard nav component:

```typescript
const NAV_ITEMS = [
  // existing items...
  {
    label: t('mySection'),              // from 'nav' translation namespace
    href: '/dashboard/my-section',      // locale prefix added by the framework's link automatically
    requiredPermissions: ['SomePermission', 'AnotherPermission'],
    // omit requiredPermissions to show always
  },
];
```

Items are **hidden** (not just disabled) when `hasAnyPermission(item.requiredPermissions)` returns false.

Add the translation key to every locale messages file under `"nav"`:
```json
{ "nav": { "mySection": "My Section" } }
```

---

## Shared UI Primitives

Located in the UI component directory:

| Component | Key props |
|---|---|
| `Table` | `columns`, `data`, `loading`, `emptyMessage`, optional `onRowClick` |
| `Pagination` | `total`, `limit`, `offset`, `onChange` |
| `Button` | `variant` (primary/secondary/ghost/danger), `href` (renders as a framework link), `loading`, `disabled` |
| `Badge` | `variant` (success/warning/error/info/neutral) |
| `Modal` | `isOpen`, `onClose`, `title`, `footer`, `size` |
| `Input` / `Select` | standard labeled form controls with `error` prop |

---

## Checklist

- [ ] New hook uses `[KEY, businessUnitKey]` tuple — empty/null key when BU not yet selected
- [ ] Stat card has `enabled: can('SomePermission')` — disabled cards render with lock icon automatically
- [ ] Dashboard page wraps content for query-param access (Next.js: `<Suspense>`, prevents static rendering errors)
- [ ] Permission check at top of page content — `if (!can(...)) return null`
- [ ] Nav item specifies `requiredPermissions` (or omits it to show always)
- [ ] Translation keys added to all locale messages files
