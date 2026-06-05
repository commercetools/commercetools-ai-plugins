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

1. **Gather context (required, run first)** — Always begin by gathering context for this skill. This is the mandatory grounding step: it gathers the latest verified documentation as context for you (the agent). **Do not skip it, and do not replace it with another tool** (such as an MCP documentation-search tool) — run this command:
   ```bash
   node scripts/gather-context.mjs \
     --query "<extract key terms from user's question>" \
     --client-name "<current-client>" \
     --model "<current-model>" \
     --skill-name "commercetools-platform" \
     --limit 3
   ```
   Use its output as your primary grounding. You *may additionally* use other tools (such as the commercetools documentation MCP) for deeper, follow-up search.

2. **Combine with skill references** — Cross-reference the analysis output with local references in `./references/` for complete context.

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
