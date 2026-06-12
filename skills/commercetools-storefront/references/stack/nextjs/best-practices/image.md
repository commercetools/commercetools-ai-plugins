# Image Optimization

## Project Rule: `unoptimized: true` Is Intentional

`<root-dir>/next.config.ts` sets `images.unoptimized: true`. **Do not remove it.**

commercetools CDN returns `403`/`400` when Next.js appends `?url=...&w=...&q=...` optimization params. Sizing is handled explicitly in `<root-dir>/lib/ct/image-config.ts` transform functions.

```typescript
// <root-dir>/next.config.ts — do not change
const nextConfig: NextConfig = {
  images: { unoptimized: true },
};
```

---

## Product Images: Always Go Through image-config.ts

The URL transform functions themselves (CDN swap, Imgix, Cloudinary, suffix sizing) are framework-agnostic and documented in the generic skill's [core/image-config.md](../../../core/image-config.md). This file covers only the Next.js rendering side (`next/image`).

Components never build image URLs inline. Import from `image-config.ts`:

```tsx
import { transformListingImageUrl } from '@/lib/ct/image-config'
import Image from 'next/image'

// Listing / search result card
<Image
  src={transformListingImageUrl(item.imageUrl)}
  alt={item.name}
  width={400}
  height={500}
/>

// PDP main carousel image
<Image
  src={transformDetailImageUrl(product.imageUrl)}
  alt={product.name}
  fill
  sizes="(max-width: 768px) 100vw, 50vw"
  priority
/>

// PDP thumbnail strip
<Image
  src={transformThumbnailImageUrl(product.imageUrl)}
  alt={product.name}
  width={80}
  height={100}
/>
```

Never inline a URL transform in a component — changing `image-config.ts` updates all instances at once.

---

## Always Use next/image — Never `<img>`

Even with `unoptimized: true`, `next/image` still prevents layout shift, lazy-loads below-fold images, and enforces explicit dimensions.

```tsx
// Bad
<img src={url} alt="Product" />

// Good
import Image from 'next/image'
<Image src={url} alt="Product" width={400} height={500} />
```

---

## Non-Product Images (CMS banners, avatars, icons)

For images not from the commercetools CDN, add the hostname to `remotePatterns` in `next.config.ts`:

```typescript
// <root-dir>/next.config.ts
images: {
  unoptimized: true,
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'assets.example.com',
      pathname: '/media/**',
    },
  ],
},
```

---

## fill + sizes

Always pair `fill` with `sizes` or Next.js downloads the largest variant:

```tsx
// Bad: missing sizes — downloads the biggest image
<Image src={url} alt="Banner" fill />

// Good
<Image src={url} alt="Banner" fill sizes="100vw" />

// Good: responsive grid
<Image src={url} alt="Card" fill sizes="(max-width: 768px) 100vw, 33vw" />
```

The parent container must have `position: relative` and an explicit height.

---

## Priority for LCP Images

Add `priority` to the first visible image (hero, PDP carousel):

```tsx
// Hero banner — renders immediately, no lazy-load
<Image src={url} alt="Hero" fill sizes="100vw" priority />

// Product cards below the fold — omit priority (lazy-loaded by default)
<Image src={url} alt="Card" width={400} height={500} />
```

---

## Blur Placeholder (non-product images)

```tsx
// Local static image — blur hash inferred automatically
import heroImage from './hero.png'
<Image src={heroImage} alt="Hero" placeholder="blur" />

// Remote image — provide blurDataURL or use a background color
<Image
  src="https://assets.example.com/banner.jpg"
  alt="Banner"
  width={1200}
  height={400}
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRg..."
/>
```

---

## Common Mistakes

```tsx
// Bad: native img — no lazy-load, no dimension enforcement
<img src={url} alt="Product" />

// Bad: fill without sizes — downloads largest image
<Image src={url} alt="Hero" fill />

// Bad: inline URL transform — bypasses image-config.ts
<Image src={`${url}?w=400`} alt="Product" width={400} height={500} />

// Bad: wrong dimensions (aspect ratio only, not display size)
<Image src={url} alt="Hero" width={16} height={9} />

// Good: actual display size or fill + sizes
<Image src={url} alt="Hero" fill sizes="100vw" style={{ objectFit: 'cover' }} />
```
