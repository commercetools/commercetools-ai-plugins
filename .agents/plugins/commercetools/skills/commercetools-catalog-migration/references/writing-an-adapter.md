---
name: writing-an-adapter
description: "Writing the per-engagement adapter that turns a source export into the canonical feed: what to establish first, the rules that matter, stock and media handling, and what good output looks like."
metadata:
  contentType: REFERENCE
---

# Writing a source adapter

The adapter is the only code an engagement normally writes. It reads the source
and emits NDJSON against
[the feed contract](catalog-feed-contract.md). It is deliberately small and
deliberately disposable — typically a couple of hundred lines.

Everything source-specific belongs here. Nothing source-specific belongs
downstream.

## Establish what the source is before writing any mapping

A migration designed against an assumed source model gets rewritten. Answer as
much of this as the export allows, from the export itself rather than from
documentation about the source system.

[source-discovery.md](source-discovery.md) is the method for answering these
from data rather than by hand — profile a sample, emit a throwaway probe feed,
and let `derive` propose the types. Work through that first; this list is what
it is trying to answer.

**Coverage**

- How many products, variants, categories, and prices? Orders of magnitude, not
  exact counts — it decides whether the load design matters.
- Is this the whole catalog or a sample? A sample that behaves differently from
  production is worse than no sample.
- Which locales and currencies actually appear in the data, as opposed to which
  are configured somewhere?

**Identity**

- What is the stable machine identifier for a product? For a sellable SKU?
- Can it change between exports? If yes, keys derived from it will duplicate
  rather than update, and that has to be solved before anything else.
- Is there a separate identifier downstream systems join on? It goes in
  `externalId`.

**The type system**

- Does the source declare attribute types, or are they implied by values?
  Declared means emitting `attributeDefinition` records; implied means the
  pipeline has to infer, and every inference needs review.
- Are attributes split across more than one place? Many platforms keep some
  attributes in a product type definition and most of them in a separate
  classification or taxonomy structure. Mapping only the first half is a common
  and expensive mistake — check for a second source before designing anything.
- Which attributes vary per variant, and which are invariant per product?
- Which attributes constitute variant identity?

**Variants**

- How many levels does the hierarchy have? commercetools has exactly one, so
  anything deeper collapses in the adapter.
- What distinguishes two variants of the same product? Is that value a stable
  code, or display text?
- Are there non-sellable intermediate levels? They usually become nothing.

**Prices**

- Is a price inherited from anywhere? commercetools does not inherit between
  variants, so inheritance resolves here.
- What dimensions scope a price — currency, country, customer group, channel,
  date range, quantity?
- Are prices net or gross? This is often a setting elsewhere in the source, not
  a property of the price row, and getting it backwards changes every price by
  the tax rate with nothing in the data to contradict you.
- Quantity breaks: the feed contract has no field for price `tiers`, in either
  price mode. Expect to report them.

**Tax**

- Does a product carry a tax class — a group, code or category it is taxed
  under? That is the product's `taxCategory`. The rates almost never sit on
  the product: they are in a tax configuration keyed by that class, often by
  customer group as well, and sometimes only in the storefront or an ERP.
- Is tax computed by the platform today, or by an external service? A class
  that is only a code handed to a tax engine carries across as that code, and
  its rates do not exist in the export at all.

**Media**

- Are image paths absolute or site-relative? If relative, **the host is not in
  the export** — it is a question for whoever owns the storefront or CDN.
- How many renditions per shot? More than one means `assets`, not `images`.
- Does the source carry real dimensions, or will they default to 0×0?

**Categories**

- Is the tree navigation, or is it really a set of facets? A taxonomy used for
  filtering is usually better as attributes.
- Are names unique? Retail taxonomies reuse them across departments, which
  forces slug disambiguation.
- Is there a sibling ordering worth preserving?

## Shape of an adapter

```
read source  →  assemble  →  emit
   parse         rebuild      one NDJSON
   the grammar   hierarchies  record per line
                 resolve
                 inheritance
```

Split parsing into **syntactic** (the file grammar — headers, cells, encodings)
and **semantic** (what the rows mean — rebuilding hierarchies, attaching prices
at the level they were declared). Conflating the two makes both untestable.

Emit in any order. The contract allows forward references, so there is no need
to buffer the whole catalog to get ordering right.

## Rules that matter

**Drive type coercion from the source's declared types, never from a list of
field names.** A name allowlist — "these four fields are dates" — fails silently
on the next export: the value lands as the wrong JSON type and commercetools
rejects the whole record with a terse error.

**Emit `attributeDefinition` records if the source declares types at all.** It
is the difference between a translation with a defensible origin for every
choice and a pile of guesses needing sign-off.

