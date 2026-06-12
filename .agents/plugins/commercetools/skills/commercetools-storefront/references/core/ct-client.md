---
name: ct-client
description: Covers the commercetools SDK singleton, server-managed sessions, and BFF architecture patterns for calling commercetools APIs.
when_to_use:
  - "Setting up the commercetools client for the first time"
  - "Implementing server-managed sessions (stateless or stateful BFF)"
  - "Understanding the BFF (Backend-for-Frontend) boundary pattern"
  - "Wiring server endpoints to commercetools helpers"
metadata:
  contentType: REFERENCE
  area:
    - auth
    - session
    - deployment
---

# commercetools Client & Session

**Impact: CRITICAL — This is the foundation. Every other reference depends on `apiRoot`, `getSession`, and the BFF boundary being correctly wired.**

This reference covers the commercetools SDK singleton, environment setup, server-managed sessions, and the BFF (Backend-for-Frontend) architecture that prevents credential leaks.

> **Architecture assumption — a server tier exists.** The BFF and secret rules below require a server-side tier (SSR, server components, or a standalone BFF service) that holds secrets and proxies commercetools. For the concrete framework binding (file paths, cookie read/write API, route shape), see the matching stack adapter under `references/stack/` — e.g. the [Next.js stack](../stack/nextjs/overview.md).

