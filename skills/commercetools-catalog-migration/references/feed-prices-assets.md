---
name: feed-prices-assets
description: "The feed records for quantity-break price tiers and for assets."
metadata:
  contentType: REFERENCE
---

# Feed records: price tiers and assets

These records are part of the canonical catalog feed. The shape, the variant axes and the two load-bearing rules are in [catalog-feed-contract.md](catalog-feed-contract.md).

## Price tiers — quantity breaks

A price can carry `tiers`, the quantity breaks of that one price:

```jsonc
{"currency":"GBP","amount":"19.99","country":"GB",
 "tiers":[{"minimumQuantity":10,"amount":"17.99"},{"minimumQuantity":50,"amount":"15.50"}]}
```

Embedded and Standalone Prices both support tiers, and the pipeline maps the
field to either. A tier has no `currency`: it is always in the currency of the
price it belongs to, and `amount` is a decimal string converted like any other
price. Once `minimumQuantity` is reached, the tier price applies to **the whole
quantity** of that line item, not only to the units above the threshold — see
[Tiered pricing](https://docs.commercetools.com/api/pricing-and-discounts-overview.md#tiered-pricing).

The schema and the audit gate refuse what the Import API refuses: a
`minimumQuantity` below 2, because the base price covers a single unit, and two
tiers at the same quantity. Order does not matter. A tier is ignored while a
Product Discount applies to its price.

`image.url` accepts a relative path. Emit what the source holds rather than
resolving it: the host is usually not in the export, and the contract used to
require an absolute URI, which forced adapter authors to invent one.

A feed with any relative URL needs `media.baseUrl` in the config. `validate`
refuses the pair without it — naming the count, an example and the decision —
and `plan` resolves against it via RFC 3986, so a root-relative `/medias/x.jpg`
ignores any path on the base. Absolute URLs are untouched, and mixing is fine.

Assets follow the same rule — see `asset` below. Both are media, and a second
media path with its own resolution is how one of them ends up wrong.

## `asset`

On a **variant** or a **category**. An asset holds *several* sources, which is
the reason to prefer it over `images`: an image carries exactly one URL, so a
source with thumbnail, product and zoom renditions has to discard two of them.
A hybris MediaContainer, or any format table, is one asset with one source per
format.

| Field | Notes |
| :--- | :--- |
| `code` | required, stable — becomes `<prefix>-<code>`, because `Asset.key` is required by the API. **Unique per variant or per category, not per project** — see below |
| `sources` | required, **at least one** |
| `name` | optional, localized — derived from `code` when absent, and recorded as information loss |
| `description` | optional, localized |
| `tags` | optional strings |

Each source:

| Field | Notes |
| :--- | :--- |
| `uri` | required; relative or absolute, resolved exactly as an image URL is |
| `key` | optional — what tells renditions apart, e.g. `zoom`. Unique within the asset |
| `contentType` | optional |
| `width`, `height` | optional; both or neither, emitted as `dimensions`. Absent means `0x0`, with the same cost as an image's — see the `images` row |

**The uniqueness scope is the owner, not the project.** The API is explicit:
`Asset.key` "is unique per Category or ProductVariant". So one source asset
reused across the sizes of a colour is **one code on several variants**, which
is legal and usually what you want — the source's own container code can go
straight through. Only two assets on the *same* variant may not share a code
(`duplicate-asset-key`).

This is worth stating because the opposite assumption — asset keys unique
project-wide — makes the natural mapping look illegal and pushes an author
into inventing per-SKU codes to satisfy a rule that does not exist. An
over-strict reading here does not merely add noise; it changes the shape of
the data.

The audit gate checks the asset key like any other key — charset, and no two
assets on one owner claiming one — plus at least one source, a name in some locale, and
no duplicate source keys inside an asset. `verify` compares assets by key and
source URI, because an asset pointing at the wrong file renders a broken image
and nothing else reports it.
