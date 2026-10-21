---
name: zendesk
description: "Map a Zendesk ticket into one Intake responses call, write the created entity back onto the ticket, and keep later comments off the Intake endpoint."
metadata:
  contentType: REFERENCE
---

# Zendesk

Read [call-responses.md](./call-responses.md) first. Zendesk's own webhook and attachment contracts: [ticket events](https://developer.zendesk.com/api-reference/webhooks/event-types/ticket-events/), [webhooks](https://developer.zendesk.com/api-reference/webhooks/webhooks-api/webhooks/), [ticket comments](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/), [attachments](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket-attachments/).

## When to call

Call Intake when a ticket is a new order request, not when it changes. A trigger (Zendesk's recommended way to send webhooks for ticket activity) with conditions such as "ticket is created" and a tag like `order-request` is the right gate. `ticket.comment_added`, or a trigger on every update, creates a new commercetools entity per comment.

The idempotency key is the ticket id. Zendesk redelivers webhooks that do not acknowledge promptly, and the Intake call is slow. Use the same sequence as [call-responses.md](./call-responses.md):

1. Conditionally insert the ticket id as in progress. If that insert does not win — the id is already in progress or already has an `entity.id` — acknowledge the duplicate so Zendesk stops redelivering, and stop. Do not call.
2. Acknowledge the webhook.
3. Call Intake once, out of band.

Acknowledging before the insert lets two overlapping deliveries both see an empty key and both POST.

## What to put in the request

The Customer email is the requester's email, looked up from the requester id. It is not the agent, and it is not the address Zendesk uses to send notifications. Write it into the prompt. Do not upload Zendesk's notification mail as an `.eml`. Its `From` is the wrong Customer.

```text
Customer email: jane.doe@example.com.
Shipping country: DE.
```

For a Shopping List, add a third line, `Create a shopping list called "PO 4481"`, using the ticket subject when the description never names the list. Omit the country line for a Shopping List. The ticket description follows the preamble. See [choose-output.md](./choose-output.md).

`locale` is the ticket's language, not a guess from the SKUs.

When a Zendesk organization is mapped to a commercetools Business Unit, pass that unit's `key` as `businessUnit`. The same for Store. The external organization id is not a commercetools key. A unit the Customer is not associated with fails with `BusinessUnitUnresolved`.

## Attachments

The ticket-created payload is not a reliable list of files. Read the ticket's comments and take each attachment's `content_url`, `content_type`, and `file_name`. Download the file and re-upload it as a `files` part. `content_url` may be hosted outside Zendesk. Do not send Zendesk credentials to that host.

Skip inline images and any type Intake does not accept. Keep at most 3 files, 20 MB each, preferring the purchase order. See [call-responses.md](./call-responses.md).

## Write the result onto the ticket

On `201`, add an internal comment (`public: false`) that a merchant can read: `entityType`, `entity.id`, `threadId`, `cartId` for a Quote Request, and any warning codes with the unmatched product identifiers. Store `entity.id` and `entityType` on ticket custom fields. The comment is for humans. The fields are what the next delivery checks.

On a `400`, comment the specific codes (`MissingCountry`, `MissingCustomerEmail`, `ProductsNotFound`, `BusinessUnitAmbiguous`) and the `threadId` if present. Do not close the loop by calling Intake again with the same body. Either a person supplies the missing fact and you allow one new attempt, or the ticket stays with the agent.

## Later comments

Once the custom field holds an entity id, further comments on that ticket are updates to that entity: [Cart update actions](https://docs.commercetools.com/api/projects/carts.md#update-actions), [Shopping List update actions](https://docs.commercetools.com/api/projects/shoppingLists.md#update-actions), or the quote flow for a Quote Request. They are not new Intake calls.

A genuinely new order from the same requester is a new ticket, which gets its own call.
