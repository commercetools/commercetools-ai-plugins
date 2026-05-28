# Authoring MCP servers

MCP server definitions live in `.internal/mcp/servers.source.json`. Each entry declares a `transport` (either `http` or `stdio`) and the build script translates the entry into each vendor's native config shape.


## Currently shipped

| Server | Transport | Endpoint |
| :--- | :--- | :--- |
| `commercetools-knowledge` | http | `https://docs.commercetools.com/apis/mcp` |


The Knowledge MCP exposes:
- `commercetools-documentation-search` — semantic search over the docs
- `commercetools-graphql-schemata` — GraphQL schemas by resource name
- `commercetools-oas-schemata` — OpenAPI specs by resource name
- `commercetools-graphql-validate` — query/mutation validation
- `commercetools-developer-tips` — best-practice prompts

It's public (no auth) and rate-limited to 100 requests / 15 minutes per IP.

Official Docs: 
https://docs.commercetools.com/sdk/mcp/knowledge-mcp


## Adding an HTTP server (streamable HTTP)

```json
{
  "mcpServers": {
    "my-http-server": {
      "transport": "http",
      "url": "https://example.com/mcp",
      "description": "What this server does — shown in docs only, not emitted."
    }
  }
}
```

Optional fields: `headers` (object) for auth tokens or custom headers.

The build emits:

| Vendor | Shape |
| :--- | :--- |
| Claude Code, Cursor, VS Code Copilot, Codex | `{ "type": "http", "url": "..." }` |
| Gemini CLI | `{ "httpUrl": "..." }` |

## Adding a stdio server (local process)

```json
{
  "mcpServers": {
    "my-local-server": {
      "transport": "stdio",
      "command": "node",
      "args": ["${PLUGIN_ROOT}/mcp/bin/server.js"],
      "env": {
        "CT_API_TOKEN": "${env:CT_API_TOKEN}"
      },
      "description": "..."
    }
  }
}
```

Portable path tokens (substituted per vendor by the build):

| Token | Resolves to |
| :--- | :--- |
| `${PLUGIN_ROOT}` | Plugin install directory (becomes `${CLAUDE_PLUGIN_ROOT}` / `${extensionPath}` / etc.) |
| `${PROJECT_DIR}` | User's project root (becomes `${CLAUDE_PROJECT_DIR}` / `${workspaceFolder}` / etc.) |

Bundle binaries inside the repo (e.g. under `mcp/bin/`) so they're available after install.

## Verifying

```bash
npm run build
cat .mcp.json .cursor-plugin/mcp.json gemini-extension.json    # inspect generated shapes
npm run validate
```

For a live test against Claude Code, point it at the local repo as a plugin:

```bash
claude --plugin-dir ./
```

Then ask the agent to use a tool from the server (e.g. "search the commercetools docs for cart discounts").
