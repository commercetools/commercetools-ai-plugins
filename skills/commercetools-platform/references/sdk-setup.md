---
name: sdk-setup
description: Canonical patterns for TypeScript SDK initialization, singleton ClientBuilder, OAuth2 client credentials flow, and environment variable configuration with region-specific auth URLs.
when_to_use:
  - "Setting up a new commercetools project with the TypeScript SDK"
  - "Configuring API client authentication and credentials"
metadata:
  contentType: REFERENCE
  area:
    - sdk
    - auth
    - api
---

# commercetools SDK Setup

**Impact: CRITICAL — One `ClientBuilder` instance per process. Instantiating it per request causes token exhaustion and memory leaks.**

## Table of Contents
- [Pattern 1: Install Packages](#pattern-1-install-packages)
- [Pattern 2: SDK Client Singleton](#pattern-2-sdk-client-singleton)
- [Pattern 3: Environment Variables](#pattern-3-environment-variables)
- [Checklist](#checklist)

---

## Pattern 1: Install Packages

```bash
npm install @commercetools/platform-sdk @commercetools/ts-client
```

| Package | Purpose |
|---------|---------|
| `@commercetools/platform-sdk` | Typed commercetools REST API client — `apiRoot`, request builders, SDK types |
| `@commercetools/ts-client` | Token management + HTTP middleware (`ClientBuilder`, `withClientCredentialsFlow`) |

---

## Pattern 2: SDK Client Singleton

**INCORRECT:** `new ClientBuilder()` inside a page, component, Route Handler, or lambda invocation — creates a new HTTP client and OAuth token per call.

**CORRECT — one module-level singleton, imported everywhere:**

```typescript
// lib/ct/client.ts
import { createApiBuilderFromCtpClient } from '@commercetools/platform-sdk';
import { ClientBuilder } from '@commercetools/ts-client';

const projectKey = process.env.CTP_PROJECT_KEY!;
const authUrl    = process.env.CTP_AUTH_URL!;
const apiUrl     = process.env.CTP_API_URL!;

function buildClient() {
  return new ClientBuilder()
    .withProjectKey(projectKey)
    .withClientCredentialsFlow({
      host: authUrl,
      projectKey,
      credentials: {
        clientId:     process.env.CTP_CLIENT_ID!,
        clientSecret: process.env.CTP_CLIENT_SECRET!,
      },
      scopes: [process.env.CTP_SCOPES!],
    })
    .withHttpMiddleware({ host: apiUrl })
    .build();
}

export const apiRoot = createApiBuilderFromCtpClient(buildClient())
  .withProjectKey({ projectKey });

export { projectKey, apiUrl, authUrl };
```

`withClientCredentialsFlow` handles OAuth 2.0 token fetching and auto-refresh transparently — you never call the auth endpoint directly.

Every helper function imports `apiRoot` from this file:

```typescript
import { apiRoot } from './client';

export async function getSomething(id: string) {
  const { body } = await apiRoot.things().withId({ ID: id }).get().execute();
  return body;
}
```

---

## Pattern 3: Environment Variables

**INCORRECT:** `NEXT_PUBLIC_CTP_CLIENT_SECRET` — exposes the secret in the browser bundle.

**CORRECT — all commercetools variables are server-only (no `NEXT_PUBLIC_` prefix):**

```bash
# .env  (add to .gitignore — never commit)
CTP_PROJECT_KEY=your-project-key
CTP_AUTH_URL=https://auth.us-central1.gcp.commercetools.com
CTP_API_URL=https://api.us-central1.gcp.commercetools.com
CTP_CLIENT_ID=your-client-id
CTP_CLIENT_SECRET=your-client-secret
# B2C example
CTP_SCOPES=manage_order_edits:your-project-key view_sessions:your-project-key view_product_selections:your-project-key view_shipping_methods:your-project-key manage_shopping_lists:your-project-key view_discount_codes:your-project-key manage_customers:your-project-key view_types:your-project-key manage_sessions:your-project-key manage_orders:your-project-key view_standalone_prices:your-project-key view_tax_categories:your-project-key view_published_products:your-project-key view_cart_discounts:your-project-key create_anonymous_token:your-project-key view_project_settings:your-project-key view_products:your-project-key view_categories:your-project-key
```

**Auth URL by region:**

| Region | Auth URL |
|--------|----------|
| Americas (GCP) | `https://auth.us-central1.gcp.commercetools.com` |
| Europe (GCP) | `https://auth.europe-west1.gcp.commercetools.com` |
| Australia (GCP) | `https://auth.australia-southeast1.gcp.commercetools.com` |

**Required API client scopes** (Merchant Center → Settings → Developer Settings):
Use the **Frontend B2C** template (or Frontend B2B), then make sure `manage_sessions` and `manage_orders` are included.

---

## Checklist

- [ ] `lib/ct/client.ts` exports a single `apiRoot` — no `new ClientBuilder()` anywhere else
- [ ] `.env` is listed in `.gitignore`
- [ ] No commercetools env vars use the `NEXT_PUBLIC_` prefix
- [ ] All `lib/ct/*.ts` helper functions import `apiRoot` from `./client`
