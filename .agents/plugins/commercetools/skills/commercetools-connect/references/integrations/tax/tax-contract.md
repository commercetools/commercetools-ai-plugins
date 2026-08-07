---
name: tax-connector-contract
description: The two-app tax connector contract — the calculator API Extension (ExternalAmount, the four tax update actions, 200-not-202, fail modes, call reduction) and the order-syncer Subscription (commit/void/refund lifecycle, idempotency). Full pitfall catalog. The tax sub-area of commercetools-connect.
metadata:
  contentType: REFERENCE
  area:
    - tax
    - connect
---

# The two-app tax contract

Everything the calculator and the syncer must do, and the pitfalls that silently break each. Grounded in the certified Avalara connector, the official template, and a from-template TaxJar build. Provider-exact payloads are in [avalara.md](./avalara.md).

## App 1 — the calculator (cart API Extension)

### What triggers it

An API Extension on the `cart` resource, `actions: [Create, Update]`, registered by the app's `postDeploy`. External engines bill per call and rate-limit, so **condition the trigger** to fire only when the cart is worth taxing:

```json
{
  "resourceTypeId": "cart",
  "actions": ["Create", "Update"],
  "condition": "taxMode = \"ExternalAmount\""
}
```

The certified Avalara connector conditions on `shippingAddress is defined and shippingInfo is defined and lineItems is not empty` — a stronger gate that avoids calling the engine until the cart can actually be taxed. Match the gate to when a correct quote is even possible: **tax can't be selected without a destination address.**

### What it must return

An API Extension response is **update actions applied before the cart persists**. In `ExternalAmount` mode you must tax **every priced element** or the cart is inconsistent and — critically — **the Order cannot be created**:

- `setLineItemTaxAmount` — per line item
- `setCustomLineItemTaxAmount` — per custom line item (easy to forget; a cart with a custom line item fails without it)
- `setShippingMethodTaxAmount` — the shipping method (a cart with shipping fails Order creation without it — see the pitfall below)
- `setCartTotalTax` — the cart-level total gross
- `changeTaxMode` → `ExternalAmount` — **only if the connector owns the mode.** The certified Avalara connector sets it itself; a from-template build often assumes the storefront already set it (and the trigger condition enforces it). Decide which, and be consistent.

Each `externalTaxAmount` carries `totalGross` (net + tax, in minor units) and a `taxRate` (`name`, `amount` as a 0–1 decimal, `country`, optional `state`, `includedInPrice`). Exact shapes: [avalara.md](./avalara.md).

### The response-status trap (this one silently breaks every cart)

An HTTP API Extension **must return `200` or `201`**. Any other status — **including `202`** — is treated by commercetools as "failed to respond properly" and **fails the triggering cart operation**. The official template shipped a `HTTP_STATUS_SUCCESS_ACCEPTED = 202` constant and returned it; on a from-template build, fix this first. A validation *rejection* uses `400` with `{ errors: [...] }`; a successful no-op is `200` with `{}` or `{ actions: [] }`.

### Latency and fail mode

The extension couples its latency and uptime to the cart operation (default **2 s**, 10 s self-service max). So:
- Keep the outbound engine call on a tight timeout **under** the extension budget (e.g. ~1.2 s), aborting rather than letting the platform time out.
- Decide **fail-open vs fail-closed** deliberately. Fail-**closed** (return `500`/`400`, blocking the cart) guarantees no untaxed cart persists — the certified Avalara connector does this (`400` when misconfigured). Fail-**open** (return `200` with no actions) keeps checkout alive at the risk of a temporarily untaxed cart. State the choice in the README.
- **Reduce calls.** Skip the engine when nothing tax-relevant changed — hash the tax-relevant cart fields (line items, quantities, address, shipping) and store the hash in a cart Custom Field; on the next call, if the hash matches and `taxedPrice` is already set, return no actions. The certified Avalara connector does exactly this (`hashCart` → `avalaraHash` custom field). It's the biggest single cost lever.

### Keep the mapping pure and testable

The cart→request and response→actions mapping is deterministic — keep it a **pure function** with no network, so the whole quote is unit-testable without a deployment, a cart, or a token. Assert: the four action types are emitted, money converts correctly between minor units and the engine's major-unit decimals, shipping and custom line items are covered, and the no-op/short-circuit paths return `[]`.

## App 2 — the order-syncer (OrderCreated Subscription)

### What triggers it

This is a Connect **`event` application**, not a hand-wired Pub/Sub consumer: Connect provisions the queue/destination and delivers each message as an HTTP `POST` to the app's endpoint (port 8080). You register a **Subscription** on the `order` resource for `OrderCreated` (and, for a full integration, `OrderStateChanged` / `OrderStateTransition` / return-shipment messages) in the app's `postDeploy` — you don't manage the transport.

