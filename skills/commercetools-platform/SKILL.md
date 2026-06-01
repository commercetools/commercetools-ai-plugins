---
name: commercetools-platform
description: Core commercetools API and SDK patterns — TypeScript SDK setup, ClientBuilder authentication, project data model (products, customers, orders, types, channels, stores), GraphQL vs REST patterns, query predicates, optimistic concurrency, rate limits, and platform observability. Foundational layer that storefront, MC app, Connect, and integration skills all reference. Use for any commercetools project regardless of surface.
when_to_use:
  - "Setting up a new commercetools project in TypeScript"
  - "Connecting to the commercetools API from any surface (storefront, MC app, Connect, serverless function)"
  - "Project data model — products, customers, orders, Custom Objects, Custom Types, ProductTypes"
  - "Channels (ProductDistribution, InventorySupply), stores, price selection with fallback"
  - "GraphQL vs REST, query predicates, cursor pagination, concurrency (version conflicts)"
  - "Rate limits, X-RateLimit-Remaining, Platform Insights APM integration"
  - "Product Search API vs Product Projection Search, facets, searchable attributes"
  - "Security: OAuth scopes, BFF pattern, brute-force protection, GDPR/HIPAA compliance"
  - "Project setup, key naming, region migration, Change History API"
metadata:
  contentType: SKILL
  area:
    - api
    - platform
    - search
    - observability
    - sdk
---

# commercetools TypeScript SDK

Foundational patterns for connecting to the commercetools API from TypeScript. These patterns are project-type agnostic — they apply whether you are building a Next.js storefront, a serverless function, or a CLI script.

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

**Use `/product-search` (not `/product-projections/search`) for all new implementations.** Product Projection Search does not support standalone prices, stores, or product selections. If the project uses `priceMode: Standalone` and queries Product Projection Search, results are silently inconsistent.

**Product Projection Search must be explicitly activated.** It returns `SearchDeactivated` by default and auto-deactivates after 30 days of inactivity. Activation triggers a full reindex.

**The Product Search API is ID-first.** Query results contain only product IDs. Follow up with a Product Projections query (filtering by returned IDs) or use the `productProjection` expansion to get names, images, prices, and attributes.

**`AttributeDefinition.isSearchable` must be `true` for an attribute to be searchable in Product Projection Search.** This cannot be changed without a full reindex. In the new Product Search API, all variant attributes are queryable via `variants.attributes.{name}` without needing `isSearchable`.

**CT semantic search (embedding-based) is in Early Access as of mid-2026.** Do not plan for GA-level SLAs until Q4 2026.

| Topic | Reference |
|-------|-----------|
| Product Search API — JSON query language, facets, sort, store scoping, ID-first pattern | [references/product-search-api.md](./references/product-search-api.md) |
| Product Projection Search — activation, full-text search, filter parameters, limitations | [references/product-projection-search.md](./references/product-projection-search.md) |

## Channels & Stores

**Channels are the unit of pricing and inventory segmentation; Stores are the unit of selling context.** A Channel carries either a `ProductDistribution` role (prices) or an `InventorySupply` role (stock). A Store groups one or more channels and applies that grouping to all product projections, carts, and orders created within it. Don't model these as the same thing.

**Always include fallback (no-channel) prices alongside channel-specific prices.** Without a fallback price, any query made without `priceChannel` returns a variant with no `price` field — breaking admin tools, OMS integrations, and any context that doesn't pass channel context.

