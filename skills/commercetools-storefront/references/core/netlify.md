---
name: netlify
description: Netlify provisioning, environment variable setup, and smoke test checklist for deploying a commercetools storefront.
when_to_use:
  - "Deploying to Netlify for the first time"
  - "Configuring environment variables for production"
  - "Setting up CI/CD with GitHub"
  - "Verifying a live deployment"
metadata:
  contentType: REFERENCE
  area:
    - deployment
---

# Deploy to Netlify

How to provision a new Netlify site and configure it for a commercetools storefront.

## Prerequisites

1. **Netlify personal access token** — generate at app.netlify.com → Personal access tokens
2. **Storefront commercetools API credentials** — the **Frontend** API client with limited scope. **Never use admin/`manage_project` credentials here.**
3. **A unique site name** — will become `https://<name>.netlify.app`
4. **`netlify.toml`** — already present in the repo root; no changes needed

## Step 1 — Run the setup script

```bash
node tools/netlify-setup.mjs
```

The script prompts for:

| Prompt | Notes |
|--------|-------|
| Netlify personal access token | Or set `NETLIFY_AUTH_TOKEN` in shell to skip |
| Site name | Must be unique across Netlify (e.g. `acme-storefront`) |
| `CTP_PROJECT_KEY` | commercetools project key |
| `CTP_CLIENT_ID` | Storefront API client ID |
| `CTP_CLIENT_SECRET` | Storefront API client secret |
| `CTP_AUTH_URL` | e.g. `https://auth.europe-west1.gcp.commercetools.com` |
| `CTP_API_URL` | e.g. `https://api.europe-west1.gcp.commercetools.com` |
| `CTP_SCOPES` | Storefront scopes (not `manage_project`) |
| `SESSION_SECRET` | Long random string for signing JWT session cookies |

Press Enter to skip any env var — you can set them later in the Netlify UI.

What the script does:
1. Finds your Netlify account
2. Creates a new site under that account
3. Sets all provided environment variables on the site

## Step 2 — Connect the GitHub repo

After the script completes, open the Admin URL it prints:

1. **Site settings → Build & deploy → Continuous deployment**
2. Click **Link to Git**
3. Select the GitHub repo
4. Netlify will pick up `netlify.toml` automatically

The first deploy starts automatically once the repo is linked.

## Step 3 — Verify the deploy

1. Watch the deploy log in the Netlify UI
2. Once live, verify:
   - Home page loads and shows the hero
   - Login works
   - Country/language selector works
   - Category page loads with products
   - Adding a product to cart works
   - Checkout flow completes successfully

## Environment Variables Reference

| Variable | Source | Description |
|---|---|---|
| `CTP_PROJECT_KEY` | commercetools Merchant Center | Project key |
| `CTP_CLIENT_ID` | commercetools Merchant Center | Frontend API client ID |
| `CTP_CLIENT_SECRET` | commercetools Merchant Center | Frontend API client secret |
| `CTP_AUTH_URL` | commercetools region | Auth server URL |
| `CTP_API_URL` | commercetools region | API server URL |
| `CTP_SCOPES` | commercetools Merchant Center | Limited scopes — no `manage_project` |
| `SESSION_SECRET` | Generated locally | `openssl rand -base64 48` |

**CRITICAL:** `CTP_CLIENT_SECRET` and `SESSION_SECRET` are server-only secrets. They must never be prefixed `NEXT_PUBLIC_`. Keep them out of git.

## Notes

- `netlify.toml` must exist at the repo root with exactly this content:

```toml
[build]
  base    = "site"
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "22"
```

- Node version is pinned to 22 via `NODE_VERSION = "22"` in `netlify.toml`
- To update env vars on an existing site: use the Netlify UI (Site settings → Environment variables)
- `tools/.env` admin credentials are for local scripts only — **never put them on Netlify**

## Checklist

- [ ] Netlify personal access token ready
- [ ] Storefront commercetools API credentials ready (limited-scope client, not admin)
- [ ] `SESSION_SECRET` generated: `openssl rand -base64 48`
- [ ] `node tools/netlify-setup.mjs` run — site created
- [ ] GitHub repo linked in Netlify UI
- [ ] First deploy succeeded
- [ ] Smoke test: home, login, category, cart, checkout
