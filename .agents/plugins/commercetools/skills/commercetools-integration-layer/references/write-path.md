---
name: write-path
description: Change how a commercetools write behaves from a CIL project, or add a write that goes to an external service provider. Walks the order for commercetools writes (Managed API Extension, then commercetools support, then overriding the existing mutation with @override as the final step) and when a custom mutation is the right tool instead.
when_to_use:
  - "Porting BFF logic that set or derived a field on a request before it reached commercetools"
  - "A write needs a value to pass validation that the client does not send, such as a distribution channel resolved from the Business Unit"
  - "Deciding whether to override a core CIL mutation with @override"
  - "Adding a mutation that calls an external service provider from a CIL project"
metadata:
  contentType: REFERENCE
  area:
    - "Integrations"
---

# The write path in the CIL

**Impact: HIGH — logic tied to one client or one update action silently lapses when another client or a new update action reaches the same data. Choose the earliest option that is correct for every path.**

First decide whose write it is. A write to **commercetools** data follows the order below. A write to an **external service provider** gets a [custom mutation](#writes-to-an-external-service-provider).

## Changing commercetools write behavior

The CIL replaces the customer's BFF, so logic the BFF ran around a commercetools write needs a home inside the CIL. Walk the steps in order and stop at the first that fits. For the wider migration (BFF code the CIL makes redundant, and workloads that belong in Connect), see [Migrate an existing BFF](https://docs.commercetools.com/guides/migration-guides/migrate-existing-bff.md).

### 1. Start with a Managed API Extension

"The BFF set it before the request, so it must be set before the request" is an assumption, not a fact. An [API Extension](https://docs.commercetools.com/api/projects/api-extensions.md) runs after the request is processed and before it is persisted, and it can validate the write or return update actions. That covers most BFF write logic: enforcing a rule, stamping a computed custom field, attaching a loyalty, tax, or pricing attribute, correcting a value. It also applies to every client, not only traffic through the CIL.

Two conditions put a requirement beyond an API Extension:

- **The field is immutable once set.** An extension firing after the fact cannot change it, so the value must be right on the incoming draft or action.
- **The request must be valid on arrival.** commercetools validates a request before any extension runs, so a value the request needs in order to pass validation has to be on it already.

Example of the second: every Price is scoped to a distribution channel with no fallback Price, and the channel for a buyer lives in a Custom Field on their Business Unit. The shopper's client does not know the channel. Price selection needs the channel on the `addLineItem` itself, so it must be present on the way in.

If neither condition holds, build a Managed API Extension and stop here.

### 2. Reach out to commercetools support

If an API Extension cannot solve it, contact commercetools support with the use case before building anything else. Describe the business requirement, not only the field you want to set: the right answer is often a modeling option or feature that makes custom logic unnecessary.

### 3. Final step: override the existing mutation with `@override`

When the steps above do not solve it, the extension subgraph can take over an existing core mutation with the federation `@override` directive. Clients keep calling the same mutation, and your resolver runs in its place: resolve the missing input, then perform the commercetools write.

It is the final step because your resolver now owns the whole operation:

- **It must keep up with the core mutation.** Fields and behavior the core mutation gains later are not inherited automatically. Re-check the override when you update the bundle.
- **It only covers traffic through the CIL.** Writes from the Merchant Center or direct API clients do not pass through it, unlike an API Extension.

## Writes to an external service provider

When the write goes to an external service provider, not to commercetools data, add a **custom mutation** on the extension subgraph. This is the best way to go: the operation is yours, it does not change any core commercetools mutation, and the client calls it explicitly. Keep the provider call and its error mapping in the resolver, and return a result type shaped for the client.

## Scope the logic to the business action, not the update action

Whatever you build on the commercetools write path, key the logic to the **business action** ("a line item is being added to a cart"), not to one low-level API action. The same business action has many entry points: creating a Cart with `lineItems` in the draft, `addLineItem`, adding a Shopping List to a Cart, a gift line item added by a Cart Discount. A handler that only recognizes `addLineItem` leaves the other paths open, and the rule it was meant to hold silently lapses the day a client uses one of them. This matters most for an `@override`, which covers only the one mutation it replaces.

Before you ship, list every entry point for the business action and check that each one is covered.
