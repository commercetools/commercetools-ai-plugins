---
name: commercetools-intake
description: "Integrate Intake over its stateless responses API so unstructured customer input (an email, support ticket, PDF, spreadsheet, CSV, or free text, including an inbound quote or purchase order) becomes one Cart, Quote Request, or Shopping List. Use when connecting that input to Intake (also called the Intake Agent), including outputType, file upload, and writing the created id back to the channel. Not the Merchant Center Intake UI, and not ongoing ERP, CRM, or transactional-email sync (see commercetools-integrations)."
when_to_use:
  - "An inbound purchase-order email should become a Cart or Quote Request through the Intake API"
  - "A Zendesk ticket, with its requester and attachments, should create a commercetools entity via POST /agents/intake/v1/responses"
  - "A retried Intake call created a second Cart, or a mailbox integration got BusinessUnitUnresolved or MissingCustomerEmail"
  - "Choosing Cart, Quote Request, or Shopping List for an unstructured order request"
metadata:
  contentType: SKILL
  area:
    - "Integrations"
  docsSearch:
    products:
      - AI Hub
      - Composable Commerce
---

# Intake

Call [Intake](https://docs.commercetools.com/api/projects/intake.md) so a channel adapter can turn one unstructured request into one commercetools entity. The HTTP surface is a single stateless endpoint. Each call starts a fresh run and returns either a created entity or an error. It does not resume a previous run, so a follow-up email or ticket comment is not another turn of the same call.

The adapter owns three decisions Intake will not make: which entity to create, which Customer the message is for, and whether this inbound event is a new request or a reply to an entity already created.

## Out of scope

- Building or automating the [Merchant Center](https://docs.commercetools.com/merchant-center/ai-agents/intake.md) Intake UI. Use that UI once, before writing the adapter, to confirm the same prompt creates the entity. The UI can ask a clarifying question. This endpoint cannot.
- Connect connectors, transactional email, and CRM sync. Those belong to [commercetools-integrations](../commercetools-integrations/SKILL.md).
- Quote negotiation after a Quote Request exists (Staged Quote, Quote, Order). That is the [Quotes API](https://docs.commercetools.com/api/quotes-overview.md).

## Workflow

1. <!-- ct:docs-search:begin -->
   **Docs search (required, run first)** — The first time you use this skill in a session you must run this before answering. It gathers the latest verified documentation as your primary grounding, filtered to the products this skill covers. Use this script for documentation search while working with this skill; the Knowledge MCP covers everything else. Always confirm details against retrieved documentation rather than the skill text alone:

   ```bash
   node "<this skill's directory>/scripts/docs-search.mjs" \
     --query "Intake responses API Cart Quote Request Shopping List file upload" \
     --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
     --model "<current-model>" \
     --commercetools-project-key "<if known>" \
     --commercetools-region "<if known>" \
     --limit 10
   ```

   Pass the commercetools project key and region (as in `api.{region}.commercetools.com`) only if already in your context; otherwise omit both. Never search files or ask the user for them.
   <!-- ct:docs-search:end -->

2. **Fetch the REST schema** before writing a request or parsing a response. Run:

   ```bash
   node scripts/openApi-schemata.mjs \
     --resource-name "api-AgentResponsesSuccess" \
     --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
     --model "<current-model>"
   ```

   The output is the OpenAPI specification for that resource. If the name is not recognized, the script prints valid names. Re-run with `api-Cart-write`, `api-QuoteRequest`, or `api-ShoppingList` when the follow-up is an update to the entity Intake created, not another Intake call.

3. **Confirm the Project can accept the call.** Intake is enabled for the Project (otherwise `FeatureDisabled`). The API client has the `manage_intake_agent:{projectKey}` [scope](https://docs.commercetools.com/api/scopes.md#intake). Product Search is enabled (otherwise `ProductSearchNotEnabled`). The buyer already exists as a Customer. Intake looks a Customer up by email and does not create one.

4. **Run the same prompt in Merchant Center before writing the adapter.** Paste the prompt and any file into [Merchant Center Intake](https://docs.commercetools.com/merchant-center/ai-agents/intake.md). A failure there is the Project, catalog, or Customer. A success there and a failure from the API is the request the integration sent. A success that needed a clarifying question does not count: the prompt that produced the entity is the prompt the API body must contain.

5. **Choose `outputType`.** Read [choose-output.md](./references/choose-output.md). The field is required. Intake never infers it from the message.

6. **Map the channel into one request.** Read [call-responses.md](./references/call-responses.md), then the channel file:
   - Mailbox: [email.md](./references/email.md)
   - Zendesk: [zendesk.md](./references/zendesk.md)
   - Any other drop (a form, a drive folder, another helpdesk): the same mapping in [call-responses.md](./references/call-responses.md). A new channel is a new normalizer, not a new Intake contract.

7. **Call once per new request, and remember that you did.** The endpoint has no idempotency key. Conditionally insert the channel's own id (email `Message-ID`, Zendesk ticket id) as in progress, acknowledge the delivery, then call. On success, store that id against `threadId`, `entity.id`, and, for a Quote Request, `cartId`. A second POST creates a second entity.

8. **Handle the outcome and write it back** using [handle-outcome.md](./references/handle-outcome.md). A `201` can still carry warnings. A `400` names what was missing. Do not answer a `400` by calling again with the same body.

9. **A later message on the same thread updates the entity** with the normal Cart, Quote Request, or Shopping List APIs. POST to Intake again only when the event is a new request and no entity was stored for it.

## Checklist

- [ ] The same prompt created the entity in Merchant Center before the adapter was written. A clarifying question in that UI does not count
- [ ] `outputType` was chosen by the integration, not left for Intake to guess
- [ ] The prompt states the buyer's email, and for a Cart or Quote Request a shipping country, in plain text
- [ ] A Shopping List name is stated in the prompt or a file. Intake does not invent one
- [ ] `businessUnit` and `store` are passed as resource identifiers when the channel knows them
- [ ] Uploads use the `files` part, at most 3 files, only allowed content types
- [ ] The channel event id is conditionally inserted as in progress before the webhook is acknowledged, then stored against `entity.id` and `threadId` so a redelivery does not call Intake again
- [ ] Warnings and the specific `400` code are written back to the channel
- [ ] A follow-up on the same email thread or ticket updates the stored entity instead of starting a new Intake run
