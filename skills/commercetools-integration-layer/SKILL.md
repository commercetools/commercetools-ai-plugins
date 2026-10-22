---
name: commercetools-integration-layer
description: "Build and publish extensions for the commercetools Commerce Integration Layer — the project-scoped commercetools BFF. Covers the two extension types (a schema extension, i.e. an extension subgraph of GraphQL typeDefs + resolvers that shapes what clients read through the Experience API; and a Managed API Extension that approves, modifies, or blocks a commercetools write), a decision tree for where custom logic belongs (incl. porting pre-request BFF logic), and the integration-layer CLI flow to init, test, validate, and push an extension bundle. Use when building, publishing, or debugging a Commerce Integration Layer extension, or asking how to add custom logic to a Commerce Integration Layer project — even if the user just says 'integration layer' or 'CIL'. Not for building commercetools Connect connectors (see commercetools-connect), the hosted Checkout (see commercetools-checkout), or storefront clients that consume the Experience API (see commercetools-storefront)."
when_to_use:
  - "Building or publishing an extension for the commercetools Commerce Integration Layer"
  - "Deciding between a schema extension and a Managed API Extension for a Commerce Integration Layer project"
  - "Porting BFF logic that derived or enriched a request before it reached commercetools into a Commerce Integration Layer project"
  - "Using the integration-layer CLI to init, run, validate, or push an extension bundle"
  - "Testing a Commerce Integration Layer bundle (schema extensions and API Extension handlers) before pushing it"
metadata:
  contentType: SKILL
  area:
    - "Integrations"
---

# commercetools Commerce Integration Layer

The Commerce Integration Layer is a project-scoped commercetools BFF: a GraphQL
edge in front of a commercetools Project that storefronts and other clients read through
the **Experience API**. You extend it with **extension bundles** you author, validate,
and publish yourself.

This skill covers **building extensions** for the Commerce Integration Layer. It is not about consuming the Experience API
from a storefront, and it is not about commercetools Connect connectors — those are
different mechanisms with their own skills.

