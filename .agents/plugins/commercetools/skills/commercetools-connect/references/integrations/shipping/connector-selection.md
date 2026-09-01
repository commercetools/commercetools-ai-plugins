---
name: shipping-connector-selection
description: "Decide whether a commercetools shipping integration needs a Connect connector at all, and if so whether to use a public one, fork one, or build a new one — the rung-0 native gate, the live registry check, the vendor-hosted-integration trap, and which template to scaffold from when no shipping template exists."
metadata:
  contentType: REFERENCE
  area:
    - connect
    - shipping
    - integration
---

# Native, use, customise, or build?

Owns Step 1.5 of [overview.md](./overview.md). Work top to bottom and **stop at the first rung that fits** — each later rung is more to build and more to maintain.

## Rung 0 — native Shipping Methods (the gate)

Most "we need a shipping integration" requests are a Shipping Method modeling problem. Answer this before anything else, and state the answer explicitly.

| Requirement as stated | Native mechanism | Connector needed? |
|---|---|---|
| Flat rate per country/region; free over a threshold | Zones + zone rates + `freeAbove` | No |
| Price by weight / volume / item count / distance band | Tiered rates over Cart Score (or a `priceFunction`) — the score is set with `setShippingRateInput` by whoever computes it | No |
| Price by an abstract bucket ("Light"/"Bulky") | Tiered rates over Cart Classification | No |
| Option only available for certain stores, addresses, warehouses, or cart contents | Shipping Method predicate | No |
| Same-day / click-and-collect as a distinct option | A Shipping Method (plus predicate); BOPIS modeling | No |
| Exact price known only from a third party, once, late in checkout | Cart freeze (`SoftFreeze`) + `setCustomShippingMethod` — or Order Edits after the fact | Not necessarily |
| Live multi-carrier rate shopping per cart, negotiated account rates, live service levels and delivery estimates | — | **Yes** |
| Labels, pickup-point selection, tracking numbers, returns labels from a carrier API | — | **Yes** |

Native modeling detail lives in [commercetools-commerce-patterns](../../../../commercetools-commerce-patterns/SKILL.md): [tiered-rates-cart-score.md](../../../../commercetools-commerce-patterns/references/tiered-rates-cart-score.md), [shipping-predicates.md](../../../../commercetools-commerce-patterns/references/shipping-predicates.md), [dynamic-shipping-costs.md](../../../../commercetools-commerce-patterns/references/dynamic-shipping-costs.md), [bopis-shipping.md](../../../../commercetools-commerce-patterns/references/bopis-shipping.md). Don't restate it here — link and hand off.

Two constraints that decide borderline cases:

