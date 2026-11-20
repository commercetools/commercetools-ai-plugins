---
name: source-data-traps
description: "Source values that pass every check in the pipeline and are still wrong: a mis-declared encoding, underscore locale tags, option labels that collide as keys, HTML entities in plain-text fields, and scoped values that override the default. How to detect each in the snapshot and what the adapter does about it."
metadata:
  contentType: REFERENCE
---

# Source data traps

Read this while writing the adapter, after profiling
([source-discovery.md](source-discovery.md)). Each trap below produces a feed
that is well-formed, correctly typed and validates, so nothing downstream
catches it. The adapter has to look for it in the source, and the profile is
where to look first.

- [Encoding: verify it from the bytes](#encoding-verify-it-from-the-bytes)
- [Locale tags](#locale-tags)
- [Two options with the same label](#two-options-with-the-same-label)
- [HTML entities in plain-text fields](#html-entities-in-plain-text-fields)
- [A scoped value that overrides the default](#a-scoped-value-that-overrides-the-default)
- [Checklist](#checklist)

## Encoding: verify it from the bytes

A declaration can be wrong. An XML prolog saying `latin1`, or an export doc
claiming a codepage, is a claim about the file, not a fact. Trusting
`encoding="latin1"` on a file that is actually UTF-8 puts `Â°C` into the
attribute label. That exact signature is what to look for, and
`MODEL-REVIEW.md` is usually where it first becomes visible. `file *` costs
nothing. Check the degree signs, the accented names and the currency symbols
in the first artefact you generate.

## Locale tags

Many sources write `en_GB`; commercetools requires `en-GB`. Re-key every
localized map, and make sure the default locale is populated: a localized field
with no entry for the default locale renders empty.

A tag says which language a text claims to be in, not which it is. Take the
language from the source's settings and check the text, per field. A language
the project does not have is a step-0 question, never a reason to borrow one of
the project's tags
([step-0-conditionals.md](step-0-conditionals.md#if-the-texts-are-in-a-language-the-project-does-not-have-ask-which-way-to-go)).

## Two options with the same label

A source can hold two options of one attribute with the same label, usually a
duplicate someone created and never cleaned up ("Wool" twice under material).
An adapter that derives enum keys from labels gives both the same key, and the
feed silently merges them.

- Group each attribute's options by the key you derive, before mapping values.
- **Only one of the pair is in use**: drop the unused twin, and report it.
- **Both are in use**: stop. Merging them merges products the source keeps
  apart, and splitting them needs a second label. Which one is right is a
  question for whoever owns the product data.

## HTML entities in plain-text fields

Shop systems that render every field as HTML often store `&trade;`, `&reg;`,
`&frac12;` or `&amp;` in names and option labels. commercetools stores a name or
an enum label as the string it is given
([LocalizedString](https://docs.commercetools.com/api/types.md#localizedstring)), so the Merchant Center, search and any
frontend that does not decode HTML show the entity as written.

- **Decode in plain-text fields only**: names, attribute and option labels,
  plain text attributes. Never decode an HTML description: there the entity is
  correct markup.
- Decode from a list of entities you have seen in the profile, and stop on one
  that is not on it, rather than guessing.
- Report each decoded field: it is a change to the source's text.
- Derive keys from the decoded label, so `Cotton&trade;` and `Cotton™` do not
  become two keys.

## A scoped value that overrides the default

Systems with store views, channels or websites keep a default value per field
and let each scope override it. An adapter that reads the default scope
ignores every override without a sign. An override is one of three things,
and only the profile says which:

- **A translation**: text on a scope that stands for a locale. Map the scope to
  the locale and read it as that locale's value.
- **A per-scope setting**: a flag, an option or a status that differs per
  store. The feed holds one value per product, so stop and ask which value is
  right, or carry it explicitly (separate attributes, a store-specific model).
- **A per-scope price**: price scopes, not an attribute
  ([pricing-and-money.md](pricing-and-money.md#price-scope)).

Compare every scoped value with the default. On a field the adapter reads,
stop unless it is a translation it maps. On a field it does not read, count the
overrides and report them as not migrated.

## Checklist

- [ ] Encoding confirmed from the bytes, and the first artefact checked for `Â` signatures
- [ ] Locale tags re-keyed to `xx-YY`, default locale populated, each tag naming the text's real language
- [ ] Options grouped by derived key; unused twins dropped and reported, used twins stopped on
- [ ] Entities decoded in plain-text fields only, from a known list, each reported
- [ ] Every scoped value compared with the default and classified as translation, setting or price
