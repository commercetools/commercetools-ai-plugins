---
name: shipping-integration-overview
description: "Build a commercetools Connect shipping connector — rule out native Shipping Methods first, then use a public connector, customise/fork one, or build a new one for a carrier or rate service the user defines; covers the rate app (Cart API Extension), the label/tracking app (Subscription), and how quoted rates land on the Cart. The shipping sub-area of commercetools-integrations."
when_to_use:
  - "Integrating a carrier, rate-shopping engine, or shipping-execution platform with commercetools via Connect"
  - "Quoting live shipping rates on the Cart from an external service instead of static Shipping Method rates"
  - "Generating shipping labels and writing tracking numbers back onto the Order from a carrier"
  - "Deciding between a public shipping connector, forking one, or building a new one for a shipping service the user defines"
metadata:
  contentType: REFERENCE
  area:
    - connect
    - shipping
    - integration
---

# Shipping connector — integrate a carrier or rate service

This is the **shipping sub-area** of this skill: you need shipping options, prices, labels, or tracking to come from an external carrier or shipping service rather than from static Shipping Method rates. The type-agnostic build contracts (service/event/job, idempotency, lifecycle, security) belong to the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill; this sub-area owns the shipping-specific decisions — **whether you need a connector at all**, which path to take, and **how an externally quoted rate actually lands on the Cart**.

## Three facts to state before anything else

Say these out loud to the user early. Each one changes the plan, and each is the opposite of what the payment/gift-card experience suggests.