**Price selection runs in two stages when using store context.** The store filters the visible price list first (removes prices from channels not in the store's distribution channels). The `priceChannel` query parameter or `distributionChannel` on the line item then selects the single best-matching price from that filtered list. Both stages must be correct.

**`supplyChannel` on a line item must match the store's supply channels.** If the cart is bound to a store, every line item's `supplyChannel` must be one of the channels listed in that store's supply channels. Mismatches cause request failures.

**Global vs. store-specific customers is an irreversible architectural decision.** A customer is either global (project-level) or store-specific — never both. Store-specific customers only see resources inside their store. This choice must be made during design; migrating later requires customer data migration.

**In-store carts are invisible to the project-level cart API.** `GET /{projectKey}/carts` does not return in-store carts. Query `/in-store/key=<storeKey>/carts` for store-scoped cart lookups.

**Product Projection Search does not apply product selection filtering.** The `product-projections/search` endpoint in-store does not restrict results to the store's product selections. Use the non-search in-store product projection endpoint for assortment-gated browsing.

**B2B company-specific pricing is best modeled with one store + distribution channel per buyer context.** Associate the store with the buyer's Business Unit. Add a product price for each distribution channel. The platform then automatically returns the right price for each buyer without any application-layer price lookup logic.

**Business Unit `storeMode: FromParent` vs. `Explicit` controls store inheritance.** Divisions with `FromParent` use the parent's stores (and thus the parent's pricing). Divisions needing independent pricing must use `storeMode: Explicit` and have their own stores assigned.

**Channels can be customized with custom types.** Attach a custom type to the channel resource to store warehouse addresses, external system IDs, or other channel-level metadata. This avoids proliferating custom objects for channel-related metadata.

| Topic | Reference |
|-------|-----------|
| Channel concept, all channel roles, channel-based prices and inventory | [references/channels-concept.md](./references/channels-concept.md) |
| Store concept, global vs. store customers, API support, store projection behavior | [references/stores-concept.md](./references/stores-concept.md) |
| Store and channel modeling patterns — one-to-one, multi-brand, multi-country, B2B | [references/store-channel-modeling.md](./references/store-channel-modeling.md) |
| Price channel selection mechanics — selection criteria, fallback strategy, two-stage filtering | [references/price-channel-selection.md](./references/price-channel-selection.md) |
| Product Selections — store-specific catalogs, B2B/Business Unit contexts | [references/product-selections.md](./references/product-selections.md) |
| Business Units, associate roles, company-specific pricing, storeMode inheritance | [references/business-units-stores.md](./references/business-units-stores.md) |

## Data Modeling

**Custom Objects (CoCo) are a key-value store — not a relational database.** Each CoCo is a JSON blob stored in a named container. There are no foreign keys, no joins, no schemas enforced by CT. Use CoCo for configuration data, lookup tables, session state, loyalty balances, and feature flags. CoCo write throughput is lower than cart or order writes; never use it as a high-frequency write store.

**Custom Types extend built-in resources; Custom Objects extend nothing.** Use Custom Types + Custom Fields when you need to attach structured data to an existing CT resource (cart, order, customer, line-item) so the data is co-located and part of the resource's version history. Use Custom Objects for stand-alone data with no parent resource. Custom Types are global within a project — changes affect all resources using that type. Never remove or rename a field that production data depends on — add new fields instead.

**CT's organization hierarchy: Organization → Project → Store.** Use multiple stores (not projects) for multi-region or multi-brand within the same data domain. Use multiple projects for true data isolation (e.g., separate production and staging environments).

**Nested attribute type is not searchable and cannot be used for promotions.** Use Nested for tabular, structured data that is read-heavy and rarely updated (e.g., nutritional info). For searchable or discount-targetable attributes, use flat attribute types (String, Enum, Number, etc.).

**Attribute constraints (`SameForAll`, `Unique`, `CombinationUnique`, `None`) cannot be changed without migration.** Plan attribute constraints during ProductType definition. `SameForAll` attributes cannot vary by variant.

**Optimistic concurrency is the only consistency mechanism.** Every CT resource has a `version` field. Updates must pass the current `version`; if another write happened in between, you get a `ConcurrentModification` error (409). Retry with the latest version — do NOT reuse the version from the failed request. Implement exponential backoff for contended resources.

**The Import API is async by design — design for eventual consistency.** Import operations are placed into a container and processed asynchronously. There is no ordering guarantee even within a single container. Batch size is max 20 operations per request.

**`productDraftImport` replaces the whole product.** Any field not included in the draft (attributes, variants, prices, images) is deleted. Use `productVariantPatch` for targeted attribute updates on existing products.

