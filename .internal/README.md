# `.internal/` — the plugin manifest generator

This folder generates the per-vendor plugin manifest files at the repo root (`.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/`, `.agents/plugins/`). Nothing in here is installed by end users — Node, npm, and the build scripts only exist to keep the four vendor configs in sync from a single source.

If you are using the plugin, you don't need to read further. See the root [`README.md`](../README.md).

## How it works

All metadata lives in **[`config.json`](config.json)**: plugin name, version, author, description, keywords, marketplace info, and the MCP server list. Editing that file and running `npm run build` regenerates every vendor manifest.

```bash
cd .internal
npm install        # one-time
npm run build      # regenerate manifests
npm run validate   # frontmatter + JSON Schema + claude plugin validate
npm run check      # build + validate
```

## What gets generated

| Path | Vendor | Purpose |
| :--- | :--- | :--- |
| `.claude-plugin/{plugin,marketplace,mcp}.json` | Claude Code (and VS Code Copilot via Claude format auto-detect) | Manifest, marketplace catalog, MCP server config |
| `.cursor-plugin/{plugin,marketplace,mcp}.json` | Cursor | Same |
| `.codex-plugin/{plugin,mcp}.json` | OpenAI Codex | Manifest + MCP server config |
| `.agents/plugins/marketplace.json` | OpenAI Codex | Marketplace catalog (Codex-specific path) |

Vendor manifest specs (don't restate them here — read the source):

- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference)
- [Cursor plugins](https://cursor.com/docs/reference/plugins)
- [VS Code Copilot agent plugins](https://code.visualstudio.com/docs/copilot/customization/agent-plugins)
- [OpenAI Codex plugins](https://developers.openai.com/codex/plugins/build)

## Validation

`npm run validate` runs in three layers:

1. **Frontmatter + JSON syntax** on `skills/`, `agents/`, and every generated manifest.
2. **JSON Schema validation** via `ajv` against schemas vendored in `schemas/` from schemastore.org. Refresh with `npm run update-schemas`.
3. **`claude plugin validate ./`** — the Claude Code CLI's own validator. Strongest backstop; runs in CI.

## Adding an MCP server

Edit `config.json` → `mcpServers`:

```json
{
  "mcpServers": {
    "my-new-server": {
      "transport": "http",
      "url": "https://example.com/mcp"
    }
  }
}
```

For stdio servers, set `transport: "stdio"` and use `${PLUGIN_ROOT}` / `${PROJECT_DIR}` placeholders — the build substitutes the right token per vendor.

Then `npm run build`.

## Adding a new vendor

Add an entry to `STDIO_TOKEN_MAP` in `scripts/build.mjs` and a new manifest builder block following the existing pattern. Update `validate.mjs` if there's a public JSON Schema for that vendor on schemastore.org.
