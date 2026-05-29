---
description: Deploy the storefront to Vercel — checks credentials, verifies vercel.json, guides project import, sets environment variables, and confirms first deploy.
---

You are deploying the storefront to Vercel. Follow each step in order.

## Step 1 — Credential safety check

Before anything else, verify the user understands the credential rule:

**The storefront must use the Frontend API client, NOT the admin/tools client.**

Check whether `site/.env` exists. If it does, scan it for signs of an admin-scope client:
- `manage_project` in the scopes → STOP. Tell the user this is an admin client and must not be deployed. They need to create a new **Frontend** API client in commercetools Merchant Center (Settings → Developer settings → API clients → Create new, use the **Mobile & single-page application** template, then add `manage_payments` and `manage_orders`).
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

## Step 3 — Verify vercel.json

Check that `vercel.json` exists at the repo root (next to `site/`, not inside it). If it is missing, create it:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "framework": "nextjs"
}
```

## Step 4 — Import the project in Vercel

Instruct the user to:
1. Open vercel.com → **Add New → Project**
2. Click **Import Git Repository** and select the repo
3. Vercel auto-detects the `vercel.json` — confirm these settings in the import wizard:
   - **Root Directory:** `site`
   - **Framework Preset:** Next.js
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
   - **Node.js Version:** 22.x
4. Do **not** click Deploy yet — proceed to Step 5 to set env vars first

## Step 5 — Set environment variables

In the Vercel import wizard (Environment Variables section), add all of these before deploying:

| Variable | Value |
|---|---|
| `CTP_PROJECT_KEY` | From `site/.env` |
| `CTP_CLIENT_ID` | From `site/.env` |
| `CTP_CLIENT_SECRET` | From `site/.env` |
| `CTP_AUTH_URL` | From `site/.env` |
| `CTP_API_URL` | From `site/.env` |
| `CTP_SCOPES` | From `site/.env` (storefront scopes, not admin) |
| `SESSION_SECRET` | The value generated in Step 2 |

Set all variables for **Production**, **Preview**, and **Development** environments.

## Step 6 — Deploy

Click **Deploy** in the Vercel dashboard. The first deploy starts automatically.

Watch the build log. If the build fails:
- Confirm environment variables are set correctly
- Confirm `vercel.json` is at the repo root (not inside `site/`)
- Check **Function Logs** in the Vercel dashboard for commercetools API errors

## Step 7 — Verify

Tell the user to:
- Wait for the deploy to finish
- Open the site URL — confirm the homepage loads and products are visible
- If products don't appear, check **Function Logs** in the Vercel dashboard for commercetools API errors (usually wrong scope or wrong region URL)

## Final reminders

- `site/app/api/health/route.ts` must NOT exist in production — delete it if present
- The admin `tools/.env` credentials must never be set as Vercel environment variables
- Re-deploy is automatic on every push to the linked branch after the repository is connected