## Table of Contents
- [Pattern 1: SDK Client Singleton](#pattern-1-sdk-client-singleton)
- [Pattern 2: Environment Variables](#pattern-2-environment-variables)
- [Pattern 3: Session Management](#pattern-3-session-management)
- [Pattern 4: BFF Boundary](#pattern-4-bff-boundary)
- [Pattern 5: commercetools Helper Function Shape](#pattern-5-commercetools-helper-function-shape)
- [Pattern 6: Connection Health Check](#pattern-6-connection-health-check)
- [Checklist](#checklist)

---

## Pattern 1: SDK Client Singleton

**See [sdk-setup.md](../../../commercetools-platform/references/sdk-setup.md)** for the `ClientBuilder` singleton pattern, package installation, and the rule: one `apiRoot` module-level export in `<server>/ct/client` — never instantiate `ClientBuilder` inside a page, component, or server endpoint.

---

## Pattern 2: Environment Variables

**See [sdk-setup.md](../../../commercetools-platform/references/sdk-setup.md)** for the full `.env` template, auth URLs by region, and required API client scopes.

If the stack signs session tokens (stateless BFF), the signing secret must be strong (≥ 32 characters), server-only, and never exposed to the client bundle — the Next.js stack calls it `SESSION_SECRET`. A stateful BFF instead keeps its session-store credentials server-only.

---

## Pattern 3: Session Management

**INCORRECT:** Storing `cartId` or `customerId` in `localStorage` or a non-HTTP-only cookie — readable by XSS and not server-authoritative.

**CORRECT — the BFF owns server-authoritative session state; the client holds only an opaque, HTTP-only reference.** The storage mechanism is a stack choice — both are valid:

- **Stateless BFF** — encode the session as a signed token (e.g. a JWT signed with a server-only secret) in an HTTP-only cookie. No server-side storage.
- **Stateful BFF** — keep the session in a server-side store (Redis, DB, edge KV) keyed by an opaque session id in an HTTP-only cookie.

Either way the cookie is HTTP-only (`sameSite: 'lax'`, `path: '/'`, ~30-day lifetime), the session is read/written only on the server, and the client never sees session secrets or raw commercetools credentials.

The session module exposes the same operations regardless of storage: `getSession()` (current session, or `{}` if none/invalid), `getLocale()` (resolve country/currency/locale from the session, falling back to the `your-shop-country-locale` cookie + `COUNTRY_CONFIG`), a write step (sign a token *or* upsert the store record), and set/clear of the opaque cookie.

```typescript
// <server>/session — the session shape is portable; storage + cookie binding are stack-specific
export interface Session {
  customerId?: string;
  customerEmail?: string;
  customerFirstName?: string;
  customerLastName?: string;
  cartId?: string;
  country?: string;
  currency?: string;
  locale?: string;
  // B2B adds: businessUnitKey, storeKey, storeId, distributionChannelId, supplyChannelId, productSelectionId
}
```

**Session fields:**

| Field | Set when | Cleared when |
|-------|----------|-------------|
| `customerId` | Login/register | Logout |
| `cartId` | Cart created or login | Order placed |
| `country/currency/locale` | Country selector | Never (persists) |

The storage mechanism and cookie read/write binding are stack-specific. 
> Find the adapter's `data-loading.md` for parrents of implementation.
> Example **Next.js (stateless BFF):** a `jose`-signed JWT in an HTTP-only cookie via `cookies()` (`next/headers`) + `NextResponse.cookies`, with `getSession` / `getLocale` / `createSessionToken` / `setSessionCookie` / `clearSessionCookie` — see the full `<server>/session` module in the adapter's [data-loading.md](../stack/nextjs/data-loading.md).

---

## Pattern 4: BFF Boundary

**INCORRECT:** Calling `<server>/ct/*` directly from a client component or a browser-side fetcher.

**CORRECT — every commercetools call goes through a server endpoint:**

```
Browser component
  → client data hook (hooks/*.ts)   — calls fetch('/<api>/...') / the framework's data loader
  → server endpoint                 — server-only, calls <server>/ct/*
  → <server>/ct/<namespace>.ts           — server-only, calls apiRoot
  → commercetools API
```

The server endpoint is your framework's request handler (Next.js Route Handler, Remix action/loader, Express route, etc.). Its concrete shape — and the rule that it does only three things (validate session → call `<server>/ct/<namespace>.ts` → return JSON) — is in adapter's `data-loading.md` file.
---

## Pattern 5: commercetools Helper Function Shape

**INCORRECT:** Inlining `apiRoot.carts().withId()...execute()` directly in a server endpoint. Or calling the commercetools REST API with raw `fetch()` — the SDK handles OAuth token lifecycle, automatic token refresh, and type safety; bypassing it means managing all of that manually.

**CORRECT — one function per operation, all in the matching `<server>/ct/` file:**

```typescript
// <server>/ct/<namespace>.ts
import { apiRoot } from './client';

export async function getThings(id: string) {
  // Destructure body from the SDK response — every .execute() returns { body, statusCode, headers }
  const { body } = await apiRoot.things().withId({ ID: id }).get().execute();
  return body;
}
```

**commercetools namespace files:**

| File | Owns |
|------|------|
| `<server>/ct/client` | `apiRoot` singleton |
| `<server>/ct/auth` | `signInCustomer`, `signUpCustomer`, `getCustomerById`, `updateCustomer` |
| `<server>/ct/cart` | All cart operations (create, addLineItem, removeLineItem, discounts, shipping) |
| `<server>/ct/orders` | `getOrderById`, `getCustomerOrders` |
| `<server>/ct/categories` | `getCategoryBySlug`, `getCategoryTree` |
| `<server>/ct/search` | `searchProducts`, `getProductBySku` |

---

## Pattern 6: Connection Health Check

After wiring up the client, verify credentials with a one-off health endpoint that calls `apiRoot.get().execute()` and returns the project key.

---

## Checklist

- [ ] SDK singleton and env vars set up per [sdk-setup.md](../../../commercetools-platform/references/sdk-setup.md)
- [ ] All commercetools calls go through `apiRoot` — no raw `fetch()` to commercetools REST endpoints
- [ ] Any session-signing secret / session-store credential is strong, server-only, and never exposed to the client bundle
- [ ] The session module exports `getSession`, `getLocale`, `createSessionToken`, `setSessionCookie`, `clearSessionCookie`
- [ ] Health check returns `{"ok":true}` with your project key

**Next:** [b2c/product-listing.md](../b2c/product-listing.md) or [b2b/product-listing.md](../b2b/product-listing.md)
