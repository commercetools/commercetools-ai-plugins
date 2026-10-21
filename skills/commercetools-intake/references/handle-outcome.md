---
name: handle-outcome
description: "How to handle an Intake responses result: 201 warnings, 400 codes that need a better request, and failures that already created a Cart."
metadata:
  contentType: REFERENCE
---

# Handle the outcome

Success is `201` with [AgentResponsesSuccess](https://docs.commercetools.com/api/projects/intake.md#agentresponsessuccess): `entityType`, `entity` (the Cart, Quote Request, or Shopping List in REST form), `threadId`, optional `warnings`, and `cartId` only for `QuoteRequest`. `warnings` is omitted when there is nothing to report. An empty array is not the success shape.

Other errors use [AgentResponsesErrorResponse](https://docs.commercetools.com/api/projects/intake.md#agentresponseserrorresponse): `statusCode`, `message`, `errors`, and `threadId` once the run has started. Parsing failures, before the run starts, have no `threadId`. Auth failures are a different envelope. See [call-responses.md](./call-responses.md).

Codes: [Intake errors](https://docs.commercetools.com/api/errors.md#intake).

Write the outcome back to the channel (email reply or ticket comment) using the code, not a generic "something went wrong". Include `threadId` whenever it is present. It is the id support can find the run with.

## 201 with warnings

The entity exists. Store it. Do not call again to "fill the gaps". That creates a second entity.

| Warning `code` | What it means | What to do |
| --- | --- | --- |
| `ProductsNotFound` | Some requested products were not matched, or are not in the bound Store. `products` lists the identifiers. The matched lines are on the entity. | Tell the channel which identifiers were dropped. A person edits the entity or replies with a better identifier. Apply that as an update action. |
| `FileNotProcessed` | One upload could not be read. `fileName` names it. Other input may still have produced the entity. | Tell the channel which file was skipped. If the purchase order was the skipped file, the entity may be incomplete. Review it before fulfilling. |

`ProductsNotFound` as a `400` is the other case: nothing matched, and no entity was created. Same code, different status. Branch on the HTTP status.

## 400, nothing was created

Safe to correct and send one new attempt, after you have stored that this channel event has no `entity.id`.

| Code | Fix in the adapter |
| --- | --- |
| `RequiredField` | A request field is missing. `outputType` and `locale` are the usual ones. A JSON body also needs `prompt`. |
| `MissingCustomerEmail` | The input never stated an email. Add `Customer email: …` to the prompt. |
| `InvalidInput` | Message is `No customer found with email "…"`. The address was stated and matches no Customer. Create the Customer, then allow one new attempt. |
| `MissingCountry` | Cart or Quote Request only. Add `Shipping country: XX`. `locale` will not do this. |
| `MissingShoppingListName` | Shopping List only. State the name in the prompt. |
| `MissingEntityType` | You called without a resolved `outputType`. Choose one. Do not retry hoping the text implies it. |
| `NoLineItemsExtracted` | No product reference in the text or the files. Often a `FileNotProcessed` on the only document. Fix the file and include a line in the prompt if you have one. |
| `ProductsNotFound` | Every referenced product missed the catalog. No entity. Surface the identifiers. Do not retry unchanged. |
| `OutOfScope` | The input had none of the cart facts (products, email, and country). The message is not an order request. Do not retry. |
| `BusinessUnitUnresolved` | Name or pin a unit this Customer belongs to. A pinned unit they are not associated with produces this too. |
| `BusinessUnitAmbiguous` | Several units, none selected. Pass `businessUnit`. |
| `BusinessUnitLimitExceeded` | Too many units to list. Pass `businessUnit`. |
| `StoreUnresolved` | Name or pin a Store this Customer can order from. |
| `StoreAmbiguous` | Several stores. Pass `store`. |
| `StoreDistributionChannelsUnsupported` | The Store has more than one distribution channel. Choose another Store. |
| `InvalidField` | A multipart part was not named `files` or `payload`, or a field failed validation. |
| `FeatureDisabled` | Intake is not enabled for the Project. This is a configuration problem, not a retry. |

## A Cart may already exist

`QuoteRequestCreationFailed` means the Cart was created and the Quote Request was not. The error includes `cartId`. Store that id against the channel event. Then create the Quote Request from that Cart, or delete the Cart. Deleting it removes customer data. Show the exact proposed deletion request and obtain the user's explicit confirmation before executing it. A second Intake call creates another Cart and leaves the first one behind.

`ShoppingListCreationFailed` leaves no Cart. It is Shopping List only, including the case where every requested product was dropped because the Store does not carry them.

## Nothing was written

`ExtractionFailed` means the run failed before a commercetools write. Branch on the code. One retry is reasonable when the channel event still has no stored entity id.

`ProductSearchNotEnabled` is returned until Product Search is enabled for the Project. Retrying without that change fails the same way. Both codes are listed with the [Intake errors](https://docs.commercetools.com/api/errors.md#intake).

## After a 201

Keep `entity.id`. For a Quote Request also keep `cartId`. Later channel messages update that resource:

- Cart: [update actions](https://docs.commercetools.com/api/projects/carts.md#update-actions), then freeze, order, or create a Quote Request from it.
- Quote Request: the [quote workflow](https://docs.commercetools.com/api/quotes-overview.md). The buyer-facing entity already exists.
- Shopping List: [update actions](https://docs.commercetools.com/api/projects/shoppingLists.md#update-actions), then add its line items to a Cart when the buyer is ready.

Deleting the entity and starting over is a new Intake call, and it needs a new channel event id or an explicit "retry allowed" flag. An automatic retry of the original event is how the deleted entity comes back as a duplicate.
