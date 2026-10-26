---
name: commercetools-aihub
description: "Exports a selected set of commercetools products (by product selection, category, product type, SKU, product key, store assortment or query predicate) for commercetools AI Hub across vendors (OpenAI Commerce feed, OpenAI Ads feed, Google Merchant Center and Microsoft Merchant Center, including supplemental feeds). Downloads once, then works offline. Maps product data to each vendor spec, checks every vendor's required fields, writes a working file per vendor for the business team to complete, and converts the completed file into the vendor upload format (.jsonl.gz, .tsv, .txt) with upload guidance, including OpenAI manual upload. Use when exporting products for ChatGPT shopping or AI Hub, checking feed readiness or missing required fields, building a supplemental feed, or converting an edited feed file for upload. Not for building or deploying the Connect feed connector itself (see commercetools-connect) and not for loading a catalog into commercetools (see commercetools-catalog-migration)."
when_to_use:
  - "Exporting a product selection, category, product type or SKU list from commercetools for the OpenAI Commerce feed, OpenAI Ads feed, Google or Microsoft"
  - "Checking which products are missing fields the OpenAI, Google or Microsoft product feed specs require"
  - "Building a Google Merchant Center or Microsoft Merchant Center supplemental feed from commercetools data"
  - "Turning a feed file the business team completed in a spreadsheet into the vendor upload format"
  - "Mapping commercetools attributes (brand, GTIN, color, size) and categories to feed fields"
  - "Automating recurring feed delivery from a Connect application — see commercetools-connect"
metadata:
  contentType: SKILL
  area:
    - Integrations
  docsSearch:
    products:
      - AI Hub
      - Composable Commerce
---

# commercetools AI Hub product feeds

AI Hub feeds go to several vendors: OpenAI Commerce feed (ChatGPT shopping), OpenAI Ads feed,
Google Merchant Center and Microsoft Merchant Center. "AI Hub" names the whole export, not one vendor.

Exports what commercetools has for a product selection, per vendor, as a **semi-finished
working file**: every row, every vendor field, blanks where commercetools has no value, and a
note per row listing the required fields it is missing. The business team completes the file
offline; the completed file comes back and is converted, unchanged, into the vendor upload
format. The merchant decides what and when to upload; the skill supplies facts and guidance.

```
aihub_feeds.py fetch     commercetools          ─► <run>/raw/                 products, categories, Store, manifest
aihub_feeds.py build     raw + mapping + specs  ─► <run>/working/<vendor>-working.csv, report/, NEXT-STEPS.md
   (business team completes the working files offline)
aihub_feeds.py finalize  completed file         ─► <out>/<vendor upload file> + finalize report
```

`scripts/aihub_feeds.py` (Python 3.9+, standard library only) is the whole toolchain; run
`aihub_feeds.py <command> --help` for options. The network is used for the download and to
read the vendors' current specs; the specs are cached per run, so rebuilding and finalizing
work offline.

Run it with `python3 scripts/aihub_feeds.py` (`py -3` on Windows, where `python3` is often
missing or a Microsoft Store stub). When no Python 3.9+ is found, tell the user to install it
from python.org and stop; do not rewrite the script in another language.

