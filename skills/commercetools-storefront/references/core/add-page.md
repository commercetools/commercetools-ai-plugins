---
name: add-page
description: Patterns for creating new standalone or CMS-driven pages with locale-aware linking, dynamic routes, server components, and metadata generation.
when_to_use:
  - "Adding a new marketing page or feature page"
  - "Implementing next-intl routing in a new page"
  - "Handling dynamic routes with await params"
  - "Setting up SEO metadata for a page"
metadata:
  contentType: REFERENCE
  area:
    - navigation
    - ui
---

# Adding a New Page

**Impact: MEDIUM — Using `next/link` instead of the locale-aware `Link`, or omitting `generateMetadata`, creates broken navigation and missing SEO metadata.**

Two patterns: standalone page (most cases) or a layout/sections CMS page (marketing pages).

## Table of Contents
- [Pattern 1: Standalone Page (Server Component)](#pattern-1-standalone-page-server-component)
- [Pattern 2: Locale-Aware Linking](#pattern-2-locale-aware-linking)
- [Pattern 3: Dynamic Routes](#pattern-3-dynamic-routes)
- [Pattern 4: Client Components Within a Server Page](#pattern-4-client-components-within-a-server-page)
- [Checklist](#checklist)

---

## Pattern 1: Standalone Page (Server Component)

**INCORRECT:** Making the page a Client Component or fetching commercetools directly in the page:

```typescript
// WRONG — no metadata, client component for no reason, direct commercetools import
'use client';
import { apiRoot } from '@/lib/ct/client';
export default function MyPage() { ... }
```

**CORRECT — async Server Component with `generateMetadata` and commercetools calls via `lib/ct/`:**

```typescript
// app/[locale]/my-new-page/page.tsx
import type { Metadata } from 'next';
import { getLocale } from '@/lib/session';

export const metadata: Metadata = {
  title: 'My Page',        // root layout template appends '| Home'
  description: 'Page description for SEO',
};

export default async function MyPage() {
  const { locale, currency, country } = await getLocale();
  const data = await fetchMyData(locale);
  return <MyPageContent data={data} />;
}
```

> **Never call commercetools SDK directly in a page.** Use functions from `lib/ct/` which encapsulate the `apiRoot` calls.

> For dynamic `generateMetadata`, avoiding duplicate fetches with `cache()`, and OG image generation, see the `next-best-practices` skill's [metadata.md](../next-best-practices/metadata.md).

---

## Pattern 2: Locale-Aware Linking

**INCORRECT:** Using `next/link` or `next/navigation` in locale-aware pages:

```typescript
// WRONG — ignores locale prefix, creates broken /en-US/en-US/... URLs
import Link from 'next/link';
import { useRouter } from 'next/navigation';
```

**CORRECT — always import from `@/i18n/routing`:**

```typescript
// ✅ correct — locale prefix handled automatically
import { Link, useRouter, usePathname } from '@/i18n/routing';

// href values are locale-path-agnostic — the routing layer prefixes them
<Link href="/my-new-page">Go to page</Link>
```

The `Link`, `useRouter`, `usePathname`, and `redirect` exports from `@/i18n/routing` are created by `createNavigation(routing)` in `i18n/routing.ts` and handle locale prefixing automatically.

---

## Pattern 3: Dynamic Routes

**INCORRECT:** Not awaiting `params` (required since Next.js 15, including 16):

```typescript
// WRONG — params is a Promise in Next.js 15+ (including 16)
export default function Page({ params }: { params: { id: string } }) {
  const { id } = params; // TypeError
```

**CORRECT — `params` is always a `Promise`, always `await` it:**

```typescript
// app/[locale]/my-thing/[id]/page.tsx
interface PageProps {
  params: Promise<{ id: string; locale: string }>;
}

export default async function MyThingPage({ params }: PageProps) {
  const { id } = await params;
  const data = await fetchThing(id);
  if (!data) notFound();
  return <MyThingView data={data} />;
}
```

## Pattern 4: Client Components Within a Server Page

**INCORRECT:** Making the whole page a Client Component to handle interactivity:

```typescript
// WRONG — loses server rendering, all data fetches become client-side
'use client';
export default function MyPage() {
  const [data, setData] = useState(null);
  useEffect(() => { fetch('/api/data').then(...) }, []);
  // ...
}
```

**CORRECT — keep the page as a Server Component, extract interactive parts into a new file:**

```typescript
// page.tsx — Server Component
import MyInteractiveWidget from '@/components/my-page/MyInteractiveWidget';

export default async function MyPage() {
  const data = await fetchData();           // server-side, no loading state
  return <MyInteractiveWidget initialData={data} />;
}

// components/my-page/MyInteractiveWidget.tsx — Client Component
'use client';
export default function MyInteractiveWidget({ initialData }: { initialData: Data }) {
  const [state, setState] = useState(initialData);
  // ... interactive logic
}
```

---

## Pattern 5: JS event handlers in Server Components

**INCORRECT:** any event handlers like onChange, onBlur, etc in a Server Component

```typescript
// WRONG — error when loading page
export default function MyPage() {
  //...
  return (
    <>
    ...
    <select onChange=((e) => {
      // handle event
    })>
    </>
  )
}
```

**CORRECT — keep the page as a Server Component, extract interactive parts into a new file:**

```typescript
// page.tsx — Server Component
import MyInteractiveSelect from '@/components/my-page/MyInteractiveSelect';

export default async function MyPage() {
  const data = await fetchData();           // server-side, no loading state
  return <MyInteractiveSelect selectedValue={} onChange={actionCall} />;
}

// components/my-page/MyInteractiveSelect.tsx — Client Component
'use client';
export default function MyInteractiveSelect({ , onChange } {
 return (

    <select onChange=((e) => {
      // handle event
      // then call onChange()
    })>
  )
}
```

---


## Checklist

- [ ] Page file at `app/[locale]/my-page/page.tsx`
- [ ] `export const metadata` or `export async function generateMetadata` present
- [ ] `import { Link, useRouter } from '@/i18n/routing'` — never from `next/link` / `next/navigation`
- [ ] Dynamic routes `await params` (required since Next.js 15)
- [ ] `notFound()` called for missing required resources
- [ ] Page is an async Server Component by default — `'use client'` only on child components that need it
- [ ] Translations added to `messages/en-US.json`, `messages/en-GB.json`, `messages/de-DE.json`
