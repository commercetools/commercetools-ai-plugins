---
name: step-0-conditionals
description: "The step-0 questions only some sources raise, each asked when discovery finds its trigger: stock in the export, slug collisions, relative media URLs, variants without a SKU, texts in a language the project does not have."
metadata:
  contentType: REFERENCE
---

# Step 0: questions only some sources raise

Each of these joins the interview file only when 0b found its trigger. Asked
anyway, it is noise; skipped when it applies, it lets an irreversible or silent
choice through. The rules of the interview file hold for every one of them
([step-0-interview.md](step-0-interview.md#the-interview-file)).

- [If the source carries stock, ask whether it is in scope](#if-the-source-carries-stock-ask-whether-it-is-in-scope)
- [If slugs collide, ask who owns the URLs](#if-slugs-collide-ask-who-owns-the-urls)
- [If 0b found relative media URLs, ask about the host](#if-0b-found-relative-media-urls-ask-about-the-host)
- [If variants have no SKU, ask where the keys come from](#if-variants-have-no-sku-ask-where-the-keys-come-from)
- [If the texts are in a language the project does not have, ask which way to go](#if-the-texts-are-in-a-language-the-project-does-not-have-ask-which-way-to-go)

## If the source carries stock, ask whether it is in scope

Most catalog exports carry a stock column, and its presence is not consent to
load it. Ask, and record the answer either way:

- **Who owns inventory after cutover?** If an ERP or OMS writes stock within
  the hour, the migrated figure is an opening balance and nothing more. That
  is still worth loading — a catalog that opens showing everything
  out-of-stock sells nothing on day one — but it changes how hard anyone
  should work to make it exact.
- **Is the export's stock current?** A figure taken from a nightly extract two
  weeks before cutover is worse than no figure, because a wrong number reads
  as authoritative while an absent one reads as unknown.
- **Per warehouse, or one number?** A store that lists supply channels sees
  stock only on those channels, plus project-wide stock; a store that lists
  none, or no store at all, sees everything. Getting this backwards makes
  stock either invisible or oversold, and neither shows up as an error.
- **If per warehouse: which store(s) sell from each warehouse?** The answer
  becomes `store` records whose `supplyChannels` list those warehouses. A
  warehouse no store lists, in a feed where some store lists others, is stock
  the storefront cannot see — `validate` warns
  (`inventory-supply-channel-not-in-store`). "No stores yet" is a valid
  answer; record it.

Write each question above as its own row in the interview file, not one
stock row: the freshness row is the one a person other than the answerer can
take, as `unknown, owner: <name>`, while "load it at all?" writes
`inventoryEntry` records and cannot be left open.

Skip it when the export carries no stock at all. Do **not** skip it because
stock looks like an implementation detail — it is the one field that decides
whether a loaded catalog can take an order.

## If slugs collide, ask who owns the URLs

Slugs are unique per locale across the Project, so a retail taxonomy that
reuses names forces suffixes — and a forced suffix is a **changed URL**, which
is an SEO decision and someone else's to make. `derive` and `plan` report the
count; what they cannot do is find the owner. Ask while the mapping is still
cheap to change, not after the load.

**Two questions, not one:** the policy, *and* the name. Asking only the
policy logs every changed URL against nobody, which reads as a decision and
is not one. The name is what makes the entry a decision rather than a guess.

Do not raise it when nothing collides.

## If 0b found relative media URLs, ask about the host

Raise it only then: it is not a standing question.

Sources often store `/medias/...` and keep the host in a CDN setting,
storefront config or runbook: it is **not in the export** and can only be
supplied. Put it plainly, with the cost: a wrong base loads a catalog whose
every image 404s, and nothing in the pipeline or project notices until
someone opens one.

Ask what host or prefix the paths resolve against; it writes
`media.baseUrl`. Two answers work. **A confirmed prefix**: the mapper resolves
every relative URL against it and records count and base as a decision. A path
starting with `/` drops the base's path: set the base to the host only, or
strip the `/` in the adapter and keep the directory in the base
([why](writing-an-adapter.md#media)). **No host**: drop the images in the
adapter and report them as not migrated. An absent image is recoverable; a
wrong URL on every product looks like success. Never guess: `validate`
refuses relative URLs without `media.baseUrl` for this reason. Absolute URLs
need no base, and a feed may mix both.

## If variants have no SKU, ask where the keys come from

Raise it when 0b finds variants with an empty SKU, all of them or some. Many
platforms make the SKU optional, while here it is the variant's identity: the
contract refuses an empty one, and each SKU becomes the variant's key on the
first load, which cannot move afterwards. So the adapter has to supply one,
and where it comes from is the business's decision, not a mapping detail.

Write one row with the options, a recommendation and the count of variants
affected:

- **Real SKUs from the business**, such as a mapping file from an ERP or PIM.
  Recommend this whenever they exist: they are what warehouses, feeds and
  people already use.
- **Derived from readable source fields**, such as the product handle plus the
  option values (`SANDALWOOD-100ML`). Readable, but only as stable as those
  fields: a merchant can rename either, and a load after a rename derives a new
  SKU and creates a second variant beside the first. Fit for a one-shot load
  only (the re-load question in
  [0c](step-0-interview.md#0c-the-remaining-judgements)).
- **The source's immutable variant id.** Stable across loads, unreadable, and it
  carries the old platform's numbering into the new shop. The choice when the
  load repeats and no real SKUs exist.

When only some variants lack a SKU, a derived one must not collide with a real
one: check, and stop on a clash rather than suffix it. Treat a SKU of only
whitespace as empty. Record the rule, the count and the answer in
`DECISIONS.md` as irreversible.

Do not raise it when every variant has a SKU.

## If the texts are in a language the project does not have, ask which way to go

Raise it when 0b finds names, descriptions or labels in a language none of the
project's locales covers. Take the language from the source's own settings
where it has them (a shop's primary language, a store view's locale), not only
from reading the text, and check per field: names and descriptions can be in
different languages.

A text filed under another language's tag passes every stage: the tag is
valid, the project accepts it, the load succeeds, and the storefront shows
Spanish descriptions to English readers. Never file a text under a project
locale because that locale exists. Write one row with the two ways out:

- **Add the language to the project.** The adapter files the texts under
  their own locale, and `preflight` reports `locales-not-accepted` until the
  project accepts it; `preflight --apply` adds it. That is a write to the
  customer's project, with its own yes and its own entry in the decision log
  ([preflight.md](preflight.md)). A storefront reading another locale then
  finds no text in that field, and the business should know which fields.
- **Translate before loading.** Someone supplies the texts in a language the
  project has, and the adapter reads both. Record who translated and from which
  source date.

Do not raise it when every text is in a language the project accepts.
