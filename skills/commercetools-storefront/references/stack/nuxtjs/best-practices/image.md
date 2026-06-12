# Image Optimization

## Project Rule: `provider: 'none'` Is Intentional

`nuxt.config.ts` sets `image: { provider: 'none' }`. **Do not change it to `ipx` or another optimizer.**

The commercetools CDN (`storage.googleapis.com`) returns `403`/`400` when an optimizer appends `?w=...&q=...` params. The `none` provider is a pure pass-through: it returns the original URL untouched, ignores modifiers, and never appends params — while keeping `<NuxtImg>` ergonomics (`loading`, `sizes`, `placeholder`, `preload`). Sizing is handled explicitly in `shared/utils/` / `server/utils/ct/image-config.ts` transform functions.

```ts
// nuxt.config.ts — do not change provider
export default defineNuxtConfig({
  image: {
    provider: 'none',
    domains: ['storage.googleapis.com'],   // allow the remote host (env: NUXT_IMAGE_DOMAINS)
  },
})
```

> `@nuxt/image` uses `domains` to allow-list remote hosts (there is no `remotePatterns` key). Add any non-CT host (CMS banners, avatars) to this array.

---

## Product Images: Always Go Through image-config

The URL transform functions themselves (CDN swap, Imgix, Cloudinary, suffix sizing) are framework-agnostic and documented in the generic skill's [core/image-config.md](../../../core/image-config.md). This file covers only the Nuxt rendering side (`<NuxtImg>`).

Components never build image URLs inline — import the transform:

```vue
<script setup lang="ts">
import { transformListingImageUrl, transformDetailImageUrl, transformThumbnailImageUrl } from '#shared/utils/image-config'
</script>

<template>
  <!-- Listing / search result card -->
  <NuxtImg :src="transformListingImageUrl(item.imageUrl)" :alt="item.name" width="400" height="500" loading="lazy" />

  <!-- PDP main image — LCP, preload with high priority, no lazy -->
  <NuxtImg
    :src="transformDetailImageUrl(product.imageUrl)"
    :alt="product.name"
    width="800" height="1000"
    sizes="100vw md:50vw"
    :preload="{ fetchPriority: 'high' }"
  />

  <!-- PDP thumbnail strip -->
  <NuxtImg :src="transformThumbnailImageUrl(product.imageUrl)" :alt="product.name" width="80" height="100" loading="lazy" />
</template>
```

Never inline a URL transform in a component — changing the transform updates all instances at once.

---

## Always Use `<NuxtImg>` — Never `<img>`

Even with `provider: 'none'`, `<NuxtImg>` still prevents layout shift (explicit `width`/`height`), lazy-loads below-fold images, and gives you `sizes`/`densities`/`placeholder` for free.

```vue
<!-- Bad -->
<img :src="url" alt="Product" />

<!-- Good -->
<NuxtImg :src="url" alt="Product" width="400" height="500" />
```

---

## sizes and densities

`sizes` is space-separated `screen:width` pairs (Tailwind-aligned breakpoints). `densities` covers HiDPI:

```vue
<!-- responsive grid card -->
<NuxtImg :src="url" alt="Card" width="400" height="500" sizes="100vw sm:50vw md:33vw" densities="x1 x2" loading="lazy" />
```

Provide real display dimensions, not just an aspect ratio — `width="16" height="9"` tells the browser the image is 16px wide.

---

## Priority for LCP Images

Add `:preload="{ fetchPriority: 'high' }"` to the first visible image (hero, PDP main) and omit `loading="lazy"`. Everything below the fold stays `loading="lazy"`:

```vue
<!-- Hero / LCP — renders immediately -->
<NuxtImg :src="url" alt="Hero" width="1200" height="600" sizes="100vw" :preload="{ fetchPriority: 'high' }" />

<!-- Below the fold — lazy -->
<NuxtImg :src="url" alt="Card" width="400" height="500" loading="lazy" />
```

---

## Placeholder

`placeholder` shows a blurred/low-res stand-in until the image loads. As a boolean it auto-derives; pass `[w, h, q, blur]` to tune:

```vue
<NuxtImg :src="url" alt="Banner" width="1200" height="400" placeholder />
<NuxtImg :src="url" alt="Banner" width="1200" height="400" :placeholder="[50, 25, 75, 5]" />
```

---

## Common Mistakes

```vue
<!-- Bad: native img — no lazy-load, no dimension enforcement -->
<img :src="url" alt="Product" />

<!-- Bad: switching provider back to an optimizer — CT CDN 403s on appended params -->
<!-- image: { provider: 'ipx' } -->

<!-- Bad: inline URL transform — bypasses image-config -->
<NuxtImg :src="`${url}?w=400`" alt="Product" width="400" height="500" />

<!-- Bad: aspect-ratio numbers as dimensions -->
<NuxtImg :src="url" alt="Hero" width="16" height="9" />

<!-- Good: real display size + responsive sizes -->
<NuxtImg :src="url" alt="Hero" width="1200" height="600" sizes="100vw" />
```
