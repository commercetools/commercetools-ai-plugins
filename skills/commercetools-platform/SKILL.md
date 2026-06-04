---
name: commercetools-platform
description: Core commercetools API and SDK patterns — TypeScript SDK setup, ClientBuilder authentication, project data model (products, customers, orders, types, channels, stores), GraphQL vs REST patterns, query predicates, optimistic concurrency, rate limits, and platform observability. Foundational layer that storefront, MC app, Connect, and integration skills all reference. Use for any commercetools project regardless of surface.
when_to_use:
  - "Setting up a new commercetools project in TypeScript"
  - "Connecting to the commercetools API from any surface (storefront, MC app, Connect, serverless function)"
  - "Implementing product search with the Product Search API"
metadata:
  contentType: SKILL
  area:
    - api
    - sdk
---

# commercetools TypeScript SDK

Foundational patterns for connecting to the commercetools API from TypeScript. These patterns are project-type agnostic — they apply whether you are building a Next.js storefront, a serverless function, or a CLI script.

## Workflow

When this skill is invoked, always follow these steps:

1. **Search documentation first** — Before providing any guidance, fetch the latest documentation:
   ```bash
   node scripts/docs-search.mjs \
     --query "<extract key terms from user's question>" \
     --client-name "<current-client>" \
     --model "<current-model>" \
     --skill-name "commercetools-platform" \
     --limit 3
   ```
   Use the search results to inform your response with current, accurate information.

2. **Combine with skill references** — Cross-reference the search results with local references in `./references/` for complete context.

3. **Provide implementation guidance** — Synthesize the documentation with the specific integration mode the user is targeting.

## SDK Setup

See [sdk-setup.md](./references/sdk-setup.md) for:
- Package installation (`@commercetools/platform-sdk` + `@commercetools/ts-client`)
- `ClientBuilder` singleton with Client Credentials flow
- Required environment variables and auth URLs by region
- Required API client scopes

## Product Search API

See [product-search.md](./references/product-search.md) for:
- Official docs and why the legacy `productProjections` search is deprecated
- Full-text + filter + sort + facets example
- Category filter, SKU lookup, price selection, discount expansion, BOPIS channel filtering
