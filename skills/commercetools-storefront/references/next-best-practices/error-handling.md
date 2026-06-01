# Error Handling

## Critical Gotcha: Never Wrap Navigation APIs in try-catch

`redirect()`, `notFound()`, `forbidden()`, and `unauthorized()` throw special internal errors. A catch block will swallow them and silently break navigation.

```tsx
'use server'
import { redirect, notFound } from 'next/navigation'

// Bad: catch block eats the redirect — navigation never happens
async function submitOrder(formData: FormData) {
  try {
    const order = await placeOrder(formData)
    redirect(`/order-confirmation/${order.id}`)  // throws internally
  } catch (error) {
    return { error: 'Failed' }  // redirect is silently caught here
  }
}

// Good: call redirect outside the try block
async function submitOrder(formData: FormData) {
  let order
  try {
    order = await placeOrder(formData)
  } catch (error) {
    return { error: 'Failed to place order' }
  }
  redirect(`/order-confirmation/${order.id}`)
}

// Good alternative: re-throw with unstable_rethrow
import { unstable_rethrow } from 'next/navigation'

async function submitOrder(formData: FormData) {
  try {
    const order = await placeOrder(formData)
    redirect(`/order-confirmation/${order.id}`)
  } catch (error) {
    unstable_rethrow(error)  // re-throws redirect/notFound/forbidden/unauthorized
    return { error: 'Failed to place order' }
  }
}
```

Applies to all five navigation functions:
- `redirect()` — 307 temporary redirect
- `permanentRedirect()` — 308 permanent redirect
- `notFound()` — renders `not-found.tsx`
- `forbidden()` — renders `forbidden.tsx`
- `unauthorized()` — renders `unauthorized.tsx`

---

## error.tsx — Route Segment Error Boundary

Catches errors thrown in a route segment and all its children. Must be a Client Component.

```tsx
// app/[locale]/shop/error.tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

`reset()` re-renders the segment without a full page reload.

---

## global-error.tsx — Root Layout Error Boundary

Catches errors thrown in the root layout. Must include `<html>` and `<body>` tags because the layout is unavailable.

```tsx
// app/global-error.tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  )
}
```

---

## not-found.tsx — 404 Pages

### Triggering Not Found

Call `notFound()` when a resource doesn't exist:

```tsx
// app/[locale]/products/[slug]/page.tsx
import { notFound } from 'next/navigation'

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>
}) {
  const { slug, locale } = await params
  const product = await getProduct(slug, locale)

  if (!product) {
    notFound()  // renders nearest not-found.tsx
  }

  return <ProductDetail product={product} />
}
```

### Scoped not-found.tsx

```tsx
// app/[locale]/products/not-found.tsx
export default function ProductNotFound() {
  return (
    <div>
      <h2>Product not found</h2>
      <p>The product you're looking for doesn't exist or has been removed.</p>
    </div>
  )
}
```

Place `not-found.tsx` next to the route segment it covers. Errors bubble up to the nearest ancestor that has one.

---

## Auth Error Pages

Trigger and render auth-specific error pages:

```tsx
// Server Component or Server Action
import { forbidden, unauthorized } from 'next/navigation'

async function Page() {
  const session = await getSession()

  if (!session) {
    unauthorized()  // renders unauthorized.tsx (401)
  }

  if (!session.hasAdminAccess) {
    forbidden()     // renders forbidden.tsx (403)
  }

  return <AdminDashboard />
}
```

```tsx
// app/[locale]/forbidden.tsx
export default function Forbidden() {
  return <div>You don't have access to this resource.</div>
}

// app/[locale]/unauthorized.tsx
export default function Unauthorized() {
  return <div>Please log in to continue.</div>
}
```

---

## Error Hierarchy

Errors bubble up to the nearest boundary:

```
app/
├── global-error.tsx         # Catches errors in root layout.tsx
├── [locale]/
│   ├── error.tsx            # Catches errors across all locale routes
│   ├── not-found.tsx        # 404 for all locale routes
│   ├── forbidden.tsx        # 403 for all locale routes
│   ├── unauthorized.tsx     # 401 for all locale routes
│   └── products/
│       ├── error.tsx        # Catches errors in /products/* only
│       ├── not-found.tsx    # 404 for /products/* only
│       └── [slug]/
│           └── page.tsx
```

A segment-level `error.tsx` does **not** catch errors thrown in the same segment's `layout.tsx` — those bubble up to the parent's error boundary.

---

## Redirects

```tsx
import { redirect, permanentRedirect } from 'next/navigation'

// 307 Temporary — use for most cases (login required, form success)
redirect('/login')

// 308 Permanent — use for URL migrations (browsers and search engines cache this)
permanentRedirect('/new-product-url')
```

Redirects work in Server Components, Server Actions, and Route Handlers. They do **not** work in Client Components — use `router.push()` there.
