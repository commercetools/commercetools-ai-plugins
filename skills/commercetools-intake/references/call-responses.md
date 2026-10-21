---
name: call-responses
description: "How to build one Intake responses request from an unstructured inbound message: prompt versus structured fields, files, and idempotency."
metadata:
  contentType: REFERENCE
---

# Call the responses endpoint

`POST /{projectKey}/agents/intake/v1/responses` on `https://api.{region}.commercetools.com`. Reference: [Intake](https://docs.commercetools.com/api/projects/intake.md). Schema: `api-AgentResponsesSuccess` via `openApi-schemata.mjs`.

Authenticate like any other HTTP API call for the Project. The client needs `manage_intake_agent:{projectKey}`. A `401` is `invalid_token`. A `403` is `insufficient_scope`. Both use [AuthErrorResponse](https://docs.commercetools.com/api/projects/intake.md#agentresponsesautherror), not the Intake error envelope.

The call does extraction and catalog matching before it returns, so it is slow. The responses endpoint has no idempotency key. Persist the normalized request as queued work, acknowledge the webhook, then call. The sequence is in [Idempotency belongs to the adapter](#idempotency-belongs-to-the-adapter).

## What the body can express

| Field | Role |
| --- | --- |
| `outputType` | `Cart`, `QuoteRequest`, or `ShoppingList`. Required. Never inferred. |
| `locale` | BCP-47 language tag of the message, such as `en-US` or `de-DE`. Required. This is the language of the Shopping List name and of product-name matching. It does not set the shipping country. |
| `prompt` | The natural-language input. Required on `application/json`. Optional on multipart when at least one file is attached. |
| `businessUnit` | Optional [resource identifier](https://docs.commercetools.com/api/types.md#resourceidentifier). Pass `key` when the channel knows the unit. |
| `store` | Optional resource identifier. Same rule. |

Customer email, shipping country, line items, and the Shopping List name are not request fields. Intake reads them from `prompt` and from files. If the channel already knows one of them, write it at the top of the prompt in plain sentences. Extraction then does not have to recover it from a signature or a ship-to block:

```json
{
  "outputType": "Cart",
  "locale": "de-DE",
  "businessUnit": { "typeId": "business-unit", "key": "acme-west" },
  "store": { "typeId": "store", "key": "west-coast" },
  "prompt": "Customer email: jane.doe@example.com. Shipping country: DE.\n\nBitte 12x ABC-123 und 4x XYZ-789 bis Freitag."
}
```

`locale` stays the language. `Shipping country: DE` is what satisfies the country requirement. A German mailbox with `locale: de-DE` and no country in the text still fails with `MissingCountry` for a Cart or Quote Request.

## Why the structured fields exist

Free-text inference is the source of `BusinessUnitUnresolved`, `BusinessUnitAmbiguous`, `StoreUnresolved`, and `StoreAmbiguous`. Pass `businessUnit` and `store` when a mailbox route, a ticket field, or an organization mapping already decided them.

The reference still has to be one this Customer can use. A pinned Business Unit the Customer is not associated with fails with `BusinessUnitUnresolved`. A pinned Store the Customer cannot order from through that unit fails with `StoreUnresolved`. Map the channel's organization to the commercetools key. Do not send the external organization's id and expect Intake to translate it.

Passing one side is enough when the other is unambiguous: one Business Unit implies its Store, and one Store can narrow the Business Unit. When the Customer belongs to several units and the message names none, pass `businessUnit` rather than hoping the text is clear enough.

`BusinessUnitLimitExceeded` means the Customer's units could not be listed. Pin `businessUnit` (and `store` if it is still ambiguous) and call again only if the first call did not create an entity.

A Store with more than one distribution channel fails with `StoreDistributionChannelsUnsupported`. Choose a Store with zero or one.

## Files

Send `multipart/form-data` when there is a document. One `payload` part, JSON, content type `application/json`. Every file under the part name `files`. Any other part name is `InvalidField`.

Limits and allowed types are on [Multipart form data](https://docs.commercetools.com/api/projects/intake.md#multipart-form-data): 3 files, 20 MB each, PDF, plain text, CSV, DOCX, XLSX, EML (`message/rfc822`), Markdown, HTML. Images are not allowed. A file over the size limit is `ContentTooLarge` (`413`).

Prefer the purchase order over logos and signature images. Three slots is the whole budget.

An uploaded `.eml` is one of those three files. Intake reads its `From` as the customer email and also reads attachments nested inside it. Inline related images, including most signatures, are skipped and do not fail the file. A non-related attachment of a disallowed type fails the whole file as `FileNotProcessed`. In that case, put the body in `prompt` and attach only the document files.

Use `.eml` when the message is the buyer's own mail and its attachments are all allowed types. The `From` address is then the Customer email, so the prompt preamble is only needed for country, list name, or a Business Unit the headers do not carry.

## One call, no resume

There is no conversation id to send back. `threadId` on the response identifies that run for support. It is not a handle for a second call.

If required information is missing, fix the prompt or the reference and POST again only when you know the first call created nothing. See [handle-outcome.md](./handle-outcome.md).

## Idempotency belongs to the adapter

The endpoint will happily create two Carts for one email. Two overlapping deliveries that both see an empty key both POST, so the request has to be stored before the HTTP acknowledgement returns. An in-progress marker alone cannot recover that request: if the process exits after acknowledging and before the POST, the row stays in progress and every redelivery is discarded.

1. Conditionally insert the channel event id together with the normalized request, as queued work that has not been sent. If that insert does not win — the id is already queued, a call is already in an unknown state, or the id already has an `entity.id` — acknowledge the duplicate so the channel stops redelivering, and stop. Do not call from this delivery. The stored row remains the copy recovery runs.
2. Acknowledge the delivery. The queued request is now the only copy that can still run.
3. Mark that row as a call with an unknown outcome immediately before the POST, then call Intake once. Recovery may send a queued row that was never marked this way. It must not send a row already marked: that POST may have completed, and a second call creates a second entity.
4. On `201`, store `entity.id`, `entityType`, `threadId`, and `cartId` when present, against the same id.
5. On a `400` that names missing input, store the failure against the same id so a redelivery does not repeat it. Correct the input only when you have new information, then allow one new attempt.

`ExtractionFailed` (`500`) happens before a commercetools write. A single retry of that code is safe if the row still has no `entity.id`. `QuoteRequestCreationFailed` is not safe to retry: the Cart already exists. See [handle-outcome.md](./handle-outcome.md).
