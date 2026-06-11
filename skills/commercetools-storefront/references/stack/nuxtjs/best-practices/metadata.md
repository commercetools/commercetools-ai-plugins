# Metadata

## Rule: Set Meta with `useSeoMeta`

`useSeoMeta()` is the type-safe way to set SEO tags from any page or component `setup`. It runs on the server (so crawlers see the tags) and updates reactively on the client. `useHead()` covers anything `useSeoMeta` doesn't (the title template, arbitrary `<link>`/`<script>`).

```ts
// app/pages/my-page.vue — static
useSeoMeta({
  title: 'My Page',                 // title template appends the site name
  description: 'Page description for SEO',
  ogTitle: 'My Page',
  ogDescription: 'Page description for SEO',
})
```

---

## Title Template

Set it once in `app/app.vue` (or the default layout) so every page title is suffixed consistently:

```ts
// app/app.vue
useHead({
  titleTemplate: (chunk) => (chunk ? `${chunk} – Your Store` : 'Your Store'),
})
```

A page that sets `title: 'Cart'` then renders as `Cart – Your Store`.

---

## Dynamic Metadata

When the title/description depend on fetched data (PDP, category, blog), pass **getter functions** to `useSeoMeta` so it stays reactive as the data resolves:

```vue
<!-- app/pages/products/[slug].vue -->
<script setup lang="ts">
const slug = useRoute().params.slug as string
const { data: product } = await useAsyncData(`product:${slug}`, () =>
  $fetch(`/api/products/${slug}`).catch(() => null)
)

if (!product.value) {
  throw createError({ statusCode: 404, statusMessage: 'Product not found', fatal: true })
}

useSeoMeta({
  title: () => product.value?.name,
  description: () => product.value?.description,
  ogImage: () => product.value?.imageUrl,
  ogType: 'product',
})
</script>
```

The `useAsyncData` result is deduped by key and ships in the SSR payload — the same fetch feeds both the page body and the meta tags; there is no second request.

---

## OG Images — `nuxt-og-image` v6

For dynamic social cards, add `nuxt-og-image`. In v6, `defineOgImageComponent` is **deprecated** — use `defineOgImage('<ComponentName>', props)`. Renderer deps are no longer bundled; install them explicitly (the Takumi renderer is the default and supports Tailwind v4):

```bash
npm install -D nuxt-og-image
# add 'nuxt-og-image' to modules in nuxt.config.ts
```

```vue
<!-- app/components/OgImage/Product.takumi.vue  (.takumi suffix selects the renderer) -->
<script setup lang="ts">
const { title = 'Product', price = '' } = defineProps<{ title?: string; price?: string }>()
</script>
<template>
  <div class="h-full w-full flex flex-col items-center justify-center bg-white">
    <h1 class="text-[72px] font-black px-20 text-center">{{ title }}</h1>
    <p v-if="price" class="text-[40px] mt-6">{{ price }}</p>
  </div>
</template>
```

```vue
<!-- in the PDP -->
<script setup lang="ts">
defineOgImage('Product.takumi', { title: product.value.name, price: formattedPrice.value })
</script>
```

Components live in `app/components/OgImage/` (auto-registered as templates). The inline `<OgImage>` component is the declarative equivalent of `defineOgImage`.

---

## Metadata File Conventions

| File / mechanism | Purpose |
|------|---------|
| `app/public/favicon.ico` | Browser tab icon |
| `defineOgImage(...)` / `<OgImage>` | OG + Twitter card image (`nuxt-og-image`) |
| `server/routes/sitemap.xml.ts` or `@nuxtjs/sitemap` | Sitemap (use the module for large catalogs) |
| `server/routes/robots.txt.ts` or `@nuxtjs/robots` | Crawl directives |

`useSeoMeta` covers `twitterCard`/`twitterTitle`/etc. directly, so a Twitter card needs no separate file — set `twitterCard: 'summary_large_image'` and Twitter falls back to the OG image.
