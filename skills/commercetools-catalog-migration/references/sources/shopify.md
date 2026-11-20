---
name: sources-shopify
description: "Shopify as the source: the questions to ask first (Markets, apps, variant counts), why the Admin API with read scopes is the access path and what the admin CSV export leaves out, how to extract with bulk operations, where the catalog lives, and the tax and stock specifics."
metadata:
  contentType: REFERENCE
---

# Shopify as the source

Read this when the source is a Shopify store. It applies the rules of
[source-access.md](../source-access.md) to one platform, and each point is a
lead to confirm against the store, not a finding: profile the export before
relying on any of it ([source-discovery.md](../source-discovery.md#the-rule)).

Shopify facts change with its quarterly API versions. Check each one against
[shopify.dev](https://shopify.dev/docs/api/admin-graphql) for the version you
extract with, not against this page or memory.

- [Ask first: markets, apps and variant counts](#ask-first-markets-apps-and-variant-counts)
- [Which access path works](#which-access-path-works)
- [Extracting with bulk operations](#extracting-with-bulk-operations)
- [Where the catalog lives](#where-the-catalog-lives)
- [Tax](#tax)
- [Stock](#stock)
- [The example extractor and adapter](#the-example-extractor-and-adapter)
- [Checklist](#checklist)

## Ask first: markets, apps and variant counts

Ask the business before writing the access request. The answers change what
to extract and which questions go into the interview:

- **Markets.** A store selling into several markets can hold a price list per
  market, with fixed prices or a percentage adjustment, while a variant's own
  price is in the shop currency only. Ask which markets sell, in which
  currencies, and whether their prices are fixed or derived. Each fixed price
  list is a price scope question
  ([pricing-and-money.md](../pricing-and-money.md#price-scope)).
- **Apps that hold catalog data.** Reviews, product options, bundles and
  subscriptions apps keep their data in metafields, metaobjects or their own
  backend. Ask which apps are installed and which of their data the new shop
  needs, then look for their metafield namespaces in the export.
- **Variant counts.** Shopify allows up to 2,048 variants and 3 options per
  product. The commercetools `Classic` catalog model holds up to 100 variants
  per product and `Modular` up to 10,000
  ([limits](https://docs.commercetools.com/api/product-catalog-apis-overview.md)),
  so size the largest product before the catalog model question.

## Which access path works

- **The Admin GraphQL API, with read scopes only.** Unlike Magento, Shopify
  separates `read_` from `write_` scopes, so a token can be read-only by
  construction. Ask for `read_products`, `read_inventory` and
  `read_locations`, plus `read_locales` to learn the shop's languages, and
  `read_translations` or `read_markets` only if translations or market prices
  are in scope. Any `write_` scope also grants reading, so refuse a token that
  holds one rather than accept it as "read access"
  ([access scopes](https://shopify.dev/docs/api/usage/access-scopes)).
- **Who creates the token.** New custom apps are created in Shopify's Dev
  Dashboard, not in the store admin, and the store owner installs them. A token
  from the client credentials grant works only for a store in the app's own
  organization, and expires after 24 hours
  ([client credentials](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant)).
  Let the store's administrator create the app and hand over the token, and
  take the snapshot the same day.
- **The admin CSV export** (Products > Export) needs no credentials, and is
  the path when the business will not grant API access. Check what it leaves
  out before relying on it: stock per location (its quantity column covers a
  single location only), variant metafields, collections (import only),
  translations (a separate export), and market prices except for markets with
  one unshared catalog
  ([CSV columns](https://help.shopify.com/en/manual/products/import-export/using-csv)).
  Each gap becomes a second request or an interview question.
- **The Storefront API is the storefront.** It shows what a shopper sees on a
  sales channel, not the catalog: use it to cross-check a count at most
  ([derived stores](../source-access.md#derived-stores-are-not-the-source)).

## Extracting with bulk operations

An Admin API pull is a snapshot like any other: one extraction into files
under `source-export/`, and an adapter that reads the files
([an API as the source](../source-access.md#an-api-as-the-source)).

- **Use bulk operations, not paging.** `bulkOperationRunQuery` runs one query
  over the whole catalog and leaves a JSONL file. A bulk query holds at most 5
  connections, nested at most 2 deep, so split the catalog into several
  operations, and join the lines by `__parentId`: each child object is a line
  of its own after its parent
  ([bulk queries](https://shopify.dev/docs/api/usage/bulk-operations/queries)).
  Download the result promptly; its URL expires.
- **Pin a stable API version you checked.** A request for a version that is
  no longer supported is served by a newer one, and the response header
  `X-Shopify-API-Version` names the version that answered. Compare it with the
  one asked for, and stop on a difference
  ([versioning](https://shopify.dev/docs/api/usage/versioning)).
- **Leave deprecated fields out.** A later version removes them, and a query
  naming a removed field fails as a whole. GraphQL introspection lists only the
  current fields by default, so check the query's fields against it.
- **Collections need 2026-07 or later.** Older versions leave out collections
  that use sub-collections or mixed sources, without an error
  ([new collection model](https://shopify.dev/changelog/new-collection-model-and-apis-now-available)).
- **Keep the token on the shop's host.** Send it only to the
  `{shop}.myshopify.com` Admin API, in an environment variable, never as an
  argument. The result file downloads from a signed URL on another host, which
  needs no token.

## Where the catalog lives

- **Products, options and variants.** A product has up to 3 options, and each
  variant one value per option. A product with only the default variant has
  the option "Title" with the value "Default Title": that is no axis. An option
  name such as "Size" can mean different things on different products, and one
  size can be written two ways (`100mm` and `100`): profile the values per
  option name before deriving axis codes
  ([derive a code](../writing-an-adapter.md#rules-that-matter)).
- **Handles and SKUs.** The handle is unique per store and makes a natural
  product code and slug, but the merchant can rename it. The SKU is optional
  in Shopify and often empty; an empty SKU has no defensible variant key, so it
  is a question for the business, never a value to invent silently.
- **Status.** Products are `ACTIVE`, `DRAFT`, `ARCHIVED` or `UNLISTED` (sold,
  but hidden from search and collections). Ask which statuses migrate, and
  report the rest by count.
- **Gift cards.** `isGiftCard` marks them. In commercetools a gift card is a
  payment method backed by an external gift card system, not a product
  ([gift card integration](https://docs.commercetools.com/guides/gift-card-integration.md)),
  so loading one as a product would sell a balance that nothing issues. Report
  them and ask how gift cards are issued in the new shop.
- **Collections are not a tree.** They are flat, and a product sits in any
  number of them. A collection is rule-based when its source has conditions;
  its membership is read as it stood at the export, and the rules are not
  carried. Sub-collections are a membership reference, not a nesting. The
  storefront's navigation tree lives in menus (`read_online_store_navigation`):
  ask whether the categories come from the collections, the menus or the
  product type. Product order within a collection is not carried
  ([report it](../categories-and-slugs.md#product-order-within-a-category-is-not-carried)).
- **Metafields and metaobjects.** Typed values per namespace and key, written
  by the merchant or by apps. Carry the ones the business names as attributes,
  typed from the metafield type, and report the rest by namespace and key.
- **Compare-at price.** The "was" price beside the selling price, with no
  price field of its own in commercetools. A money attribute stores the figure,
  as commercetools suggests for an MSRP, but the storefront has to read it; a
  strikethrough price commercetools computes comes from a Product Discount,
  which is a pricing decision
  ([best practices](https://docs.commercetools.com/learning-price-and-discount-your-products/price-calculation/best-practices.md)).
  Ask, never fold it into the price, and report it either way.
- **Images.** Media belong to the product, and a variant can name some of them
  as its own; commercetools attaches images to variants. The URLs point at
  Shopify's CDN. Whether they keep working after the store closes is not
  documented, so re-hosting before the old store goes is an open obligation:
  record its owner ([media](../writing-an-adapter.md#media)).
- **Texts and languages.** Product texts are in the shop's primary language;
  translations are separate resources. File texts under a locale of that
  language, never under the project's default because it exists.
- **Not in the feed contract:** SEO titles and descriptions, the Shopify
  product taxonomy category, tags, barcodes, weights and URL redirects. Report
  each by count, and ask whether redirects matter to the storefront.

## Tax

- **The taxable flag is per variant**, and commercetools holds the tax category
  on the product. Check that a product's variants agree
  ([tax per variant](../writing-an-adapter.md#tax)).
- **No rates in the export.** The Admin API exposes no tax rates: Shopify
  computes tax per destination. Product tax overrides are set in the admin per
  collection and region. Ask whoever owns tax for the rates and the overrides,
  and decide the tax mode with the business.
- **Gross prices can be re-grossed abroad.** `Shop.taxesIncluded` says prices
  include tax. With dynamic tax display on a market, Shopify removes the home
  rate and applies the destination's, so a gross price differs per country
  ([dynamic tax-inclusive pricing](https://help.shopify.com/en/manual/international/pricing/dynamic-tax-inclusive-pricing)).
  What that means for the load is in
  [pricing-and-money.md](../pricing-and-money.md#things-to-report-rather-than-approximate).

## Stock

- **Pick the quantity with the business.** An inventory level holds several
  quantities. `available` is what can be sold; `on_hand` is the physical stock,
  including units committed to unfulfilled orders
  ([inventory states](https://shopify.dev/docs/apps/build/orders-fulfillment/inventory-management-apps/manage-quantities-states)).
- **An untracked variant has no stock to carry.** Give it no inventory entry,
  not a zero, which would read as out of stock
  ([stock](../writing-an-adapter.md#stock)).
- **"Continue selling when out of stock"** (`inventoryPolicy: CONTINUE`) has no
  equivalent on an inventory entry, and its quantity can be negative. Report it.
- **Several locations** are each a supply channel, or one total; that is a
  question for the business.

## The example extractor and adapter

The fetched pipeline holds an example for this platform in
`src/examples/shopify/`, with a README that lists what it assumes and what it
does not carry: a read-only extractor (bulk operations, read scopes only) and
an adapter that writes a feed and a report counting every decision and loss.

It is an example, written against one test store, not this engagement's
adapter. Never load its output as the migration:

- **Ask before running the extractor.** It sends requests to the live store
  with the business's token: show the command and wait for a yes.
- **Profile the export first**, then compare what you found with the README's
  assumptions. Where they differ, the example is wrong for this store.
- **Borrow from it** when writing `migration/adapter/`: the bulk queries, how
  the lines are joined, where it stops.
- **Running the adapter against the export is read-only** and shows which of
  its stops fire: an empty SKU, a language that is not the shop's, two option
  values with one code, variants that disagree on taxable, oversold stock.
  Each is a question for the business, not an error to code around.

## Checklist

- [ ] Markets, installed apps and the largest variant count asked about
- [ ] A token with `read_` scopes only, created by the store's administrator; no `write_` scope accepted
- [ ] Or the admin CSV export, with its gaps listed as requests or questions
- [ ] Bulk operations on a checked API version, the served version compared, no deprecated fields
- [ ] Empty SKUs, statuses, gift cards and the default-variant option counted
- [ ] Option values profiled per option name before axis codes are derived
- [ ] The category source chosen with the business: collections, menus or product type
- [ ] Compare-at prices asked about, never folded into a price
- [ ] Tax rates and overrides asked for; taxable flags checked per product
- [ ] The stock quantity chosen; untracked variants given no entry
- [ ] Image re-hosting recorded as an open obligation with an owner
- [ ] The example used as a map, its assumptions checked against the profile, its output never loaded as is