**Bundle modeling in CT is always external orchestration.** CT has no native bundle type. The standard pattern is: a "bundle" product variant holds child SKU references (via a Reference attribute or custom fields); the BFF/backend explodes the bundle into individual line items at add-to-cart time.

| Topic | Reference |
|-------|-----------|
| Custom Objects — container/key design, JSON schema, use cases, limitations | [references/custom-objects.md](./references/custom-objects.md) |
| CT organizations — org vs project vs store hierarchy, use cases for each level | [references/ct-organizations.md](./references/ct-organizations.md) |
| Customer profiles — data model, profile fields, extensibility, guest vs registered | [references/customer-profiles.md](./references/customer-profiles.md) |
| Data integrity — eventual consistency, ConcurrentModification, retry patterns | [references/data-integrity.md](./references/data-integrity.md) |
| Product data modeling — hierarchy, all 14 attribute types, Nested vs Custom Object | [references/product-data-modeling.md](./references/product-data-modeling.md) |
| Product attributes — attribute types, constraints, lenum vs enum, Set attributes | [references/product-attributes.md](./references/product-attributes.md) |
| Inventory modeling — supply channels, inventory entries, reservations, backorder | [references/inventory-modeling.md](./references/inventory-modeling.md) |
| Import API — containers, batching, async processing, ordering guarantee, delta imports | [references/import-api.md](./references/import-api.md) |
| Image management — image upload, CDN considerations, image ordering | [references/images.md](./references/images.md) |
| Reviews & Ratings — Review resource model, rating field, moderation via State Machines | [references/reviews-and-ratings.md](./references/reviews-and-ratings.md) |

## Security & Auth

**Scope your API clients to the minimum required.** commercetools uses granular OAuth scopes (`manage_orders`, `view_products`, etc.) — every client should have exactly the scopes it needs, nothing more. Frontend clients should never hold `manage_*` scopes; use BFF patterns.

**CT does not provide built-in brute-force protection for the Password Flow.** Your BFF or API gateway must implement rate limiting, CAPTCHA, and lockout logic. Use an external identity provider (Auth0, Cognito, Okta) for enterprise-grade brute-force protection.

**HIPAA/PHI: CT is not HIPAA-compliant out of the box for storing ePHI.** Do not store Protected Health Information in CT custom fields, customer profiles, or order notes unless a BAA is in place with commercetools.

**For social login, the pattern is: IDP handles authentication, CT creates/updates the customer.** Use the `externalId` field on the CT customer to store the IDP's user ID for future lookups.

**Project keys are immutable — plan your naming convention upfront.** Once a project is created with a key, that key cannot be changed. Common pattern: `<client>-<environment>` (e.g., `acme-prod`, `acme-staging`).

**Pagination with `offset` breaks above 10,000 results.** Use `where=id > "<last-seen-id>"` + `sort=id asc` + `limit=500` and page via the last returned ID for full-dataset traversal.

**Change History API Basic plan only tracks Merchant Center changes.** API and Import API changes are invisible on Basic. Customers relying on Basic for compliance audits routinely discover this gap too late.

**GraphQL is better for read-heavy frontend queries; REST is better for writes and system integrations.** CT's GraphQL API does not support all resources available in REST (e.g., Import API, Subscriptions).

