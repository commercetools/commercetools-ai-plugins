---
name: email-service-providers
description: Email service provider specifics for the stubbed sendMail call — SendGrid, Mailgun, AWS SES, Postmark — ESP-hosted templates, personalization data, idempotency keys, and a cross-provider comparison. The email sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - email
    - connect
---

# Email service provider specifics

The official template leaves exactly one thing unimplemented: `GenericHandler.sendMail(sender, recipient, templateId, data)` — the call to the ESP. This file is the shape of that call per provider. The commercetools side is identical regardless of ESP; only this outbound call changes. **Verify each provider's exact API against its own docs** (linked) — ESP APIs evolve and are outside commercetools' docs.

## The shape (ESP-agnostic)

Every transactional ESP send is the same four things:

1. **Auth** — the API key from `EMAIL_PROVIDER_API_KEY` (secured config), typically a `Bearer` header.
2. **From/To** — `SENDER_EMAIL_ADDRESS` (a *verified* sender) → the recipient (`order.customerEmail` / `customer.email`).
3. **A template reference** — the ESP-hosted template id for this email type (+ locale), from secured config.
4. **Personalization data** — the key/value object your handler built (order number, name, line items, totals, token/link) merged into the template by the ESP.

Prefer **ESP-hosted templates referenced by id** over rendering HTML in the connector: marketers can edit copy without a redeploy, and the connector stays a thin data-mapper. Render in-connector only if the ESP has no template feature or you need full control.

Pass an **idempotency key** wherever the ESP supports one — it's how Option B (at-least-once + dedupe, [email-contract.md](./email-contract.md)) avoids duplicate emails. Use a stable key: `resource.id` + `sequenceNumber`, or the message id.

## Providers

### SendGrid (dynamic templates)

- **Send:** `POST https://api.sendgrid.com/v3/mail/send`, `Authorization: Bearer <key>`.
- **Template:** `template_id` (a dynamic template `d-…`); personalization goes in `personalizations[].dynamic_template_data`.
- **Idempotency:** SendGrid supports a batch/idempotency mechanism; at minimum set a stable custom arg / batch id to help dedupe.
- Docs: [SendGrid Mail Send](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send).

```js
// sendMail body sketch
{
  from: { email: senderEmailAddress },
  personalizations: [{ to: [{ email: recipient }], dynamic_template_data: data }],
  template_id: templateId,
}
```

### Mailgun (stored templates)

- **Send:** `POST https://api.mailgun.net/v3/<domain>/messages`, HTTP basic auth (`api:<key>`), form-encoded.
- **Template:** `template` = the stored template name; variables via `h:X-Mailgun-Variables` (JSON) or `v:` params.
- Docs: [Mailgun sending](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-templates).

### AWS SES (templated email)

- **Send:** `SendTemplatedEmail` / `SendBulkTemplatedEmail` (SDK v3) or the SESv2 `SendEmail` with a `Template`.
- **Template:** `Template` name + `TemplateData` (JSON string); auth via the app's AWS credentials (secured config).
- Docs: [SES send templated email](https://docs.aws.amazon.com/ses/latest/dg/send-personalized-email-api.html).

### Postmark (templated, transactional-first)

- **Send:** `POST https://api.postmarkapp.com/email/withTemplate`, `X-Postmark-Server-Token: <key>`.
- **Template:** `TemplateId` or `TemplateAlias` + `TemplateModel`; separate message streams for transactional vs broadcast.
- Docs: [Postmark templated email](https://postmarkapp.com/developer/api/templates-api).

## Cross-provider summary

| Dimension | SendGrid | Mailgun | AWS SES | Postmark |
|---|---|---|---|---|
| Template ref | `template_id` (`d-…`) | `template` name | `Template` name | `TemplateId`/`TemplateAlias` |
| Data field | `dynamic_template_data` | Mailgun variables | `TemplateData` | `TemplateModel` |
| Auth | Bearer key | basic `api:<key>` | AWS creds | server token header |
| Payload | JSON | form-encoded | SDK | JSON |
| Localization | one template id per locale, or a locale in the data | same | same | same |

All four fit the same `sendMail(sender, recipient, templateId, data)` seam — swapping ESP is a change to this one function, not the connector. Keep the mapping (resource → `data`) provider-independent and unit-tested; keep only the HTTP/SDK call provider-specific.

## Checklist

- [ ] `sendMail` implemented against the chosen ESP's transactional-send API; key from `EMAIL_PROVIDER_API_KEY`
- [ ] Sender is a **verified** domain/sender in the ESP
- [ ] ESP-hosted template referenced by id (per email type, per locale) unless rendering in-connector is justified
- [ ] Personalization data mapping is a pure, unit-tested function; only the HTTP/SDK call is provider-specific
- [ ] Idempotency key passed on the send when using at-least-once delivery (dedupe — [email-contract.md](./email-contract.md))
- [ ] Outbound call has a tight timeout under the 10 s event ack budget
