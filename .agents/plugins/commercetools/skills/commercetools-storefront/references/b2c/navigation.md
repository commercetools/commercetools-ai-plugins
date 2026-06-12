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

**Impact: HIGH — The header renders on every page. Wrong data-fetching (client-side category fetch) adds a waterfall to every route.**

This reference covers the Header server-rendered component, logo, mega menu driven by the category tree, search bar, and country/locale switcher.

## Table of Contents
- [Pattern 1: Header Structure](#pattern-1-header-structure)
- [Pattern 2: Logo](#pattern-2-logo)
- [Pattern 3: Mega Menu](#pattern-3-mega-menu)
- [Pattern 4: Search Bar](#pattern-4-search-bar)
- [Pattern 5: Country & Locale Switcher](#pattern-5-country--locale-switcher)
- [Checklist](#checklist)

---

## Pattern 1: Header Structure

**INCORRECT:** Fetching the category tree inside the Header component from the client (an effect or a client-side data fetch) — adds a loading waterfall on every page.

**CORRECT — fetch the category tree once in the root/locale layout (server-rendered) and pass it down as a prop:**

In a server-rendered layout that wraps every route, resolve the active locale from the session and call `getCategoryTree(locale)` from `<server>/ct/categories` once. Render `Header` with the resulting `categoryTree` as a prop, then render the page children.

> Find the adapter's `data-loading.md` for concrete server-rendered layout (data fetched once and passed as props) implementation.

`Header` itself is server-rendered. Interactive children (mega menu open/close, search input, locale switcher) are client components in their own files receiving the server-fetched data as props.

---

## Pattern 2: Logo

- Render as a `<Link href="/">` using the framework's locale-aware link so locale prefix is preserved
- Use the framework's image primitive with explicit `width`/`height` (or `fill` in a sized container) — never a bare `<img>`
- Mark the logo image `priority` — it is above the fold on every page

---

## Pattern 3: Mega Menu

The mega menu receives the `categoryTree` array (already fetched server-side) and manages open/close state client-side.

### Data shape
`categoryTree` is an array of root categories, each with a `children` array of subcategories (produced by `getCategoryTree` in `<server>/ct/categories`).

### Desktop mega menu
- A client component that accepts `categoryTree` as a prop
- Hovering or clicking a root category reveals a panel of its `children` as links
- Active root category highlighted using the framework's client navigation/query-param API — compare current path to `/category/<slug>`
- All category links use the framework's locale-aware link
- Close the panel on outside click (a `document` click listener registered while the panel is open) and on `Escape` key

### Mobile drawer
- A client component toggled by a hamburger button
- Renders the same category tree as an accordion or flat list
- Drawer slides in from the left; backdrop click closes it
- Same locale-aware link usage as desktop

---

## Pattern 4: Search Bar

- A client component input
- On submit (Enter key or search button click), navigate to `/search?q=<encoded-query>` using the framework's client navigation/query-param API
- The `/search` page is a server-rendered page that reads the `q` query param and calls `searchProducts`
- Keep input state local component state — no global store needed

A client component with a controlled input. On submit it pushes a navigation to `/search?q=<encoded query>` via the framework's locale-aware client navigation.

---

## Pattern 5: Country & Locale Switcher

These are two distinct concerns wired differently:

### Locale switcher (URL-based)
- Use the framework's client navigation/current-path access to switch locale without losing the current path
- The framework's i18n/locale routing handles the URL rewrite — no session update needed

A client component that, on select, re-navigates to the current path under the chosen locale (the framework's locale-aware navigation rewrites the URL prefix).

> Find the adapter's `concept-mapping.md` for concrete locale-switcher client component.

### Country / currency switcher (session-based)
- Changing country must update `country` and `currency` in the server-managed session, then refresh
- `POST` to a server endpoint with `{ country, currency, locale }` — the endpoint writes the session and returns the updated values
- After the response, trigger a refresh of the server-rendered tree so components re-render with the new session values
- Country → currency mapping lives in a static config (e.g. `lib/locale-config.ts`) so the UI can derive the correct currency without an API call

A client component that, on select, `POST`s the new `{ country, currency }` to the locale server endpoint and then refreshes the server-rendered tree.

---

## Checklist

- [ ] `getCategoryTree` called once in the server-rendered root/locale layout — not inside Header
- [ ] `Header` is server-rendered; mega menu open/close and search are client sub-components
- [ ] Logo uses the framework's locale-aware link — not a bare `<a>`
- [ ] Logo image uses the framework's image primitive with `priority`
- [ ] All category links use the framework's locale-aware link
- [ ] Active category detected with the framework's current-path/query-param access — no manual URL parsing
- [ ] Mega menu closes on outside click and `Escape` key
- [ ] Search navigates to `/search?q=` — does not call a server endpoint for data
- [ ] Locale switch re-navigates to the current path under the chosen locale via the framework's locale routing
- [ ] Country switch POSTs to the locale server endpoint then refreshes the server-rendered tree

**Next:** [product-listing.md](./product-listing.md)
