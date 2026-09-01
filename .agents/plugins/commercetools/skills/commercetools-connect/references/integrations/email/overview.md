---
name: email-integration-overview
description: Integrate a transactional email service (SendGrid, Mailgun, AWS SES, Postmark, …) into commercetools via a Connect connector — the one-app, event-driven workflow (requirements → is-a-ready-made-connector-enough → config → send + verify). The email sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - email
    - notifications
    - connect
---

# Email connector — integrate a transactional email service (event-driven)

This is the **email integration sub-area** of [commercetools-connect](../../../SKILL.md): you want commercetools events (a customer registers, an order is placed or ships, a password reset is requested) to trigger transactional emails through an external Email Service Provider (ESP). You'll do it with a Connect connector. For the deep, type-agnostic build/publish/certify lifecycle and the production-readiness gate, that's the parent connect skill; this sub-area owns the email-specific shape end to end — from "is there a connector already?" through configuring, forking, or building one.

Unlike the tax sub-area (a *synchronous* calculator plus an *asynchronous* recorder), an email integration is **one job and one application**:

- **mail-sender** (an `event` app driven by a **Subscription** on Customer/Order Messages) — commercetools delivers a Message to the app's queue; the handler picks the email type from the Message type, re-fetches the resource, builds the personalization data, and calls the ESP to send. Email is **always asynchronous**: sending must never block or fail a checkout, so there is **no API Extension** here.

