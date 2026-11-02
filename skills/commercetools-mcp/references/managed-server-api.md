# Create / update a Managed MCP Server

The config is a commercetools API resource. Create and update it through the **Commerce MCP's own
MCP-server tools** — `read_mcp_server_types`, `read_mcp_servers`, `create_mcp_servers`,
`update_mcp_servers` — on a Commerce MCP the user has connected, Managed or self-hosted
([connect-commerce-mcp.md](./connect-commerce-mcp.md)). You make tool calls; no REST requests or token handling. The shapes below
are a working summary: the tool's own description and input schema (`tools/list`) are authoritative for
parameters, and the [MCP Servers API reference](https://docs.commercetools.com/api/projects/managed-mcp-servers.md)
covers field semantics.

## 1. Confirm the management tools are callable

Check `tools/list` on the connected Commerce MCP for `create_mcp_servers` and `update_mcp_servers`.

Then, before the first create or update, call `read_project` and show the user the project `key` and
`name` it returns, next to the project they confirmed in step 2 of the workflow. A repository can hold
connections to several projects, and the one you call decides where the write lands. A server created in
the wrong project is live there until someone notices, so a mismatch stops the write. If the tools are
missing, don't reach for raw credentials — see
[connect-commerce-mcp.md](./connect-commerce-mcp.md#verify-before-going-further).

## 2. Inventory what already exists

`read_mcp_servers` (no arguments, or `limit`/`offset` to page) before you create anything. Don't assume a
clean slate — projects often carry servers from earlier exploration, and a `key` collision fails the
create call anyway. The endpoint takes no `where` predicate, so filter the list yourself; then
`read_mcp_servers` with `key` on anything that looks related, to see its real tool list and state. Signs
of leftover experimentation rather than deliberate configuration: no `name`/`description`, a broad `all`
tool list, several near-identical duplicates.

> **Never repurpose or disable an existing server without asking the user.** `key` is immutable, so
> reusing one means overwriting the config a live agent may be connected to — and you can't tell from the
> config alone whether something is pointed at it. That includes the server you're working through.

## 3. Choose the authentication mode

`authenticationMode` decides what credential a client presents, and it changes who the config is for.

| Mode | Credential | Fits | Tools exposed |
|---|---|---|---|
| `ClientCredentials` (default) | API Client with scope `mcp:{projectKey}:{key}` | Autonomous agents, machine-to-machine | Every tool on the server |
| `CommercetoolsIdentity` | The user's own Identity account (their Merchant Center login) | Human-in-the-loop assistants | Only configured tools the signed-in user's Merchant Center permissions allow |

What this changes in practice:

- **Set it in the draft, deliberately.** Omitting `authenticationMode` silently yields
  `ClientCredentials`. Change it later with the `setAuthenticationMode` update action.
- **`CommercetoolsIdentity` needs no API Client at all** — but the client must support OAuth 2.0
  authorization-code discovery. A client that only takes a static bearer token cannot connect in this mode.
- **Each mode has its own authorization server.** A token minted for one mode is rejected by a server
  configured for the other, which surfaces as an auth failure that looks nothing like a mode mismatch.
- Permission-based filtering applies **per signed-in user and without reconfiguring the server**; a user
  whose permissions allow none of the configured tools is rejected outright. So the effective surface is the
  *intersection* of your tool list and their permissions — your config sets the ceiling, not the floor.
- `ClientCredentials` works for human-in-the-loop too, but then per-user filtering is your problem.

## 4. Create the server — `create_mcp_servers`

The `McpServerDraft` goes under `body`:

```jsonc
{
  "body": {
    "key": "sell-off-agent",                 // unique, IMMUTABLE, becomes part of the URL
    "name": { "en": "Sell-off promotion agent" },    // optional LocalizedString
    "authenticationMode": "ClientCredentials",       // optional; defaults to ClientCredentials — see step 3
    "state": "Enabled",                              // optional; DEFAULTS TO "Disabled"
    "mcpServer": {
      "type": "CommerceMCP",
      "majorVersion": "v4",                          // check read_mcp_server_types for current versions
      "tools": ["read_product_search", "read_products", "read_inventory", "create_product_discounts"],
      "toolCustomizations": [ /* see tool-customizations.md */ ],
      "jsonOutputFiltering": { /* see field-filtering.md */ },
      "toolOutputFormatting": "JsonToTabular"        // optional
    }
  }
}
```

The response is the created server, including `id`, `version`, and the computed `mcpServer.url`
(`https://mcp.{region}.commercetools.com/projects/{projectKey}/{key}`) — the endpoint the agent connects
to. Tool names and parameter overrides are validated against `(type, majorVersion)`, so an invented name
or a bad override fails the call instead of silently doing nothing.

> **New servers default to `state: "Disabled"`.** Set `"state": "Enabled"` in the draft or send a
> `setState` action later; a disabled server rejects every tool request.

## 5. Update an existing server — `update_mcp_servers`

Read the current `version` with `read_mcp_servers`, then send the server's `key` (or `id`), that
`version`, and an ordered action list. A stale version returns `ConcurrentModification` — re-read and
retry rather than bumping the number blindly.

```jsonc
{
  "key": "sell-off-agent",
  "version": 3,
  "actions": [
    { "action": "setTools", "tools": ["read_product_search", "read_products", "create_product_discounts"] },
    { "action": "setJsonOutputFiltering", "jsonOutputFiltering": { "drop": { "fieldNames": ["lastModifiedBy"] } } },
    { "action": "setState", "state": "Enabled" }
  ]
}
```

The response carries the new `version`; use it for the next update.

### Available update actions
- `setTools` (replace), `addTool`, `removeTool` — the tool set.
- `setToolCustomizations` (replace; send `[]` to clear), `addToolCustomization`, `removeToolCustomization`.
- `setJsonOutputFiltering` — the response filter; replaces it entirely.
- `setToolOutputFormatting` — output format.
- `setState` — `Enabled` / `Disabled`.
- `setAuthenticationMode` — `ClientCredentials` / `CommercetoolsIdentity` (step 3).
- `setName`, `setDescription`.

Not available through the tool: deletion. There's no `delete_mcp_servers`; to take a server out of
service, `setState` it to `Disabled` — it keeps its config and can be re-enabled. If the user wants it gone,
they delete it on the server's page in the Merchant Center, which also revokes its API clients and tokens.

`key` is immutable — there is no `setKey`. Pick one that describes the agent role
(`catalog-read-agent`, not `instance-3`).

## Hand off: the agent's runtime client

On a `ClientCredentials` server, the agent can't connect until a **runtime client** exists. You can't create
it — the Commerce MCP has no API client tools — so send the user straight to the form. (On a
`CommercetoolsIdentity` server there is no runtime client: the user signs in with their own account. Skip to
the client config below.)

Build the link from the create response — `mcpServer.url` gives the host, `id` the server:

```text
https://mc.{region}.commercetools.com/{projectKey}/settings/mcp-servers/{id}/overview/api-clients/new
```

Take the host of `mcpServer.url` and replace its leading `mcp.` with `mc.` rather than assembling the region
yourself, and use the server's `id` — a UUID — not its `key`. There, **Add API Client** derives the scope
from the server, and the Merchant Center shows the credentials plus a ready-to-use command for a token; it
can also generate a bearer token directly
([details](https://docs.commercetools.com/merchant-center/managed-mcp-servers.md#api-clients)). Ask the user
to name the client after the agent that will use it.

Three things trip everyone up:

- **It uses ONE dedicated scope: `mcp:{projectKey}:{key}`** — *not* data scopes. Data access is gated by
  the server config (the tools you selected), not by the client's scopes: a client with data scopes but
  no `mcp:` scope gets a **403**. Creating it from the server's page gets this right; a client created
  elsewhere usually doesn't.
- **The secret is shown once.** The user stores it for the agent then — never in the chat with you.
- **Plan the token refresh now.** Token validity is up to 30 days (`2592000` seconds). 30 days is a hard ceiling with **no non-expiring option**, so expiry is a
  scheduled event, not an edge case — decide who refreshes it and how before rollout, rather than finding
  out when a production agent starts failing auth. Refreshing means minting a new token from the same
  durable client credentials; the API Client itself doesn't need recreating.

## Client config, without committing the token

The get-started guide's examples paste the bearer token straight into `.mcp.json`, which is typically
git-tracked. Use an env var instead:

```jsonc
{
  "mcpServers": {
    "<key>": {
      "type": "http",
      "url": "<mcpServer.url>",
      "headers": { "Authorization": "Bearer ${CTP_MCP_TOKEN}" }
    }
  }
}
```

**One catch:** for an `http`-type entry, `${VAR}` is resolved only from variables **already exported in the
shell that launched the client**. The client does not read `.env` itself, and unlike a `stdio` entry there's
no launch command that could source one. An unset variable passes through as the literal `${VAR}` string, so
the failure shows up as an opaque auth error rather than a config error. Have the user export it (e.g.
`set -a; . ./.env; set +a`) before starting the client.

Full connection steps, including Cursor and n8n, and the OAuth-discovery alternative to a static token, are
in the [get-started guide](https://docs.commercetools.com/api/managed-mcp-servers-get-started.md).