What the handler receives is the Subscription's **delivery payload**, and its shape depends on config, so don't hardcode one form:
- **Transport wrapper (GCP):** on a Google Cloud destination the payload arrives wrapped as `{ "message": { "data": "<base64>", ... } }` — `message.data` is **base64-encoded JSON**, so decode it first. (Other destinations wrap differently; Connect abstracts which one.)
- **Message format:** the decoded message is either **PlatformFormat** (`{ notificationType: "Message", type: "OrderCreated", resource: { typeId, id }, ... }`) or **CloudEventsFormat** (`{ specversion, type: "com.commercetools.order.message.OrderCreated", data: { ...same fields... } }`), set when the Subscription is created. Read `type` and `resource.id` from whichever you get, and **validate the message type** before acting (ack-and-ignore the platform's test/probe messages).

See [Test an event application locally](https://docs.commercetools.com/connect/test-applications-locally.md#test-an-event-application) for both payload formats and a sample `OrderCreated`.

### What it must do

- **Re-fetch the Order by id** from the message's `resource.id` — don't trust the (possibly stale/omitted) payload. This is the required pattern for at-least-once delivery.
- **Record the transaction** via the engine's *record/commit* API (Avalara `createTransaction` with `commit: true`; TaxJar `POST /v2/transactions/orders`). This is what appears in the engine's dashboard — the calculator's quote never does.
- **Be idempotent.** Use a **stable `transaction_id` = the order id**, so a redelivered message hits the engine's duplicate guard (TaxJar returns `422`; treat as already-recorded). Redelivery is guaranteed, not hypothetical.
- **Ack correctly.** Reply **`200`** for handled *and* irrelevant-but-acked messages — the Connect event contract expects a `200` ([docs](https://docs.commercetools.com/connect/test-applications-locally.md)); a positive ack tells the platform "don't redeliver." Return non-2xx only for transient failures you *want* redelivered (Subscriptions retry unacked messages, at-least-once). Ack the platform's test/probe messages too.

### Full lifecycle (if in scope)

A compliance-grade integration doesn't stop at `OrderCreated`:
- **Cancel → void** the filed transaction (on the order states the merchant designates as cancellations).
- **Return → refund** (partial), on return-shipment state changes.
- **Order edit → recalculate.**

The certified Avalara connector drives these off **merchant-configured order-state ID lists** (`commitOrderStates`, `cancelOrderStates`, `activateReturns`) stored in custom objects — not hardcoded state names. If the requirements include void/refund, model it the same way (configurable states), because state keys differ per project.

## Pitfall catalog

| Pitfall | Symptom | Fix |
|---|---|---|
| Extension returns `202` | Every cart update fails | Return `200`/`201` only |
| Shipping not taxed in `ExternalAmount` | Order creation fails: *"shipping method is missing an external tax amount and rate"* | Emit `setShippingMethodTaxAmount` |
| Custom line items not taxed | Order creation fails on carts with custom line items | Emit `setCustomLineItemTaxAmount` |
| Extension destination = base URL | Platform's calls 404 the app | Register destination as `<CONNECT_SERVICE_URL>/taxCalculator` |
| `postDeploy` doesn't register the extension | Extension never fires; `taxedPrice` never appears | Wire `connector:post-deploy`, not just `npm install` |
| No trigger condition | Engine called on every cart keystroke; bill/limits blow up | Condition on mode + address + non-empty; hash to dedup |
| Syncer trusts the payload | Missing/stale order data → wrong or failed transaction | Re-fetch the Order by `resource.id` |
| Non-idempotent recording | Redelivery double-files a transaction | Stable `transaction_id` = order id; treat duplicate (`422`) as success |
| Config-validation throws a string status | Process crashes (`ERR_HTTP_INVALID_STATUS_CODE`) | Guard: only `res.status()` on integer codes |
| Engine requires a state (e.g. TaxJar transactions) | `406 to_state can't be blank` | Ensure the destination address carries `state`; omit blank optional fields |
| Legacy SDK | Fails the parent skill's pinned-version gate | `@commercetools/platform-sdk@^8` + `@commercetools/ts-client@^4` (both the template *and* the certified Avalara connector still ship the legacy `sdk-client-v2` — upgrade anyway) |

## Test-first checklist (mirror in the suite)

Calculator
- [ ] Emits all four action types; money minor↔major conversion correct
- [ ] Shipping and custom line items taxed
- [ ] Returns `200` (asserted — the `202` regression is the one to pin)
- [ ] No-op/short-circuit paths return `{ actions: [] }`
- [ ] Fail mode (open vs closed) asserted for an engine error

Syncer
- [ ] Decodes the base64 envelope; acks irrelevant messages
- [ ] Re-fetches the Order by id
- [ ] Records idempotently on a stable `transaction_id`; duplicate treated as success
- [ ] (If in scope) commit/void/refund keyed on configurable order states
