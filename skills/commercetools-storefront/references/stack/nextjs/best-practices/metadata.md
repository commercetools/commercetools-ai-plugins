# Metadata

## Rule: Metadata Lives in Server Components Only

`metadata` and `generateMetadata` cannot be used in Client Components. If a page has `'use client'`, either remove it (move client logic to child components and files) or extract metadata to a parent layout.

---

## Static Metadata

```tsx
// app/[locale]/my-page/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Page',       // root layout template appends '| Home'
  description: 'Page description for SEO',
}
```

The root layout sets the title template, so page-level `title` values are automatically formatted as `My Page | Home`.

---

## Dynamic Metadata

Use `generateMetadata` when the title or description depends on fetched data (PDP, category pages, blog posts):

```tsx
// app/[locale]/products/[slug]/page.tsx
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ slug: string; locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale } = await params
  const product = await getProduct(slug, locale).catch(() => null)

  if (!product) return { title: 'Not Found' }

  return {
    title: product.name,
    description: product.description,
  }
}
```

`params` is a `Promise` in Next.js 15+ — always `await` it.

---

## Avoid Duplicate Fetches

`generateMetadata` and the page component often need the same data. Wrap the fetch in React `cache()` so it runs only once per request:

```tsx
// lib/ct/products.ts
import { cache } from 'react'

export const getProduct = cache(async (slug: string, locale: string) => {
  return await apiRoot.products().withSlug(slug).get({ /* ... */ }).execute()
})
```

```tsx
// app/[locale]/products/[slug]/page.tsx
import { getProduct } from '@/lib/ct/products'
import { notFound } from 'next/navigation'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale } = await params
  const product = await getProduct(slug, locale)
  if (!product) return { title: 'Not Found' }
  return { title: product.name, description: product.description }
}

export default async function ProductPage({ params }: Props) {
  const { slug, locale } = await params
  const product = await getProduct(slug, locale)  // same call — deduplicated by cache()
  if (!product) notFound()
  return <ProductDetail product={product} />
}
```

---

## OG Images

Place `opengraph-image.png` (static) or `opengraph-image.tsx` (dynamic) in the route segment:

```tsx
// app/[locale]/products/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const alt = 'Product'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

type Props = { params: Promise<{ slug: string; locale: string }> }

export default async function Image({ params }: Props) {
  const { slug, locale } = await params
  const product = await getProduct(slug, locale)

  return new ImageResponse(
    (
      <div
        style={{
          background: '#fff',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 64,
          fontWeight: 'bold',
        }}
      >
        {product?.name ?? 'Product'}
      </div>
    ),
    { ...size }
  )
}
```

**Rules for OG images:**
- Use `next/og`, not `@vercel/og`
- No `searchParams` access — use route `params` only
- Do not set `export const runtime = 'edge'` — default Node.js runtime works fine
- `ImageResponse` uses Flexbox; CSS Grid is not supported; all styles must be inline objects

A single `opengraph-image.png` at the root covers both Open Graph and Twitter (Twitter falls back to OG).

---

## Metadata File Conventions

Files placed in `app/` (or any route segment) are picked up automatically — no code needed:

| File | Purpose |
|------|---------|
| `favicon.ico` | Browser tab icon |
| `opengraph-image.png` / `.tsx` | OG + Twitter card image |
| `sitemap.ts` | Sitemap (use `generateSitemaps` for large catalogs) |
| `robots.ts` | Crawl directives |

