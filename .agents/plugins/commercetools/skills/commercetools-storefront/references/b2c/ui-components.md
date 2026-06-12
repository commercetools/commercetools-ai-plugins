---
name: ui-components
description: Shared UI component library including Button, Input, Drawer, Badge, Modal, and Select with patterns for composition and link usage.
when_to_use:
  - "Building UI components following the project style"
  - "Implementing forms or interactive elements"
  - "Using react-hook-form with form inputs"
  - "Composing components consistently across pages"
metadata:
  contentType: REFERENCE
  area:
    - b2c
    - ui
---

# UI Components

**Impact: LOW — Writing raw HTML with inline Tailwind instead of using `components/ui/` creates inconsistent styling and duplicated behaviour.**

The shared library lives at `<server>/../components/ui/`. Check it before writing any interactive element from scratch.

> **Stack-specific reference.** The snippets below are a React + Tailwind reference implementation (the b2c-starter-kit's `components/ui/`). The framework-neutral concept is: keep one shared, consistently-styled set of primitives (Button, Input, Card, Modal, Drawer, Select) and compose them everywhere instead of re-styling raw markup. On another stack, build the equivalent in that stack's component model.

## Table of Contents
- [Pattern 1: Check Before Writing](#pattern-1-check-before-writing)
- [Pattern 2: Button Component](#pattern-2-button-component)
- [Pattern 3: Input Component](#pattern-3-input-component)
- [Pattern 4: Drawer Component](#pattern-4-drawer-component)
- [Pattern 5: Adding a New Component](#pattern-5-adding-a-new-component)
- [Pattern 6: Link Component](#pattern-6-link-component)

---

## Pattern 1: Check Before Writing

**INCORRECT:** raw button with inline Tailwind.

```typescript
// BAD
<button className="px-5 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800">
  Add to Cart
</button>
```

**CORRECT — import from `@/components/ui/`:**

```typescript
// GOOD
import Button from '@/components/ui/Button';

<Button variant="primary" onClick={handleAddToCart}>
  Add to Cart
</Button>
```

Components available in `components/ui/`: `Button`, `Input`, `Drawer`, `Badge`, `Spinner`, `Modal`, `Select`.

---

## Pattern 2: Button Component

Props: `variant` (`'primary'` | `'secondary'` | `'outline'` | `'ghost'`), `size` (`'sm'` | `'md'` | `'lg'`), `isLoading`, `disabled`.

```typescript
import Button from '@/components/ui/Button';

// Primary CTA
<Button variant="primary" size="lg">
  Checkout
</Button>

// Secondary action
<Button variant="secondary" size="md">
  Save for Later
</Button>

// Outline / bordered
<Button variant="outline" size="sm">
  View Details
</Button>

// Ghost / text-only
<Button variant="ghost" size="sm">
  Remove
</Button>

// Loading state — shows spinner, disables click
<Button variant="primary" isLoading={submitting}>
  Place Order
</Button>

// Disabled
<Button variant="primary" disabled>
  Out of Stock
</Button>

// As a link (passes through HTML anchor attributes)
<Button variant="primary" as="a" href="/cart">
  View Cart
</Button>
```

---

## Pattern 3: Input Components

Props: `label`, `error`. It is a `forwardRef` component — compatible with `react-hook-form` and similar.

```typescript
import Input from '@/components/ui/Input';
import { useRef } from 'react';

// Basic usage
<Input
  label="Email address"
  type="email"
  placeholder="you@example.com"
  onChange={(e) => setEmail(e.target.value)}
/>

// With validation error
<Input
  label="Password"
  type="password"
  error="Password must be at least 8 characters"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
/>

// With forwardRef (react-hook-form)
const { register, formState: { errors } } = useForm();

<Input
  label="First name"
  error={errors.firstName?.message}
  {...register('firstName', { required: 'Required' })}
/>
```

---

## Pattern 4: Drawer Component

Props: `isOpen`, `onClose`, `title`, `children`, `footer`, `position` (`'left'` | `'right'`).

```typescript
import Drawer from '@/components/ui/Drawer';
import Button from '@/components/ui/Button';

// A client component holds the drawer's open/close state and passes it in via props:
function CartDrawer({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open Cart
      </Button>

      <Drawer
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Your Cart"
        position="right"
        footer={
          <Button variant="primary" className="w-full">
            Proceed to Checkout
          </Button>
        }
      >
        {/* cart line items */}
        <p className="text-sm text-gray-500">Your cart is empty.</p>
      </Drawer>
    </>
  );
}
```

> The `footer` slot is rendered at the bottom of the drawer, above the scroll area. Use it for sticky CTAs.

---

## Pattern 5: Adding a New Component to components/ui/

**INCORRECT:** domain-specific component with commercetools imports placed in `components/ui/`.

```typescript
// BAD — ui/ component importing from <server>/ct/
import { getProduct } from '<server>/ct/products';

export default function ProductBadge({ sku }: { sku: string }) {
  // fetches product data — domain knowledge, not generic UI
}
```

**CORRECT — no domain knowledge, extends HTML attributes:**

```typescript
// <root-dir>/components/ui/Badge.tsx
import { HTMLAttributes } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error:   'bg-red-100 text-red-800',
  info:    'bg-blue-100 text-blue-800',
};

export default function Badge({
  variant = 'info',
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
```

Rules for `components/ui/`:
- No imports from `<server>/ct/`, `<server>/mappers/`, or domain hooks
- Props interface must extend the relevant `HTML*Attributes` type
- Accept and spread `...props` so callers can add `aria-*`, `data-*`, `className` etc.
- Export a single default component per file

---

## Pattern 6: Link Component

**INCORRECT:** raw `<a>` tag for internal navigation — causes a full page reload and bypasses the framework's locale-aware link.

```typescript
// BAD
<a href="/products">Browse products</a>
```

**CORRECT — use the framework's locale-aware link:**

```typescript
// GOOD
import Link from '@/i18n/routing';

<Link href="/products">Browse products</Link>
```

When to use each:

| Case | Use |
|---|---|
| Internal route (same origin) | `<Link href="...">` |
| External URL (`https://...`) | `<a href="..." target="_blank" rel="noopener noreferrer">` |
| Button that navigates programmatically | `router.push(...)` via the framework's client navigation/query-param API |

Combining with the `Button` component — pass `as="a"` only for external links; use `<Link>` wrapping for internal ones:

```typescript
import Link from '@/i18n/routing';
import Button from '@/components/ui/Button';

// Internal CTA — Link wraps Button
<Link href="/cart">
  <Button variant="primary">View Cart</Button>
</Link>

// External CTA — Button renders as <a>
<Button variant="outline" as="a" href="https://docs.example.com" target="_blank" rel="noopener noreferrer">
  Read Docs
</Button>
```

> Never use `<a href="...">` for routes inside the app. `<Link>` prefetches the destination, preserves scroll position, and avoids full-page reloads.

---

## Checklist
- [ ] `components/ui/` checked before writing raw HTML for buttons, inputs, drawers, badges
- [ ] New generic UI components placed in `components/ui/` (not in feature folders)
- [ ] Props interface extends the appropriate `HTML*Attributes` type
- [ ] No `<server>/ct/` imports inside `components/ui/` files
- [ ] `...props` spread passed through to the underlying HTML element
- [ ] `<Link href="...">` used for all internal navigation — no bare `<a>` tags pointing to internal routes
- [ ] External links use `<a target="_blank" rel="noopener noreferrer">` (not `<Link>`)