This one-app shape is what the official [transactional email integration template](https://docs.commercetools.com/connect/templates/transactional-emails.md) ships (its app is literally named `mail-sender`, `applicationType: event`, `endpoint: /mailSender`) and what the [email integration tutorial](https://docs.commercetools.com/tutorials/connect-email-integration.md) documents. Because it's a pure `event` app, **everything in [event-applications.md](../../event-applications.md) applies directly** — this sub-area layers the email-specific decisions (which Messages, delivery semantics for un-idempotent sends, templating, localization, PII) on top.

> **The mistake to internalize first: delivery semantics.** An ESP send is **not idempotent** — call it twice and the customer gets two emails. Event delivery is **at-least-once**, so the same Message *will* sometimes arrive twice. How you acknowledge decides everything: ack *before* sending (at-most-once — never double-sends, but a transient ESP failure silently drops the email) vs. ack *after* a confirmed send and dedupe on redelivery (at-least-once — retries failures, but you must dedupe or customers get duplicates). The official template acks first (fire-and-forget). Pick deliberately per email type — see [email-contract.md](./email-contract.md).

## Workflow

Follow these steps in order. **The connector fit-check is a hard, ordered gate — never skip it or jump ahead to ESP/provider details:** (1) list the public marketplace connectors, (2) confirm with the user whether to *use* a public one, *modify/fork* one, or *create* a new one, and only then (3) gather the detailed requirements. The heart is **Step 1 → Step 2 → Step 3 → Step 4** (list marketplace → use/modify/create → requirements → config).

### Step 0 — Gather context (required, run first)

The mandatory grounding step: pull the latest verified documentation as context for you (the agent). Use the parent connect skill's docs-search script with email-focused terms. **Do not skip it, and do not replace it with another tool**:

```bash
node scripts/docs-search.mjs \
  --query "<email terms from the user's request, e.g. 'transactional email connector subscription messages order confirmation customer registration'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-connect" \
  --limit 10
```

(Run it from the `commercetools-connect` skill root.) Use its output as primary grounding. You *may additionally* use the commercetools Knowledge MCP or `https://docs.commercetools.com/tutorials/connect-email-integration` for deeper follow-up.

### Step 1 — List the publicly available connectors (required — do this first, before ESP or requirements)

Before asking anything about the ESP or which emails, find out **what already exists**. Don't answer from memory — the marketplace changes. Check **live** data (the Connect marketplace at `marketplace.commercetools.com/connectors` + the email docs, via the `docs-search` script / Knowledge MCP) and **present the user a concrete list** of the available email / messaging / marketing connectors — each with its **name, vendor, the service it integrates, and its certification/status**. Call out explicitly whether any is a *transactional* email connector or whether the listings are only *marketing/CRM* platforms (as of writing they are marketing-oriented; the classic transactional ESPs — SendGrid, Mailgun, AWS SES, Postmark — have **no dedicated connector** and are build-from-template). How to check and the current landscape: [connector-selection.md](./connector-selection.md).

### Step 2 — Confirm the approach: use, modify, or create (required — do not skip, do not assume)

With the list in front of the user, **explicitly ask which path they want.** This decision drives everything after it, so make it *before* gathering ESP/build details:

1. **Use a public connector as-is** (rung 1) → install + configure it; the emails are authored and sent inside that platform. Installation (CLI auth, scopes, `deployment create`) is the parent skill's [deployment-installation.md](../../deployment-installation.md).
2. **Modify / fork an existing connector** (rung 3) → the "customize the code" path: fork a source-available connector or the official template, add only the delta (message types, localization, attachments, a different ESP), deploy as an Organization connector. (First rule out rung 2 — a gap that *config* can close.)
3. **Create a new one from scratch** (rung 4) → build from the [transactional email template](https://docs.commercetools.com/connect/templates/transactional-emails.md), implementing the stubbed ESP call for the service they define.

Walk the ladder (stop at the first rung that fits) and **record: platform/ESP · rung · connector + version checked · why.** Full ladder incl. the "config closes the gap" middle rung: [connector-selection.md](./connector-selection.md).

> Email is **template-first**: unlike tax (where Avalara/Vertex ship certified connectors), most ESPs have no dedicated transactional connector, so "create new" or "modify the template" is the common outcome — but you **still run Steps 1–2 and let the user decide**; never skip the fit-check or presume the rung.

### Step 3 — Extract requirements (after the approach is chosen)

Which emails, on which events, in which language, is downstream of business facts. Each maps to a config key in Step 4 or a decision in the contract. Ask the user (don't assume):

1. **Which ESP, and why?** SendGrid, Mailgun, AWS SES, Postmark, Brevo, Mailchimp/Mandrill, … Do they already have an account + API key + a verified sender domain? (Deliverability, template model, and pricing differ; see [providers.md](./providers.md).)
2. **Which emails do they need?** Each maps to a commercetools Message — the canonical set the template covers: registration (`CustomerCreated`), email verification (`CustomerEmailTokenCreated`), password reset (`CustomerPasswordTokenCreated`), order confirmation (`OrderCreated`), order state / shipment (`OrderStateChanged`, `OrderShipmentStateChanged`), refund/returns (`ReturnInfoAdded`, `ReturnInfoSet`). See [email-contract.md](./email-contract.md).
3. **For order-state emails, which *target states* trigger a send?** `OrderStateChanged` fires on *every* transition — you only want to email on specific ones (e.g. `Confirmed`, `Cancelled`, shipmentState `Shipped`). Without a state gate you spam customers on every internal state change.
4. **Delivery guarantee per email:** is a duplicate email acceptable, or is a *dropped* email worse? Token/reset emails are high-stakes (a dropped reset email blocks the user); marketing-ish confirmations tolerate at-most-once. → drives the ack strategy ([email-contract.md](./email-contract.md)).
5. **Templating & localization.** Are templates authored in the ESP (dynamic/stored templates, referenced by ID — the template's model) or rendered in the connector? Multiple languages? What's the language source — `customer.locale`, the order/store locale, or a single default? (The template hardcodes `en-US` — a gap to close.)
6. **Region and project?** e.g. `europe-west1.gcp`, project `my-project`.
7. **Token-email validity.** For verification/reset emails: the token *value* only rides the Message when the token's validity is **≤ 60 minutes**; otherwise the connector must mint the token itself (a write). → scope + design impact, [email-contract.md](./email-contract.md).
8. **Anything special? (always ask — open-ended)** Multi-store/brand (different sender/template per store), B2B/business-unit recipients, attachments (PDF invoice), unsubscribe/consent handling, bounce/complaint feedback back into commercetools, a batch/digest email (a separate `job` app). Capture each as its own requirement line; **don't force it into a slot above.**

Write these as a short requirements block and **confirm with the user** before deriving config. If the user surfaces nothing special, a sane default is: ESP chosen → the emails they name → ESP-hosted templates by ID → language from `customer.locale` with an `en` fallback → at-most-once for confirmations, and prioritized retry for token emails → and say so explicitly.

The rung was set in **Step 2** — if it's rung 1 (use as-is), the configuration below is the *installed connector's* settings and Steps 5–6 are owned by that connector (skip to Step 7 to verify); for rungs 3–4 it's your own `connect.yaml` and app.

### Step 4 — Derive the config from the requirements

Translate the answers into `connect.yaml` values, with a one-line **why** each. Full mapping and provider key names: [config-from-requirements.md](./config-from-requirements.md). Key decisions here:

- **Least-privilege scopes** via `inheritAs.apiClient.scopes` (not hand-supplied `CTP_CLIENT_ID/SECRET`). Which scopes depends on which emails: always `manage_subscriptions` (postDeploy registers the Subscription); `view_orders`/`view_customers` to re-fetch for order/registration emails; **`manage_customers`** if token emails mint a token.
- **Secrets in `securedConfiguration`:** ESP API key, and (per template) the per-email template IDs; region and toggles in `standardConfiguration`.

### Step 5 — The Subscription & message routing (reference)

The Subscription is what makes the connector fire. Register it in `postDeploy` on the exact `resourceTypeId` + message `types` you send email for — nothing more (the broker shouldn't deliver noise). Then the handler branches on the Message type to the right email. Full registration shape and routing: [email-contract.md](./email-contract.md).

### Step 6 — Build the one app (the main body of work), test-first

**Tests come before implementation.** The rules that make an email integration correct — acking so a failed send isn't silently lost (or a redelivery isn't double-sent), gating order-state emails on the target state, re-fetching by id, localization, not logging PII/tokens — are invisible at the call site. Each is one cheap assertion. Write the test first.

Read [email-contract.md](./email-contract.md) and [providers.md](./providers.md), then build, test-first:

1. **Subscription registration** (`postDeploy`) — idempotent (delete-then-create by a stable key, or get-then-skip); the exact message types; destination from the injected vars for the broker `CONNECT_SUBSCRIPTION_DESTINATION` reports.
2. **The handler** — decode the base64 envelope; validate & branch on Message type; ack per your chosen delivery semantics; re-fetch the Order/Customer by id; map to the ESP's send request (template id + personalization data); call the ESP behind a tight timeout.

**Mock the outbound boundary** (the ESP, the CT APIs) and assert on what your code *decided* — which email type, which template, what recipient/data, what it did on failure. The suite must run with zero deployment and zero secrets. What to assert/mock is in [email-contract.md](./email-contract.md).

### Step 7 — Verify the round trip

Don't declare done until a real event produces a real email. Trigger each event (register a customer, place an order), confirm the ESP's activity feed shows the send to the right recipient with the right template and data, and check the two traps that look like bugs: **the Subscription wasn't registered** (no email fires at all) and **the ESP is in sandbox/test mode** (accepts the call but doesn't deliver). See [verification.md](./verification.md).

## References

| Need | Reference |
|---|---|
| **Is a ready-made connector enough?**: configure vs fork vs build-from-template; the template-first reality; live-marketplace check | [connector-selection.md](./connector-selection.md) |
| **Requirements → config mapping**: which messages, ESP + template IDs, sender, least-privilege scopes; the `connect.yaml` envelope; worked example | [config-from-requirements.md](./config-from-requirements.md) |
| **The one-app contract**: subscription registration, message→email routing, the at-most-once vs at-least-once decision, token-email gotcha, state filtering, localization, PII; full pitfall catalog | [email-contract.md](./email-contract.md) |
| **ESP specifics**: SendGrid / Mailgun / AWS SES / Postmark send-call shape, ESP-hosted templates, idempotency keys; provider comparison | [providers.md](./providers.md) |
| **Verify the round trip**: per-event checks; the no-subscription and sandbox-doesn't-deliver traps; duplicate/silent-drop symptoms | [verification.md](./verification.md) |
| Generic event-app contract (envelope, ack table, idempotency, re-fetch) — this sub-area builds on it | [event-applications.md](../../event-applications.md) |
| Build/publish/certify lifecycle, deploy, scopes, production-readiness gate (type-agnostic) | [commercetools-connect](../../../SKILL.md) |

Adding another ESP later means adding notes to [providers.md](./providers.md) — the one-app architecture, the contract, and the flow do not change.

## Checklist

Connector fit-check (do this FIRST — do not skip or reorder)
- [ ] Listed the **live** marketplace connectors (not from memory) and **presented them to the user** with name · vendor · service · status
- [ ] Flagged whether any is a *transactional* email connector or only *marketing/CRM* platforms
- [ ] **Confirmed the approach with the user: use as-is (1) · config-closes-gap (2) · modify/fork (3) · create from template (4)** — before gathering ESP/build details
- [ ] Recorded platform/ESP · rung · connector + version checked · why

Requirements (after the approach is chosen)
- [ ] ESP/platform chosen + API key + verified sender domain; region + project
- [ ] The exact emails/Messages listed; for order-state emails, the **target states** that trigger a send named
- [ ] Delivery guarantee decided **per email** (duplicate-tolerant vs drop-intolerant) — for use-as-is, owned by the platform
- [ ] Templating model (ESP-hosted by ID vs in-connector) and **localization source** identified
- [ ] Token-email validity (≤ 60 min → value in Message; else mint in connector) understood
- [ ] Asked the open-ended "anything special?" question; each special its own line
- [ ] Requirements block written and confirmed

Config (the deliverable)
- [ ] `inheritAs.apiClient.scopes` least-privilege for the emails in scope (`manage_subscriptions` + the read/write the handlers need)
- [ ] ESP key + template IDs in `securedConfiguration`; region/toggles in `standardConfiguration`
- [ ] `connect.yaml` at the repo root; only documented envelope fields

The one app (build test-first)
- [ ] Subscription registered idempotently on only the needed message types; destination from the injected vars for the broker `CONNECT_SUBSCRIPTION_DESTINATION` reports
- [ ] Ack strategy implemented and asserted (no silent drop; no double-send)
- [ ] Order-state emails gated on the target state; handlers re-fetch by id
- [ ] Boundary mocked; suite runs with no deployment/secrets

Verification
- [ ] Each event produces an email to the right recipient with the right template + data
- [ ] Understood: no Subscription → no email; ESP sandbox/test mode may not deliver
