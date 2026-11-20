---
name: sources-magento
description: "Magento 2.4 and Adobe Commerce as the source: the edition and hosting questions to ask first, which access path works and why the REST API is not one, what to ask the DBA to dump, where the catalog lives in the tables, and the tax and stock specifics."
metadata:
  contentType: REFERENCE
---

# Magento 2.4 as the source

Read this when the source is Magento Open Source or Adobe Commerce. It applies
the rules of [source-access.md](../source-access.md) to one platform, and each
point is a lead to confirm against the installation, not a finding: profile the
snapshot before relying on any of it
([source-discovery.md](../source-discovery.md#the-rule)).

- [Ask first: version, edition and hosting](#ask-first-version-edition-and-hosting)
- [Which access path works](#which-access-path-works)
- [What to ask the DBA for](#what-to-ask-the-dba-for)
- [Where the catalog lives in the tables](#where-the-catalog-lives-in-the-tables)
- [Tax](#tax)
- [Stock](#stock)
- [The example adapter](#the-example-adapter)
- [Checklist](#checklist)

## Ask first: version, edition and hosting

Ask the business which version and edition they run and where it is hosted,
before writing the table list or the access request. The answers change both:

- **Adobe Commerce with content staging** keeps several rows per product in
  `catalog_product_entity` and keys the value tables by `row_id`. Filter to the
  current version (`created_in` and `updated_in`) and join on `row_id`, or SQL
  written for Open Source returns wrong or duplicate rows
  ([Adobe](https://experienceleague.adobe.com/en/docs/commerce-knowledge-base/kb/troubleshooting/database/multiple-rows-in-database-for-same-entity)).
- **Adobe Commerce on cloud infrastructure** does not let anyone create a
  database user by hand: a read-only one is declared as an `ro` endpoint in
  `services.yaml`, on Pro staging and production through Adobe support
  ([MySQL service](https://experienceleague.adobe.com/en/docs/commerce-on-cloud/user-guide/configure/service/mysql)).
  The dump options differ too (below).
- **Modules that move the data**: multi-source inventory, a table prefix, and
  any extension that adds product types or attribute storage. Ask which are
  installed, then check the snapshot.

## Which access path works

- **The REST API cannot be read-only.** Reading and changing products share the
  ACL resource `Magento_Catalog::products`, categories share
  `Magento_Catalog::categories`, and attributes share
  `Magento_Catalog::attributes_attributes`
  ([webapi.xml](https://github.com/magento/magento2/blob/2.4-develop/app/code/Magento/Catalog/etc/webapi.xml)).
  An integration that can read the catalog can change it, so do not ask for
  one. Since 2.4.4, integration tokens are also refused as bearer tokens unless
  a setting Adobe advises against is turned on, so requests need OAuth 1.0a
  signing
  ([Adobe](https://developer.adobe.com/commerce/webapi/get-started/authentication/gs-authentication-token)).
- **GraphQL is the storefront.** It shows what a shopper sees: products by
  visibility and website, enabled variants only, no admin data.
- **The search index is derived.** It holds only enabled products visible in
  catalog or search. Variants that are not visible individually have no
  document of their own.
- **The admin export** (System > Data Transfer > Export, entity Products, CSV)
  runs through the message queue: the file appears on the same page once cron
  has run the `exportProcessor` consumer. It carries categories as paths,
  `additional_attributes`, `configurable_variations`, stock and relative image
  paths. It leaves out attribute definitions, option lists and tax rates (only
  the tax class name), and per-source stock is a separate entity, Stock Sources
  ([export](https://experienceleague.adobe.com/en/docs/commerce-admin/systems/data-transfer/data-export),
  [columns](https://experienceleague.adobe.com/en/docs/commerce-admin/systems/data-transfer/data-attributes-product)).
- **The database**, through a dump or a user granted only `SELECT` on the listed
  tables, is the only access that is read-only by construction, and the only
  one that holds everything above.

## What to ask the DBA for

A dump of the named catalog tables, in one consistent transaction, with binary
columns as hex so the file reads back as text:

```bash
mysqldump --single-transaction --hex-blob --no-tablespaces <database> <tables...> | gzip > catalog.sql.gz
```

On cloud infrastructure, `magento-cloud db:dump` takes `--table` (repeatable)
and `--gzip`, so it can dump only the listed tables
([Cloud CLI](https://experienceleague.adobe.com/en/docs/commerce-on-cloud/user-guide/dev-tools/cloud-cli/cloud-cli-reference)).
Do not suggest `ece-tools db-dump` for this: it puts the site into maintenance
mode and disables cron while it runs, and dumps whole database connections
([Adobe](https://experienceleague.adobe.com/en/docs/commerce-on-cloud/user-guide/develop/storage/database-dump)).
A full dump the business already has is still usable, but it holds customers
and orders: keep it out of the engagement's git, read only the catalog tables,
and say it can be deleted once the snapshot is profiled.

Write the table list into `migration/SOURCE-ACCESS.md` with the version,
edition and hosting answers. The catalog tables are the product entity and its
value tables, the EAV attribute, set, label and option tables, the configurable
super-attribute and super-link tables, the media gallery tables, the category
entity, value and product-link tables, the stock tables, the `catalogrule`
tables, `tax_class`, and `store`. Ask for `core_config_data` rows by path, never for the table: it holds
encrypted payment credentials beside the settings
([Encrypted](https://github.com/magento/magento2/blob/2.4-develop/app/code/Magento/Config/Model/Config/Backend/Encrypted.php)).

## Where the catalog lives in the tables

- **EAV.** `catalog_product_entity` has one value table per type (`_varchar`,
  `_int`, `_decimal`, `_text`, `_datetime`), keyed by `store_id`, where 0 is the
  admin value and any other store view can override it. A store-view value is a
  translation, a per-store setting, or a per-website price, and only profiling
  says which ([how to treat each](../source-data-traps.md#a-scoped-value-that-overrides-the-default)).
- **Options.** Select and multiselect attributes hold option ids, with the
  labels in `eav_attribute_option_value`, per store view. Duplicate labels
  under one attribute are common, and names and labels often hold HTML
  entities ([source-data-traps.md](../source-data-traps.md)).
- **Configurable products** list their children in
  `catalog_product_super_link` and their axes in
  `catalog_product_super_attribute`, ordered by `position`.
- **Categories** are a tree under one root per store group; the categories a
  shopper sees start two levels down. `catalog_category_product.position` is the
  product's order within a category, which the feed does not carry
  ([report it](../categories-and-slugs.md#product-order-within-a-category-is-not-carried)).
- **Images** are stored as `/m/b/file.jpg`, relative to
  `pub/media/catalog/product` despite the leading slash.
- **Visibility.** The `visibility` attribute (1 not visible individually, 2
  catalog, 3 search, 4 both) does not say which products to drop. A visibility-1
  simple product listed in `catalog_product_super_link` is a configurable's
  child, so it is a variant, not a product. A visibility-1 simple product with
  no parent is usually a bundle or grouped component: ask the business whether
  it sells on its own, and do not drop it because the storefront hides it.
- **Product types.** `catalog_product_entity.type_id` separates simple,
  configurable, virtual, bundle, grouped and downloadable products. Bundle,
  grouped and downloadable have no direct equivalent: the bundle or group
  structure is lost, the components load as products of their own, and
  downloadable links and samples do not carry. Count each type in the snapshot,
  report the loss per type, and ask whether the business needs the structure
  rebuilt another way.
- **Catalog price rules** (`catalogrule`, `catalogrule_product_price`). A live
  rule, such as a percentage off a set of products, is applied by the shop
  outside the stored price, and the feed does not carry it. Do not fold it into
  a price: ask whether the rule should survive, and report it as a discount
  question ([pricing-and-money.md](../pricing-and-money.md#things-to-report-rather-than-approximate)).
  Ask the DBA for the rule tables, and read their active dates.
- **URLs.** `url_rewrite` holds the shop's URLs, category paths and redirects.
  Whether they matter is a storefront and SEO question for the business.
  Slugs come from `url_key`, and a collision changes the URL
  ([slugs](../categories-and-slugs.md#slugs-are-unique-across-the-project-per-locale)).
  Ask for `url_rewrite` only if the business wants redirects.

## Tax

- **The variants are taxed, not the configurable product.** Magento charges the
  tax class of the child simple in the cart, and commercetools holds the tax
  category on the product, so take the class from the variants and check they
  agree ([writing-an-adapter.md](../writing-an-adapter.md#tax)).
- **Gross prices are re-grossed abroad.** With tax-inclusive catalog prices
  (`tax/calculation/price_includes_tax`) and cross-border trade off
  (`tax/calculation/cross_border_trade_enabled`), Magento treats each price as
  including the home country's tax and recomputes it for a foreign
  destination ([config paths](https://experienceleague.adobe.com/en/docs/commerce-operations/configuration-guide/paths/config-reference-sales)).
  What that means for the load is in
  [pricing-and-money.md](../pricing-and-money.md#things-to-report-rather-than-approximate).

## Stock

With the multi-source inventory modules installed, per-source quantities live
in `inventory_source_item`, and the legacy `cataloginventory_stock_item`
mirrors only the default source. Configurable, bundle and grouped products have
stock rows of their own that carry no sellable quantity; only the simple
products that become variants get inventory entries.

## The example adapter

The fetched pipeline holds an example adapter for this platform in
`src/examples/magento/`, with a README that lists what it assumes and what it
does not carry. It reads a mysqldump or one NDJSON file per table and writes a
feed and a report counting every decision and loss.

It is an example, written against one test shop, not this engagement's
adapter. Never load its output as the migration:

- **Profile the snapshot first**, then compare what you found with the
  README's assumptions. Where they differ, the example is wrong for this shop.
- **Borrow from it** when writing `migration/adapter/`: which tables hold what,
  how store-view values and option labels are read, where it stops.
- **Running it against the snapshot is read-only** and shows which of its stops
  fire: content staging, a store-view value the feed cannot hold, two used
  options with one label, an unknown HTML entity, variants with different tax
  classes. Each is a question for the business, not an error to code around.

## Checklist

- [ ] Version, edition and hosting asked, and written into `migration/SOURCE-ACCESS.md`
- [ ] No REST integration and no admin login requested
- [ ] A dump of the named tables, or a `SELECT`-only user on them; no `ece-tools db-dump` on a live site
- [ ] `core_config_data` asked for by path
- [ ] Content staging (`row_id`) checked for before any query
- [ ] Store-view values profiled: translation, per-store setting or per-website price
- [ ] Tax classes read from the variants, and checked to agree per product
- [ ] Multi-source inventory checked before reading stock
- [ ] Visibility 1 products sorted into variants and parentless components, none dropped by visibility alone
- [ ] Bundle, grouped and downloadable products counted, their loss reported per type
- [ ] Catalog price rules asked about, never folded into a price
- [ ] `url_rewrite` asked about as a redirect question
- [ ] The example adapter used as a map, its assumptions checked against the profile, its output never loaded as is
