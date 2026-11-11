---
name: entity-coverage
description: "Which commercetools resources this skill migrates, which are opt-in, which only have an Import API type, and which the skill does not touch; the step-0 question on which entities are in scope; what to do when a user asks for one of the others."
metadata:
  contentType: REFERENCE
---

# Entity coverage

Read this when the user names a resource other than products, categories, prices or
stock ("and the customers", "what about discounts?"), and in step 0 when deciding
which entities are in scope. It answers two separate questions per resource: does the
Import API have a type for it, and does this skill's pipeline load it. A resource can
have the first without the second.

The resource list comes from the OpenAPI schemata in the Knowledge MCP (the `api-*`
resource names), and the Import API column from the
[`ImportResourceType`](https://docs.commercetools.com/api/import-export/import-container.md#importresourcetype)
values, both checked in November 2026. Re-check both before relying on a row: a type
added since is exactly what this table cannot show.

Columns:

- **Import API**: the resource type value, or "none" when the resource can only be
  created through the platform API.
- **This skill**: **feed record** is read from the feed and loaded through the Import
  API; **prerequisite** is created by `load` through the platform API, because the
  Import API cannot, and removed again only by `teardown --include-created-prerequisites`
  and only when `load` created it; **no** means no stage of the pipeline reads, loads, verifies or
  tears it down.

## Catalog

| Resource | Import API | This skill | Where |
| :--- | :--- | :--- | :--- |
| Product Type | `product-type` | feed record, derived from `attributeDefinition` records | [product-model.md](product-model.md) |
| Category | `category` | feed record | [categories-and-slugs.md](categories-and-slugs.md) |
| Product, with embedded variants | `product-draft` (also `product`, `product-variant`, `product-variant-patch`) | feed record, under `Classic` | [catalog-feed-contract.md](catalog-feed-contract.md) |
| Variant, standalone | `variant` | feed record, under `Modular` | [product-model.md](product-model.md) |
| Product Selection | `product-selection` | feed record | [feed-assortments.md](feed-assortments.md) |
| Store | none | feed record, created through the platform API and loaded last; removed again only by `teardown --include-created-prerequisites` | [feed-assortments.md](feed-assortments.md) |
| Product Tailoring | `product-tailoring` | no | |
| Attribute Group | none | no | |

## Prices and stock

| Resource | Import API | This skill | Where |
| :--- | :--- | :--- | :--- |
| Embedded price | `price` | feed record, when `target.priceMode` is embedded | [pricing-and-money.md](pricing-and-money.md) |
| Standalone Price | `standalone-price` | feed record, when `target.priceMode` is standalone | [pricing-and-money.md](pricing-and-money.md) |
| Inventory Entry | `inventory` | feed record, opening stock per SKU and supply channel; no running inventory | [feed-prerequisites.md](feed-prerequisites.md) |
| Channel | none | prerequisite | [feed-prerequisites.md](feed-prerequisites.md) |
| Customer Group | none | prerequisite | [feed-prerequisites.md](feed-prerequisites.md) |
| Tax Category | none | prerequisite | [feed-prerequisites.md](feed-prerequisites.md) |

## Customers and B2B

| Resource | Import API | This skill | Where |
| :--- | :--- | :--- | :--- |
| Customer, with addresses | `customer` | feed record, **opt-in** (`entities.customers`), no passwords | [feed-customers.md](feed-customers.md) |
| Business Unit, with its associates | `business-unit` | no | |
| Associate Role, Approval Rule, Approval Flow | none | no | |
| Customer token | none | no | |

## Orders, carts and payments

| Resource | Import API | This skill | Where |
| :--- | :--- | :--- | :--- |
| Order: number verbatim, line items, totals, tax, addresses, states | `order` | feed record, **opt-in** (`entities.orders`); unknown SKUs as custom line items | [feed-orders.md](feed-orders.md) |
| Order shipping info, deliveries, returns | `order`, `order-patch` | no | |
| Order Edit | none | no | |
| Cart, Quote Request, Staged Quote, Quote | none | no | |
| Shopping List | none | no | |
| Recurring Order, Recurrence Policy | none | no | |
| Payment, Payment Method | none | no | |
| Review | none | no | |

## Discounts

| Resource | Import API | This skill | Where |
| :--- | :--- | :--- | :--- |
| Discount Code | `discount-code` | no | |
| Cart Discount, Product Discount, Discount Group | none | no | |

## Project configuration and platform

| Resource | Import API | This skill | Where |
| :--- | :--- | :--- | :--- |
| Custom Type | `type` | no | [categories-and-slugs.md](categories-and-slugs.md) notes category custom fields as out of scope |
| Zone, Shipping Method, State | none | no | |
| Custom Object | none | no | |
| Subscription, API Extension | none | no | |
| Commerce MCP Server, Connect deployment, Checkout application | none | no | |
| API Client, Project settings | none | no; `preflight --apply` adds missing locales and currencies, nothing else | [preflight.md](preflight.md) |

Product Projection, Variant Projection, Messages and change history are read models or
system records. There is nothing to migrate into them.

## In step 0: which entities are in scope

Ask this from what discovery (0b) found, not from what the user mentioned. An
export handed over "for the catalog" routinely holds customer, order or review
files, and nobody decided anything about them by handing them over.

1. **List what the source holds**, by entity and with a count: "1,240
   customers in `customers.csv`, 3 years of orders in `orders/`". Map each to its
   row in the tables above.
2. **Write one interview row per entity found**, in its own block of
   `INTERVIEW.md`, asking whether it is in scope. Recommend the catalog rows; for
   anything marked opt-in, recommend nothing and name the consequence: customers
   and orders are personal data, and the yes belongs to whoever is accountable
   for it. For orders, add the subscriptions question in
   [feed-orders.md](feed-orders.md#ask-about-subscriptions-before-the-first-load).
3. **Customers and orders default to out.** Only a written yes in the interview
   file sets `entities.customers` or `entities.orders` to `true`; a request for
   "everything" is not that yes, because the person asking has not seen what
   "everything" contains. A no sets the switch to `false`, so the pipeline
   ignores those records instead of refusing the feed.
4. **Record every entity found**: in scope with the config switch it set, or in
   the mapping proposal's "Not migrating" section and in `DECISIONS.md`, with
   the count. An entity dropped without an entry is the gap someone finds at
   cutover.

An entity marked "no" can still be in the export and in the answer: a yes for it
means the steps below, not a load.

## When the user asks for a resource marked "no"

1. Say it is outside what this pipeline loads, and name the row. Do not improvise a
   partial load: without `validate`, `audit`, `verify` and a prefix-scoped `teardown`,
   a hand-built import has none of the checks that make the catalog load safe.
2. If the Import API column has a type, point to its
   [Import Resources](https://docs.commercetools.com/api/import-export/import-resources.md)
   entry, and say the engagement owns the rest: key scheme, ordering, verification
   and removal. If it says "none", the platform API is the only route.
3. Record the entity in `DECISIONS.md` as not migrated, with who was told and what
   they decided, so the gap is a decision and not a surprise at cutover.
4. For ongoing synchronisation of any entity, use the `commercetools-integrations`
   skill. For discount, B2B and order-flow modelling, use the
   `commercetools-commerce-patterns` skill.

Credentials, payment tokens and PSP references are never migrated for any resource:
they are not portable, and re-keying them breaks reconciliation with the provider.

## Checklist

- [ ] Every entity discovery found in the source has an interview row asking
      whether it is in scope, and an answer.
- [ ] `entities.customers` and `entities.orders` are `true` only with a written
      yes in the interview, and `false` for a no.
- [ ] Every entity the user named has a row here, and its answer was given from the
      row rather than from memory.
- [ ] Each entity marked "no" is in `DECISIONS.md` as not migrated.
- [ ] The Import API column was re-checked against the current `ImportResourceType`
      values before it was relied on.
