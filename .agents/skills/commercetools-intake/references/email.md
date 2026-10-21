---
name: email
description: "Map an inbound mailbox message to one Intake responses call, and treat a reply on the same thread as an update to the entity already created."
metadata:
  contentType: REFERENCE
---

# Email

Read [call-responses.md](./call-responses.md) first. This file is only the mailbox mapping.

The idempotency key is the RFC 5322 `Message-ID`. Use the same sequence as [call-responses.md](./call-responses.md): conditionally insert that id as in progress, acknowledge the provider delivery, then call. A redelivery of the same `Message-ID` loses the insert and must not call Intake again.

## Which address is the Customer

Intake looks up one existing Customer by email. The address it needs is the buyer's, not the mailbox that received the mail (`orders@your-domain.com`) and not the address of whoever forwarded it internally.

| What you received | Customer email |
| --- | --- |
| The buyer's own message | The `From` address, if that address is a Customer in the Project |
| A forward | The original `From` inside the body, not the forwarder's |
| A helpdesk or automation notification | The buyer named in the body, not the notification sender |

Put that address in the prompt as `Customer email: jane.doe@example.com`. When you upload the buyer's own `.eml`, Intake already treats `From` as the customer email. A forwarded or notification `.eml` will treat the wrong `From` as the customer, so do not upload those. Use the parsed body plus an explicit preamble instead.

If the address matches no Customer, the call fails. Create the Customer with the Customers API, then allow one new attempt for that `Message-ID`. Intake will not create the Customer for you.

## What to send

State, in the prompt, anything the route already knows:

- `Customer email: …`
- `Shipping country: DE` for a Cart or Quote Request. A dedicated country mailbox is not a country unless you write it out. `locale` does not carry it.
- For a Shopping List, `Create a shopping list called "{subject}"` using the subject when the body never names the list.

Then the body.

Attachments:

- Keep PDF, CSV, XLSX, DOCX, HTML, and plain text. Drop images. The cap is 3 files, 20 MB each.
- Upload the buyer's raw `.eml` (`message/rfc822`) when its non-related attachments are allowed types. Inline related images, including most signatures, are skipped and do not fail the file. A non-related attachment of a disallowed type fails the whole file as `FileNotProcessed`, and you may get `NoLineItemsExtracted` if nothing else was readable.
- Otherwise put the body in `prompt` and attach the purchase-order files as `files` parts.

`outputType` still comes from [choose-output.md](./choose-output.md), not from words like "quote" in the subject. A business rule may map those words. That rule lives in the adapter.

## Replies

Match `In-Reply-To` and `References` to a `Message-ID` you already stored.

- A match means this mail is about an entity you already created. Update that Cart or Shopping List with its own API, or hand the Quote Request to the quote flow. Do not POST to Intake. A second call creates a second entity and the buyer now has two baskets.
- No match means a new request. Call once.

Do not auto-reply in a way that invites a second email before you have stored an outcome. A "we could not read this, please resend" reply, processed by the same mailbox rule, is how duplicate Carts get created. Reply with the specific missing fact (`MissingCountry`, unmatched SKUs from a `ProductsNotFound` warning) or with the created id.
