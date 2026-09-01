---
name: marketplace-integration-overview
description: Integrate a marketplace service (Marketplacer, Mirakl, Convictional, a channel manager, or one you define) into commercetools via a Connect connector — the workflow (role + direction → is a public connector enough? → seller modeling → config → build the sync apps). The marketplace sub-area of commercetools-integrations.
metadata:
  contentType: REFERENCE
  area:
    - platform
    - integration
    - marketplace
    - connect
---

# Marketplace connector — integrate a marketplace service

This is the **marketplace integration sub-area** of this skill: a multi-vendor marketplace platform (Marketplacer, Mirakl, Convictional, a channel manager, or a service the user defines) has to exchange **sellers, offers, inventory, prices, and orders** with commercetools, and you'll do it with a Connect connector. The type-agnostic build/publish/certify lifecycle and the production-readiness gate stay in the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill; this sub-area owns the marketplace-specific job end to end — from "is there a connector already?" through configuring one, **customising (forking) one**, or **building one for a marketplace service the user defines**.

> **First, disambiguate the word "marketplace" — ask if it isn't obvious.** Two unrelated meanings collide here:
> - **The commercetools Connect marketplace** — [marketplace.commercetools.com](https://marketplace.commercetools.com/connectors), the catalog where connectors and integrations are *listed*. Every connector task touches this.
> - **A marketplace business model** — selling third-party sellers' assortments, or selling your assortment on someone else's marketplace. That is what this sub-area is about.
>
> "Build a marketplace connector" almost always means the second. If the user actually meant "publish my connector on the Connect marketplace", that's the commercetools-connect skill's [deployment-installation.md](../../../commercetools-connect/references/deployment-installation.md), not this file.

**Nothing here belongs on the cart hot path.** Offer sync, order export, and inventory updates are asynchronous by nature — they must never be registered as an API Extension. The one arguable exception is a cross-seller *cart validation* extension (e.g. rejecting a cart that mixes sellers who can't ship together); if the user needs that, price it against the extension timeout budget in [service-applications.md](../../../commercetools-connect/references/service-applications.md) first, and keep it separate from the sync apps.

## Step 1 — Fix the role, then the direction

Everything else follows from these two answers. Get them before proposing an architecture.

| Role | The user is… | Direction(s) | Connect app(s) |
|---|---|---|---|
| **Operator** | running the marketplace: third-party sellers' offers sell through their commercetools-powered storefront | sellers/offers/inventory/prices **in**; order lines and fulfilment status **out** | **`service`** inbound webhook and/or **`job`** poll for seller + offer sync; **`event`** app on `OrderCreated` to route each seller's lines to the marketplace; optional **`job`** for reconciliation/backfill |
| **Seller (channel)** | selling their own catalog *on* an external marketplace (Amazon, eBay, a Mirakl operator) usually via a channel manager | catalog/price/stock **out**; marketplace orders **in**; shipment/tracking **out** | **`event`** app exporting catalog/price/stock changes (or a **`job`** for batch feeds); **`service`** webhook or **`job`** to import marketplace orders; **`event`** app pushing shipment/tracking back |
| **Both** | hybrid (operates a marketplace *and* lists on others) | both | both sets — as **separate apps**, never one app with a mode flag |

Then, per the commercetools-connect skill's rule, name the source of truth **per domain**, not globally: catalog/offer content, inventory, price, order, and seller record can each be mastered on a different side. The platform guidance is explicit — pick one source of truth per data domain and [avoid bi-directional syncs](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md); a marketplace integration is where teams most often break that rule and get sync loops.

## Workflow

The heart is **Step 1 → Step 1.5 → Step 2 (seller modeling) → Step 4**.

### Step 0 — Gather context (required, run first)

The mandatory grounding step: pull the latest verified documentation as context for you (the agent). Use this skill's docs-search script with marketplace-focused terms. **Do not skip it, and do not replace it with another tool:**

```bash
node scripts/docs-search.mjs \
  --query "<marketplace terms from the request, e.g. 'marketplace seller supply channel distribution channel store product selection order import syncInfo'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-integrations" \
  --limit 10
```

(Run it from the `commercetools-integrations` skill root.) You *may additionally* use the commercetools Knowledge MCP for follow-up. There is **no marketplace module in the public docs** — the load-bearing references are [Channels](https://docs.commercetools.com/api/projects/channels.md), [Stores](https://docs.commercetools.com/api/projects/stores.md), [Product Selections](https://docs.commercetools.com/api/projects/product-selections.md), [Inventory](https://docs.commercetools.com/api/inventory-overview.md), and [Order Import](https://docs.commercetools.com/api/projects/orders-import.md). Read the ones your role needs.

### Step 1 — Extract requirements (before any config or code)

Ask the user — don't assume:

1. **Which marketplace service, and what API access?** Marketplacer, Mirakl, Convictional, a channel manager, an operator's own portal, or a service they define. Webhooks vs polling, credentials, sandbox, rate limits.
2. **Role and direction** (the table above). Operator, seller, or both.
3. **Source of truth per domain** — offer content, inventory, price, order, seller record.
4. **How many sellers, and do they need isolation?** Isolated storefront/catalog/permissions per seller → Store-per-seller; a shared catalog with per-seller offers → Channel-per-seller only. Drives Step 2.
5. **Do multiple sellers sell the same SKU?** If yes, one Product with per-seller prices and stock — not one Product per seller. This is the single most consequential modeling answer.
6. **Which entities sync?** Sellers, offers/listings, inventory, prices, orders, shipments/tracking, returns/cancellations, invoices.
7. **Order flow.** Does commercetools capture the order and route lines to sellers (operator), or does the marketplace capture it and you import it (seller)? Can one cart span sellers → split shipments and per-line fulfilment states?
8. **Commission, payout, and settlement.** Confirm explicitly that these stay in the marketplace/PSP: commercetools [only tracks Payment status](https://docs.commercetools.com/learning-integrate-with-commercetools/integration-patterns/integration-planning-and-patterns.md) and has no payout ledger. Don't model seller payouts as commercetools resources.
9. **Seller onboarding/offboarding.** Approval flow, and what happens on offboarding — note up front that a [Channel can't be deleted while it's referenced](https://docs.commercetools.com/api/projects/channels.md#delete-channel) by inventory, a Line Item, a Store, or a Price, so offboarding is deactivation, not deletion.
10. **Anything special or non-standard? (always ask — open-ended)** Seller-specific shipping rules or lead times, per-seller tax, drop-ship vs consignment, marketplace-imposed feed formats/schedules, returns arbitration, multi-currency or multi-country sellers, seller-facing UI in the Merchant Center. Capture each as its own requirement line; **don't force it into a slot above.**

Write these as a short requirements block and **confirm with the user** before deriving config.

### Step 1.5 — Ask the user which path: use as-is, customise, or build

This is a **question to the user, not a silent decision** — and it comes before any code. Check **live** what exists (the [Marketplaces category](https://marketplace.commercetools.com/integrations/marketplaces) and [connector list](https://marketplace.commercetools.com/connectors)), show the user what you found, then offer exactly three paths:

1. **Use a public connector directly** — install and configure it, no code. Only valid if the listing is an actually deployable Connect connector.
2. **Customise it** — fork an open-source connector and add only the delta (the realistic path for marketplace work). Assess the candidate by **reading its current repo** — `connect.yaml`, handlers, mapping — and score it against the production gate and this sub-area's contract; don't work from a remembered gap list.
3. **Build a new one for the marketplace service they define** — no listing fits, or the service is bespoke. There is **no marketplace Connect template**, so you scaffold plain `service`/`event`/`job` apps.

**Apply the commercetools-connect skill's [listings-are-not-all-Connect-connectors rule](../../../commercetools-connect/SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending) — it bites hardest here.** The Marketplaces category is mostly partner-operated platforms, accelerators that deploy as cloud functions, and iPaaS middleware, none of which Connect can deploy. Confirm a candidate has a root `connect.yaml` before calling it path 1; if a listing matches functionally but isn't a Connect connector, surface it and say plainly that this skill doesn't cover non-Connect integrations, then offer path 2 or 3. Marketplace-specific method, how to assess a fork candidate, and the ladder: [connector-selection.md](./connector-selection.md).

Record the chosen path, the connector name + version you checked (or "none exists"), and why, in the requirements block.

### Step 2 — Model sellers and offers, then derive the config

Marketplace integrations fail at the data model long before they fail at the transport. Decide seller modeling (Channel per seller, Store per seller, CustomObject seller record, offer keying, price/stock scoping) and only then write `connect.yaml`. The mapping table, the limits that constrain it, scopes, and a worked example are in [config-from-requirements.md](./config-from-requirements.md).

### Step 3 — Price the async contract (reference)

Restate in one sentence each before coding: **idempotency** (every write is an upsert by a stable marketplace id — seller id, offer id, marketplace order number — never a blind create), **at-least-once with no ordering** (re-fetch by id; a stale offer update must not overwrite a newer one), **fan-out limits** ([50 Subscriptions and 25 Extensions per Project](https://docs.commercetools.com/api/limits.md) — never one per seller), and **loop avoidance** where a domain syncs both ways.

### Step 4 — Build/verify the sync apps (the main body of work), test-first

**Tests come before implementation.** The rules that make a marketplace integration correct — upsert-by-marketplace-id, per-seller supply channel on every InventoryEntry, a channel on every seller price, dedupe on `orderNumber`, per-line fulfilment state — are invisible at the call site and expensive to reproduce by hand. Each is one cheap assertion.

Read [marketplace-contract.md](./marketplace-contract.md) and build **only the apps your role requires**, test-first for each:

1. **Seller sync** (inbound) — upsert a Channel (and Store/CustomObject) per seller, keyed on the marketplace seller id.
2. **Offer/listing sync** — inbound (operator): upsert Products/prices/inventory per seller; outbound (seller role): export catalog/price/stock changes to the marketplace.
3. **Order app** — inbound (seller role): import marketplace orders via [Order Import](https://docs.commercetools.com/api/projects/orders-import.md) keyed on `orderNumber`; outbound (operator): route each seller's lines on `OrderCreated` and record the hand-off in the Order's [`syncInfo`](https://docs.commercetools.com/api/projects/orders.md#update-syncinfo).
4. **Fulfilment/status app** — shipment, tracking, cancellation and return states back to the other side, per line/per seller.
5. **Reconciliation `job`** — periodic full sweep that catches what events dropped (offers, stock drift, missed orders), checkpointed.

**Mock the outbound boundary** (the marketplace API and the commercetools APIs) and assert on what your code *decided* — which resource, what key, upsert-vs-create, which channel. The suite must run with zero deployment and zero secrets.

### Step 5 — Verify the round trip

Don't declare done until a seller, an offer, and an order each flow end to end, and a multi-seller order splits correctly. See [verification.md](./verification.md), including the traps that look like bugs but aren't (a channel-less price leaking into every Store, availability aggregated across sellers, throttled feeds).

## References

| Need | Reference |
|---|---|
| **Which path** — use a public connector as-is, customise/fork one, or build for a defined service; live check, listing-is-not-a-connector verification, how to assess a fork candidate from its repo, the ladder | [connector-selection.md](./connector-selection.md) |
| **Seller + offer modeling and config** — Channel/Store/CustomObject per seller, offer keying, price and stock scoping, the limits that constrain it, scopes, `connect.yaml`, worked example | [config-from-requirements.md](./config-from-requirements.md) |
| **The sync contract** — per-app rules for seller sync, offer sync, order import/export, fulfilment, reconciliation; idempotency keys, `syncInfo`, split shipments; full pitfall catalog | [marketplace-contract.md](./marketplace-contract.md) |
| **Verify the round trip** — seller, offer, order, split order; the channel-less-price, aggregated-availability, and throttling traps | [verification.md](./verification.md) |
| Build/publish/certify lifecycle, deploy, scopes, production-readiness gate (type-agnostic) | [commercetools-connect](../../../commercetools-connect/SKILL.md) |

Adding another marketplace service later reuses this tree unchanged — the role/direction split, the seller model, and the keying rules don't change; only the service's API and payloads do.

## Checklist

Requirements
- [ ] "Marketplace" disambiguated (business model vs the Connect marketplace listing catalog)
- [ ] **Role fixed** (operator / seller / both) and **direction per domain** decided
- [ ] Source of truth named per domain (offer, inventory, price, order, seller)
- [ ] Seller count and isolation needs known; same-SKU-multiple-sellers answered
- [ ] Entities in scope listed; order flow (route vs import) decided
- [ ] Commission/payout confirmed as out of scope for commercetools
- [ ] Offboarding path decided (deactivate, not delete — Channel delete constraints)
- [ ] Asked the open-ended "anything special?" question; each special requirement its own line
- [ ] Requirements block written and confirmed

Path (asked, not assumed)
- [ ] Checked **live** marketplace listings; named connector + version (or "none exists")
- [ ] Verified any candidate is a **deployable Connect connector**, not a partner/SaaS listing
- [ ] Presented all three paths — use as-is · customise/fork · build for their service — and let the user choose
- [ ] Chosen path + rung recorded

Modeling and config
- [ ] Seller modeling decided (Channel per seller; Store/Product Selection only if isolation is needed; CustomObject for profile data)
- [ ] Offer keying decided; same-SKU sellers modeled as one Product with per-seller prices/stock
- [ ] Every seller price carries a distribution channel; every InventoryEntry a supply channel
- [ ] `inheritAs.apiClient.scopes` least-privilege; marketplace credentials in `securedConfiguration`
- [ ] No per-seller Subscriptions or Extensions (Project limits)

The sync apps (build test-first)
- [ ] Every write is an upsert keyed on a stable marketplace id
- [ ] Inbound orders deduped on `orderNumber`; outbound hand-off recorded in `syncInfo`
- [ ] Per-seller fulfilment tracked per line item, not per order
- [ ] Reconciliation job checkpointed; rate limits respected (batch + backoff)
- [ ] Boundary mocked; suite runs with no deployment/secrets

Verification
- [ ] Seller, offer, and order round trips proven; multi-seller order splits correctly
- [ ] Re-delivery of the same webhook/message creates no duplicate
