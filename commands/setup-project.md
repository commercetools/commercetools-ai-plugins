---
description: Scaffold a new Next.js (>16) + commercetools storefront — installs dependencies, configures Tailwind v4, wires next-intl locale routing, creates directory structure, and writes shared types/utils. Run as /setup-project.
---

You are bootstrapping a new Next.js + commercetools storefront from scratch. Execute every step in order. Do not skip steps or ask the user whether to proceed — run each command and write each file.

## Step 1 — Create the Next.js app

Run the scaffold command **without** `--tailwind` (that would install Tailwind v3). Pin to `^16`:

```bash
npx create-next-app@^16 site \
  --typescript \
  --app \
  --src-dir=false \
  --tailwind=false \
  --eslint \
  --import-alias "@/*"
cd site
```

Install all project dependencies in one pass:

```bash
npm install \
  @commercetools/platform-sdk@^8 \
  @commercetools/ts-client@^4 \
  "next-intl@^4" \
  swr \
  jose \
  tailwindcss @tailwindcss/postcss postcss
```

Create `netlify.toml` at the **project root** (next to `site/`, not inside it):

```toml
[build]
  base    = "site"
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "22"
```

## Step 2 — Configure Tailwind v4

Delete `tailwind.config.ts` if it exists — Tailwind v4 uses no config file.

Write `postcss.config.mjs`:

```js
const config = { plugins: { '@tailwindcss/postcss': {} } };
export default config;
```

Replace the contents of `app/globals.css`:

```css
@import 'tailwindcss';

@source inline('{col-span-1,col-span-2,col-span-3,col-span-4,col-span-5,col-span-6,col-span-7,col-span-8,col-span-9,col-span-10,col-span-11,col-span-12}');
@source inline('{md:col-span-1,md:col-span-2,md:col-span-3,md:col-span-4,md:col-span-5,md:col-span-6,md:col-span-7,md:col-span-8,md:col-span-9,md:col-span-10,md:col-span-11,md:col-span-12}');
@source inline('{lg:col-span-1,lg:col-span-2,lg:col-span-3,lg:col-span-4,lg:col-span-5,lg:col-span-6,lg:col-span-7,lg:col-span-8,lg:col-span-9,lg:col-span-10,lg:col-span-11,lg:col-span-12}');

@theme {
  --color-cream: #faf7f4;
  --color-cream-dark: #f0ebe3;
  --color-charcoal: #1a1a1a;
  --color-charcoal-light: #4a4a4a;
  --color-terra: #b5724a;
  --color-terra-dark: #9a5f3a;
  --color-sage: #7d9b7a;
  --color-border: #e5e0d8;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
}

:root { --background: #faf7f4; --foreground: #1a1a1a; }

* { box-sizing: border-box; }

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

a, button { transition: all 0.15s ease; }
```

## Step 3 — Create directory structure

Run from inside `site/`:

```bash
mkdir -p \
  app/\[locale\] \
  app/api \
  lib/ct \
  lib/mappers \
  hooks \
  components/ui \
  components/layout \
  components/product \
  context \
  i18n \
  messages
```

## Step 4 — Write shared types and utilities

Write `lib/types.ts`:

```typescript
export interface Price {
  centAmount: number;
  currencyCode: string;
  discounted?: { centAmount: number; currencyCode: string };
}

export interface Variant {
  id: number;
  sku: string;
  images: string[];
  price?: Price;
  prices: Price[];
  attributes: Array<{ name: string; value: unknown }>;
  availability?: { isOnStock?: boolean };
}

export interface Product {
  type: 'Product';
  id: string;
  name: string;
  slug: string;
  description?: string;
  categories: Array<{ id: string }>;
  variants: Variant[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent?: { id: string };
  children?: Category[];
}
```

Write `lib/utils.ts`:

```typescript
export const COUNTRY_CONFIG: Record<string, { currency: string; locale: string; country: string; label: string }> = {
  'en-US': { locale: 'en-US', currency: 'USD', country: 'US', label: 'United States' },
  'en-GB': { locale: 'en-GB', currency: 'GBP', country: 'GB', label: 'United Kingdom' },
  'de-DE': { locale: 'de-DE', currency: 'EUR', country: 'DE', label: 'Germany' },
};

export const DEFAULT_LOCALE = COUNTRY_CONFIG['en-US'];

export function formatMoney(centAmount: number, currencyCode: string, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode })
    .format(centAmount / 100);
}

export function getLocalizedString(obj: Record<string, string> | undefined, locale: string): string {
  if (!obj) return '';
  return obj[locale] ?? obj[locale.split('-')[0]] ?? Object.values(obj)[0] ?? '';
}
```

Write `lib/cache-keys.ts`:

```typescript
export const KEY_CART = 'cart';
export const KEY_ACCOUNT = 'account';
export const KEY_ORDERS = 'orders';
export const KEY_ADDRESSES = 'addresses';
export const KEY_WISHLIST = 'wishlist';
export function keyOrder(id: string) { return `order-${id}`; }
```

## Step 5 — Wire next-intl locale routing

Write `i18n/routing.ts`:

```typescript
import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { COUNTRY_CONFIG } from '@/lib/utils';

export const routing = defineRouting({
  locales: Object.keys(COUNTRY_CONFIG) as [string, ...string[]],
  defaultLocale: 'en-US',
  localePrefix: 'always',
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

Write `i18n/request.ts`:

```typescript
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

Write `next.config.ts` (replace what create-next-app generated):

```typescript
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default withNextIntl(nextConfig);
```

Create a seed messages file for the default locale:

```bash
echo '{}' > messages/en-US.json
cp messages/en-US.json messages/en-GB.json
cp messages/en-US.json messages/de-DE.json
```

## Step 6 — Write locale middleware

Write `middleware.ts` at the project root (inside `site/`):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { COUNTRY_CONFIG, DEFAULT_LOCALE } from '@/lib/utils';

const LOCALES = Object.keys(COUNTRY_CONFIG);
const DEFAULT_LOCALE_STRING = DEFAULT_LOCALE.locale; // 'en-US'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const matchedLocale = LOCALES.find(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );
  if (matchedLocale) {
    const response = NextResponse.next();
    response.headers.set('x-next-intl-locale', matchedLocale);
    return response;
  }

  // Cookie stores the BCP-47 locale directly (e.g. 'en-US', 'de-DE')
  const cookieLocale = request.cookies.get('your-shop-country-locale')?.value;
  const locale = (cookieLocale && LOCALES.includes(cookieLocale)) ? cookieLocale : DEFAULT_LOCALE_STRING;
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next|favicon|.*\\..*).*)', '/'],
};
```

## Step 7 — Verify installed versions

Run this inside `site/` and confirm the output:

```bash
npm list next next-intl @commercetools/platform-sdk @commercetools/ts-client --depth=0
```

**Required:** `next` must be `> 16.0.0`, `next-intl` must be `^4.x.x`, `@commercetools/platform-sdk` must be `> 8.0.0` and `@commercetools/ts-client` must be `> 4.0.0`. If either version is wrong, stop and fix before continuing:

- Wrong `next` version: `npm install next@^16`
- Wrong `next-intl` version: `npm install "next-intl@^4"`
- Wrong `@commercetools/platform-sdk` version: `npm install "@commercetools/platform-sdk@^8"`
- Wrong `@commercetools/ts-client` version: `npm install "@commercetools/ts-client@^4"`

