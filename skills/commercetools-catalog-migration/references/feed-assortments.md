---
name: feed-assortments
description: "The feed records for assortments: productSelection and store, how prices, channels and stores relate, which products exist for a store, and why the load order inverts."
metadata:
  contentType: REFERENCE
---

# Feed records: product selections and stores

These records are part of the canonical catalog feed. The shape, the variant axes and the two load-bearing rules are in [catalog-feed-contract.md](catalog-feed-contract.md).

## `productSelection` and `store` — assortments, and where they apply

These two answer a different question from everything else in the contract: not
*what* the catalog contains, but **which products exist, and at what price, in
a given shopping context.** They also split along the line that organises this
whole pipeline:

| | Import API | Key | Teardown |
| :--- | :--- | :--- | :--- |
| `productSelection` | **yes**, resource `product-selection` | `<prefix>-<code>` | removed by a prefix-scoped teardown |
| `store` | **no** — platform API | **verbatim** | left behind |

### How prices, channels and stores actually relate

There is **no `store` field on a price.** Ever. The relationship is indirect
and mediated entirely by channels:

```
Price ──carries──> Channel (role: ProductDistribution)
                      ^
Store ──lists─────────┘  distributionChannels[]
```

In a store's context the candidate prices are those whose channel the store
lists, **plus every price with no channel at all**. Selection among the
candidates then follows the documented fallback: customer group + channel +
country, then progressively dropping dimensions, down to the bare price.

Three consequences worth planning around:

- **The channel is the pricing unit; the store is only the binding.** Giving
  three stores three different prices means three *channels*. A store with no
  distribution channels sees only channel-less prices.
- **Equal specificity is ambiguous, and the platform will not resolve it.** If
  a store lists two distribution channels and a variant is priced in both, both
  match at the same fallback step, and the storefront has to disambiguate with
  `setLineItemDistributionChannel`. Modelling "one channel per price list *and*
  one per store" is legal and needs middleware — know that before choosing it.
- **Cheapest wins within a step.** A stray channel price silently undercuts the
  intended one rather than erroring.

`supplyChannels` is the inventory twin — the same Channel resource with the
`InventorySupply` role. It is **wiring only**: the stock itself is
[`inventoryEntry`](feed-prerequisites.md#inventoryentry--stock-per-sku-and-supply-channel) records
naming that channel. A store listing a supply channel nothing stocks gets
created, wired and empty, so `validate` warns
(`store-supply-channel-unstocked`) rather than letting a correct-looking store
imply migrated stock. The reverse warns too: a store that lists supply
channels projects stock **only** from those (plus project-wide stock), so a
stocked channel no store lists is invisible through every such store
(`inventory-supply-channel-not-in-store`). A store listing none filters
nothing.

### Product selections decide which products exist

A selection is a named subset of the catalog. On its own it does **nothing** —
it takes effect only when a store references it.

| `productSelection` field | Notes |
| :--- | :--- |
| `code` | required |
| `name` | required, localized |
| `mode` | `Individual` (allowlist) or `IndividualExclusion` (denylist). Defaults to `Individual`. **Permanent** |

**The mode is fixed at creation, and re-importing does not say so.** The
update actions are `setKey`, `changeName`, add/exclude/remove product and the
variant setters — there is no `changeMode`. Importing a different mode onto
an existing key reports **`imported`** and leaves the mode untouched: nothing
fails, nothing warns, and the assortment means the opposite of the plan. The
API does not document this, so treat it as observed behaviour rather than a
guarantee — but do not design around the import fixing a mode. It belongs in
the same class as `attributeConstraint`:
`preflight` reports a conflict with an existing selection as an error, `verify`
reports drift as "delete and recreate", and `plan` records the choice as
irreversible. Choose by which list is shorter to *maintain*, not which is
shorter today.

Membership is authored **on the product**, not on the selection:

```jsonc
{"_type":"product","code":"TEE","selections":[{"code":"uk-assortment"}]}
{"_type":"product","code":"DRESS","selections":[{"code":"uk-assortment","includeSkus":["D-S","D-M"]}]}
```

| `selections[]` field | Notes |
| :--- | :--- |
| `code` | required — a declared `productSelection` |
| `includeSkus` | only these variants |
| `excludeSkus` | all variants except these. **Mutually exclusive with `includeSkus`** |

With neither, every variant is in. A SKU that is not a variant of *that*
product selects nothing and the platform prunes it silently, so `validate`
makes it an error.

Two things follow from the Import API's shape, and they are the reason the feed
is authored this way round:

- **Assignments cannot be split.** The API replaces omitted fields, so all of a
  selection's assignments travel in **one** resource. `plan` inverts the
  product-side authoring and assembles the complete list per selection; there
  is no batching to fall back on, and an assortment of twenty thousand products
  is one large request. `plan` flags anything above a thousand for review.
- **One line per record stays true.** A selection carrying its assignments in
  the feed would be a single twenty-thousand-element line.

### Stores decide where it all applies

| `store` field | Notes |
| :--- | :--- |
| `code` | required — the store's key in the project, **verbatim** |
| `name` | optional, localized |
| `languages`, `countries` | optional; must be a **subset of the project's**, checked by `preflight` |
| `distributionChannels` | codes of declared channels, each needing `ProductDistribution` |
| `supplyChannels` | codes of declared channels, each needing `InventorySupply` |
| `productSelections` | at most 100, each `{code, active}`; `active` defaults to true |

Deliberately unsupported: `storefront` URLs and `custom`. Neither is catalog
data, and neither can be validated or verified here.

**The activation rule reads backwards, so read it twice:**

| Store's `productSelections` | Products offered |
| :--- | :--- |
| empty | **all of them** |
| at least one active | only the active ones' contents |
| all inactive, ≥1 `Individual` | **none at all** |
| all inactive, only `IndividualExclusion` | all of them |

An *empty* list is permissive; a list that is switched off is not.
`validate` makes the third row an error (`store-exposes-no-products`), because
it is the one an author reaches by accident while trying to stage a rollout.

### Loading, and why the order inverts

A store references selections that the **Import API creates asynchronously**,
and a store cannot be created pointing at one that does not exist yet. So
`store` is a platform stage that runs **last**, after every import — not
alongside `channel`, `customer-group` and `tax-category`, which must run first.

`load` **refuses without `--wait`** when a store references selections. Without
waiting there is no moment at which the store stage is safe, and refusing up
front is cheaper than a catalog whose stores were never wired.

An existing store is **never modified**. `setDistributionChannels` and
`setProductSelections` replace the whole array, so applying a plan over a store
the project already configured would discard wiring this migration knows
nothing about. `preflight` and `load` both report the difference and stop.
