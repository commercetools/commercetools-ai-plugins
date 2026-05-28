# `.internal/` — everything that doesn't need to be at repo root

If you landed here from a file browser or a `cd`, you're inside the toolkit's build and documentation directory. Nothing in here is read by Claude Code, Cursor, Copilot, Codex, or Gemini at install time — these are the **source files** that get fanned out into the vendor manifests at the repo root.

## What's where

| Folder | Purpose |
| :--- | :--- |
| `manifests/meta.json` | Single source of truth for plugin name, version, author, repo URL. Edit here, then `npm run build`. |
| `mcp/servers.source.json` | Canonical MCP server definitions. Build emits the right shape per vendor. |
| `context/always-on.md` | The always-loaded commercetools framing. Build copies / wraps it per vendor. |
| `schemas/` | Vendored JSON Schemas from schemastore.org. Used by `npm run validate`. Refresh with `npm run update-schemas`. |
| `scripts/` | `build.mjs`, `validate.mjs`, `new-skill.mjs`, `update-schemas.mjs`. |
| `docs/` | Contributor guides (authoring, installing, smoke testing, releasing). |

## Quick starts

- **Bumping the version?** → `manifests/meta.json`, then `npm run build`.
- **Updating the always-on context?** → `context/always-on.md`, then `npm run build`.
- **Adding a new MCP server?** → `mcp/servers.source.json`, then `npm run build`. See `docs/authoring-mcp.md`.
- **Authoring a new skill?** → `npm run new-skill <name>` from the repo root.
- **Wondering what CI does?** → `docs/smoke-testing.md`.
- **First time contributing?** → `docs/contributing.md`.
