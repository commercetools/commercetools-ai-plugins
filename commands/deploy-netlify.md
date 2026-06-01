---
description: Deploy the B2C storefront to Netlify — checks credentials, runs the provisioning script, and guides repository connection.
---

You are deploying the B2C storefront to Netlify. Follow each step in order.

## Step 1 — Credential safety check

Before anything else, verify the user understands the credential rule:

**The storefront must use the Frontend B2C API client, NOT the admin/tools client.**

Check whether `site/.env` exists. If it does, scan it for signs of an admin-scope client:
- `manage_project` in the scopes → STOP. Tell the user this is an admin client and must not be deployed. They need to create a new **Frontend B2C** API client in commercetools Merchant Center (Settings → Developer settings → API clients → Create new, use the **Mobile & single-page application** template, then add `manage_payments` and `manage_orders`).
- `manage_my_*` scopes → incorrect scope, stop.
- File missing → remind them to create `site/.env` with the Frontend B2C or B2B client credentials before deploying.

The least scope set for `site/.env` for B2C:
```
CTP_SCOPES=manage_order_edits:key view_sessions:key view_product_selections:key view_shipping_methods:key manage_shopping_lists:key view_discount_codes:key manage_customers:key view_types:key manage_sessions:key manage_orders:key view_standalone_prices:key view_tax_categories:key view_published_products:key view_cart_discounts:key create_anonymous_token:key view_project_settings:key view_products:key view_categories:key
```

## Step 2 — Check SESSION_SECRET

Look in `site/.env` for `SESSION_SECRET`. If it is missing, shorter than 32 characters, or still the placeholder value, tell the user to generate one:
```bash
openssl rand -base64 48
```
Paste the output as `SESSION_SECRET` in `site/.env` before continuing.

## Step 3 — Generate a Netlify personal access token

Instruct the user to:
1. Go to Netlify → user avatar → User settings → Applications → Personal access tokens
2. Create a new token with a meaningful name (e.g. `b2c-storefront-deploy`)
3. Copy the token — it is shown only once

## Step 4 — Run the provisioning script

```bash
node tools/netlify-setup.mjs
```

The script will prompt for:
1. **Netlify personal access token** — paste the token from Step 3
2. **Site name** — must be globally unique on Netlify (e.g. `acme-b2c-storefront`)
3. **commercetools credentials** — paste values from `site/.env` (the storefront client, not tools)

The script creates the Netlify site and sets all environment variables. It outputs the site URL and dashboard link — show these to the user.

## Step 5 — Connect the Git repository

Instruct the user to:
1. Open the new site in the Netlify dashboard (URL from the script output)
2. Go to **Site settings → Build & deploy → Link repository**
3. Authorise GitHub/GitLab and select the repo
4. Netlify reads `netlify.toml` at the repo root — confirm it contains:
   ```toml
   [build]
     base    = "site"
     command = "npm run build"
     publish = ".next"

   [build.environment]
     NODE_VERSION = "22"
   ```
   If `netlify.toml` is missing, create it with the content above.
5. Trigger the first deploy: **Deploys → Trigger deploy → Deploy site**

## Step 6 — Verify

Tell the user to:
- Wait for the deploy to finish (watch the deploy log in the Netlify dashboard)
- Open the site URL — confirm the homepage loads and products are visible
- If products don't appear, check **Functions log** in the Netlify dashboard for commercetools API errors (usually wrong scope or wrong region URL)

## Final reminders

- `site/app/api/health/route.ts` must NOT exist in production — delete it if present
- The admin `tools/.env` credentials must never be set as Netlify environment variables
- Re-deploy is automatic on every push to the linked branch after the repository is connected
