# Selecting products

`aihub_feeds.py fetch` is the only command that calls commercetools. It is read-only and writes
everything later steps need into `<run>/raw/`, so the build can be repeated offline.

## Credentials and scopes

The script reads the same variables commercetools Connect applications use, from the
environment or from a dotenv file passed with `--env-file`:

| Variable | Required | Notes |
| :--- | :--- | :--- |
| `CTP_PROJECT_KEY`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET` | yes | API client credentials. |
| `CTP_AUTH_URL`, `CTP_API_URL` | yes | `https://auth.{region}.commercetools.com`, `https://api.{region}.commercetools.com`. |
| `CTP_SCOPE` | no | Space-separated; `:{projectKey}` is appended when missing. Omit to get all scopes of the client. |
| `CTP_STORE_KEY`, `CTP_CURRENCY`, `CTP_COUNTRY`, `CTP_LOCALE`, `CTP_DISTRIBUTION_CHANNEL_KEY` | no | Defaults for `--store`, `--currency`, `--country`, the feed locale and `--channel`. |

Use a read-only API client. The scopes it needs
([scopes](https://docs.commercetools.com/api/scopes.md)):

- `view_products`: product projections, product types, channels;
- `view_categories`: category paths and `--category` filters. Without it the download still
  runs, but category filters fail and `product_category` / `product_type` stay empty;
- `view_product_selections`: with `--product-selection`, and with `--store` when the Store
  has product selections;
- `view_stores`: only with `--store`.

Pass the dotenv file by path. Do not read it into the conversation or echo its values.

## Finding the market context

```bash
python3 "<this skill's directory>/scripts/aihub_feeds.py" fetch --env-file <path to .env> --list-stores
```

prints the project's currencies, countries and languages, every channel with its roles, every
Store with its languages, countries, distribution and supply channel keys, active product
selections and which `storefront` / custom fields it has, and every product selection with
its mode and product count. Two more listings map the user's wording to keys:

- `--list-categories [TEXT]`: `key: path` for every category whose path contains TEXT, e.g.
  `--list-categories "women > shoes"`;
- `--list-attribute NAME`: the attribute's type and, for enums, `key: label` pairs, e.g.
  `--list-attribute color`. Use it to propose `--store`, `--currency`, `--country`, `--channel` and `--locale`
instead of guessing, and confirm them with the user.

## Market context

These decide which price and stock a row carries, so confirm them before downloading.

- `--currency`, `--country`, `--channel` (distribution channel **key**), `--customer-group`
  turn on [price selection](https://docs.commercetools.com/api/pricing-and-discounts-overview.md#price-selection).
  Each variant then carries the one best-matching `price`, including Standalone Prices, and
  its discounted value. Without `--currency` the build picks a price offline from embedded
  prices and flags it in the report.
- `--store` adds `storeProjection`, which limits locales, prices and inventory to the Store's
  configuration ([Product Projections](https://docs.commercetools.com/api/projects/productProjections.md)),
  and applies the Store's active [Product Selections](https://docs.commercetools.com/api/projects/product-selections.md):
  `Individual` selections include only assigned products, `IndividualExclusion` selections
  remove excluded ones, and variant selections (`includeOnly`, `includeAllExcept`) limit SKUs.
  Use `--ignore-assortment` to export products outside the Store's assortment. That changes
  the scope of the export, so it is the user's call: when the dry run reports that the
  selection and the assortment do not overlap, ask.
  The same Store supplies the storefront URL used in product links, the seller name and the
  privacy, terms and refund policy URLs. Without `--store` these fields stay empty. A
  Microsoft supplemental feed carries none of them, so a Store matters there only for prices,
  inventory scope and assortment.
- The feed locale (`--locale`, else `CTP_LOCALE`, else the Store's first language, else
  `en-US`) is used for names, descriptions, slugs and localized attribute values. A locale
  falls back to its language (`en-US` reads `en`) and to other locales of that language.
  When a product has no text in that language the value stays blank and the row is listed
  under *Normalization notes*. `allowLocaleFallback: true` in mapping.json uses another
  language instead; only set it when the user accepts text in another language in the feed.
- Availability comes from inventory on the variant. With several supply channels a variant
  is in stock when any channel is. Variants without inventory entries get no availability
  and are reported.

## Filters

All filters are combined with AND. Category, product type, SKU and product-key values may be
repeated or comma-separated.

| Need | Flags |
| :--- | :--- |
| One category tree | `--category mens` (id, key, slug or name; sub-categories included, `--no-subtree` to disable). A name or slug used by several categories, such as "Women" under both Women and Sale, stops with the candidate keys and paths: show them to the user and re-run with the chosen key |
| Several categories | `--category shirts --category "Kitchen Knives"` |
| Product type | `--product-type apparel` (key, id or name) |
| Specific variants | `--sku TEE-RED-M,TEE-RED-L` (only those variants become rows) |
| Specific products | `--product-key classic-tee` |
| One product selection | `--product-selection "Summer picks"` (key, id or name; only the products, and variants, it includes) |
| Store assortment | `--store us-store` (all of the Store's active product selections) |
| Attribute value (any type) | `--attribute color=blue`, `--attribute designer=michaelkors,karllagerfeld`, `--attribute size>=40`, `--attribute isOnStock=true` |
| In stock (inventory in any supply channel) | `--search-filter "variants.availability.isOnStockInChannels:exists"` |
| In stock in one channel | `--search-filter 'variants.availability.isOnStockInChannels:"<channel id>"'` |
| In stock (inventory without supply channel) | `--search-filter "variants.availability.isOnStock:true"` |
| Price below 200 (selected price) | `--currency USD --country US --search-filter "variants.scopedPrice.currentValue.centAmount:range(* to 19999)"` (range ends are inclusive; `currentValue` is after Product Discounts, `value` before, so ask which should count) |
| Any embedded price below 200 | `--where 'masterVariant(prices(value(currencyCode="USD" and centAmount < 20000)))'` (any matching Embedded Price, not necessarily the one the feed carries) |
| Recently changed | `--where 'lastModifiedAt > "2026-10-01T00:00:00.000Z"'` |
| Sample | `--max-products 100` |
| Draft data | `--staged` |

`--product-selection` and `--store` can be combined: a product must be in both. Use
`--store` as well when the export should carry the Store's storefront URL, seller and
policy data, or its price and inventory scope.

### Three ways to filter

| Mechanism | Endpoint | Use for | Variant handling |
| :--- | :--- | :--- | :--- |
| `--attribute` | Product Projections query | Any product or variant attribute, by name, typed from the product types | Only matching variants (`--attribute-scope product` keeps whole products) |
| `--where` | Product Projections query | Anything [query predicates](https://docs.commercetools.com/api/predicates/query.md) can express: product fields, embedded prices, dates, keys, nested attributes | Whole products |
| `--search-filter` | [Product Projection Search](https://docs.commercetools.com/api/projects/product-projection-search.md) | What predicates cannot: inventory (`variants.availability.isOnStock`, `availableQuantity`), selected prices (`variants.scopedPrice…`), attribute facets and ranges | Only matching variants (`--all-variants` keeps all) |

`--where` and `--search-filter` use different endpoints and cannot be combined; categories,
product types, SKUs, product keys, product selections and `--attribute` work with both
(attribute conditions are sent as predicates or search filters, then checked per variant).
All filters are ANDed.

Price filters only see Embedded Prices; Standalone Prices cannot be filtered with `--where` or
`--search-filter`. Use the scoped-price filter when the cut-off should match the price the feed
carries, and `--where` when any price in a currency is enough.

Product Projection Search is
[deprecated](https://docs.commercetools.com/api/projects/product-projection-search.md) and
cannot be activated for Projects created after 31 August 2026. There, `--search-filter`
fails: use `--where` or `--attribute`, and for stock read the `availability` column of the
working file instead of filtering.

"In stock" can mean commercetools inventory (search filters above; also what the feed's
`availability` is built from) or a project attribute such as `isOnStock`. When both exist,
they usually give very different results: show the user both counts and ask.

Several `--attribute` conditions must hold on the same variant (one combined predicate).
Conditions the query cannot express (`!=`, localized text, money) are checked per variant only;
the dry run then warns that its match count still includes products they will drop.

`--attribute name<op>value`: operators `=`, `!=`, `>`, `>=`, `<`, `<=`; `=` and `!=` take a
comma-separated list (`color=blue,black`). The attribute type comes from the product types:
enum and lenum values match by key or by label in any locale (`gender=Herren` means key
`men`), numbers and dates compare as such, set attributes match when any element matches.
An unknown attribute name or enum value stops with the valid names or keys, so a dry run
is the way to map the user's wording ("blue shirts by a given designer") to attribute names and
keys; it prints the resolved conditions. Confirm the mapping with the user when the wording
could mean more than one attribute (for example stock as an `isOnStock` attribute versus
inventory).

Search filter syntax: `variants.attributes.<name>:"value"` (text), `variants.attributes.<name>.key:"value"`
(enum), `range(<from> to <to>)` with `*` for open ends, money in cent amounts, and scoped-price
filters only after `--currency` (and `--country`) select a price.

Pagination uses an id cursor (`sort=id asc`, `id > "<last>"`), so there is no offset limit on
large catalogs.

## Running it

```bash
python3 "<this skill's directory>/scripts/aihub_feeds.py" fetch \
  --out ai-hub-feeds/<run> \
  --env-file <path to .env> \
  --store <store-key> --currency USD --country US --channel <channel-key> \
  --category <category> --dry-run
```

`--dry-run` writes nothing and needs no `--out`. It prints a short summary (resolved names,
search filters, number of predicates, products matching the query before the Store
assortment and per-variant checks, variants kept in a sample, warnings); add `--json` for the
full plan with the query. It resolves product selections, categories, product types and
attribute conditions and prints, in addition to the query (endpoint, predicates or search
filters), `sampleVariantsKept` when variant filters apply, and: what each name resolved to (`resolvedCategories` as
`key: path`, `resolvedProductSelections`), how many products match the query
(`productsMatchingQuery`), how many sampled products are in the Store assortment / product
selection (`sampleInAssortment`), and whether the feed locale matches the sampled product
names (`localeCheck`). It stops with a message for unknown product selections, categories
or product types: ask the user which one they meant rather than guessing. Remove `--dry-run` to download.

Output in `<run>/raw/`:

| File | Content |
| :--- | :--- |
| `products.jsonl` | One Product Projection per line, with `_feed.selectedSkus` when only some variants are in scope |
| `categories.json` | All categories, for category paths and category mapping |
| `store.json` | The Store: name, storefront URLs and policy URLs, custom fields, product selections |
| `fetch-manifest.json` | Resolved filters, query, counts, warnings. No credentials |

Audit metadata (`createdBy`, `lastModifiedBy`, which carry the API client id) is removed
before anything is written. The run folder still contains catalog data. Keep it out of version control.
