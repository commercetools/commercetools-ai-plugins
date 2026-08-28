---
name: add-country
description: Covers locale, country, and currency configuration through a single COUNTRY_CONFIG source of truth including routing updates and message files.
when_to_use:
  - "Adding a new country, locale, or currency to the storefront"
  - "Setting up multi-region support"
  - "Configuring BCP-47 locale mappings"
  - "Translating messages for a new locale"
metadata:
  contentType: REFERENCE
  area:
    - localization
    - navigation
---

# Add Country / Locale

**Impact: MEDIUM — Adding country config in multiple places instead of the single source causes missing currencies in cart and broken locale routing.**

All locale data derives from one `COUNTRY_CONFIG` object. Update it once, then add a messages file, routing entry, and hero config.

## Table of Contents
- [Pattern 1: Single Source of Truth](#pattern-1-single-source-of-truth)
- [Pattern 2: Routing Update](#pattern-2-routing-update)
- [Pattern 3: Message File](#pattern-3-message-file)

---

## Pattern 1: Single Source of Truth

**INCORRECT:** hardcoding currency or locale in multiple files.

```typescript
// BAD — scattered across files
// In cart.ts:
currency: 'EUR'
// In checkout.ts:
country: 'DE'
// In the header component:
const locales = ['en-US', 'de-DE'];
```

**CORRECT — add to `COUNTRY_CONFIG` in `<server>/utils` only:**

```typescript
// <root-dir>/<server>/utils
export const COUNTRY_CONFIG: Record<string, CountryConfig> = {
  'en-US': {
    locale:    'en-US',       // BCP-47 — used as COUNTRY_CONFIG key, URL segment, and in commercetools API calls
    currency:  'USD',         // ISO 4217
    country:   'US',          // ISO 3166-1 alpha-2
    label:     'United States',
    flag:      '🇺🇸',
  },
  'de-DE': {
    locale:    'de-DE',
    currency:  'EUR',
    country:   'DE',
    label:     'Germany',
    flag:      '🇩🇪',
  },

  // ADD NEW COUNTRY HERE:
  'fr-FR': {
    locale:    'fr-FR',
    currency:  'EUR',
    country:   'FR',
    label:     'France',
    flag:      '🇫🇷',
  },
};
```

The `locale` value is used directly in commercetools search queries (`language: locale`). The `currency` is used when creating carts. Everything else derives from this map — no other files need direct currency/country hardcoding.

---

## Pattern 2: Routing Update

The active-locale list the framework's i18n/locale routing uses must **derive from `COUNTRY_CONFIG` keys**, never be hardcoded — otherwise it drifts every time a country is added. In practice this is `Object.keys(COUNTRY_CONFIG)` fed into the routing configuration, with a default locale (e.g. `en-US`).

1. Update the Merchant center by adding the new country, language and currency from **Settings** > **Project settings**
2. Update and add a new entry to `COUNTRY_CONFIG` is all that's needed — the locale list updates automatically. The COUNTRY_CONFIG key is the BCP-47 locale (e.g. `fr-FR`), the same format commercetools uses for API calls, and the URL segment matches the key exactly: `/fr-FR/`, `/de-DE/`.
> The routing wiring itself is framework-specific — find the adapter's `project-layout.md`.

---

## Pattern 3: Message File

**INCORRECT:** reusing an existing locale file or naming it incorrectly.

```
// BAD — wrong filename, won't be picked up by the framework's i18n loader
messages/fr.json
messages/fr-fr.json
messages/FR.json
```

**CORRECT — create `messages/<BCP-47>.json` matching the key in `COUNTRY_CONFIG`:**

```bash
# Copy the closest existing locale as a starting point
cp <root-dir>/messages/de-DE.json <root-dir>/messages/fr-FR.json
```

Then translate all values in `fr-FR.json`. The filename **must** exactly match the COUNTRY_CONFIG key (e.g. `fr-FR.json` for the `'fr-FR'` entry).

```json
// <root-dir>/messages/fr-FR.json (excerpt)
{
  "common": {
    "addToCart": "Ajouter au panier",
    "checkout":  "Passer à la caisse",
    "search":    "Rechercher"
  },
  "cart": {
    "empty":     "Votre panier est vide",
    "subtotal":  "Sous-total"
  }
}
```

## Checklist
- [ ] New entry added to `COUNTRY_CONFIG` in `<root-dir>/<server>/utils` with `locale`, `currency`, `country`, `label`
- [ ] Locale list in the framework's routing config derives from `COUNTRY_CONFIG` keys (not hardcoded) — Adapter's `project-layout.md`
- [ ] `<root-dir>/messages/<BCP-47>.json` created with all translation keys
- [ ] commercetools Merchant Center: prices defined for the new currency in the product catalogue
- [ ] commercetools Merchant Center: shipping zones/methods set up for the new country
