---
description: Add a new country/locale to the B2C storefront — updates COUNTRY_CONFIG, routing, creates a messages file, and updates hero config. Run as /add-locale or ask the user for the locale code if not provided.
---

You are adding a new country and locale to the B2C storefront. This touches exactly four files. Follow the steps in order.

## Step 0 — Get the locale code

If the user did not provide a locale code in their message, ask:
> "Which locale are you adding? Provide it as a BCP-47 locale code (same format commercetools uses), e.g. `fr-FR`, `nl-NL`, `es-ES`."

Wait for the answer, then derive these values (ask the user to confirm if unsure):
- **Locale** (BCP-47, e.g. `fr-FR`) — used as the COUNTRY_CONFIG key, in routing, file names, URL segments, and commercetools API calls
- **Country code** ISO 3166-1 alpha-2 (e.g. `FR`)
- **Currency** ISO 4217 (e.g. `EUR`)
- **Label** (e.g. `France`)

## Step 1 — Update COUNTRY_CONFIG

Edit `site/lib/utils.ts`. Add a new entry to `COUNTRY_CONFIG`:

```typescript
'<BCP-47>': {
  locale:   '<BCP-47>',
  currency: '<ISO-4217>',
  country:  '<ISO-3166>',
  label:    '<Label>',
},
```

Do NOT add a `flag` field unless the existing entries already have it.

## Step 2 — Update routing

Edit `site/i18n/routing.ts`. Add the locale to the `locales` array:

```typescript
export const routing = defineRouting({
  locales: [...existing locales..., '<BCP-47>'],
  defaultLocale: 'en-US',
  localePrefix: 'always',
});
```

## Step 3 — Create the messages file

Copy the closest existing locale file as a starting point:
```bash
cp site/messages/de-DE.json site/messages/<BCP-47>.json
```

Then update the values in the new file. If you can translate the strings, do so. Otherwise leave a comment in the file noting that translations are still needed.

## Step 4 — Update hero config

Edit `site/config/hero.json`. For every text field that uses locale-keyed objects, add an entry for the new locale:

```json
"<field>": {
  "en-US": "...",
  "de-DE": "...",
  "<BCP-47>": "<translated text or copy of closest locale>"
}
```

## Step 5 — Report and remind

Tell the user:
1. The four files that were changed
2. To add prices for the new currency in commercetools Merchant Center → Products (check each product type's price set)
3. To set up shipping zones/methods for the new country in commercetools Merchant Center → Shipping
4. To translate `site/messages/<BCP-47>.json` if placeholder strings were used
5. To restart `npm run dev` and navigate to `/<BCP-47>/` to verify the new locale works
