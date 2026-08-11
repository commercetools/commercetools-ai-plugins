---
name: email-connector-selection
description: Decide whether to configure a ready-made email connector, fork/customize one, or build from the transactional email template — email is template-first (most ESPs have no dedicated connector). Uses live marketplace data. The email sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - email
    - connect
---

# Is a ready-made email connector enough?

This answers **Steps 1–2** of [overview.md](./overview.md), the mandatory ordered gate: **first list the public marketplace connectors, then confirm with the user whether to *use* one as-is, *modify/fork* one, or *create* a new one** — before gathering ESP details or writing anything. For email the answer skews toward create/modify-from-template, because the connector landscape is **ESP-specific and thin** — unlike tax, where Avalara/Vertex ship certified connectors.

## Do this in order — don't skip, don't answer from memory

Marketplace listings change. Run these **before** any ESP/requirements questions:

1. **List** the connectors from the **live** Connect marketplace (`marketplace.commercetools.com/connectors`) + the email docs via the `docs-search` script or the Knowledge MCP — the email / messaging / marketing listings.
2. **Present them to the user**: name · vendor · service · certification/status, and flag whether any is a *transactional* email connector or only *marketing/CRM* platforms.
3. **Confirm the approach with the user** — use as-is (rung 1) · config-closes-gap (rung 2) · modify/fork (rung 3) · create from template (rung 4). Do not presume the rung.
4. **Record** platform/ESP · rung · connector + version checked · why.

Only after this gate do you gather ESP-specific requirements ([overview.md](./overview.md) Step 3). Match the requirements against the listings ESP-by-capability (which emails/messages, ESP-hosted vs in-connector templates, localization, attachments, multi-store).

## The email landscape (verify, but this is the shape)

commercetools ships an **official, ESP-agnostic [transactional email integration template](https://docs.commercetools.com/connect/templates/transactional-emails.md)** ([`commercetools/connect-email-integration-template`](https://github.com/commercetools/connect-email-integration-template)). It wires the Connect plumbing (the `event` app, the Subscription registration, message routing to per-type handlers, config) and leaves **one thing stubbed: the actual call to the ESP** (`GenericHandler.sendMail`). It is a *template*, not a marketplace install — you deploy your own customization of it.

Whether a *ready-made marketplace connector* exists depends entirely on the ESP:

| Situation | Default rung |
|---|---|
| A marketplace connector exists for the exact ESP and covers the emails needed | **1 (configure)** |
| A marketplace connector exists but source-available and has a real gap | **3 (fork/customize)** |
| No marketplace connector for the ESP (the common case) | **4 (build from the official template)** |

The practical consequence: **"just install a connector" is often not available for email.** A request to "send order emails via SendGrid/Mailgun/SES" is usually a build-from-template job — start from the official template and implement the provider call. State this to the user early; it changes the effort estimate. And because the template already carries the skeleton, **rung 3 and rung 4 are nearly the same work** — "customize the code" and "build a new one for a defined ESP" both mean *edit the template and implement `sendMail`.*

## The ladder (stop at the first rung that fits)

### Rung 1 — Configure a ready-made connector

If a marketplace connector exists for the ESP and covers the requirements, **install and configure it** — cheapest and most maintainable. Installation (CLI auth, scopes, `deployment create --connector-key`, or Merchant Center install) is the parent skill's [deployment-installation.md](../../deployment-installation.md). Hand it the config you derive in [config-from-requirements.md](./config-from-requirements.md) (API key, sender, template IDs).

### Rung 2 — A gap that config can close

Most "missing" email behavior is configuration: *which* emails are sent, *which* ESP template ID maps to each, the sender address, the region. Re-check the apparent gap against the connector's config surface before forking. Mapping: [config-from-requirements.md](./config-from-requirements.md).

### Rung 3 — Fork/customize (the "customize the code" path)

A genuine gap config can't close — add message types (e.g. `OrderShipmentStateChanged`, a custom message), localize by `customer.locale`, attach a PDF invoice, gate order-state emails on specific target states, or swap the ESP — and the source is available (the official template always is). Fork it, add **only the delta**, deploy as an **Organization connector**. Don't rebuild the plumbing. Hand off to [commercetools-connect](../../../SKILL.md) for the fork's build/stage/publish lifecycle. The per-email contract and pitfalls to preserve are in [email-contract.md](./email-contract.md).

### Rung 4 — Build from the template (the "create a new one" path)

No connector for the ESP → build from the [transactional email template](https://docs.commercetools.com/connect/templates/transactional-emails.md). The template ships the `mail-sender` `event` app with the Connect plumbing done — lifecycle scripts, Subscription registration, envelope decode, message→handler routing, per-email personalization mapping — but the **ESP call is a stub you implement** (`sendMail`), plus retry/recovery is yours.

What you actually write on rung 4:
- The **ESP send call** in `sendMail`: template id + `to`/`from` + personalization data → the provider's transactional-send API ([providers.md](./providers.md)).
- Your **delivery-semantics** choice (ack-first vs ack-after-success + dedupe) and any retry ([email-contract.md](./email-contract.md)).
- **Localization**, **state-filtering** on order-state emails, and **token-email** handling if in scope.
- Config + least-privilege scopes ([config-from-requirements.md](./config-from-requirements.md)).

The full build/stage/publish/certify lifecycle for rungs 3–4 is the parent [commercetools-connect](../../../SKILL.md) skill; return to this email flow once the connector is deployed.

## Recording the decision

In the requirements block, note: **ESP · rung · connector name + version checked · why**. Example:

> *Email: SendGrid · rung 4 (build from template) · checked marketplace 2026-07 — no dedicated SendGrid email connector listed; using the official transactional email template and implementing the SendGrid dynamic-templates send call · emails: order confirmation + shipment + password reset.*
