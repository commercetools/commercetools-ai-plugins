---
name: choose-output
description: "How to choose Intake outputType: Cart, Quote Request, or Shopping List, and what each one still needs from the channel."
metadata:
  contentType: REFERENCE
---

# Choose the output

`outputType` is the integration's decision. Intake does not pick from the wording of the email. If the business has not decided, ask before generating the client. The required inputs per type are in [Required information](https://docs.commercetools.com/api/projects/intake.md#required-information).

| The request is… | `outputType` | The prompt must also contain |
| --- | --- | --- |
| Something to price and fulfill at the Customer's entitled prices | `Cart` | Buyer email, shipping country, at least one product reference |
| A request for terms (volume, a split delivery, "please quote") | `QuoteRequest` | The same as a Cart. The Customer must already exist; the created Cart has to carry that verified Customer |
| A named list to buy later, or a list that may include unpublished products | `ShoppingList` | Buyer email and a name for the list. Country is not used |

All three require at least one product reference: a name, a product key, a variant SKU, or a variant key. With no line items at all the call fails with `NoLineItemsExtracted`. Some unmatched products are a warning, not a failure. See [handle-outcome.md](./handle-outcome.md).

## Cart

Use this when the merchant will review the basket and then freeze it, order it, or turn it into a Quote Request themselves. The response `entity` is a [Cart](https://docs.commercetools.com/api/projects/carts.md) in REST form.

Country is read from the input (a stated country or a ship-to address), not from `locale` and not from the Customer record. A marketplace mailbox that only receives German orders should still put `Shipping country: DE` in the prompt.

## Quote Request

Use this when the inbound message is the buyer's ask and a seller will negotiate before anything is binding. Intake creates the Cart and the Quote Request. The `201` body includes `entity` (the [Quote Request](https://docs.commercetools.com/api/projects/quote-requests.md)) and `cartId` (the Cart it was created from). Keep both.

If the Cart is created but the Quote Request is not, the error is `QuoteRequestCreationFailed` and it carries `cartId` of that Cart. Do not call Intake again to "finish" it. That creates another Cart. Create the Quote Request from `cartId` with the [Quote Requests API](https://docs.commercetools.com/api/projects/quote-requests.md). Deleting the Cart is the other option, and it removes customer data. Show the exact proposed deletion request and obtain the user's explicit confirmation before executing it.

A Quote Request needs a verified Customer on the source Cart. An email that matches no Customer fails the call before a Cart exists. `QuoteRequestCreationFailed` is the later case, where the Cart exists and the Quote Request does not. Create or correct the Customer first, then retry only if no `cartId` was stored.

After the Quote Request exists, seller follow-up is the normal quote flow, not another Intake call.

## Shopping List

Use this when the outcome is a list the Customer will turn into a Cart later, or when the products may be unpublished. A Cart or Quote Request cannot hold unpublished products. A Shopping List can: an exact key, SKU, variant key, or product name in `locale` (or a project or store language) is looked up against staged data, and the line item is stored with `published: false`. Partial names do not match. Details: [Unpublished Products in a Shopping List](https://docs.commercetools.com/api/projects/intake.md#unpublished-products-in-a-shopping-list).

The name has to be in the prompt or a file, for example `Create a shopping list called "Q3 restock"`. Intake does not invent one. A missing name is `MissingShoppingListName` and nothing is created. When the channel has a natural name (the email subject, the ticket subject), state that name in the prompt rather than asking the model to title it.

The name is stored as a LocalizedString under `locale`. A description in the input is stored the same way.

Country is not required and is not used for pricing.