- **The Project's `shippingRateInputType` is a single choice.** Cart Value, Cart Classification, or Cart Score — not a mix. If the score is already committed to another purpose, the tiered-rate route is closed and the case moves toward a connector.
- **100 Shipping Methods per Project** (soft limit, [limits](https://docs.commercetools.com/api/limits.md#shipping-methods)). A carrier × service level × zone matrix blows through this. If your native design needs dozens of near-identical methods, that is a signal the rates want to be quoted, not enumerated.

## Rung 1 — is there a public connector? (live check, never memory)

1. **Check live, programmatically.** `shipping` is a valid Connect `IntegrationType`, so query the registry rather than browsing:

   ```
   GET {connect-host}/connectors/search?integrationTypes=shipping
   # add &text=<carrier or platform name> to narrow; &integrationTypes=oms if fulfilment is also in scope
   ```

   Each result carries `key`, `integrationTypes`, `creator`, `repository`, `configurations`, `supportedRegions`, `certified`, and `private` — use `certified: true` / `private: false` for public connectors, and `repository` to judge whether rung 3 (fork) is even possible ([deployment-installation.md](../../deployment-installation.md)). Also search the [Connect marketplace](https://marketplace.commercetools.com/connectors) and the integration docs (via `docs-search` / the Knowledge MCP) by the **service name** the user gave you. Name the connector **key + version** you found, or record "none exists". Availability changes; a connector you remember may not exist, and one you don't may.
2. **Apply the listings rule — it bites hard here.** Shipping is one of the categories where a vendor's "commercetools integration" is most often *their* hosted service plus glue you write, not a deployable Connect application: a dashboard where you paste commercetools API credentials, a rate endpoint you are expected to call yourself, or an app in the vendor's own marketplace. None of that is Connect-deployable. Confirm a Connect affordance — a public connector repo, a root `connect.yaml`, a Connect deploy action — before you call anything "install". Full rule: [Marketplace listings are not all Connect connectors](../../../SKILL.md#marketplace-listings-are-not-all-connect-connectors--verify-before-recommending).
3. **If the fit is a vendor-hosted integration**, say so plainly: this skill's patterns (`connect.yaml`, the Connect CLI, lifecycle scripts, the Connect deployment model) do not apply to it. Point at the vendor's onboarding, and offer the in-skill alternative — build a Connect connector that calls their API (rung 4), which is usually a thin client over the same endpoints.

### The landscape (verify live, but this is the shape)

| What you may find for a shipping service | What it usually is | Default rung |
|---|---|---|
| A **rate/checkout-rules engine** advertising commercetools support | Their hosted rating service plus glue you write; frequently documented as requiring custom development | Verify Connect-deployability; usually **4** (thin connector over their rate API) |
| A **label/shipping-execution platform** ("connect your store, print labels") | Their SaaS pulling orders via API credentials you paste into their dashboard | Often out of Connect scope — say so; else **4** |
| A **single carrier's own API** | An API, not an integration | **4** |
| An **OMS/WMS** that already books carriers | Not a shipping connector at all | Hand to [order-management](../order-management/overview.md) |
| Nothing for the service | Common | **4** |

The practical consequence: **"just install the shipping connector" is usually not available.** Say this early — it changes the effort estimate materially.

## Rung 2 — prove the gap isn't configuration

Before forking anything, check whether the "missing" behavior is a config value on the existing connector or on the commercetools side:

- Enabled carriers and service levels, markup/discount, package/dimension defaults, origin address, currency and unit system → almost always `standardConfiguration`.
- Which options appear where, and their ordering/default → often Shipping Method `predicate` and `isDefault` on the commercetools side, not connector code.
- Cut-off times, insurance, signature-on-delivery → frequently carrier-account settings, not connector code.

If config closes it, go back to rung 1.

## Rung 3 — fork and customise

Justified when there is a real gap config can't close **and** an open-source connector for the service exists. Fork it, add only the delta, publish as an Organization connector. Assess the candidate from its **current** repository before committing — a fork you can't maintain is worse than a build:

- Root `connect.yaml`: which applications, which `inheritAs.apiClient.scopes`, which config keys already exist.
- The rate path: does it use `setShippingRateInput` or a custom shipping method (this is the hard-to-change decision — [shipping-contract.md](./shipping-contract.md)).
- Timeout and fallback handling on the extension path; whether it caches quotes.
- Idempotency on any delivery/parcel write-back.
- Test suite and last release; whether it targets `@commercetools/platform-sdk@^8` + `@commercetools/ts-client@^4`.

Score it against the parent production-readiness gate ([commercetools-connect](../../../SKILL.md)). Gaps there are yours to close after forking.

## Rung 4 — build a new one (the common case)

There is **no shipping application template**. Scaffold from the closest architectural twin with `commercetools connect init` ([connect-cli.md](../../connect-cli.md)) and replace the domain logic:

| What you're building | Scaffold from | Why it maps |
|---|---|---|
| Rate quoting on the Cart | `tax-integration` | Structurally identical: a Cart API Extension that calls an external service and returns update actions, plus an `OrderCreated` Subscription. Swap tax calls for rate calls; the extension registration, `postDeploy`/`preUndeploy`, and envelope plumbing carry over unchanged. |
| Labels, shipments, tracking write-back | `fulfilment-integration` | Its order-export and order-updates applications already model "Order out, fulfilment data back", which is exactly the label/tracking loop. |
| Both | `tax-integration` for the extension app, `fulfilment-integration` for the event app | One connector, two applications in one `connect.yaml`. |

Do **not** treat the tax template as a tax connector you are bending — take its wiring and delete its domain code. And do not skip the parent skill's decision framework: the rate app's sync-vs-async contract is the expensive part, not the carrier client.

## Present it, don't pick it

Once you have the live landscape, put the rungs to the user with a recommendation and the reasoning: native (0), install (1), config (2), fork (3), build (4). Record the chosen rung, the connectors checked, and their versions in the requirements block. If you recommend build, say which template you'll scaffold from and why.

## Checklist

- [ ] Rung-0 native gate answered explicitly, with the mechanism named or ruled out
- [ ] `shippingRateInputType` availability and the 100-Shipping-Method limit checked against the proposed design
- [ ] Ran `GET /connectors/search?integrationTypes=shipping` (not memory) plus a marketplace check; cited connector key + version and its `certified`/`private` flags
- [ ] Every candidate confirmed Connect-deployable (repo / `connect.yaml` / deploy action), not vendor-hosted
- [ ] If vendor-hosted: said plainly that this skill doesn't cover it, and offered the build alternative
- [ ] Config-vs-code tested before recommending a fork
- [ ] Fork candidates assessed from the current repo against the production-readiness gate
- [ ] For a build: template chosen and justified (`tax-integration` for rating, `fulfilment-integration` for execution)
- [ ] Ladder presented to the user; **they** chose the rung; decision recorded
