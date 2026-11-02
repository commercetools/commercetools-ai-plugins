# Discover the available tools (don't assume a list)

The Commerce MCP tool set grows over time, and which tools exist depends on the server's
`(type, majorVersion)`. **Never design a config against a memorized list.** Pull the current inventory and
reason from it. Any tool names in this skill (e.g. `read_products`) are illustrations, not an authoritative
catalog.

## The authoritative catalog

Call `read_mcp_server_types` with `type: "CommerceMCP"` on the connected Commerce MCP. Add `majorVersion`
(e.g. `v4`) to pin a version; **omit it to get the latest**.

The response is `{ type, majorVersion, tools[] }`, where each tool carries:

| Field | Use it for |
|---|---|
| `name` | The exact snake_case value to put in `tools` — never hand-type these |
| `description` | The current default text, i.e. your starting point for an override ([tool-customizations.md](./tool-customizations.md)) |
| `operationType` | `read` or `write` — the fastest least-privilege filter ([select-tools.md](./select-tools.md)) |
| `groups` | Which groups (`all`, `read_all`) the tool belongs to |

Omitting `type` lists every server type. This is also the source of truth for which `majorVersion` values
exist — as of writing `v1` (deprecated) and `v4`, but check rather than trust that.

**The catalog returns no input schemas.** It tells you which tools exist, not what parameters they take,
so you can't design `const` / `default` / `allowedTypes` overrides from it alone. For parameter shapes use
a live `tools/list` against a connected server, or `openApi-schemata.mjs` for the underlying resource.

**If `read_mcp_server_types` isn't listed** (e.g. filtered by the signed-in user's permissions), get the inventory from
`tools/list` on the broad Commerce MCP the user already has connected, and confirm against the catalog
before creating the server ([connect-commerce-mcp.md](./connect-commerce-mcp.md)). The
[Available Tools](https://docs.commercetools.com/dev-tooling/mcp/commerce-mcp.md#available-tools) docs
section is a browsable third option, but it is prose and can lag the API.

## Don't infer names by crossing verbs with resources

Coverage is **not** symmetric — `{create,read,update,delete}_{resource}` is the wrong mental model. Real
`v4` examples:

- **There are no `delete_*` tools at all.** Deletion is not on the surface. If the agent's task implies
  cleanup or removal, say so early: it needs a different path (direct REST, a separate process, or a
  rethink of the task), not a tool you can add.
- Read-only, no write counterpart: `read_messages`, `read_product_projections`, `read_product_search`,
  `read_customer_search`.
- `update_payment_intents` exists with no matching read or create.
- `create_transactions` and `read_transactions` exist, but there is no update.
- Verbs beyond CRUD exist: `replicate_carts`.
- `create_bulk` / `update_bulk` operate across resource types and are their own thing.

A name that isn't in the catalog is rejected at write time, so a typo or an invented name fails the create
call rather than silently doing nothing — but checking the catalog first is cheaper than guessing.

> Naming is snake_case `verb_resource`. The same tool set is shared with self-hosted Commerce MCP `4.0.0`+
> ([choose-variant.md](./choose-variant.md)), so names don't differ between the two variants.