> The [Commerce Integration Layer documentation](https://docs.commercetools.com/commerce-integration-layer.md)
> is the source of truth: [Get started](https://docs.commercetools.com/commerce-integration-layer/development/get-started.md),
> [Choose an extension type](https://docs.commercetools.com/commerce-integration-layer/extension-types.md),
> [Write schema extensions](https://docs.commercetools.com/commerce-integration-layer/development/writing-schema-extensions.md),
> [Write Managed API Extensions](https://docs.commercetools.com/commerce-integration-layer/development/writing-managed-api-extensions.md),
> [Configure and deploy](https://docs.commercetools.com/commerce-integration-layer/development/configure-and-deploy.md),
> and, when replacing a hand-built BFF, [Migrate an existing BFF](https://docs.commercetools.com/guides/migration-guides/migrate-existing-bff.md).
> The [`commerce-integration-layer-extensions`](https://github.com/commercetools/commerce-integration-layer-extensions)
> repository holds runnable example extensions to start from.

## Where the logic must run

Choose the mechanism from *when in an API call* the logic must run, not from how it feels
to write. The Commerce Integration Layer sits on every client flow, so each moment below has a home:

| Moment | Mechanism |
| :--- | :--- |
| A client **reads** data | **Schema extension** |
| **Before** commercetools processes a write (deriving or enriching the input) | Usually still a **Managed API Extension**. See [the write path](references/write-path.md) |
| **Within** a write, before it is persisted (approve, modify, block) | **Managed API Extension** |
| **After** a write is persisted | commercetools **Subscription**, outside the bundle |

### Decision tree

Work top-down and stop at the first step that fits:

1. **Can built-in commercetools features model it?** Check data modeling and native
   features first. The requirement often disappears, and nothing is cheaper to run.
2. **Is it about what a client reads?** Use a **schema extension**.
3. **Does it change how a commercetools write behaves?** Start with a **Managed API
   Extension**, even if the old BFF did it before the request. If an API Extension cannot
   solve it, reach out to commercetools support with the use case. As a final step,
   override the existing mutation with `@override`. Read
   [the write path](references/write-path.md) before going past the API Extension.
4. **Is it a write to an external service provider?** Add a **custom mutation** on the
   extension subgraph. This is the best way to go for that case.

Whatever you build, key it to the **business action** ("a line item is added to a
cart"), and cover every entry point: cart creation with line items, `addLineItem`, adding
a Shopping List. A handler for one update action leaves the other paths open.

### Schema extension (an extension subgraph)

GraphQL `typeDefs` + `resolvers` that federate into the Experience API. Use it to add a query,
type, or field on an entity (e.g. `Product`); to compute a value from data the Commerce Integration Layer owns
or from fields your extensions expose (via `@requires`); to call an external service and
return the result in the graph; or to shape and enrich what a storefront reads. For a
write to an external service provider, a custom mutation on your subgraph is the best way
to go. To change a commercetools write, start with a Managed API Extension instead.

It runs **at the edge**, so it only affects traffic that goes through the Experience API. It is not
a platform-wide guarantee.

### Managed API Extension

Approves, modifies, or blocks a commercetools write **before it is persisted**. Use it to
enforce a rule on a cart, order, or customer and reject a bad write; to stamp, derive, or
correct a field as part of the write; or whenever the rule must hold for *every* write
regardless of which client made it (storefront, Merchant Center, direct API client). It
builds on the commercetools [API Extensions](https://docs.commercetools.com/api/projects/api-extensions)
mechanism, but the Commerce Integration Layer hosts and registers the handler for you.

Because it runs inside the write, it applies to **all consumers**: the platform-wide
guarantee a schema extension cannot give.

## Building an extension

A Project must be [enrolled and activated](https://docs.commercetools.com/commerce-integration-layer/overview.md#enrollment)
for the Commerce Integration Layer before extensions can be published. The flow, from the
[Get started](https://docs.commercetools.com/commerce-integration-layer/development/get-started.md) guide;
the `commerce-integration-layer-extensions` repo holds standalone example extensions, one per pattern.

Ask the user before installing anything and before every push: the first two commands install
the CLI and its plugin on the user's machine, and `pnpm push` replaces what the Project serves.
Name the command and the target Project, and wait for an explicit yes. The user signs in themselves.

```bash
# Install the CLI and the integration-layer topic (once), then log in
npm install -g @commercetools/cli
commercetools plugins install @commercetools/cli-topic-integration-layer
commercetools auth login --project-key <your-project-key>

# Start a real workspace (extensions merge into the one bundle a Project deploys)
commercetools integration-layer init

# Or start from the template closest to what you want, then edit src/extension.ts
pnpm test         # unit tests for resolvers and handlers; offline
pnpm dev          # local gateway over the merged bundle + deployed Experience API; hot-reloads
pnpm validate     # sandbox, shape, composition, and breaking-change checks; no upload
pnpm push         # validates, replaces the Project's bundle, waits until it is running
```

Before pushing, test the whole merged bundle in layers, including API Extension handlers
fired offline and against real writes: see [verify and push](references/verify-and-push.md).

A bundle may export schema extensions (`typeDefs` + `resolvers`), Managed API Extensions
(`apiExtensions`), or both.

## Workflow

1. **Confirm the mechanism.** Walk the [decision tree](#decision-tree) with the user's
   actual requirement. Don't skip its first step (native modeling), because a data-model
   change often beats any extension. For anything past a Managed API
   Extension, read [the write path](references/write-path.md).
2. **Read before writing.** Open the Commerce Integration Layer documentation for the chosen type
   ([schema extensions](https://docs.commercetools.com/commerce-integration-layer/development/writing-schema-extensions.md)
   or [Managed API Extensions](https://docs.commercetools.com/commerce-integration-layer/development/writing-managed-api-extensions.md)),
   then the closest example in the
   [`commerce-integration-layer-extensions`](https://github.com/commercetools/commerce-integration-layer-extensions) repo.
3. **Start from a template or `integration-layer init`.** Edit `src/extension.ts`; keep
   one concern per extension so it merges cleanly into the Project bundle.
4. **Test the merged bundle, validate, then push.** Follow
   [verify and push](references/verify-and-push.md): unit tests, handlers fired offline,
   the composed schema, and real writes for every entry point of the business action.
   Then `pnpm validate`, and `pnpm push`, which only counts as done once it reports the
   new revision as running.
