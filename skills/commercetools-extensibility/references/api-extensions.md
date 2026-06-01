# API Extensions

## Overview

API Extensions intercept CT API calls synchronously and can return update actions before the resource is persisted. They were originally designed for SPAs and use cases with no viable middle layer. When a BFF or middle-layer service exists, extending that service is almost always the better choice — it provides better retry/timeout control, richer context, and no impact on CT API latency.

## Limitations and Gotchas

**Timeout constraints are strict and fatal.**
- CT must establish a connection to your extension within **1 second**.
- Your extension must return a result within **2 seconds** (Payment resources allow 10s). Recommendation: target 50ms to avoid impacting conversion.
- Cold starts on serverless functions (Lambda, Cloud Functions) can breach these limits. Use provisioned concurrency or keep-warm pings if running serverless.
- If the timeout is exceeded or the extension errors, the **entire originating API call fails** — the resource change is not persisted and the customer sees an error.

**Supported resources are limited.**
Only the following resource types support API Extensions: Cart, Order, Payment, Customer, Customer Group, Quote Request, Staged Quote, Quote, Business Unit, Shopping List. Resources not on this list (products, categories, types, etc.) cannot be intercepted.

**Trigger conditions are coarse.**
There is no built-in way to fire an extension only for specific customer groups, specific API clients, or specific stores. If your conditional logic is not expressible with CT's trigger predicates, the extension fires on every matching event — including low-value events — and you pay the latency cost every time.

**Execution order is not guaranteed for multiple extensions.**
If more than one extension is configured for the same resource (e.g., fraud check + inventory check + dynamic pricing), their execution order is undefined. Race conditions can occur if extensions depend on each other's output. Design each extension to be independent, or consolidate logic into a single extension endpoint.

**Response update actions are capped at 100.**
A single extension response can return at most 100 update actions. For large carts this may not be enough to update all line items in one call.

**Project and context information is limited in the payload.**
The extension receives the resource payload but does not receive: what specifically changed (the diff), which project or store originated the request (an issue when one extension endpoint serves multiple projects), whether the trigger was an API call or a Merchant Center action, or which MC user made the change. You cannot pass custom request context without writing it to a custom field first.

**Testing requires public availability.**
CT calls your extension from its infrastructure. Integration tests against CT must expose your extension endpoint publicly (or via a tunnel like ngrok). Local-only services cannot be tested end-to-end.

**Project limit: 25 extensions per CT project.**

## When Not to Use an API Extension (BFF Anti-patterns)

If you have a BFF or API gateway, the following should be handled there — **not** in an API Extension:

- Calling a 3rd party tax service, promotion engine, or shipping rate calculator
- Generating an order number by calling an external sequence service
- Any logic that requires context about the user's session, permissions, or checkout step

The BFF already has this context, can retry, and won't degrade CT API performance for all other callers.

## Valid Use Cases

- **No BFF exists.** The extension is the only interception point between CT and the client.
- **Intercepting Merchant Center changes** where no custom MC application is in place and a validation must fire regardless of whether the change came from the API or the MC UI.
- **Multi-touchpoint enforcement** — POS, web, mobile, and back-office all use CT directly and need the same validation applied consistently (e.g., fraud check at order creation). Valid only if low latency can be guaranteed.
- **Blocking an unwanted create/update** — the use case requires that a resource must not be persisted at all if a condition is not met, and the decision depends on CT-recalculated totals (which are only available after CT processes the request but before persistence).
- **CT-payload-only logic with guaranteed fast response** — the extension reads only data in the CT payload (no 3rd party calls) and can reliably return within 50ms.
- **3rd party integrations (PSPs, discounting engines)** built to be storefront-agnostic and reused across multiple CT projects/customers.

## Performance Guidance

- Always instrument your extension with p95/p99 latency metrics. A single slow call pattern (e.g., fraud logic firing on every cart item add) can degrade checkout conversion measurably.
- If fraud/compliance logic is only needed at the end of checkout, scope the trigger to `Create` on `Order`, not `Update` on `Cart` — this is one of the most common performance mistakes.
- When the same extension endpoint is shared across projects, ensure the project key or store key is in the request context (via a custom field or query parameter convention) — CT does not include it in the extension payload.
- The serverless approach discourages API client caching. Recreating an API client on every invocation adds latency. Use a singleton client with token caching across invocations.