**Never repair source data silently.** If a cell holds a sentinel value, a
placeholder, or obvious junk, either skip it and report it or pass it through —
quietly cleaning it is how a migration starts lying about what the source
contained.

**Report every silent cap.** If the adapter samples, truncates, or skips, say so
in its output. Partial coverage that reads as complete is worse than an error.

**An attribute the source declares but never populates: the target will not
carry it, so say so.** The pipeline builds each ProductType from the attributes
its products actually set, and leaves out a declared attribute no product sets.
That is deliberate: it would sit empty on every ProductType, and the
[product-modeling guidance](https://docs.commercetools.com/learning-model-your-product-catalog/product-modeling/product-types.md)
is to avoid attributes with no clear use. Emitting the definition therefore
does not keep the target's model faithful to the source's. It only makes
`validate` report `attribute-never-populated`, which is the right signal for a
field the adapter dropped by mistake. Either way, **record that the field was
left off**, because a later reader comparing the two models will otherwise
wonder whether it was missed.

**Normalise locale tags.** Many sources write `en_GB`; commercetools requires
`en-GB`. Re-key every localized map, and make sure the default locale is
populated — a localized field with no entry for the default locale renders empty.

**Verify the encoding from the bytes; a declaration can be wrong.** An XML
prolog saying `latin1`, or an export doc claiming a codepage, is a claim about
the file, not a fact. Trusting `encoding="latin1"` on a file that is actually
UTF-8 puts `Â°C` into the attribute label — that exact signature is what to
look for, and `MODEL-REVIEW.md` is usually where it first becomes visible.
`file *` costs nothing, and mis-decoded
text survives every validation in this pipeline — it is well-formed, correctly
typed, and wrong. Check the degree signs, the accented names and the currency
symbols in the first artefact you generate.

**Derive a code when the source only has a display value.** Especially for
variant axes. Record how it was derived; that is a decision, not a detail.

**Choose the master variant deliberately, because the fallback is arbitrary.**
With no `isMaster`, the pipeline takes the **lowest SKU by sort order** and
records the choice for review. That is deterministic on purpose — a
feed-order-dependent master would silently change between runs — but it is not
a merchandising decision, and the master variant is what a storefront shows by
default and what a category listing puts in the shop window.

This is not an edge case. Most source systems have no master-variant concept
at all: in a hybris export the base product *is* the style, so every product
gets its master by sort order — which is how a dress ends up fronted by
`Navy XXL`. The dry run's `load-requests.json` is where that is visible
before the load, and usually the only place.

If the source has any signal — a display order, a hero image, a "default
colour" — map it to `isMaster`. If it has none, that is a question for whoever
owns merchandising, and it is cheap to ask at step 0 and expensive to change
after the first load.

## Stock

Emit `inventoryEntry` records **from the stock file, on its own pass** — not
by folding a quantity onto each variant as you build it. The two are joined
only by SKU, and keeping the passes separate is what lets a stock refresh be
regenerated without rebuilding the catalog.

Three things go wrong here, and none of them errors:

- **A stock row for a SKU the catalog does not have.** Extracts routinely
  carry discontinued lines. `validate` rejects these, which is the point —
  the Import API would accept them.
- **An emitted zero versus an omitted row.** They mean different things: zero
  is "none in stock", absent is "no entry at all", and most storefronts render
  the second as available. If the source distinguishes them, preserve the
  distinction; if it does not, say which reading you chose in the adapter
  report.
- **A warehouse column read as project-wide stock.** Summing per-warehouse
  rows into one figure is a decision, not an aggregation: it makes stock
  count in every store rather than the ones that list the channel. Either map
  each warehouse to a `supplyChannel`, or record the collapse as lossy.

## Tax

Emit one `taxCategory` record per tax class the catalog uses, and set
`taxCategory` on each product from its class. Most sources hold the class on
the product and the rates in a separate table keyed by class; join them in the
adapter, the same way stock is joined by SKU.

Five things go wrong here, and none of them errors:

- **A percentage emitted as a rate.** Sources store `20`, the contract takes
  `0.2`. The schema refuses anything above 1, so `20` is caught — but a rate
  under one percent is not: `0.5` meaning 0.5% passes as 50%. Convert every
  rate in one place, and check the smallest one by eye.
- **`includedInPrice` taken from the wrong place.** It is rarely on the rate
  row. Look for the store-level net/gross setting — a hybris `BaseStore.net`,
  a "prices include tax" flag — and state it on every rate. It has no default
  because guessing it shifts every price by the rate.
- **Rates scoped by customer group.** commercetools selects a rate by country
  and state only. A source with separate trade and retail rows for one class
  cannot express both on one category: pick the one the storefront charges,
  and record the other as lossy.
- **A tax class per variant.** Some sources tax each SKU on its own — Magento
  taxes a configurable's child simples, not the parent — and commercetools
  holds the tax category on the **product**. A product whose variants carry
  different classes (a children's jacket whose largest size is standard-rated)
  cannot be expressed. Check for it explicitly: taking the parent's class, or
  the first child's, silently charges the wrong rate on the others. The
  options are to split the product by class, hold the odd SKUs back, or pick
  one class and record the rest as lossy — and which one is a question for
  whoever owns tax and merchandising, not a mapping detail.
- **A class the project already has, under another key.** A category that
  exists is never modified, and its *name* is unique per project. If the
  project's tax setup predates the migration, use its keys as the codes —
  `preflight` refuses a new category whose name another one already holds.

If the source has no tax classes at all, emit no `taxCategory` records and say
so in the adapter report. `validate` then warns once that no product can be
taxed under `Platform` mode, which is the right warning to accept under
`External` mode and the wrong one to accept otherwise.

## Media

Images are a normal migration concern and they have three decisions in them,
none of which the data answers.

**Emit the URL as the source stores it, relative or absolute.** Do not
resolve it in the adapter and do not invent a host. Sources very often keep a
site-relative path — `/medias/sys_master/root/h9c/...` is the hybris shape —
and the host lives in a CDN setting or a storefront config, not in the export.

The pipeline owns this. `validate` refuses a feed carrying relative URLs unless
`media.baseUrl` is set, so the decision is forced into the open instead of
being guessed; `plan` then resolves each relative URL against that base and
records the count and the base as a reviewable decision. Absolute URLs pass
through untouched, and a feed may legitimately mix the two.

Do not work around this by inventing a hostname to get a feed to validate.
That is what a contract requiring an absolute `url` would force, and it is
precisely the guess the current rule exists to prevent.

If no host can be obtained, drop the images in the adapter and report them as
not migrated. An absent image is recoverable; a wrong URL on every product is
not, because it looks like success.

**Several renditions per shot go in an `asset`, not an `image`.** Sources
commonly hold thumbnail, product and zoom behind a container or a format table.
An `image` carries exactly one URL, so using it means discarding the rest; an
`asset` holds one **source** per rendition, each with its own key, dimensions
and content type. A hybris MediaContainer maps to one asset, and nothing is
lost.

Use `images` when the source genuinely has one URL per shot. Use `assets` the
moment it has more, and key the sources after the source's own format names
(`thumbnail`, `product`, `zoom`) rather than inventing a scheme — the keys are
how a storefront asks for a size.

If you do have to reduce several renditions to one image, larger is the safer
default: a storefront can scale down and cannot scale up. Record the choice —
"the middle one" is a decision a retina storefront will disagree with.

**Dimensions are required, and 0×0 is accepted.** If the source has real
width and height, emit them. If it does not, the pipeline defaults to 0×0 and
records it as information loss — a storefront reserving layout space from the
declared size then cannot. That is worth knowing before go-live rather than
after a page reflows.

Two smaller things worth stating in the proposal: image **order** is
significant in commercetools and usually meaningful in the source, so preserve
it rather than emitting whatever the join returned; and `label` is optional but
is what alt text comes from, so dropping it is an accessibility cost, not a
cosmetic one.

## Iterating

Run `validate` after every adapter change. Its diagnostics name a file and line
in the feed, and they are written to be actionable:

```
ERROR catalog.ndjson:17 [axis-combination-duplicate]
      Variants 'COLLAPSED-M-1' and 'COLLAPSED-M-2' share the axis combination
      size=M. Axes become CombinationUnique, so commercetools will reject the
      product. Either the hierarchy was collapsed wrongly, or an axis is missing
      from the declaration.
```

Fix the adapter, never the feed. The feed is regenerated on every run.

A useful first milestone is a **thin vertical slice**: one product with two
variants, two prices and a category, all the way through `audit`. It exercises
every stage and every invariant in seconds, and it surfaces identity and
type-system problems while they are still cheap. A slice leaves some declared
tax categories and channels unreferenced; set `feed.subset: true` for it (see
[running-the-pipeline.md](running-the-pipeline.md)) so `validate` says so once
instead of warning per prerequisite.

## What good output looks like

- Codes are stable machine identifiers, and `externalId` preserves the raw
  source identifier.
- Axis values are codes; display text is in `axisLabels`.
- Every SKU has an explicit price, with inheritance already resolved.
- Locale tags are IETF form and the default locale is populated everywhere.
- Money is a decimal string with no more precision than its currency allows.
- Anything the adapter could not express is reported rather than approximated.