| Topic | Reference |
|-------|-----------|
| Accessing CT — OAuth flows, client credentials, password flow, token scopes | [references/accessing-commercetools.md](./references/accessing-commercetools.md) |
| Brute force & DDoS — rate limiting, WAF, CAPTCHA, lockout patterns, IDP delegation | [references/brute-force-ddos.md](./references/brute-force-ddos.md) |
| HIPAA compliance — PHI, ePHI, HDA, BAA requirements, design patterns for healthcare | [references/hipaa-compliance.md](./references/hipaa-compliance.md) |
| Customer password management — reset flow, changePassword, token lifecycle | [references/customer-password.md](./references/customer-password.md) |
| Social login & SSO — OIDC integration, IDP token verification, CT customer linking | [references/social-login.md](./references/social-login.md) |
| IDP user creation flows — Auth0/Cognito/Okta → CT customer sync, externalId pattern | [references/idp-user-creation.md](./references/idp-user-creation.md) |
| Rate limits — per-resource limits, rate limit headers, quota increase requests | [references/rate-limits.md](./references/rate-limits.md) |
| Change History API — Basic vs Premium, payload structure, compliance decision guide | [references/change-history.md](./references/change-history.md) |
| GraphQL examples — query patterns, fragments, variables, pagination in GraphQL | [references/graphql-examples.md](./references/graphql-examples.md) |
| Complex queries — OR predicates, negation, nested predicates, common patterns | [references/complex-queries.md](./references/complex-queries.md) |
| Pagination — offset limits, cursor pattern, sort+ID technique | [references/pagination.md](./references/pagination.md) |
| Content encoding — gzip, Accept-Encoding, large response handling | [references/content-encoding.md](./references/content-encoding.md) |
| commercetools UUIDs — ID format, ID stability, resource references by typeId+id | [references/ct-uuid.md](./references/ct-uuid.md) |
| Deprecation policy — versioning, notice periods, how to track deprecated APIs | [references/deprecation-policy.md](./references/deprecation-policy.md) |

## Platform Insights

**Platform Insights forwards server-side CT metrics to your APM — zero code changes required.** Configuration is entirely via the `/insights-configuration` API endpoint. CT pushes five metrics (`ct_time_sec`, `ct_response_count`, `ct_sent_bytes`, `ct_received_bytes`, `ct_error_count`) directly to your APM once configured.

**Start with `"eventTypes": ["Metrics"]` only.** As of early 2026, log forwarding produces only heartbeat messages (`"Logs"` has a known open bug). Configure metrics only until this is resolved.

**`POST` (not `PUT`) to `/insights-configuration` to add a provider without replacing existing ones.** `PUT` replaces the entire configuration — any previously configured providers are silently removed.

**All five metrics can be faceted by `endpoint`, `http_status`, `http_method`, and `project_key`.** Use `endpoint` as your primary dimension to identify slow or error-prone API routes.

**Allow 15 minutes for configuration changes to propagate before troubleshooting.** Generate test traffic after setup and wait before assuming misconfiguration.

**Platform Insights is in Public Beta.** Pricing as of March 2026: ~1000 EUR/month including 5 projects. Confirm current pricing with the CSM before recommending it in a proposal.

See [references/platform-insights.md](./references/platform-insights.md) for provider setup (New Relic, Datadog, Dynatrace, OpenTelemetry), sample NRQL/Datadog queries, known issues, and pricing details.

---

## Priority Tiers

### CRITICAL

- **Never expose `manage_*` scoped tokens to the browser.** Any write operation must go through a BFF that holds a narrow-scoped token server-side.
- **CT does not throttle Password Flow login attempts.** Implement rate limiting, CAPTCHA, and account lockout in your BFF.
- **Do not store PHI in CT unless you have a BAA.** CT's standard DPA covers GDPR but not HIPAA.
- **Project keys cannot be changed.** Establish a key naming convention before creating any project.
- **`offset` pagination breaks above 10,000 results.** Use the sort+ID cursor pattern for full-dataset exports.
- **Always include fallback (no-channel) prices alongside channel-specific prices.** Without a fallback price, any query made without `priceChannel` returns a variant with no `price` field — breaking admin tools, OMS integrations, and any context that doesn't pass channel context.
- **Global vs. store-specific customers is an irreversible design decision.** Make this choice during project design — there is no built-in migration path.
- **`supplyChannel` on a line item must match the store's supply channels.** Design supply channel assignment logic to enforce this constraint before calling the API.
- **Never use CoCo as a high-frequency write store.** Use CT custom fields on the resource itself or an external cache instead.
- **`productDraftImport` is destructive.** Any field not included in the draft is deleted. Use `productVariantPatch` for targeted updates.
- **Version conflicts (409 ConcurrentModification) require retry with the latest version.** Do NOT use the version from the failed request. Fetch the current resource version, apply update actions again, and retry.
- **Do not enable `"Logs"` in Platform Insights in production.** As of early 2026, log forwarding produces only heartbeat messages. Configure `"eventTypes": ["Metrics"]` only.
- **`PUT` on `/insights-configuration` replaces the full configuration.** Use `POST` to append a provider.
- **Use `/product-search` (not `/product-projections/search`) when the project uses standalone prices.** Product Projection Search silently returns inconsistent results for `priceMode: Standalone`.
- **Product Projection Search must be activated before use.** It returns `SearchDeactivated` by default.
- **The Product Search API is ID-first — results do not include full product data.** Make a second request to get names, images, prices, and attributes for the PLP.

