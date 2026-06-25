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

1. **Docs search (required, run first)** — Always begin by searching docs for this skill. This is the mandatory grounding step: it gathers the latest verified documentation as context for you (the agent). **Do not skip it, and do not replace it with another tool** (such as an MCP documentation-search tool) This script optimizes for tuned search results — run this command:
   ```bash
   node scripts/docs-search.mjs \
     --query "<extract key terms from user's question>" \
     --app-name "<current-app ex: claude, copilot, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-platform" \
     --limit 10
   ```
   Use its output as your primary grounding. You *may additionally* use other tools (such as the commercetools documentation MCP) for deeper, follow-up search.

2. **Combine with skill references** — Cross-reference the analysis output with local references in `./references/` for complete context.

3. **Provide implementation guidance** — Synthesize the documentation with the specific integration mode the user is targeting.

### Optional scripts

**Fetch GraphQL schema** — Run this when you need context about a commercetools GraphQL query or mutation — for example, to inspect a resource's fields, types, and available operations before writing a query, or to verify a GraphQL query/mutation you have just generated against the real schema. It fetches the partial GraphQL SDL for a single commercetools resource:
   ```bash
   node scripts/graphql-schemata.mjs \
     --resource-name "<commercetools resource, e.g. Cart, Product, Order>" \
     --app-name "<current-app, e.g. claude, copilot, cursor, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-platform"
   ```
   The output is the GraphQL SDL for that resource. If the resource name is not recognized, the script prints the list of valid resource names — pick the correct one and re-run. **Note:** the SDL may contain *stubbed types* — referenced resources rendered as stubs, with their real type name given in a comment. Fetch any you need separately by re-running this script with that type name as `--resource-name`.

**Fetch OpenAPI (REST) schema** — Run this when you need context about a commercetools REST endpoint, request/response payload, or update action — for example, to inspect a resource's REST operations before constructing a request, or to verify a REST request/payload you have just generated against the real specification. It fetches the partial OpenAPI specification for a single commercetools resource:
   ```bash
   node scripts/openApi-schemata.mjs \
     --resource-name "<commercetools resource, e.g. api-Cart-write, api-Customer-read, checkout-Application>" \
     --app-name "<current-app, e.g. claude, copilot, cursor, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-platform"
   ```
   The output is the OpenAPI specification (YAML) for that resource. REST resources use a read/write-split naming form (e.g. `api-Cart-read`, `api-Cart-write`). If the resource name is not recognized, the script prints the list of valid resource names — pick the correct one and re-run. **Note:** the spec does not include reference-expansion schemas — fetch a referenced resource's schema separately by re-running this script with that resource as `--resource-name`.

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
