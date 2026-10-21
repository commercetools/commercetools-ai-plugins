---
name: verify-and-push
description: Test a whole Commerce Integration Layer bundle before pushing it (schema extensions, resolvers, and Managed API Extension handlers together), then validate, push, and confirm the new revision is running. Orders the test layers from unit tests to real commercetools writes and says what each one catches that the previous cannot.
when_to_use:
  - "Testing a Commerce Integration Layer extension bundle before pushing it"
  - "Unit-testing resolvers or API Extension handlers in an integration-layer workspace"
  - "Checking that API Extension handlers fire on the right cart or order writes"
  - "Understanding what integration-layer validate checks and what push does"
  - "A pushed extension change does not show up, or a push reported failed"
metadata:
  contentType: REFERENCE
  area:
    - "Integrations"
---

# Testing, validating, and pushing a Commerce Integration Layer bundle

**Impact: HIGH — a Project runs exactly one bundle, and a push replaces all of it. A handler that never fires, or a schema change that breaks a client, reaches every consumer at once.**

Test the **merged bundle**, because that is what deploys: the root scripts of an `integration-layer init` workspace run with `--all`, which merges the `typeDefs`, `resolvers`, and `apiExtensions` of every package under `extensions/*` into one subgraph and one artifact. Work through the layers below in order. Each one catches something the previous one cannot, and the first three need no deployment.

| Layer | Command (from the workspace root) | Catches | Needs |
| :--- | :--- | :--- | :--- |
| 1. Unit tests | `pnpm test` | Resolver and handler logic, config handling | Nothing |
| 2. Handlers, offline | `invoke-api-extension --all` | Which handlers fire for a write, and their verdict | Nothing |
| 3. Schema, composed | `pnpm dev` | Merged schema against the deployed Experience API, `@requires`, entity fields, `@override` | Login |
| 4. Real writes | `serve-api-extension --all` | commercetools calling your handlers on real writes, `condition` triggers | Login with `manage_project`, a tunnel, a sandbox Project |
| 5. Publish gate | `pnpm validate` | Sandbox violations, shape, composition, breaking changes | Login |
| 6. Push and confirm | `pnpm push`, then `explore --deployed` | The revision actually loads and serves | Login |