Vendor specs are **not hardcoded**: `build` and `finalize` read each vendor's published spec
at runtime (fields, required/conditional/optional, allowed values, length limits, Microsoft's
supplemental fields) and merge it with the code that maps commercetools data to fields. New
spec fields become empty columns, removed ones are dropped, and the report lists both. See
[references/vendors.md](references/vendors.md#specs-are-read-at-runtime).

## Data integrity: commercetools is the only source of product data

Feeds are checked against the storefront, and a guessed value hides a real gap. So:

- Do not write, rewrite, shorten, translate, summarise or infer product content: titles,
  descriptions, brands, GTINs, MPNs, categories, colors, sizes, conditions, availability,
  prices or images. Not in `mapping.json`, not in the working files, not in the completed file.
- `mapping.json` changes only *where* a value is read from (attribute names, category and
  Store fields, id strategy) and *how* an existing value is spelled for a vendor
  (`valueMaps`, units, separators). It holds no values of its own.
- Feed eligibility flags are merchant settings, not product data, and the only defaults:
  discovery on (`is_eligible_search=true`), checkout off (`is_eligible_checkout=false`) and,
  for the OpenAI Ads feed only, `is_ads_eligible=true`. A product attribute overrides them;
  change a default only when the user asks. Google and Microsoft have no checkout flag; their
  products are listed for discovery by default.
- Storefront URL, seller name and policy URLs (privacy, terms, refund) come from the Store
  passed with `--store`, the Store whose product selections define the assortment.
- Values the business team adds in the working file are theirs. Convert the completed file
  as it is: `finalize` changes the format, never the content. If a value looks wrong,
  report it; do not correct it.

## Before you start

1. <!-- ct:docs-search:begin -->
   **Docs search (required, run first)** — The first time you use this skill in a session you must run this before answering. It gathers the latest verified documentation as your primary grounding, filtered to the products this skill covers. Use this script for documentation search while working with this skill; the Knowledge MCP covers everything else. Always confirm details against retrieved documentation rather than the skill text alone:

   ```bash
   node "<this skill's directory>/scripts/docs-search.mjs" \
     --query "<extract key terms: AI Hub, product feed, Product Projections, price selection, Product Selections>" \
     --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
     --model "<current-model>" \
     --commercetools-project-key "<if known>" \
     --commercetools-region "<if known>" \
     --limit 10
   ```

   Pass the commercetools project key and region (as in `api.{region}.commercetools.com`) only if already in your context; otherwise omit both. Never search files or ask the user for them.
   <!-- ct:docs-search:end -->

2. **Vendor specs change often**, which is why they are read at runtime. When the user asks
   whether a spec changed, or a vendor flags a field the report marked valid, rebuild the run
   with `--specs live` and report its *Changes since the previous spec* section. If a spec
   page could not be read, the report says which fallback was used and links the page.

## Workflow

1. **Agree the selection and market.** Collect, asking only for what is missing:
   - credentials: a dotenv file with the `CTP_*` variables. Pass it with `--env-file` and
     never print or copy secret values;
   - Store, currency, country, distribution channel, locale. `aihub_feeds.py fetch --list-stores`
     prints the project's currencies, countries, languages and channels and every Store with
     its languages, countries, channel keys, product selections and storefront fields;
   - filters: any combination of product selections, categories, product types, SKUs,
     product keys, attribute conditions (`--attribute color=blue`), query predicates
     (`--where`) and search filters (`--search-filter`, e.g. inventory or price ranges).
     `--list-categories` and `--list-attribute` map the user's wording to keys. When wording
     could mean different data (stock as inventory or as an attribute), show both counts and
     ask;
   - vendors: the user names them; if the request does not say, ask, for example "Which
     vendors should I build feeds for: OpenAI Commerce feed, OpenAI Ads feed, Google
     Merchant Center, Microsoft Merchant Center?" Never assume all of them, and do not label
     one vendor "AI Hub". `build` requires `--vendors` (`openai`, `openai-ads`, `google`,
     `microsoft`);

   Flags, scopes and filter recipes: [references/selecting-products.md](references/selecting-products.md).

2. **Resolve, then download.** Run `aihub_feeds.py fetch --dry-run` first. It writes nothing, shows
   what each name resolved to, counts matching products, samples whether they are in the
   Store assortment, and checks the feed locale against the data. Show the user the plan and
   any warnings, then run the download once they confirm. A name that matches several
   categories stops with the candidates: ask which one is meant (a dry run over the union
   shows whether the choice changes the result). Ignoring the Store assortment changes the
   scope, so ask before using `--ignore-assortment`.

3. **Build the working files.** `aihub_feeds.py build --run <run> --vendors <named vendors>` writes
   one working file per requested vendor, `report/gap-report.md` (required fields per vendor first), `report/issues.csv`
   and `NEXT-STEPS.md`. The first build writes `<run>/mapping.json`.

4. **Review the gaps with the user.** For each vendor, report which required fields are
   filled and which are missing, with example SKUs, and the `⚠?` fields whose spec condition
   may apply (e.g. required for apparel) for the user to judge. Sort gaps into:
   - **mapping gaps**, where the value exists in commercetools under another name or
     spelling: point `attributes.*` (or `store.*`, `categoryFields`) at it, or add a
     `valueMaps` entry. Confirm with the user, rebuild offline, show before/after counts.
     See [references/mapping-and-files.md](references/mapping-and-files.md);
   - **values commercetools does not have**: they stay blank in the working file, marked in
     `_missing_required`. The team fills them in the file or in commercetools.

5. **Hand over the working files.** Point to `working/` and `NEXT-STEPS.md`: how to edit the
   files safely (import as text so GTINs and SKUs keep their form, keep the header row) and
   what each helper column means.

6. **Finalize a completed file.** When the user hands a completed file back, run
   `aihub_feeds.py finalize --vendor <v> --input <file> --out <dir>` (Google and Microsoft:
   `--kind supplemental|primary`, optional `--columns`). When the user wants an upload file
   straight away, finalize the generated working file as it is. Report the finalize report as facts:
   rows, required fields still missing or invalid, empty cells in supplemental columns,
   columns a vendor does not accept. Then give the vendor's upload guidance from its reference.
   Do not decide for the user whether to upload.

## Facts to surface (information, not decisions)

| Topic | Fact | Where |
| :--- | :--- | :--- |
| OpenAI Ads feed | A separate feed in the ad account (its own SFTP), not the merchant portal feed. Products need `is_ads_eligible=true`; `ads_metadata` keys come from the Ads setup and are never invented. | [vendors.md](references/vendors.md#openai-ads-feed) |
| OpenAI uploads | Each upload is treated as the complete catalog; products missing from a later upload drop out after up to 14 days. | [vendors.md](references/vendors.md#full-snapshot-semantics) |
| Supplemental ids | Supplemental rows apply only to products whose `id` matches the primary feed. A SKU-vs-key mismatch updates nothing and reports no error. | [mapping-and-files.md](references/mapping-and-files.md#item-and-group-ids) |
| Supplemental cells | Every column overrides the primary value, and an empty cell can clear it. `--columns` limits the file to chosen attributes. | [vendors.md](references/vendors.md#choosing-columns) |
| Microsoft supplemental | Accepts only the fields Microsoft lists for supplemental feeds (read at runtime; `id`, `title`, `description`, `size`, `color`, `custom_label_0–4`, `promotion_ID` when captured); other fields belong in the primary feed. | [vendors.md](references/vendors.md#supplemental-feed-limits) |
| Market | Prices come from price selection (currency, country, channel); availability from inventory, blank without inventory entries. | [selecting-products.md](references/selecting-products.md#market-context) |

## Reference index

| Topic | Reference |
| :--- | :--- |
| Credentials, scopes, `--list-stores`, filters, store assortment, market context, dry run | [references/selecting-products.md](references/selecting-products.md) |
| `mapping.json`, working files, finalize, reading the gap report | [references/mapping-and-files.md](references/mapping-and-files.md) |
| Runtime vendor specs, per-vendor facts, file formats, upload steps (OpenAI manual upload, OpenAI Ads feed, Google and Microsoft supplemental feeds) | [references/vendors.md](references/vendors.md) |

## Scope

In scope: read-only export of published (or `--staged`) product data, variant-level rows,
price selection, inventory-based availability, Store and seller data, required-field checks
per vendor, working files for offline completion, conversion of completed files into vendor
upload formats, upload guidance.

Out of scope: uploading files, deciding whether to upload, recurring delivery (a Connect job,
see `commercetools-connect`), shipping and tax settings (configured per account in each
merchant center), and changing product data in commercetools.

## Checklist

- [ ] The vendors were named by the user (asked when missing, listing OpenAI Commerce feed,
      OpenAI Ads feed, Google and Microsoft), and only those were built.
- [ ] Flags stayed at their defaults (discovery on, checkout off, ads on only for the OpenAI Ads feed)
      unless the user asked otherwise.
- [ ] The selection, Store, currency, country and locale were confirmed with the user, and
      the dry run resolved every product selection, category and product type.
- [ ] The download used an API client with `view_products` and `view_categories` (plus
      `view_product_selections` / `view_stores` when used), and no secret was printed.
- [ ] Per vendor, the user knows which required fields are filled and which are missing,
      with example SKUs. Mapping gaps were fixed in `mapping.json` with the user's agreement.
- [ ] No product content was written or inferred; `mapping.json` only points at attributes
      and fields; the completed file was converted without changing its values.
- [ ] The report says which spec was used per vendor (live with fetch time, or the built-in
      list when the fetch failed); new or removed spec fields were mentioned.
- [ ] The user has the working files, `NEXT-STEPS.md`, the finalize report when a completed
      file was converted, and the upload guidance for each vendor.
