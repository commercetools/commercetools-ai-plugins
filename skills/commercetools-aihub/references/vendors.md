# Vendors: specs, files and uploading

## Contents

- [Specs are read at runtime](#specs-are-read-at-runtime)
- [OpenAI Commerce feed](#openai-commerce-feed)
- [OpenAI Ads feed](#openai-ads-feed)
- [Google Merchant Center](#google-merchant-center)
- [Microsoft Merchant Center](#microsoft-merchant-center)

Uploading is the merchant's step; the upload sections below are guidance for them. If the
user asks the agent to upload or publish (SFTP, a hosted URL, a Merchant Center data source),
first show the target, the file and its effect (an OpenAI Commerce upload replaces the whole
catalog, a supplemental feed overrides primary values, an Ads feed can put products into live
campaigns), and act only after the user's explicit yes.

## Specs are read at runtime

Which fields exist, which are required, their allowed values and length limits change without
notice, so the skill does not hardcode them. `aihub_feeds.py build` (and `finalize`) fetch the
vendor's published spec, parse it and cache it in `<run>/specs/<vendor>.json`; later offline
builds of the same run use the cache. `aihub_feeds.py specs --vendors <v>` shows the current
spec on its own.

| Vendor | Spec read from |
| :--- | :--- |
| OpenAI Commerce feed, OpenAI Ads feed | [developers.openai.com/commerce/specs/file-upload/products](https://developers.openai.com/commerce/specs/file-upload/products) (Markdown version, `.md`); Ads rules from the [OpenAI Ads product feeds guide](https://developers.openai.com/ads/product-feeds) |
| Google | [support.google.com/merchants/answer/7052112](https://support.google.com/merchants/answer/7052112) (attribute tables) |
| Microsoft | [Microsoft product attributes](https://help.ads.microsoft.com/#apex/ads/en/51084/1-500) and [Microsoft feed files and supplemental feeds](https://help.ads.microsoft.com/#apex/ads/en/51105/1-500) (fields a supplemental feed accepts) |

What stays in code is how commercetools data becomes each field (the field registry). The
gap report compares both and lists:

- fields in the spec with no commercetools mapping: written as empty working-file columns
  the team can fill; tell the user, and add a mapping when the data exists in commercetools;
- fields no longer in the spec: left out;
- requirement changes, e.g. a field that became required.

`--specs live` refetches; the previous copy is kept as `<vendor>.previous.json` and the report
opens the vendor section with **Changes since the previous spec of this run** (fields added,
removed, requirement / allowed values / length changed). Use this when the user asks whether
a spec changed. `--specs bundled` uses the registry's own list (captured 2026-10-23).

When a spec cannot be fetched or no longer parses (page layout changed), the run's cached spec
is used, else the registry's list; the console and the report say which. Tell the user and
link the spec page.

Conditions in the spec that the data cannot answer ("required for apparel in the US", "for
new products") are shown as `⚠?` in the required-fields table with the rows where the field
is empty: the merchant decides whether the condition applies.

## OpenAI Commerce feed

Working file `working/openai-working.csv`; `finalize --vendor openai` writes
`product-feed.jsonl.gz` (or `--format csv.gz|tsv.gz`), every row, values as given. OpenAI
accepts gzipped CSV, TSV and JSONL (Parquet with zstd is preferred for large automated
feeds), UTF-8, up to about 500k items and ~500 MB per file.

Built from commercetools: SKU → `item_id`; product name → `title`; description (HTML
stripped) → `description`; `productUrlTemplate` + Store storefront URL → `url`; attributes →
`brand`, `gtin`, `mpn`, `color`, `size`, `gender`, `age_group`, `condition`, measures; first /
other images → `image_url` / `additional_image_urls`; price selection → `price`,
`sale_price`; inventory → `availability`; product key → `group_id` with
`listing_has_variations` and `variant_dict` (varying options) on multi-variant products;
Store → `seller_name`, `seller_url`, policy URLs; `chatgptEnableSearch/Checkout` attributes →
`is_eligible_search` / `is_eligible_checkout`.

Flags: the working file carries `is_eligible_search=true` (discovery) and
`is_eligible_checkout=false` from the mapping's `flags` defaults unless a product attribute
says otherwise. The privacy policy and terms URLs only matter once checkout is `true`, which
also needs the checkout integration enabled with OpenAI. `is_ads_eligible` is not part of the
merchant feed; use the OpenAI Ads feed export for ads. If
`offer_id` is added, it must not contain the price.

### Full snapshot semantics

Every upload is the complete catalog. A product missing from a later upload is kept for up
to 14 days and then removed, so an upload of a filtered selection becomes the catalog ChatGPT
shows. Tell the user this when the export is a subset; whether to upload is their call. To
hide a product without removing it, send `is_eligible_search=false`. OpenAI suggests
validating about 100 items first and refreshing at least daily.

### Uploading (merchant portal → product feed)

Manual upload, on the product feed page of the OpenAI merchant portal:

1. **Manual upload → Upload a file** ("Upload a compressed feed file from your device") →
   **Choose File** → the finalized `product-feed.jsonl.gz`.
2. **Validate**. Problems go back into the working file (or the mapping / commercetools),
   then finalize and validate again.
3. **Submit feed**.

For recurring delivery: **SFTP** (username/password, shown once after **Generate password**,
or SSH key; upload to the root and overwrite the same file names, all shards without long
pauses) or **Hosted URL** (public HTTPS URL, run frequency Once / Hourly / Daily). Recurring
SFTP delivery from commercetools is a Connect job (see `commercetools-connect`).

## OpenAI Ads feed

A product feed in the OpenAI ad account, used by product-feed campaigns. It is separate from
the merchant portal feed: created in the ad account (needs product feed API access), with its
own SFTP access (password or SSH key), and processed for ads rather than ChatGPT discovery.

Working file `working/openai-ads-working.csv`; `finalize --vendor openai-ads` writes
`ads-product-feed.csv` (UTF-8 CSV, as the Ads guide asks; `--format` for others). It is the
OpenAI product schema plus:

| Field | From | Note |
| :--- | :--- | :--- |
| `is_ads_eligible` | attribute `chatgptEnableAds` / `isAdsEligible`, else `flags.isAdsEligible` (`true`) | Required here: products Ads should process |
| `ads_metadata` | `adsMetadata` in mapping.json, key → attribute names | Keys must be the ones configured for the Ads integration (e.g. `custom_label_0`); never invent keys |
| `target_countries`, `store_country` | the download's `--country` | The market of the export |

Discovery and checkout flags keep their defaults (`true` / `false`), as in the Ads guide's
example. Uploading: put the CSV in the ad feed's SFTP root, check upload history and
diagnostics, then select products for ad groups with product sets (brand, category, price,
`ads_metadata.<key>`). Prices and availability must stay current; product pages and images
must be public HTTPS URLs.

## Google Merchant Center

Working file `working/google-working.csv`; `finalize --vendor google` writes
`google-supplemental-feed.tsv` (default) or `google-primary-feed.tsv` (`--kind primary`),
tab-separated, header row, `id` first.

A supplemental data source adds or overrides attributes of products that already exist in a
primary source, matched by `id`; it cannot add or remove products. So:

- `id` must equal the primary feed id exactly. Compare a few ids from Merchant Center with
  the working file before finalizing ([item ids](mapping-and-files.md#item-and-group-ids)).
- Rows missing required fields of the full spec still belong in a supplemental file.

### Choosing columns

Every column overrides the primary value, and an empty cell can clear it. Ask which
attributes the supplemental feed should own and pass them with `--columns`, e.g.
`--columns gtin,brand,google_product_category,custom_label_0`; otherwise every column with a
value is written. The finalize report lists empty cells per column.

Shipping, tax and returns are usually configured per account in Merchant Center, not in the
feed. `google_product_category` comes from an attribute or category custom field, never chosen
by the agent.

### Uploading a supplemental data source

1. Merchant Center → **Settings → Data sources → Supplemental sources** → **Add supplemental
   product data** (some accounts need the *Advanced data source management* add-on).
2. **Upload a file** (or Google Sheets / scheduled fetch for recurring updates).
3. Select the primary data source(s) it applies to, save, then review **Products → Needs
   attention**.

## Microsoft Merchant Center

Working file `working/microsoft-working.csv` with every primary-feed field;
`finalize --vendor microsoft` writes `microsoft_supplemental_feed.txt` (default) or
`microsoft_primary_feed.txt` (`--kind primary`). File rules applied: tab-delimited `.txt`, one
header row, no spaces and at most 50 characters in the file name, no tabs or line breaks in
values, no HTML, `id` last (Microsoft rejects lines ending in a tab).

### Supplemental feed limits

A supplemental feed overrides fields of products in a primary feed with the same Feed label
(or Country of sale), Language and `id`, and only accepts the fields Microsoft lists for
supplemental feeds (read at runtime; at capture time `id`, `title`, `description`, `size`,
`color`, `custom_label_0–4`, `promotion_ID`). Finalize writes only those and lists the rest as
not written. Gaps in other fields (GTIN, brand, price, availability, images) need the primary
feed: the merchant's own, or one finalized with `--kind primary`. Say this when the user
expects a supplemental feed to fix identifiers or prices. A Store matters for a Microsoft
supplemental export only through prices, inventory scope and assortment.

### Uploading a supplemental feed

1. Microsoft Advertising → **Tools → Merchant Center → Feeds** → store → **Create feed**.
2. **Feed type:** *Supplemental feed* (or *Primary feed* for `--kind primary`); same **Feed
   label / Country of sale** and **Language** as the primary feed.
3. **Input method:** *Manually upload* (< 4 MB) or *FTP/SFTP* (< 1 GB; file name must match
   the feed settings) → **Create feed**. Feeds expire after 30 days.
