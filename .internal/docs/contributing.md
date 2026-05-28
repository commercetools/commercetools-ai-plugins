# Contributing to commercetools-skills

This is the technical/contributor guide. For the user-facing landing page, see the [root README](../../README.md).

## How the repo is organized

```
commercetools-skills/
│
├── README.md                       ← user-facing landing page
├── package.json                    ← npm scripts and dev deps
├── .nvmrc                          ← Node version
├── .gitignore
│
├── skills/                         ← author skills here (one folder per skill)
│   └── <skill-name>/SKILL.md
├── agents/                         ← author subagents here (one .md per agent)
│
├── .claude-plugin/                 ← GENERATED — Claude Code (plugin.json, marketplace.json, mcp.json, hooks.json)
├── .cursor-plugin/                 ← GENERATED — Cursor (plugin.json, marketplace.json, mcp.json, rules/)
├── .codex-plugin/                  ← GENERATED — OpenAI Codex (plugin.json, mcp.json, hooks.json)
├── .agents/plugins/                ← GENERATED — Codex marketplace catalog (Codex-only path, despite the name)
├── gemini-extension.json           ← GENERATED — Gemini CLI manifest (Gemini requires it at root)
├── GEMINI.md                       ← GENERATED — Gemini always-on context (Gemini requires it at root)
│
└── .internal/                      ← everything else (build sources, tooling, docs)
    ├── README.md                   ← orient yourself when landing here
    ├── manifests/meta.json         ← single source of truth: name, version, author, repo
    ├── mcp/servers.source.json     ← canonical MCP server definitions
    ├── context/always-on.md        ← canonical always-loaded framing
    ├── schemas/                    ← vendored JSON Schemas from schemastore.org
    ├── scripts/                    ← build.mjs, validate.mjs, new-skill.mjs, update-schemas.mjs
    └── docs/                       ← contributor guides (this file lives here)
```

The repo **is** the plugin for all 5 vendors. There's no per-vendor subdirectory — each tool reads its native manifest from one of the dot-folders or the root, and they all share `skills/` and `agents/`.

## Authoring workflow

```bash
# Scaffold a new skill
npm run new-skill ct-cart-debugger

# After editing the skill body and frontmatter:
npm run check                # build + validate

# Refresh vendored JSON Schemas (occasional, see below):
npm run update-schemas
```

Authoring guides for each component type:

- [authoring-skills.md](authoring-skills.md)
- [authoring-agents.md](authoring-agents.md)
- [authoring-mcp.md](authoring-mcp.md)
- [authoring-context.md](authoring-context.md) — the always-on framing
- [install.md](install.md) — per-vendor user install walkthrough
- [smoke-testing.md](smoke-testing.md) — what CI covers and doesn't

## How validation works

`npm run validate` runs three layers, each progressively more thorough:

1. **Frontmatter + JSON syntax** on skills, agents, and all generated artifacts (always runs, no deps)
2. **JSON Schema validation** via ajv against vendored schemas in `.internal/schemas/`. Covers the three files where official schemas exist on schemastore.org: Claude `plugin.json`, Claude `marketplace.json`, Codex `hooks.json`.
3. **`claude plugin validate ./`** — runs if the Claude CLI is on `PATH`. Most thorough check for Claude-specific issues.

Cursor, VS Code Copilot, and Gemini CLI don't publish JSON Schemas or have a `validate` subcommand yet — when they do, the same pattern slots in.

## How the build works

`npm run build` reads three canonical source files and fans them out into vendor-specific artifacts:

| Source (`.internal/`) | Generated artifacts |
| :--- | :--- |
| `manifests/meta.json` | All five vendor `plugin.json` / `marketplace.json` / `gemini-extension.json` files |
| `mcp/servers.source.json` | `.mcp.json` (Claude/Copilot), `.cursor-plugin/mcp.json` (Cursor), `.codex-plugin/mcp.json` (Codex), inline `mcpServers` in `gemini-extension.json` |
| `context/always-on.md` | `GEMINI.md` (Gemini reads), `.cursor-plugin/rules/commercetools-context.mdc` (Cursor with `alwaysApply: true`), `.claude-plugin/hooks.json` + `.codex-plugin/hooks.json` (SessionStart hooks for Claude/Copilot/Codex) |

So when you bump `version` in `manifests/meta.json`, ten or so output files update consistently in a single `npm run build`.

## Releasing

1. Bump `version` in `.internal/manifests/meta.json`
2. `npm run build` (regenerate all vendor artifacts)
3. `npm run validate` (sanity check)
4. Commit, tag, push
5. Users on each platform pick up the new version via their tool's marketplace-update command

See [install.md](install.md) for the official-marketplace submission flow when we're ready for that.

## Updating vendored schemas

The JSON Schemas in `.internal/schemas/` are vendored from schemastore.org so CI runs offline. Refresh them periodically:

```bash
npm run update-schemas
git diff .internal/schemas/
# if anything changed, commit the diff
```

Don't auto-refresh on every build — that would break offline dev and make builds non-reproducible. See [smoke-testing.md](smoke-testing.md) for the rationale.

## Coding conventions for this repo

- Build scripts use plain Node 20+ ESM, no external deps beyond `ajv` and `ajv-formats` (dev only).
- Generated files are committed (so users installing from git don't need to run the build).
- A CI check fails the PR if generated files drift from the canonical sources (`npm run build` must produce no diff).
