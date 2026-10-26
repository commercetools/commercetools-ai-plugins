# Mapping, working files and finalize

## Contents

- [Building](#building)
- [Item and group ids](#item-and-group-ids)
- [URLs and seller data](#urls-and-seller-data)
- [Attributes](#attributes)
- [Feed flags](#feed-flags)
- [Value maps and availability](#value-maps-and-availability)
- [Variants and titles](#variants-and-titles)
- [Categories](#categories)
- [Working files](#working-files)
- [Finalizing a completed file](#finalizing-a-completed-file)
- [Reading the gap report](#reading-the-gap-report)

## Building

`aihub_feeds.py build` merges `<run>/mapping.json` over the default mapping built into the
script (objects merge, lists replace) and writes the effective result back to `<run>/mapping.json`.
Edit that file and rebuild.

```bash
python3 "<this skill's directory>/scripts/aihub_feeds.py" build --run ai-hub-feeds/<run> \
  --vendors <the vendors the user named> [--mapping other.json] [--specs auto|live|bundled]
```

`--vendors` is required and has no default: build only for the vendors the user asked for
(`openai`, `google`, `microsoft`).

`mapping.json` decides where values are read from and how they are spelled for each vendor.
It holds no values of its own and no defaults: when no attribute or field matches, the value
stays blank and is reported.

Every row is one purchasable variant. The build turns each variant into a vendor-neutral
record in `<run>/normalized/records.jsonl` (keys such as `item_id`, `sku`, `title`,
`description`, `url`, `brand`, `gtin`, `price_amount`, `currency`, `sale_price_amount`,
`availability`, `category_path`, `group_id`, `variant_options`, `seller_name`), then formats
it per vendor. When a vendor value looks wrong, check the normalized record first: it shows
whether the cause is the mapping or the vendor formatting.

## Item and group ids

| Key | Default | Use |
| :--- | :--- | :--- |
| `itemId` | `sku` | `sku`, `variantKey`, `productKeyVariantId` or `template` |
| `itemIdTemplate` | `{productKey}-{variantId}` | Used when `itemId` is `template` |
| `groupId` | `productKey` | `productKey`, `productId` or `slug`; set only on products with more than one variant |

For Google and Microsoft supplemental feeds, `itemId` must reproduce the id of the merchant's
**existing primary feed**. Ask the user for two or three ids from their merchant center and
compare them with `normalized/records.jsonl` before handing over the files. A wrong id
strategy updates nothing, and neither merchant center reports it as an error.

The report warns on duplicate ids, which usually means variants without SKUs.

## URLs and seller data

These are read from the Store passed with `--store`. Each `store.<key>` is an ordered list
of paths into the [Store](https://docs.commercetools.com/api/projects/stores.md); the first
non-empty one wins. `custom.<name>` reads a Store custom field, and a trailing `@origin`
keeps only the scheme and host of a URL.

| Key | Default paths | Feeds |
| :--- | :--- | :--- |
| `store.baseUrl` | `custom.sellerStoreUrl`, `storefront.orderUrlTemplate@origin`, `storefront.checkoutUrlTemplate@origin` | `{baseUrl}` in product URLs; OpenAI `seller_url` |
| `store.sellerName` | `custom.sellerName`, `name` | OpenAI `seller_name` (required) |
| `store.privacyPolicyUrl`, `store.termsOfServiceUrl` | `storefront.privacyPolicyUrl` / `storefront.termsOfServiceUrl`, then custom fields | OpenAI, required when checkout is enabled |
| `store.returnPolicyUrl` | `storefront.refundPolicyUrl`, `custom.returnPolicyUrl` | OpenAI `return_policy` |
| `store.returnWindowDays`, `store.acceptsReturns` | `custom.returnWindowDays`, `custom.acceptsReturns` | OpenAI; the window is only sent when returns are accepted |

Add paths when the project keeps these values elsewhere, for example
`"store": { "baseUrl": ["custom.shopUrl"] }`.

`productUrlTemplate` (`{baseUrl}/products/{slug}`) sets the shape of product page URLs.
Add `?sku={sku}` for variant-specific landing pages, which Google prefers. Placeholders:
`{baseUrl} {slug} {sku} {variantId} {variantKey} {productKey} {productId} {locale}`. When
`{baseUrl}` is used and the Store has no storefront URL, product URLs stay empty.

## Attributes

`attributes.<field>` is an ordered list of commercetools attribute names. Matching ignores
case, variant attributes win over product-level attributes, and the first non-empty value is
used. Values are rendered as follows: enum and lenum use the label, localized values the
feed locale, money becomes `amount CUR`, and references the expanded name or key.

| Field | Default names | Feeds |
| :--- | :--- | :--- |
| `brand` | brand, manufacturer, designer | all |
| `gtin`, `mpn` | gtin, ean, upc, barcode / mpn, manufacturerPartNumber | all; GTINs are checked for length and check digit |
| `color`, `size`, `sizeSystem`, `material`, `pattern` | same names | all |
| `gender`, `ageGroup`, `condition` | same names | all, after `valueMaps` |
| `weight`, `length`, `width`, `height` (+ `weightUnit`, `dimensionsUnit`) | same names | OpenAI, Google |
| `isEligibleSearch`, `isEligibleCheckout` | chatgptEnableSearch, chatgptEnableCheckout | OpenAI |
| `reviewCount`, `starRating` | reviewCount / starRating, averageRating, rating | OpenAI |
| `googleProductCategory` | googleProductCategory | Google, Microsoft (wins over `categoryFields`) |
| `identifierExists` | identifierExists | Google `identifier_exists`, Microsoft `identifier_exists`; never derived from a missing GTIN |
| `promotionId`, `customLabel0`–`customLabel4` | promotionId / none | Google, Microsoft |

The report section *commercetools attributes not used by any feed field* lists attribute
names in the data that no field reads. It is the fastest way to find a brand or barcode
stored under a project-specific name.

Measure attributes accept numbers, strings such as `"250 g"` or `"20 cm"`, and
`{ "value": 1.2, "unit": "kg" }`. A bare number needs a unit from a `weightUnit` /
`dimensionsUnit` attribute. Without one the measure stays blank and is noted in the report.

## Feed flags

`flags` holds the merchant's eligibility settings, used when a product has no attribute for
them: `isEligibleSearch` (`true`, discovery), `isEligibleCheckout` (`false`) and
`isAdsEligible` (`true`, written only in the OpenAI Ads feed). Attributes in
`attributes.isEligibleSearch` / `isEligibleCheckout` / `isAdsEligible` override per product.
The report header lists the defaults and how many rows used them. Change a default only on
the user's request.

`adsMetadata` maps OpenAI Ads metadata keys to attribute names, e.g.
`{"custom_label_0": ["season"]}`; use only keys the Ads integration is configured for.

## Value maps and availability

- `valueMaps.gender|ageGroup|condition`: re-spells existing project values (case-insensitive)
  as spec values, for example `"herren": "male"`. Only map values that mean the same thing.
  Values that are still outside the spec stay in the working file as they are and are
  flagged in `_issues`.
- There is no default `condition`. Vendors treat an empty condition as new; products sold
  used or refurbished need a `condition` attribute in commercetools.
- Availability comes only from inventory. `restockableAsBackorder` (`false`) sends
  out-of-stock variants with `restockableInDays` as `backorder`; `onlyInStock` (`false`)
  drops out-of-stock variants.

## Variants and titles

`variantOptions` lists the attributes that can distinguish variants, with display labels
(default color, size, material, pattern). Only options whose values differ between a
product's variants are used, and they become OpenAI `variant_dict`.

Titles are sent exactly as the product name in commercetools. `appendVariantToTitle`
(`false`) appends the varying option values, such as `Classic Tee - Red / M`. It only
reuses commercetools values, but it changes the title, so turn it on only when the user asks.
Titles over a vendor's length limit are flagged, never shortened.

## Categories

`product_category` (OpenAI) and `product_type` (Google, Microsoft) use one category path per
product, for example `Women > Clothing > Dresses`. With `categoryPath.preferFilteredCategories`
(default `true`) a category inside the downloaded `--category` tree is preferred; categories
under the roots listed in `categoryPath.excludeRoots` (root category keys or names, e.g.
`["new", "sale"]` for merchandising trees) come last. The report notes when every path starts
with the filtered category, the usual sign that it is a merchandising tree. Otherwise the commercetools order applies. The
[Google product taxonomy](https://support.google.com/merchants/answer/6324436) value comes
from the product attribute in `attributes.googleProductCategory`, otherwise from the
category custom fields listed in `categoryFields.googleProductCategory`. The most specific
category wins, walking from the assigned category up to its root, so a value on a top-level
category covers its whole tree.

```json
{
  "productUrlTemplate": "{baseUrl}/{locale}/p/{slug}?sku={sku}",
  "attributes": { "brand": ["brandName"], "gtin": ["ean13"], "customLabel0": ["season"] },
  "categoryFields": { "googleProductCategory": ["googleCategoryId"] },
  "store": { "baseUrl": ["custom.shopUrl", "storefront.orderUrlTemplate@origin"] },
  "categoryPath": { "excludeRoots": ["new", "sale"] }
}
```

## Working files

`working/<vendor>-working.csv` (UTF-8 with BOM, comma-separated) has one row per variant and
one column per vendor field, in spec order with the id first, including fields commercetools
has no values for, so the team can fill them. Two helper columns lead:

| Column | Content |
| :--- | :--- |
| `_missing_required` | Required fields this row has no valid value for |
| `_issues` | Other findings: invalid optional values, over-long text, recommended fields missing |

Values are vendor-formatted (`79.99 USD`, `in_stock`, `in stock` for Microsoft), flagged
values are kept as they are, and lists use commas (`%2C` inside URLs). OpenAI object fields
(`variant_dict`, `dimensions`) are JSON text.

Guidance for the team, also in `NEXT-STEPS.md`: import as text so GTINs, SKUs and prices
keep their exact form (spreadsheets otherwise turn `00012345600012` into `1.23456E+10`),
keep the header row, and save as CSV UTF-8. Comma-, semicolon- and tab-separated files are
all read back.

## Finalizing a completed file

```bash
python3 "<this skill's directory>/scripts/aihub_feeds.py" finalize --vendor openai \
  --input <completed>.csv --out <dir> [--format jsonl.gz|csv.gz|tsv.gz]
python3 "<this skill's directory>/scripts/aihub_feeds.py" finalize --vendor google|microsoft \
  --input <completed>.csv --out <dir> [--kind supplemental|primary] [--columns brand,gtin,...]
```

`finalize` reads the run's cached specs (`<run>/specs`, next to `working/`; `--specs-dir`
otherwise), drops the `_` helper columns and columns that are not vendor fields,
writes every row with its values exactly as given, and converts only the format:

| Vendor | Output |
| :--- | :--- |
| OpenAI Commerce feed | `product-feed.jsonl.gz` (typed JSON: booleans, numbers, arrays, objects), or `.csv.gz` / `.tsv.gz` |
| OpenAI Ads feed | `ads-product-feed.csv` (UTF-8 CSV), or `--format jsonl.gz|csv.gz|tsv.gz` |
| Google | `google-supplemental-feed.tsv` (id first), or `google-primary-feed.tsv` with `--kind primary` |
| Microsoft | `microsoft_supplemental_feed.txt` (only the fields Microsoft accepts there, id last) or `microsoft_primary_feed.txt` with `--kind primary` |

For supplemental feeds, the default columns are all columns with at least one value;
`--columns` restricts them. It then re-runs the vendor checks and writes
`<vendor>-<kind>-finalize-report.md`: rows with every required field, required fields still
missing or invalid, empty cells per supplemental column, duplicate or missing ids, and
columns that were not written (not accepted by the vendor, not requested, or empty in every
row). Mention columns that were empty in every row, e.g. no descriptions to send. Report these as facts; the decision to upload is the user's.

## Reading the gap report

The report starts with a summary per vendor: rows, rows with every required field, rows
missing at least one. Each vendor section then has:

- **Required fields**: every always-required and conditionally required field with filled /
  missing / invalid counts; `✓` when complete, `⚠` when a required value is missing or
  invalid, `⚠?` when the field is empty and the spec's condition (shown in *When*) may apply;
- **All fields**: **Filled**, **Flagged** (sent with a note or re-spelled for the vendor, such
  as an over-long title or `backorder` as `out of stock` for Microsoft), **Invalid** (kept,
  but outside the spec) and **Missing**, plus the commercetools source of each field;
- **Top issues** with example ids, and where each missing value would come from.

For Google and Microsoft the required fields are those of the full product spec; a
supplemental feed itself only needs `id`. `report/issues.csv` has one line per row and field.
