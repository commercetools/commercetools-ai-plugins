---
name: image-config
description: Image URL transforms via image-config.ts and CDN integration with Imgix or Cloudinary.
when_to_use:
  - "Configuring image sizing and CDN transforms"
  - "Integrating with Imgix or Cloudinary"
  - "Adding new image contexts to the app"
metadata:
  contentType: REFERENCE
  area:
    - performance
    - deployment
---

# Image Config

**Impact: LOW — All product image URL transforms are in `<root-dir>/<server>/ct/image-config`. Edit the config — never components.**

Three named functions cover the three image contexts. Components import them directly; swap the implementation to change all images site-wide. The transform functions here are framework-agnostic (plain string manipulation). The **rendering** side — the framework's image primitive, optimizer settings, responsive sizing, LCP priority — is framework-specific; See the adapter's `best-practices/image.md` file.

## Table of Contents
- [Pattern 1: Three Transform Functions](#pattern-1-three-transform-functions)
- [Pattern 2: Suffix Pattern](#pattern-2-suffix-pattern)
- [Pattern 3: CDN Hostname Replacement](#pattern-3-cdn-hostname-replacement)
- [Pattern 4: Imgix and Cloudinary](#pattern-4-imgix-and-cloudinary)
- [Pattern 5: Adding a New Context](#pattern-5-adding-a-new-context)

---

## Pattern 1: Three Transform Functions

```typescript
// <root-dir>/<server>/ct/image-config

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

> The framework's image optimizer should be disabled — the commercetools CDN rejects optimizer query params (`?url=...&w=...&q=...`), and these functions handle sizing directly. (Next.js: `images.unoptimized: true` — see the adapter.)

---

## Pattern 2: Suffix Pattern

Insert a size suffix **before** the file extension, preserving any query string:

```typescript
// <root-dir>/<server>/ct/image-config

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

## Pattern 3: CDN Hostname Replacement

Swap the GCS origin for a custom CDN hostname:

```typescript
// <root-dir>/<server>/ct/image-config

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

## Pattern 4: Imgix and Cloudinary

**Imgix** — append query params to the imgix domain:

```typescript
// <root-dir>/<server>/ct/image-config
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
// <root-dir>/<server>/ct/image-config
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

## Pattern 5: Adding a New Context

Export a new function from `image-config.ts` and import it in the component:

```typescript
// <root-dir>/<server>/ct/image-config
// New context: cart line item thumbnail
export function transformCartImageUrl(url: string): string {
  return addSuffix(url, '-thumb');
}
```

```typescript
// <root-dir>/components/cart/CartItem.tsx
import { transformCartImageUrl } from '<server>/ct/image-config';
// ...render with the framework's image primitive using transformCartImageUrl(item.imageUrl)
```

Do not inline the transform in the component — keeping it in `image-config.ts` means a single config change updates all instances.
