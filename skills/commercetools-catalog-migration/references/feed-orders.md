---
name: feed-orders
description: "The opt-in order record: when an order history may be migrated, the subscriptions an import wakes, verbatim order numbers, discontinued SKUs as custom line items, totals the platform never checks, and what verify and teardown do."
metadata:
  contentType: REFERENCE
---

# Feed records: orders

Read this once the entity scope question has a yes for orders
([entity-coverage.md](entity-coverage.md#in-step-0-which-entities-are-in-scope)),
before the adapter emits a single `order` record. Orders that name a customer
need customers migrated too: read [feed-customers.md](feed-customers.md) first.

## The switch: true, false, or not yet decided

```json
"entities": { "orders": true }
```

| `entities.orders` | Order records in the feed |
| :--- | :--- |
| `true` | checked, planned and loaded |
| `false` | ignored, with one `orders-ignored` warning giving the count |
| absent | refused (`orders-not-in-scope`): nobody has decided yet |

`false` lets an adapter keep emitting the history a source always exports
while the decision not to load it stays in the config. Log the ignored count
in `DECISIONS.md` either way. `entities.customers` works the same, and an order
that names a customer who is not migrated is refused
(`order-customer-not-loaded`): emit it as a guest order with `customerEmail`.

## Ask about subscriptions before the first load

Importing an order emits `OrderImported`, not `OrderCreated`, and every
subscription listening for `OrderImported` receives it, once per order. An
order-confirmation email, an ERP export or a loyalty-points connector reacting
to that message treats a three-year-old order as new. Nothing in the pipeline
reads the project's subscriptions, so put the question in `INTERVIEW.md` for
whoever owns them: which subscriptions and Connect applications listen for
`OrderImported`, and are they paused or filtered for the load? Repeat it, live,
before every `load --execute` that carries orders, with the count.

## What the record carries, and why each rule exists

```jsonc
{"_type":"order","orderNumber":"100045","currency":"GBP","totalPrice":"24.95",
 "customer":"C-1001","completedAt":"2024-03-01T10:00:00Z",
 "orderState":"Complete","shipmentState":"Shipped","paymentState":"Paid",
 "shippingAddress":{"country":"GB","city":"Leeds"},
 "lineItems":[{"sku":"TEE-S","name":{"en-GB":"Tee"},"quantity":2,"price":"10.00",
               "taxRate":{"name":"VAT 20%","amount":0.2,"includedInPrice":true,"country":"GB"}}]}
```

- **The order number is kept verbatim.** Customers and support quote it, so it
  is not prefixed. Orders are therefore the one migrated resource outside
  `keys.prefix`, which changes how teardown works (below). Orders are
  create-only: a number the project already holds is rejected, so a re-run
  reports those as rejected rather than updating them.
- **Amounts are decimal strings in one currency per order**, converted with
  `market.currencyFractionDigits` like every price.
- **Totals are taken as given.** The platform does not compute `totalPrice`
  from the lines on import, and accepts negative prices and quantities without
  an error ([Order Import](https://docs.commercetools.com/api/projects/orders-import.md)).
  `validate` refuses negative amounts and warns, once with a count, where a
  total is not the sum of its lines: shipping, discounts and fees are not lines
  in the record, so most real orders differ. Check a few against the source
  before accepting the warning.
- **A SKU the feed does not declare becomes a custom line item.** Histories name
  discontinued products, and a line item for a variant that does not exist
  fails the whole order. The custom line keeps the name, unit price, quantity
  and tax rate and loses the product link. `plan` records the count as lossy.
  To keep the link instead, migrate the discontinued products, unpublished.
- **A line item names its variant by SKU and by key.** The pipeline sends
  `variant.sku` together with `variant.productVariant`, a key reference to the
  variant the plan creates, derived from the SKU the way the variant's own key is
  (a SKU with `/` is keyed with `-`, and the reference follows). Sent with the SKU
  alone, every order was rejected as "invalid product variant identification
  information", although the products were loaded and the SKU existed. The adapter
  writes nothing for this. See the
  [line item type](https://docs.commercetools.com/search.md?urn=ctp:import:type:LineItemProductVariantImportDraft).
- **Products need not be published.** Orders imported against products that were all
  unpublished. Publishing them does not fix a rejection, and a publish made by
  hand is undone by the next `load`, which plans every product unpublished.
- **`completedAt` is when it was placed.** Without it the order looks as if it
  was placed on the day of the load, in every history and every report.
- **There is no `store`, `inventoryMode` or payment.** A store on an imported
  order silently drops prices, languages and stock outside its configuration;
  any inventory mode decrements stock for orders fulfilled long ago; payment
  data and PSP references are never migrated. The feed cannot express them, and
  `audit` refuses a plan that carries the first two.

Not carried: shipping info, deliveries and parcels, and returns. Record them in
`DECISIONS.md` as information loss if the source holds them.

The full field list is the `order` definition in the pipeline's
`schema/catalog-feed.schema.json`.

## The personal data

An order carries an email and addresses, so the handling in
[feed-customers.md](feed-customers.md#the-personal-data-in-the-engagement)
applies: the export, the feed and `out/` stay outside version control, chat and
tickets. Diagnostics name order numbers and never emails.

## Loading, verifying, removing

- **Scopes:** `load` and `teardown` need `manage_orders`; `verify` needs
  `view_orders`.
- **Order:** orders load after customers and the catalog, which they reference.
- **The first request goes alone.** It holds the order that shows the most (one with a
  custom line item and a customer, if there is one), and `load` reads its result
  before it sends the rest, so a shape the API refuses costs one failed operation,
  not one per order. A stop and what to do next are in
  [load-recovery.md](load-recovery.md#the-first-record-of-a-customer-or-order-stage-goes-alone).
- **`verify`** compares the total, the number of line and custom line items,
  and the three states. A missing order is usually an order number the project
  already held, or a customer or product that never resolved: read the order
  container's summary. If every order failed with "invalid product variant
  identification information", the pipeline in use sends the SKU without the key
  reference: use a pipeline release that sends both, and neither edit the feed nor
  publish the products.
- **`teardown`** deletes orders first, with `dataErasure`, but only an order whose
  total and line counts still match the plan. Because the number is verbatim,
  an order with a planned number that does not match may be someone else's: it
  is left alone, named, and the teardown reports itself incomplete. Ask before
  `--execute`, as for any teardown.

## Checklist

- [ ] The user said yes to migrating orders (`entities.orders: true`), or `false`
      records the decision not to; `DECISIONS.md` says who decided.
- [ ] Whoever owns subscriptions confirmed what listens for `OrderImported`, and
      the answer was asked again before each `load --execute` with orders.
- [ ] Orders naming a customer have customers migrated; the rest are guest
      orders with `customerEmail`.
- [ ] The custom line item count was read in `MODEL-REVIEW.md` and accepted, or
      the discontinued products were added to the feed.
- [ ] A sample of totals was checked against the source.
- [ ] Shipping, deliveries and returns in the source are logged as not migrated.
