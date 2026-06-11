---
name: add-page
description: Patterns for creating new standalone or CMS-driven pages — server-rendered data loading, locale-aware linking, dynamic routes, and SEO metadata.
when_to_use:
  - "Adding a new marketing page or feature page"
  - "Deciding server-rendered vs client data loading for a page"
  - "Handling dynamic route params and SEO metadata for a page"
metadata:
  contentType: REFERENCE
  area:
    - navigation
    - ui
---

# Adding a New Page

**Impact: MEDIUM — Loading data client-side when it could be server-rendered, skipping the locale-aware link primitive, or omitting SEO metadata all degrade a new page.**

Two shapes: a standalone page (most cases) or a layout/sections CMS page (marketing). The decisions below are framework-agnostic; the concrete Next.js primitives are linked at each point.

## Decisions (framework-agnostic)

1. **Server-rendered by default.** A page that needs first-paint data is a server-rendered load that fetches via `<server>/ct/*` — never a client component fetching commercetools directly, and never the commercetools SDK called inline in the page. Add a client component only for interactivity.
2. **Resolve route params, then fetch.** Read the route's dynamic params (e.g. `[id]`, `[slug]`) and the locale, fetch the data, and return the framework's **not-found response** when a required resource is missing — don't render a fallback.
3. **SEO metadata.** Every page declares a title and description; dynamic pages derive them from the fetched resource, fetched with the **same context** as the page so the SEO data can't diverge.
4. **Locale-aware links only.** Use the framework's locale-aware link/navigation primitive — never a bare anchor or a non-locale link, which produces broken `/en-US/en-US/...` URLs.
5. **Keep interactivity at the leaves.** Keep the page server-rendered and extract interactive UI (event handlers, local state) into client components, passing plain data down — never make the whole page a client component just to handle a `select`/`button`.

## Stack mapping

Each decision above maps onto concrete framework primitives — the server-rendered page shell, route-param resolution, the not-found response, the page-metadata API, the locale-aware link/navigation primitive, and the client-component boundary for interactivity.

> Find the adapter's `concept-mapping.md` and `best-practices/` for concrete not-found/redirect, metadata API, locale-aware link, client boundary implementation.

## Checklist

- [ ] Page is server-rendered by default; data fetched via `<server>/ct/*`, not the SDK inline
- [ ] Route params resolved before fetching; not-found response returned for missing required resources
- [ ] SEO title + description present (static or derived from the fetched resource)
- [ ] Links use the framework's locale-aware primitive — never a bare/non-locale link
- [ ] Interactive UI extracted into client components; the page itself stays server-rendered
- [ ] Translations added for every active locale (e.g. `messages/<locale>.json`)
