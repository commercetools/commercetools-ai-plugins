---
name: categories-and-slugs
description: "Rebuilding the category tree, project-wide per-locale slug uniqueness and how collisions are disambiguated, and encoding a legal order hint from sibling order."
metadata:
  contentType: REFERENCE
---

# Categories, slugs and order hints

Reference: [Categories](https://docs.commercetools.com/api/projects/categories.md).

Limit: 10,000 categories per project (soft; increasable after a performance
review — see [limit increase guidance](https://docs.commercetools.com/api/limit-increase-guidance.md)).

## The tree

Categories carry a single `parent`. The feed allows forward references, so an
adapter can emit in any order; the mapper emits parents before children so the
import can also be streamed in that order.

Cycles and missing parents are caught by `validate`; a parent reference that
survives into the plan but names nothing is caught by `audit`. An unresolved
KeyReference would otherwise sit in the Import API for 48 hours and then expire.

## Slugs are unique across the Project per locale

The same slug may repeat across **locales of one category**, but not across two
categories. Pattern: `[A-Za-z0-9_-]{2,256}`. Indexes cover the first 15 project
languages, so slug queries beyond that are slower.

Retail taxonomies reuse names freely — "Accessories" under both Menswear and
Womenswear — so collisions are **normal** and have to be resolved rather than
reported and abandoned.

Resolution appends the source code, which keeps the result traceable to the
record that produced it:

```
mens-acc    →  accessories
womens-acc  →  accessories-womens-acc
```

This changes the URL the migration produces, so it is recorded as information
loss. Generate the slug report from the plan, not from the loaded project: the
old URL structure only exists before cutover, and the SEO owner needs to see the
changes forced by project-wide uniqueness while there is still time to argue.

Appending the code is a default the pipeline applies, not a decision anyone has
made. So when `derive` reports collisions, ask two things, not one: which
suffix policy the business wants, and **who owns the URLs**. Logging every
changed URL against nobody reads as a decision and is not one. The question and
why it is asked are in
[step-0-interview.md](step-0-interview.md#0c-conditional-if-slugs-collide-ask-who-owns-the-urls).

Derivation from a name strips diacritics by decomposing them rather than
dropping the letters, so `Oberbekleidung für Männer` becomes
`oberbekleidung-fur-manner` rather than a run of dashes. A name that slugifies to
nothing — punctuation only, or a non-Latin script with no transliteration —
falls back to the source code.

Product slugs follow the same uniqueness rule and the same pattern.

## Order hints

An order hint is a **string** holding a decimal strictly between 0 and 1, and it
**must not end in `0`**.

Both halves matter, and the second one catches people out: the natural
implementation is to zero-pad an index so the values sort correctly, but that
produces `0.10` for the tenth sibling, which is rejected.

The encoding used here pads to a fixed width and appends a non-zero terminal
digit. Fixed width makes the values sort in the same order as the positions they
encode; the terminal digit keeps them legal. Because every value has the same
width, appending it cannot change the relative order.

```
position 1 of 3    →  0.11
position 2 of 3    →  0.21
position 1 of 12   →  0.011
position 10 of 12  →  0.101
```

Supply `sourceOrder` in the feed and let the pipeline encode it. Supply
`orderHint` directly only if the source genuinely holds a valid (0,1) string.

If the source has no ordering at all, siblings are ordered by code and a decision
is recorded saying so — navigation order is a merchandising decision, not a
migration one.

Order hints are scoped to a **sibling group**, so two categories under different
parents legitimately share a value.

## Modelling questions worth raising

**Is the tree navigation, or facets?** A taxonomy used for filtering is usually
better as attributes. Flattening a facet-shaped tree into categories produces a
navigation nobody wants to browse.

**Are there cross-cutting editorial groupings?** Seasonal or campaign
collections often deserve a second category tree rather than being flattened
into a set of codes, which loses their date windows.

**Do categories carry attributes?** Category-level fields need a `Type`
definition for custom fields. Out of scope for this pipeline today.

**Empty leaves.** A leaf category with no products and no children renders as an
empty page. Reported as a warning, since it is usually a sign the source tree
was migrated more completely than the products were.

## Other fields

- `externalId` preserves the source identifier alongside the key, so downstream
  systems can still join on it. Populated from the feed's `externalId`, falling
  back to the source code.
- `description` passes through when supplied.
- Meta title, description and keywords are not mapped today — they are SEO
  content, usually owned elsewhere, and inventing them from a name is worse than
  leaving them empty.