### HIGH

- **`externalId` is the link between CT customers and external identity providers.** Always set it on customer creation from an IDP flow.
- **GDPR deletion: CT's `deleteCustomer` removes PII but not order history.** Anonymize personal data fields on orders before deleting the customer if required.
- **Rate limit headers are returned on every CT API response.** Log `X-RateLimit-Remaining` and alert when it drops below 20%.
- **Change History Basic plan is blind to API-initiated changes.** Verify the plan before committing to Change History as a compliance mechanism.
- **In-store carts are not visible via the project-level cart listing.** Use `/in-store/key=<storeKey>/carts` for any store-scoped cart query.
- **Product Projection Search does not filter by product selections.** Use the non-search in-store product projections endpoint or apply post-filtering.
- **B2B Division `storeMode` must be `Explicit` for independent pricing.** Divisions with `FromParent` use the parent's pricing channels.
- **Nested attributes are not searchable and cannot target discount predicates.** Use flat attribute types for any attribute that must appear in search filters or cart discount predicates.
- **Batch size for Import API is max 20 operations per request.** Always chunk.
- **Custom Types are global within a project — changes affect all resources using that type.** Never remove or rename a field that production data depends on.
- **Validate Platform Insights metric flow before building dashboards.** Confirm `ct_response_count` and `ct_time_sec` appear in your APM within 15 minutes of setup.
- **Use `FACET endpoint` in every Platform Insights query.** Without faceting by endpoint, aggregated metrics mask which routes are slow or erroring.
- **For external search, subscribe to both product and standalone price messages.** `ProductPublished` does not include standalone price changes — subscribe separately to `StandalonePriceCreated/Changed/Deleted`.
- **`AttributeDefinition.isSearchable` must be `true` for an attribute to be searchable in Product Projection Search.** Cannot be changed without a full reindex.
- **Subscriptions are at-least-once delivery — build idempotent handlers.** Use `sequenceNumber` or `resourceVersion` to detect and skip duplicates.

### MEDIUM

- **For peak events, request rate limit increases 2 weeks minimum before the event.** Include projected RPS in the request to commercetools support.
- **`Accept-Encoding: gzip` reduces payload size by 60–80% for list responses.** Always send this header for large list queries.
- **Password reset tokens in CT expire after 10 minutes by default.** Design email delivery to be fast.
- **CoCo is the right place for feature flags and project-level configuration.** Use a single entry with a well-known key (e.g., container: `feature-flags`, key: `global`).
- **Standalone prices via Import API support `validFrom`/`validUntil`** for time-limited pricing without product republication.
- **Batch multiple update actions into a single API call to reduce version conflicts.** Combine all update actions into one request with an `actions` array.
- **Product Projection Search auto-deactivates after 30 days of no calls.** Add a scheduled canary call for staging environments.
- **Channels support custom types for extended metadata.** Use a custom type on the channel resource to store warehouse addresses or external system IDs.
- **Platform Insights pricing is Beta.** Confirm commercials with the CSM before go-live.
- **Notify CS/support before large imports (>1M records) in production.** CT support needs visibility on large load events.
- **Limit default of 100 channels per role and per store may require a quota increase.** Plan ahead for projects with 100+ physical locations.
- **CT semantic search is in Early Access as of mid-2026.** Do not plan for GA-level SLAs on CT semantic search until Q4 2026.
