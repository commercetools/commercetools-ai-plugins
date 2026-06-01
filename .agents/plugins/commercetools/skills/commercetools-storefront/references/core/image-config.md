---
name: image-config
description: Image URL transforms via image-config.ts, CDN integration with Imgix or Cloudinary, and next/image usage with LCP optimisation.
when_to_use:
  - "Configuring image sizing and CDN transforms"
  - "Optimising images for LCP"
  - "Integrating with Imgix or Cloudinary"
  - "Adding new image contexts to the app"
metadata:
  contentType: REFERENCE
  area:
    - performance
    - deployment
---

# Image Config

**Impact: LOW — All product image URL transforms are in `site/lib/ct/image-config.ts`. Edit the config — never components.**

Three named functions cover the three image contexts. Components import them directly; swap the implementation to change all images site-wide.

## Table of Contents
- [Pattern 1: Three Transform Functions](#pattern-1-three-transform-functions)
- [Pattern 2: Keep `unoptimized: true`](#pattern-2-keep-unoptimized-true)
- [Pattern 3: next/image Usage and LCP Priority](#pattern-3-nextimage-usage-and-lcp-priority)
- [Pattern 4: Suffix Pattern](#pattern-4-suffix-pattern)
- [Pattern 5: CDN Hostname Replacement](#pattern-5-cdn-hostname-replacement)
- [Pattern 6: Imgix and Cloudinary](#pattern-6-imgix-and-cloudinary)
- [Pattern 7: Adding a New Context](#pattern-7-adding-a-new-context)

---

## Pattern 1: Three Transform Functions

```typescript
// site/lib/ct/image-config.ts

/**
 * ProductCard on listing/search pages.
 */
export function transformListingImageUrl(url: string): string {
  return url; // identity by default — override below
}

/**
 * Main carousel image on the PDP.
 */
export function transformDetailImageUrl(url: string): string {
  return url;
}

/**
 * Thumbnail strip on the PDP.
 */
export function transformThumbnailImageUrl(url: string): string {
  return url;
}
```

Each function receives the raw commercetools image URL (e.g. `https://storage.googleapis.com/merchant-center-europe/...`) and returns the transformed URL. Keep the signature — components call these by name.

---

## Pattern 2: Keep `unoptimized: true`

`next.config.ts` sets `images.unoptimized = true`. **Do not remove this.**

commercetools images come from a CDN that returns `403` or `400` when Next.js appends `?url=...&w=...&q=...` optimisation query params. The transform functions in `image-config.ts` handle sizing directly, making Next.js optimisation redundant.

```typescript
// site/next.config.ts  (do not change)
const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
};
```

---

## Pattern 3: next/image Usage and LCP Priority

Always use `next/image`, never a raw `<img>` tag. Even with `unoptimized: true`, `next/image` lazy-loads below-fold images and prevents layout shift.

```tsx
import Image from 'next/image';
import { transformListingImageUrl, transformDetailImageUrl } from '@/lib/ct/image-config';

// Product card — lazy-loaded, no priority
<Image
  src={transformListingImageUrl(imageUrl)}
  alt={product.name}
  width={400}
  height={400}
  className="w-full h-full object-cover"
/>

// PDP main image — LCP element, preloads immediately
// Parent must have position: relative and explicit height (e.g. aspect-square)
<Image
  src={transformDetailImageUrl(imageUrl)}
  alt={productName}
  fill
  sizes="(max-width: 768px) 100vw, 50vw"
  className="object-cover"
  priority
/>
```

**`priority` rule: one image per page, on the LCP element only.** Using `priority` on multiple images defeats the preload — the browser can't prioritise everything. Apply it to:
- The main PDP carousel image
- Hero banners on marketing pages

Product card images on listing pages must **not** have `priority` — they are below the fold and should lazy-load.

---

## Pattern 4: Suffix Pattern

Insert a size suffix **before** the file extension, preserving any query string:

```typescript
// site/lib/ct/image-config.ts

// Inserts '-medium' before the last extension, e.g.:
// .../product.jpg  →  .../product-medium.jpg
// .../product.jpg?v=2  →  .../product-medium.jpg?v=2
function addSuffix(url: string, suffix: string): string {
  return url.replace(/(\.[^./?#]+)($|\?)/, `${suffix}$1$2`);
}

export function transformListingImageUrl(url: string): string {
  return addSuffix(url, '-medium');  // e.g. product-medium.jpg
}

export function transformDetailImageUrl(url: string): string {
  return addSuffix(url, '-large');
}

export function transformThumbnailImageUrl(url: string): string {
  return addSuffix(url, '-small');
}
```

---

## Pattern 5: CDN Hostname Replacement

Swap the GCS origin for a custom CDN hostname:

```typescript
// site/lib/ct/image-config.ts

const CDN = 'https://cdn.example.com';
const ORIGIN = 'https://storage.googleapis.com';

export function transformListingImageUrl(url: string): string {
  return url.replace(ORIGIN, CDN);
}

export function transformDetailImageUrl(url: string): string {
  return url.replace(ORIGIN, CDN);
}

export function transformThumbnailImageUrl(url: string): string {
  return url.replace(ORIGIN, CDN);
}
```

Combine with the suffix pattern if the CDN also uses filename-based sizing.

---

## Pattern 6: Imgix and Cloudinary

**Imgix** — append query params to the imgix domain:

```typescript
// site/lib/ct/image-config.ts
const IMGIX_BASE = 'https://mystore.imgix.net';
const ORIGIN     = 'https://storage.googleapis.com/my-bucket';

export function transformListingImageUrl(url: string): string {
  const path = url.replace(ORIGIN, '');
  return `${IMGIX_BASE}${path}?w=400&h=500&fit=crop&auto=format`;
}

export function transformDetailImageUrl(url: string): string {
  const path = url.replace(ORIGIN, '');
  return `${IMGIX_BASE}${path}?w=800&h=1000&fit=crop&auto=format`;
}

export function transformThumbnailImageUrl(url: string): string {
  const path = url.replace(ORIGIN, '');
  return `${IMGIX_BASE}${path}?w=100&h=125&fit=crop&auto=format`;
}
```

**Cloudinary** — use the fetch delivery URL:

```typescript
// site/lib/ct/image-config.ts
const CLD = 'https://res.cloudinary.com/my-cloud/image/fetch';

export function transformListingImageUrl(url: string): string {
  return `${CLD}/w_400,h_500,c_fill,f_auto,q_auto/${encodeURIComponent(url)}`;
}

export function transformDetailImageUrl(url: string): string {
  return `${CLD}/w_800,h_1000,c_fill,f_auto,q_auto/${encodeURIComponent(url)}`;
}

export function transformThumbnailImageUrl(url: string): string {
  return `${CLD}/w_100,h_125,c_fill,f_auto,q_auto/${encodeURIComponent(url)}`;
}
```

---

## Pattern 7: Adding a New Context

Export a new function from `image-config.ts` and import it in the component:

```typescript
// site/lib/ct/image-config.ts
// New context: cart line item thumbnail
export function transformCartImageUrl(url: string): string {
  return addSuffix(url, '-thumb');
}
```

```typescript
// site/components/cart/CartItem.tsx
import { transformCartImageUrl } from '@/lib/ct/image-config';

<Image
  src={transformCartImageUrl(item.imageUrl)}
  alt={item.name}
  width={80}
  height={80}
/>
```

Do not inline the transform in the component — keeping it in `image-config.ts` means a single config change updates all instances.
