---
name: navigation
description: Header and navigation patterns covering category tree fetching, mega menu, search bar, locale switching, and country selector.
when_to_use:
  - "Building the header component"
  - "Implementing category-driven navigation"
  - "Building search functionality in the header"
  - "Implementing locale and country switching"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - navigation
    - localization
    - ui
---

# Header & Navigation

**Impact: HIGH — The header renders on every page. Wrong data-fetching (client-side category fetch) adds a waterfall to every route; wrong Link usage breaks locale routing.**

This reference covers the Header Server Component, logo, mega menu driven by the category tree, search bar, and country/locale switcher.

## Table of Contents
- [Pattern 1: Header Structure](#pattern-1-header-structure)
- [Pattern 2: Logo](#pattern-2-logo)
- [Pattern 3: Mega Menu](#pattern-3-mega-menu)
- [Pattern 4: Search Bar](#pattern-4-search-bar)
- [Pattern 5: Country & Locale Switcher](#pattern-5-country--locale-switcher)
- [Checklist](#checklist)

---

## Pattern 1: Header Structure

**INCORRECT:** Fetching the category tree inside the Header component with `useEffect` or a client-side SWR call — adds a loading waterfall on every page.

**CORRECT — fetch the category tree once in the locale layout (Server Component) and pass it as a prop:**

```typescript
// app/[locale]/layout.tsx
import { getCategoryTree } from '@/lib/ct/categories';
import { getLocale } from '@/lib/session';
import Header from '@/components/layout/Header';

export default async function LocaleLayout({ children }: Props) {
  const { locale } = await getLocale();
  const categoryTree = await getCategoryTree(locale);

  return (
    <html>
      <body>
        <Header categoryTree={categoryTree} />
        {children}
      </body>
    </html>
  );
}
```

`Header` itself is a Server Component. Interactive children (mega menu open/close, search input, locale switcher) are `'use client'` sub-components in their own files receiving data as props.

---

## Pattern 2: Logo

- Render as a `<Link href="/">` using `<Link>` from `@/i18n/routing` so locale prefix is preserved
- Use `next/image` with explicit `width`/`height` (or `fill` in a sized container) — never a bare `<img>`
- Mark the logo image `priority` — it is above the fold on every page

---

## Pattern 3: Mega Menu

The mega menu receives the `categoryTree` array (already fetched server-side) and manages open/close state client-side.

### Data shape
`categoryTree` is an array of root categories, each with a `children` array of subcategories (produced by `getCategoryTree` in `lib/ct/categories.ts`).

### Desktop mega menu
- A `'use client'` component that accepts `categoryTree` as a prop
- Hovering or clicking a root category reveals a panel of its `children` as links
- Active root category highlighted using `usePathname()` — compare current path to `/category/<slug>`
- All category links use `<Link href={/category/${slug}}>` from `@/i18n/routing`
- Close the panel on outside click (`useEffect` + `document` listener) and on `Escape` key

### Mobile drawer
- A `'use client'` component toggled by a hamburger button
- Renders the same category tree as an accordion or flat list
- Drawer slides in from the left; backdrop click closes it
- Same `<Link>` usage as desktop

---

## Pattern 4: Search Bar

- A `'use client'` input component
- On submit (Enter key or search button click), navigate to `/search?q=<encoded-query>` using `useRouter` from `@/i18n/routing`
- The `/search` page is a Server Component that reads `searchParams.q` and calls `searchProducts`
- Keep input state local (`useState`) — no global store needed

```typescript
// components/layout/SearchBar.tsx
'use client';
import { useRouter } from '@/i18n/routing';

export default function SearchBar() {
  const router = useRouter();
  // controlled input; on submit: router.push(`/search?q=${encodeURIComponent(query)}`)
}
```

---

## Pattern 5: Country & Locale Switcher

These are two distinct concerns wired differently:

### Locale switcher (URL-based)
- Use `usePathname` + `useRouter` from `@/i18n/routing` to switch locale without losing the current path
- `next-intl` handles the URL rewrite — no session update needed

```typescript
// 'use client'
import { usePathname, useRouter } from '@/i18n/routing';

// on select: router.replace(pathname, { locale: selectedLocale })
```

### Country / currency switcher (session-based)
- Changing country must update `country` and `currency` in the server session, then reload
- `POST /api/locale` with `{ country, currency, locale }` — the Route Handler calls `setSessionCookie` and returns the updated values
- After the response, call `router.refresh()` to re-render Server Components with the new session values
- Country → currency mapping lives in a static config (e.g. `lib/locale-config.ts`) so the UI can derive the correct currency without an API call

```typescript
// 'use client'
// on select:
//   await fetch('/api/locale', { method: 'POST', body: JSON.stringify({ country, currency }) })
//   router.refresh()
```

---

## Checklist

- [ ] `getCategoryTree` called once in `app/[locale]/layout.tsx` (Server Component) — not inside Header
- [ ] `Header` is a Server Component; mega menu open/close and search are `'use client'` sub-components
- [ ] Logo uses `<Link>` from `@/i18n/routing` — not `next/link` or `<a>`
- [ ] Logo image uses `next/image` with `priority`
- [ ] All category links use `<Link>` from `@/i18n/routing`
- [ ] Active category detected with `usePathname()` — no manual URL parsing
- [ ] Mega menu closes on outside click and `Escape` key
- [ ] Search navigates to `/search?q=` — does not call an API route
- [ ] Locale switch uses `router.replace(pathname, { locale })` from `@/i18n/routing`
- [ ] Country switch POSTs to `/api/locale` then calls `router.refresh()`

**Next:** [product-listing.md](./product-listing.md)
