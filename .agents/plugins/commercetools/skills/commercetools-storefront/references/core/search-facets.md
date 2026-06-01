---
name: search-facets
description: Faceted search with product-type attribute definitions, facet expressions, postFilter building, and facet UI renderers.
when_to_use:
  - "Implementing full-text search with filtering"
  - "Deriving facets from product-type schemas"
  - "Building filter panels"
  - "Handling facet selections via URL params"
metadata:
  contentType: REFERENCE
  area:
    - search
    - plp
    - navigation
---

# Search facets
**Impact: HIGH — Wrong implementation results in error**
  
Full-stack faceted search for a commercetools storefront — deriving facets from product-type
attribute definitions, mapping commercetools attribute types to the correct ProductSearchFacetExpression
shape, returning facet results from the search function, building a client-side filter panel
that reads/writes URL params, and translating those selections back into a commercetools postFilter.
Use this skill whenever you are adding facets to a commercetools Product Search request, building filter
UI data, implementing getSearchableAttributes, wiring facet selections to the URL, or deciding
whether an attribute should produce a distinct vs ranges facet expression.

## What this skill covers

The complete lifecycle of faceted search: building the facet request from the catalog schema,
surfacing the facet response in the UI, letting users make selections that round-trip through
the URL, and translating those selections back into a commercetools `postFilter` on the next search call.

---

## Source of truth: product type attribute definitions

The commercetools catalog declares which attributes are filterable through the `isSearchable`
flag on each `AttributeDefinition`. Read from this — facets then stay in sync with the catalog
schema without any manual configuration.

Fetch all product types and flatten their attribute arrays. Deduplicate by attribute name
(first occurrence wins) because multiple product types often share attribute names, and the
field path in the search index is the same regardless of which type defined it.

Return `AttributeDefinition[]` directly from the SDK — it already contains everything needed
to derive both the facet expression shape and the postFilter field paths, so no parallel
intermediate type is needed.

Cache this result aggressively (at least one hour) with `unstable_cache` from `next/cache`.
Product type schemas change rarely; the savings on every search call are meaningful.

---

## Mapping attribute types to facet expressions

`AttributeType.name` values map almost directly to `SearchFieldType`. The only mechanical
transformation: for `set` types, prefix the inner type name with `set_` (e.g. `set_enum`).

Skip `reference` and `nested` — they are not meaningfully facetable.

**Ranges** — numeric or temporal: `number`, `money`, `date`, `datetime`, `time` (and `set_*` variants)

A single open-ended `{ from: 0 }` is a valid starting point — it surfaces counts and can be
replaced with business-defined buckets later.

**Distinct** — everything else: `boolean`, `enum`, `lenum`, `text`, `ltext` (and `set_*` variants)

---

## The lenum and enum subfield constraint

`lenum` and `enum` attributes store their value as `{ key, label }`. commercetools only allows querying by subfields —
point the facet field at `variants.attributes.<name>.key` and use `enum` for both as the effective
`fieldType` (not `lenum`), because the key is a plain enum key. Same rule for `set_lenum` and `set_enum` → field
at `.key`, `fieldType: set_enum`.

This is the only type that requires a path suffix.

Every other distinct type (`boolean`, `text`, `ltext`) carries its own type name as `fieldType` — the enum
special-case does not generalise. Hardcoding `'enum'` for all distinct types will cause commercetools to reject or
misinterpret fields whose actual type differs.


---

## Always-present facets

Always include these two regardless of attribute configuration, first in the array:

- **Stock** — `variants.availability.isOnStock`, `fieldType: boolean`, `distinct`
- **Price** — `variants.prices.centAmount`, `fieldType: number`, `ranges`

---

## Language on every facet expression

Pass the session locale as `language` on **every distinct facet** — both in the facet
expressions sent to commercetools and in every `exact` expression in the `postFilter`. commercetools needs it to
resolve localized bucket labels for `ltext` and localized enum labels. Passing it uniformly
to all fields (including non-localized ones like `enum` and `boolean`) is safe — commercetools ignores
it where it doesn't apply — and avoids per-type branching.

`ranges` facets and range filter expressions do not carry a language field since numeric and
temporal values are locale-independent.

---

## Returning facet results from the search function

`searchProducts` should return both `body.facets` (the response facet - data ask commercetools-developer-tips about ProductSearchFacetResult) and `searchRequest`
(the full request object that was sent). The client needs the request to match each response
facet by name and determine whether it is a `distinct` or `ranges` type — that information
lives in the request expressions, not in the response.

The facet `name` field is the stable link between request and response. Use the attribute name
directly for attribute facets, and short descriptive names (`isOnStock`, `price`) for the
hardcoded fields.

---

## Building the postFilter from URL selections

Alongside the facet expressions, maintain a metadata map keyed by facet name that stores each
facet's `field` path, `fieldType`, and kind (`distinct` | `ranges`). This is built at the same
time as the expressions so no second pass over attributes is needed.

When the user has active selections (passed in as `Record<string, string>` from `f_*` URL
params), translate them into a commercetools `_SearchQuery` for `postFilter`:

- **Distinct, single value** — `exact` expression with `field`, `fieldType`, `language`, `value`
- **Distinct, multiple values** — wrap multiple `exact` expressions in `or`
- **Boolean** — parse `"true"/"false"` string to a boolean before putting it in `exact`
- **Ranges** — parse the bucket key (format: `<from>-<to>`, `*` for open-ended) into numeric
  `gte`/`lte` bounds; use `SearchNumberRangeExpression` for `number`/`money`, `SearchLongRangeExpression` otherwise
- **Multiple active facets** — combine all per-facet clauses with `and`

Use `postFilter` (not `query`) so that facet counts reflect the full catalog while results are
filtered — this is the standard UX expectation for a filter sidebar.

---

## URL convention and client-side state

Store each active facet selection as a `f_<name>` URL param. This keeps selections shareable,
bookmarkable, and readable by the server page for the next render.

- Distinct multi-select: `f_color=red,blue`
- Range: `f_price=1000-5000` (matching the commercetools bucket key format)
- Boolean: `f_isOnStock=true`

When any filter changes, reset `offset` to 0 — otherwise users land mid-paginated results.

---

## Client-side filter panel

The filter panel is a `'use client'` component that receives `facets` and `searchRequest` as
serializable props from the server page. It:

1. Reads `f_*` URL params with `useSearchParams` to reconstruct current selections
2. Builds a name→expression lookup from `searchRequest.facets` to know each facet's kind
3. Iterates the response facets, skipping any with no non-zero buckets (nothing to show)
4. Dispatches to a `DistinctFacet` or `RangeFacet` component based on the request expression kind
5. Shows an `ActiveFilters` strip at the top when any selections are active
6. Updates the URL with `router.push` on every selection change, preserving unrelated params

Wrap the panel in a `<Suspense>` boundary on the server page — it reads `useSearchParams`
which requires Suspense in Next.js App Router.

---

## Distinct vs Range rendering

**DistinctFacet** — renders a checkbox per non-zero bucket. Multi-select: toggling a value
adds or removes it from the comma-separated URL param.

**RangeFacet** — renders each bucket as a clickable option (single-select). The bucket key
is the commercetools-formatted range string and goes directly into the URL; no client-side parsing needed
since the server-side postFilter builder handles it.

**ActiveFilters** — renders a pill per active selection with an × to clear it individually,
and a "Clear all" button when more than one is active.


## Checklist

- [ ] Never use any, unknown for type checking specially for facets. Always use types provided by @commercetools/platform-sdk
- [ ] Skip `reference` and `nested` attribute types
- [ ] Mapped `set` attribute type to `set_*` inner type name