Commands for developing, publishing, and checking an extension are documented in [Get started](https://docs.commercetools.com/commerce-integration-layer/development/get-started.md) and [Configure and deploy](https://docs.commercetools.com/commerce-integration-layer/development/configure-and-deploy.md); `--help` lists every flag. The CLI commands below are shortened: each one runs as `commercetools integration-layer extension <command>`.

## 1. Unit-test resolvers and handlers

Resolvers and API Extension handlers are plain functions, so call them directly with a minimal fake for the host context (`now()` and `config`). `init` scaffolds a Vitest file next to each `src/extension.ts`, and `pnpm test` at the root runs every package's suite with no login and no network.

Test a handler with a hand-built `ExtensionInput`. The handler receives the resource **as it will be persisted**, after the request's update actions are applied, not the update actions themselves. Assert on the resulting cart or order, and cover `Create` and `Update`:

```ts
import { describe, expect, it } from "vitest";
import type { ExtensionInput } from "@commercetools/platform-sdk";
import { apiExtensions } from "./extension.js";

const ctx = (config: Record<string, string> = {}) => ({ now: () => Date.now(), config });
const { handler } = apiExtensions.find((e) => e.key === "cart-sku-blocker")!;

const cartWith = (action: "Create" | "Update", skus: string[]) =>
  ({
    action,
    resource: {
      typeId: "cart",
      id: "cart-1",
      obj: { id: "cart-1", lineItems: skus.map((sku, i) => ({ id: `li-${i}`, quantity: 1, variant: { sku } })) },
    },
  }) as unknown as ExtensionInput;

describe("cart-sku-blocker", () => {
  it("approves a cart without blocked SKUs", () => {
    expect(handler(cartWith("Create", ["OK-1"]), ctx())).toEqual({});
  });

  it.each(["Create", "Update"] as const)("blocks a blocked SKU on %s", (action) => {
    expect(handler(cartWith(action, ["BLOCKED-SKU"]), ctx())).toMatchObject({
      errors: [expect.objectContaining({ code: "InvalidInput" })],
    });
  });

  it("reads the blocked list from config", () => {
    expect(handler(cartWith("Create", ["X"]), ctx({ BLOCKED_SKU: "X,Y" }))).toHaveProperty("errors");
  });
});
```

Because the handler sees the resulting resource, a check on `lineItems` holds for every entry point that adds a line item (cart creation, `addLineItem`, adding a Shopping List) without knowing which one was used. Prefer that over inspecting the request.

Unit tests run in Node, where `process`, `Buffer`, and `node:*` imports exist. The sandbox withholds them, so a passing unit test does not prove the bundle loads. Step 5 catches that.

## 2. Fire the handlers at the merged bundle, offline

`invoke-api-extension` runs the bundle's handlers in-process against a JSON `ExtensionInput` and prints each handler's verdict: approve, modify with the actions, or block with the errors. With `--all` it runs the merged bundle and reports every package's handlers for the same write.

```bash
# Scaffold realistic payloads once, edit them, and keep them in the repo as fixtures
commercetools integration-layer extension create-api-extension-input --resource-type cart --action Create --out payloads/cart-create.json
commercetools integration-layer extension create-api-extension-input --resource-type cart --action Update --out payloads/cart-update.json

commercetools integration-layer extension invoke-api-extension --all --input payloads/cart-create.json
commercetools integration-layer extension invoke-api-extension --all --input payloads/cart-update.json --config MAX_LINE_QUANTITY=10
```

A handler fires locally only when its `resourceTypeId` and `actions` match the payload, and the rest are reported as skipped. Check the skipped list: a handler that should have fired but was skipped has the wrong trigger. Local matching uses `resourceTypeId` and `actions` only, so test a commercetools `condition` with real writes in step 4.

`ctx.config` comes from `EXTENSION_CONFIG_<KEY>` variables in the shell or a `.env` file, and `--config KEY=VALUE` overrides a single key.

## 3. Query the merged schema through a gateway

The workspace's root `pnpm dev` runs `serve --all`: a local federated gateway over your merged extension subgraph **and** the Project's deployed Experience API. This is the production topology in miniature, so query core fields and your fields together in one operation:

```graphql
{ product(id: "…") { name loyaltyPoints(price: 1000) } }
```

`name` resolves upstream and `loyaltyPoints` locally. The server hot-reloads on every save of an extension or the `.env`. The server exposes three routes:

- `/graphql` is the gateway.
- `/_extension` is the raw merged subgraph.
- `/composed` shows the merged schema.

If an edit does not compose, the log lists the collisions and the server keeps serving the last good schema, so watch the log, not only the query result.

- **Fields that use `@requires` or `@override`** only show their real behavior in the composed graph. Test them here, not in a standalone server.
- **External services:** when you are logged in, resolver `fetch` goes through the same Project host allowlist as production. Add the provider's host with `allowlist add <host>` before testing. Without a login, `fetch` is unrestricted locally, so an allowlist gap only shows up once you log in.
- **Customer-scoped fields:** `commercetools integration-layer explore --as <email>`, run from an extension directory, composes your working tree against the Project and runs operations as that customer.
- **One extension in isolation:** `pnpm --filter @extensions/<name> dev` serves just that subgraph, offline. Exercise entity fields through the `_entities` query.

## 4. Run real writes through your local handlers

`serve-api-extension` serves the merged handlers over HTTP and registers a commercetools API Extension pointing at a public tunnel, so real writes in the Project call the code on your machine. Attach a debugger, and edits hot-reload.

```bash
ngrok http 4000   # or any HTTPS tunnel
commercetools integration-layer extension serve-api-extension --all --public-url https://<tunnel-host>
```

Use a dedicated sandbox Project and a `manage_project` login. The command refuses to start if the Project already has an API Extension on the same resource and action, which can include the one your deployed bundle registered. It deletes what it registered on exit, and `--cleanup` removes leftovers after a crash.

This is the only layer where commercetools itself validates the request before your handler runs. Use it to:

- send every entry point of the business action through the API: a cart created with `lineItems`, `addLineItem`, adding a Shopping List;
- confirm that a `condition` triggers on the writes it should, and only those;
- confirm the case from [the write path](write-path.md): a value the request needs to pass validation has to be on the request itself, because your handler never sees a request that fails validation.

## 5. Validate the merged bundle

`pnpm validate` runs the publish gate against the logged-in Project without uploading anything:

| Check | Where | Bypass with `--force` |
| :--- | :--- | :--- |
| Static analysis: no withheld globals (`process`, `node:*`, `eval`, …) | Local | Never |
| Shape: non-empty `typeDefs`, a resolver for every declared field, well-formed `apiExtensions` | Local | Never |
| Composition against the Project's live core subgraph | Remote | Yes |
| Breaking changes against the currently published schema | Remote | Yes |

Fix every local failure. A bundle that fails them does not load. A Project's first push has no published schema to compare against, and a bundle with only API Extensions has no schema to compose, so those checks do not apply there. `commercetools integration-layer schema fetch` prints the core subgraph SDL your bundle composes against, which helps when a composition error comes from a change on the core side.

## 6. Push and confirm the revision is running

`pnpm push` builds, validates, and uploads the merged bundle, replacing the Project's current one. A push **stores** the bundle. The runtime then loads it, and each revision moves from `pending` to `running` (it serves) or `failed` (with a reason). `push` waits for that verdict by default and exits non-zero on `failed`. Keep the wait, and raise `--wait-timeout` instead of using `--no-wait` if loading takes long.

- **A failed revision drops out of service.** The Project keeps serving the newest revision that did not fail. When a pushed change does not appear, check whether the push reported `running`.
- **`extension status`** shows the stored bundle (version, size, upload time, recorded source revision), not whether it loaded. The push's wait is where the load verdict is reported.
- **Rolling back** means pushing the previous code again. There is no unpublish command, and the recorded source revision (from git, or `EXTENSION_SOURCE_REVISION` in CI) tells you which code is deployed.
- **`--force`** skips only the remote checks, for a coordinated breaking change. Through a package script, forward it explicitly: `pnpm push -- --force`.
- **Configuration** set with `config set <KEY> <VALUE>` (add `--secret` for credentials) takes effect without a new push.

After `running`, check the live edge:

```bash
commercetools integration-layer explore --deployed        # the composed schema the router actually serves
commercetools integration-layer extension invoke-api-extension --deployed --input payloads/cart-create.json   # the deployed handlers; nothing is persisted
```

In CI, log in with a `manage_project` client and push with the wait on:

```bash
EXTENSION_SOURCE_REVISION="$BUILD_ID" \
  commercetools integration-layer extension push --all --wait-timeout 300
```
