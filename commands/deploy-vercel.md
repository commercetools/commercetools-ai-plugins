---
description: Deploy the storefront to Vercel — verifies commercetools credentials, then hands off to Vercel's official agent skill to perform the deploy.
---

You are deploying the storefront to Vercel. Your job here is to get the **commercetools credentials** right, then hand the actual deploy off to **Vercel's official agent skill** — do not run deploy commands yourself.

## Step 1 — Credential safety check

Before anything else, verify the user understands the credential rule:

**The storefront must use the Frontend API client, NOT the admin/tools client.**

Check whether `site/.env` exists. If it does, scan it for signs of an admin-scope client:
- `manage_project` in the scopes → STOP. Tell the user this is an admin client and must not be deployed. They need to create a new **Frontend** API client in commercetools Merchant Center (Settings → Developer settings → API clients → Create new, use **Frontend B2C** template (or Frontend B2B), then make sure `manage_sessions` and `manage_orders` are included).
- `manage_my_*` scopes → incorrect scope, stop.
- File missing → remind them to create `site/.env` with the Frontend client credentials before deploying.

Example: The minimum scope set for `site/.env` for B2C:
```
CTP_SCOPES=manage_order_edits:key view_sessions:key view_product_selections:key view_shipping_methods:key manage_shopping_lists:key view_discount_codes:key manage_customers:key view_types:key manage_sessions:key manage_orders:key view_standalone_prices:key view_tax_categories:key view_published_products:key view_cart_discounts:key create_anonymous_token:key view_project_settings:key view_products:key view_categories:key
```

## Step 2 — Check SESSION_SECRET

Look in `site/.env` for `SESSION_SECRET`. If it is missing, shorter than 32 characters, or still the placeholder value, tell the user to generate one:
```bash
openssl rand -base64 48
```
Paste the output as `SESSION_SECRET` in `site/.env` before continuing.

## Step 3 — Environment variables the deploy must set

These are the commercetools env vars the Vercel deploy needs `site/.env`:

| Variable | Source |
|---|---|
| `CTP_PROJECT_KEY` | `site/.env` |
| `CTP_CLIENT_ID` | `site/.env` |
| `CTP_CLIENT_SECRET` | `site/.env` |
| `CTP_AUTH_URL` | `site/.env` |
| `CTP_API_URL` | `site/.env` |
| `CTP_SCOPES` | `site/.env` (storefront scopes, not admin) |
| `SESSION_SECRET` | The value from Step 2 |

## Step 4 — Hand off to Vercel's agent skill

Install and use Vercel's official agent skill to perform the deploy:

```
npx skills add vercel-labs/agent-skills
```

See the [README](https://github.com/vercel-labs/agent-skills) for the available skills and usage. Let the Vercel skill handle project linking, environment variables (from the table above), and the deploy itself.

## Final reminders

- `site/app/api/health/route.ts` must NOT exist in production — delete it if present
- The admin `tools/.env` credentials must never be set as Vercel environment variables
