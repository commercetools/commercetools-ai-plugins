---
name: feed-customers
description: "The opt-in customer record: when customers may be migrated at all, how sign-in works without a password, global versus Store-specific customers, email uniqueness, handling the personal data, and what verify and teardown do."
metadata:
  contentType: REFERENCE
---

# Feed records: customers

Read this once the entity scope question has a yes for customers
([entity-coverage.md](entity-coverage.md#in-step-0-which-entities-are-in-scope)),
before the adapter emits a single `customer` record. The shape, the variant axes
and the two load-bearing rules of the feed are in
[catalog-feed-contract.md](catalog-feed-contract.md).

## Customers are opt-in, and the switch records a sign-off

A source that contains customers is not a decision to migrate them. Customers
are personal data, and moving them is a decision for whoever is accountable for
that data, not for the person writing the adapter. So the config records the
decision, and the pipeline acts on nothing else:

```json
"entities": { "customers": true }
```

| `entities.customers` | Customer records in the feed |
| :--- | :--- |
| `true` | checked, planned and loaded |
| `false` | ignored, with one `customers-ignored` warning giving the count |
| absent | refused (`customers-not-in-scope`), before any other check: nobody has decided yet |

`audit` also refuses a plan that holds customers without `true`. An order that
names a customer who is not migrated is refused too
([feed-orders.md](feed-orders.md)). Set `true` only after the user's yes, and record in
`DECISIONS.md` who said yes, when, and on what basis (the same entry names
anything about the customers that is not migrated).

## No passwords, and why

The record has **no password field**, and the pipeline imports every customer
with `authenticationMode: ExternalAuth`, the only mode the API accepts without a
password. Two reasons:

- A source system's password hashes cannot be imported as hashes, so there is
  no password to carry across.
- A feed with passwords puts credentials into a file in the engagement
  directory, which is exactly where they must not be.

How customers sign in afterwards is the implementation's decision, so ask it in
the interview rather than deciding it here:

- **An external identity provider** handles sign-in: ExternalAuth is the end
  state.
- **commercetools sign-in, with a password reset** the implementation sends after
  cutover.
- **Re-hashing on first login**: the
  [Import customers](https://docs.commercetools.com/guides/implementation-guide/import-customers.md)
  guide describes keeping each old hash in a custom field and setting the
  password the first time the customer signs in with it. The pipeline does not
  carry hashes or custom fields, so this is the implementation's work, after the
  load.

Log the answer. A customer who cannot sign in on day one is the visible failure,
and it is a decision, not a defect.

## The record

```jsonc
{"_type":"customer","code":"C-1001","email":"ada@example.com",
 "firstName":"Ada","lastName":"Example","customerGroup":"trade",
 "addresses":[{"code":"home","country":"GB","city":"Leeds"},
              {"code":"office","country":"GB","city":"York"}],
 "defaultShippingAddress":"office","defaultBillingAddress":"home",
 "shippingAddresses":["home","office"],"billingAddresses":["home"]}
```

- **`code` is the identity, never the email.** It becomes the key
  `<prefix>-<code>`. An email changes, and a key built from it puts personal data
  into every key, log line and report.
- **Addresses are named by code.** The API takes positions in the address list;
  the pipeline computes them from the codes, so reordering the source's addresses
  cannot move a customer's default.
- **A default is also a member of its list.** `defaultShippingAddress` has to be one
  of the codes in `shippingAddresses`, and `defaultBillingAddress` one of
  `billingAddresses`. The Import API refuses the whole request otherwise
  ("defaultShippingAddress must be a valid index in shipping addresses array"), and a
  customer with no list counts as not listing the default. `validate` and `audit`
  refuse it (`customer-default-address-not-listed`); the adapter puts the address in
  the list. A customer with a default and no list is the case that slips through
  when the example above is copied without the lists.
- **`customerGroup`** names a declared `customerGroup` record, a prerequisite
  `load` creates ([feed-prerequisites.md](feed-prerequisites.md)).
- **`stores`** makes the customer Store-specific: they can sign in only through
  those Stores. Leave it out for a global customer, who can sign in through
  every Store. Each code names a declared `store` record
  ([feed-assortments.md](feed-assortments.md)).

The full field list is the `customer` definition in the pipeline's
`schema/catalog-feed.schema.json`; the fields mirror
[CustomerImport](https://docs.commercetools.com/api/import-export/import-resources.md#customerimport).

## Email uniqueness decides which accounts survive

An email is unique across the Project, compared without regard to letter case
([Customer uniqueness](https://docs.commercetools.com/api/customers-overview.md#customer-uniqueness));
Store-specific customers are unique within their Stores instead. Sources often
hold one person twice: a guest account and a registered one, or the same address
in two letter cases. `validate` refuses the pair (`customer-email-duplicate`),
treating a global customer as clashing with anyone, because it can sign in
everywhere.

Which account survives is the business's call, not the adapter's. Merge them in
the adapter or drop one, and log the others as not migrated, with the count.

## The personal data in the engagement

Once customers are in scope, personal data sits in `source-export/`, the feed,
`out/plan.json` and `out/load-requests.json`. Keep all four out of version
control and out of chat, tickets and screenshots. What is safe to share:
diagnostics and `MODEL-REVIEW.md`, which name customer codes and counts, never
an email or a name. Use invented people on `example.com` for any test feed.

## Loading, verifying, removing

- **Scopes:** `load` needs `manage_customers`; `verify` needs `view_customers`
  and `view_customer_groups`; `teardown` needs `manage_customers`. None of them
  comes with `manage_products`.
- **The first request goes alone.** It holds the customer that shows the most (one with
  an address, if there is one), and `load` reads its result before it sends the rest;
  a refusal stops the load before any later stage runs
  ([load-recovery.md](load-recovery.md#the-first-record-of-a-customer-or-order-stage-goes-alone)).
- **Order:** customers load after the catalog. A Store-specific customer waits
  as `unresolved` until `load` creates its Store at the end, then resolves on its
  own.
- **`verify`** compares the email, the authentication mode, the group, the
  Stores and the addresses with their defaults. A missing customer is usually a
  duplicate email the import rejected: read the customer container's summary.
- **`teardown`** removes customers first and asks the platform to erase their
  personal data (`dataErasure`), because a trial load's data was never the
  project's to keep. Ask before `--execute`, as for any teardown.

## Checklist

- [ ] The user said yes to migrating customers, `entities.customers` is `true`,
      and `DECISIONS.md` records who decided and when.
- [ ] How customers sign in after cutover was asked and logged.
- [ ] Every customer has a stable source `code`; no key is built from an email.
- [ ] Duplicate emails were resolved by the business, and the dropped accounts
      are logged as not migrated.
- [ ] `source-export/`, the feed and `out/` are outside version control.
- [ ] The API Client has the customer scopes above.