1. **There is no shipping connector *contract*.** Checkout defines connector contracts for payment and gift cards ([Connectors and applications](https://docs.commercetools.com/checkout/connectors-and-applications.md)); shipping is not one of them. There is no enabler/processor pair and no session-authenticated contract to conform to — a shipping connector is a plain Connect connector built from `service` / `event` / `job` applications. Note the distinction: `shipping` **is** a valid Connect `IntegrationType`, so it classifies a connector in the registry (and is how you search for one — see [connector-selection.md](./connector-selection.md)); it does not prescribe the connector's shape.
2. **There is no shipping application template.** The documented templates are payment, product-export, tax, and transactional email ([Application templates](https://docs.commercetools.com/connect/templates/templates-overview.md)); the CLI additionally exposes `fulfilment-integration`. You scaffold from the closest architectural twin — see [connector-selection.md](./connector-selection.md).
3. **Most shipping vendors ship a vendor-hosted integration, not a Connect connector.** Rate engines and label platforms commonly document "connect your commercetools store" flows that run on *their* infrastructure and require custom glue on yours. That is not something Connect deploys. Apply the commercetools-connect rule — [Marketplace listings are not all Connect connectors](../../../commercetools-connect/SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending) — before calling anything installable.

## Scope boundary — three neighbours

Shipping work lands in one of four places. Route it, don't absorb it:

| The user needs | Owner |
|---|---|
| Zones, Shipping Method modeling, tiered rates, cart score, shipping predicates, BOPIS — **no external service in the loop** | [commercetools-commerce-patterns](../../../commercetools-commerce-patterns/SKILL.md) (rung 0 below) |
| Live rates, labels, or tracking from a **carrier or rate service** | **this sub-area** |
| Order orchestration, allocation, fulfilment status and inventory owned by an **OMS/WMS** (which usually also owns shipment + tracking) | [order-management](../order-management/overview.md) |
| Tax on the shipping line | [tax](../tax/overview.md) |

**The most common mis-scope: label + tracking.** If an OMS or WMS is in the picture, it almost certainly already books the carrier and holds the tracking number — the write-back to commercetools then belongs to the OMS connector, not here. Build a label/tracking app in *this* connector only when commercetools talks to the carrier directly. Never build both; two writers on `Delivery`/`Parcel` is a data-integrity bug, not redundancy.

## Rung 0 — can native Shipping Methods do this? (gate before designing a connector)

commercetools ships a real shipping model: Zones, per-zone/per-currency rates, `freeAbove`, predicates, and **tiered rates** driven by the Project's `shippingRateInputType` setting (Cart Value, Cart Classification, or Cart Score — with `priceFunction` available inside Cart Score tiers) — see [Shipping and Delivery Overview](https://docs.commercetools.com/api/shipping-delivery-overview.md) and the [Shipping Methods](https://docs.commercetools.com/api/projects/shippingMethods.md) reference. The docs' own guidance is that external calculation is for when tiered rates are not enough ([Shipping Methods & Rates](https://docs.commercetools.com/learning-model-your-product-catalog/shipping-methods/data-structure.md)).

Rule out native **explicitly** before proposing a connector:

- **Rates are a table** (per zone, per weight band, per cart value, free over a threshold) → native. Zones + tiers + `freeAbove`. No connector.
- **Rates are a function of one computable number** (weight, volume, distance, item count) → native tiers over Cart Score, optionally expressed as a `priceFunction`, with the score set by whoever computes it. → [tiered-rates-cart-score.md](../../../commercetools-commerce-patterns/references/tiered-rates-cart-score.md)
- **Availability varies by store, warehouse, address, or cart contents** → native shipping predicates. → [shipping-predicates.md](../../../commercetools-commerce-patterns/references/shipping-predicates.md)
- **Only the price is unknown until an external system says so, and the flow can quote once late in checkout** → still not necessarily a connector: the documented cart-freeze + `setCustomShippingMethod` pattern covers it. → [dynamic-shipping-costs.md](../../../commercetools-commerce-patterns/references/dynamic-shipping-costs.md)
- **You need a connector when** the carrier itself must be called per cart (multi-carrier rate shopping, negotiated/account-specific rates, live service levels and delivery estimates), or when labels/tracking/pickup points must be created against a carrier API.

Note the project-wide constraint before choosing the native route: **the Project's `shippingRateInputType` is a single choice** (Cart Value *or* Cart Classification *or* Cart Score). If cart score is already used for something else, that option is spent. Also note the soft limit of **100 Shipping Methods per Project** ([limits](https://docs.commercetools.com/api/limits.md#shipping-methods)) — a design that mints a Shipping Method per carrier × service level × zone will hit it.

Say which rung applies and why. If native covers it, stop there and hand off to [commercetools-commerce-patterns](../../../commercetools-commerce-patterns/SKILL.md).

## Workflow

The heart is **Step 1 → Step 1.5 → Step 2 → Step 3** (requirements → native/use/customise/build → config → the apps).

### Step 0 — Gather context (required, run first)

The mandatory grounding step: pull the latest verified documentation as context for you (the agent). Use this skill's docs-search script with shipping-focused terms. **Do not skip it, and do not replace it with another tool**:

```bash
node scripts/docs-search.mjs \
  --query "<shipping terms from the user's request, e.g. 'shipping methods tiered rates cart score custom shipping method delivery parcel tracking'>" \
  --app-name "<current-app ex: claude, copilot, codex>" \
  --model "<current-model>" \
  --skill-name "commercetools-integrations" \
  --limit 10
```

(Run it from the `commercetools-integrations` skill root.) Use its output as primary grounding; the Knowledge MCP and [Shipping and Delivery Overview](https://docs.commercetools.com/api/shipping-delivery-overview.md) are for deeper follow-up.

**This sub-area is deliberately vendor-neutral, and stays that way.** It owns the commercetools side: the landing decision, the application shapes, the update actions, the config surface. Everything on the *carrier* side — auth, rate request/response shapes, service and package codes, dimensional-weight rules, sandbox behavior, idempotency support, rate limits — is the carrier's or rate service's to document, changes without notice, and must be read from **their** current API docs (and, for a public connector, its repo's `connect.yaml` and README) rather than recalled. Fetch that at the moment you need it; don't write carrier field names from memory.

### Step 1 — Extract requirements (before any config or code)

Shipping design is downstream of business facts, and the wrong default produces either a blocked checkout or a wrong price on a placed Order. Ask (don't assume):

1. **Which shipping service, and what does it actually do?** A carrier API (one carrier), a multi-carrier aggregator, a rate/checkout-rules engine, or a shipping-execution/label platform. These need different applications. Do they have an account and API credentials already?
2. **Which side do you need — quoting, execution, or both?** Rates at checkout, labels + tracking after the Order, or both. This decides the number of applications and is the single biggest scope lever.
3. **Is an OMS/WMS in the picture?** If yes, who books the carrier? → boundary above.
4. **Shipping mode: `Single` or `Multiple`?** Multiple (split shipments, per-line-item methods and addresses) changes every update action and is not reversible once set on a Cart.
5. **Must quoted options appear in `GET /shipping-methods/matching-cart`?** The storefront's normal shipping-options list only shows *native* Shipping Methods. If the storefront reads that endpoint and you land carrier prices as custom shipping methods, the options never show up. → this is the Step 3 landing decision; get the answer here.
6. **Rate granularity:** per cart, per shipment/delivery group, or per line item? Are pickup points / parcel lockers in scope (address selection, not just price)?
7. **Latency and fallback:** what should happen when the carrier is slow or down — block the cart or fall back to a native rate? Shipping is a **fail-open** candidate; get the business decision, don't pick it yourself.
8. **Region and project** (e.g. `europe-west1.gcp`, project key) — the CT API/Auth hosts are region-specific.
9. **Anything special or non-standard? (always ask — open-ended)** Dimensional weight, hazmat/dangerous goods, oversize surcharges, duties/DDP for cross-border, insurance, negotiated account rates, delivery-date promises, returns labels, multi-origin/warehouse routing, carrier cut-off times. Capture each as its own line; **don't force it into a slot above.**

Write these up as a short requirements block and **confirm with the user** before deriving config. Each special requirement feeds the Step 1.5 fit-check.

### Step 1.5 — Native, use a public connector, customise one, or build? (decide before building)

Run the rung-0 gate above first. If a connector is genuinely needed, don't answer "does one exist?" from memory — check **live** (Connect marketplace + connector registry via the Connect CLI), name the connector and version you checked, and apply the listings rule. Then walk the ladder, stopping at the first rung that fits:

0. **Native Shipping Methods** — the gate above. Stop here if it fits.
1. **Use a public connector directly** — a Connect-deployable shipping connector for this service exists and covers the requirements → install and configure.
2. **The gap is config, not code** — prove it before forking. Enabled carriers, service levels, markup, package defaults and fallback behavior are typically `connect.yaml` values → back to rung 1.
3. **Customise/fork** — a real gap config can't close, and an open-source connector for the service exists → fork, add only the delta, deploy as an Organization connector.
4. **Build a new one** — no connector for the service (**the common case here**) → build from the type-agnostic `service`/`event`/`job` patterns, scaffolding from the closest template. Which template and why: [connector-selection.md](./connector-selection.md).

**Present the ladder and ask the user to choose.** These are materially different amounts of work. Give your recommendation and its reasoning, then let them decide, and record the rung and the version checked in the requirements block. Rungs 3–4 use the [commercetools-connect](../../../commercetools-connect/SKILL.md) skill for the build/stage/publish lifecycle and its production-readiness gate, then return here.

### Step 2 — Derive the config from the requirements

Translate the Step 1 answers into `connect.yaml` values with a one-line **why** each: which applications, carrier credentials in `securedConfiguration`, enabled carriers/service levels/package defaults/markup/timeout/fallback in `standardConfiguration`, and least-privilege scopes. Mapping table, scopes, and a worked example: [config-from-requirements.md](./config-from-requirements.md).

### Step 3 — Build the applications, test-first

Read [shipping-contract.md](./shipping-contract.md) before writing code — it owns the decision that everything else hangs off: **how a quoted rate lands on the Cart** (`setShippingRateInput` over native tiers vs. `setCustomShippingMethod`/`addCustomShippingMethod`), and what each choice costs you at `matching-cart`. Then build, red test first for each:

1. **Rate application** (`service`, usually a Cart API Extension) — quote the carrier and land the result. This is where the extension response budget (**2 s by default, configurable per Extension via `setTimeoutInMs` up to 10 s**), the fail-open decision, and quote caching live — set the timeout deliberately for the carrier's latency instead of inheriting the default.
2. **Label/tracking application** (`event` on Order Messages) — book the shipment, then write `addDelivery` → `addParcelToDelivery` → `setParcelTrackingData` back onto the Order, idempotently. Skip this app entirely if an OMS owns it.
3. **Optional `job`** — tracking-status polling or reconciliation where the carrier has no outbound webhook.

Mock the carrier boundary and assert on what your code *decided* — which quote it picked, which update action it emitted, what it did when the carrier timed out. The suite must run with no deployment and no secrets ([testing.md](../../../commercetools-connect/references/testing.md)).

### Step 4 — Verify the round trip

Not done until a real cart shows a real carrier price and (if in scope) an Order carries a real tracking number. [verification.md](./verification.md) also covers the traps that look like bugs: the extension that silently blocks every cart, custom shipping methods invisible to `matching-cart`, and sandbox rates that aren't the negotiated ones.

## References

| Need | Reference |
|---|---|
| **Native, use, customise, or build?** the rung-0 native gate, the live registry check, the vendor-hosted-integration trap, which template to scaffold from, how to assess a fork candidate | [connector-selection.md](./connector-selection.md) |
| **The contract (read before coding)**: how quoted rates land on the Cart and the `matching-cart` consequence; the rate extension's latency/fail-open budget; the label + tracking write-back; `Single` vs `Multiple` mode; full pitfall catalog | [shipping-contract.md](./shipping-contract.md) |
| **Requirements → `connect.yaml`**: applications, carrier credentials, carrier/service-level/package/markup/timeout config, least-privilege scopes; worked example | [config-from-requirements.md](./config-from-requirements.md) |
| **Verify the round trip**: quote → option shown → Order priced → label → tracking; the blocked-cart, invisible-option, and wrong-rate traps | [verification.md](./verification.md) |
| Native shipping modeling (rung 0): zones, tiers, cart score, predicates, BOPIS, the freeze + `setCustomShippingMethod` pattern | [commercetools-commerce-patterns](../../../commercetools-commerce-patterns/SKILL.md) |
| OMS/WMS owns fulfilment, shipment status, and tracking write-back | [order-management/overview.md](../order-management/overview.md) |
| Build/publish/certify lifecycle, deploy, scopes, production-readiness gate (type-agnostic) | [commercetools-connect](../../../commercetools-connect/SKILL.md) |

Adding another carrier or rate service later means a new mapping and new credentials — the landing decision, the application shapes, and the contract do not change.

## Checklist

Scope and rung 0
- [ ] Quoting vs execution (labels/tracking) scoped explicitly; OMS/WMS boundary settled and **only one** writer of `Delivery`/`Parcel`
- [ ] Native Shipping Methods ruled out **explicitly** (zones/tiers/predicates/`freeAbove`/freeze + `setCustomShippingMethod`), with the reason stated
- [ ] `shippingRateInputType` not already spent on another use case; 100-Shipping-Method soft limit not designed into

Requirements
- [ ] Shipping service identified and classified (carrier / aggregator / rules engine / label platform); credentials available
- [ ] `Single` vs `Multiple` shipping mode decided; rate granularity decided
- [ ] Answered whether options must appear in `GET /shipping-methods/matching-cart`
- [ ] Fail-open vs fail-closed decided **by the user**, with the fallback rate named
- [ ] Asked the open-ended "anything special?" question; each special requirement its own line
- [ ] Requirements block written and confirmed

Path
- [ ] Checked the registry/marketplace **live** (not memory); named connector + version
- [ ] Verified any candidate is actually Connect-deployable, not a vendor-hosted integration
- [ ] Ladder rung **presented to the user and chosen by them**: native (0) · use public (1) · config-closes-gap (2) · fork (3) · build (4)

Build
- [ ] Landing mechanism chosen deliberately, with the `matching-cart` consequence understood
- [ ] Extension timeout set deliberately (`setTimeoutInMs`, 2 s default / 10 s max), outbound carrier timeout **under** it, plus a cache/short-circuit and the agreed fallback
- [ ] Label/tracking app idempotent on a stable delivery key; re-fetches the Order before writing
- [ ] Carrier boundary mocked; suite runs with no deployment/secrets
- [ ] commercetools-connect production-readiness gate satisfied ([commercetools-connect](../../../commercetools-connect/SKILL.md))

Verification
- [ ] A real cart shows a real carrier price; the placed Order carries that exact amount
- [ ] Carrier outage exercised — cart still completes per the agreed fallback
- [ ] Tracking number visible on the Order's Parcel (if in scope)
