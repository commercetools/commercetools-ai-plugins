# commercetools-skills

Official commercetools skills, subagents, and MCP servers for AI coding agents.

One repo, five tools. Install with a single command from your editor of choice:

| Tool | Install command |
| :--- | :--- |
| **Universal** | `npx skills add commercetools/commercetools-skills` |
| **Claude Code** | `/plugin marketplace add commercetools/commercetools-skills` then `/plugin install commercetools-ai-toolkit@commercetools` |
| **Cursor** | Settings → Plugins → Install from Git URL → `https://github.com/commercetools/commercetools-skills` |
| **VS Code Copilot** | Command Palette → `Chat: Install Plugin From Source` → `https://github.com/commercetools/commercetools-skills` |
| **OpenAI Codex** | `codex plugin marketplace add commercetools/commercetools-skills` |
| **Gemini CLI** | `gemini extensions install https://github.com/commercetools/commercetools-skills` |

See [`docs/install.md`](docs/install.md) for the full per-tool walkthrough.

## What you get

- **Skills** — focused playbooks the agent invokes when it sees a matching task (e.g. exploring the commercetools API, debugging carts, modeling Custom Objects).
- **Subagents** — specialized personas (e.g. `ct-architect`) the agent can hand a problem to.
- **MCP servers** — tools that connect the agent to commercetools data (docs search, GraphQL schemas, project state).

All three are shipped as one bundle so customers get the full experience with a single install.

## Repo layout

```
commercetools-skills/
├── skills/                  ← author skills here, one folder per skill
├── agents/                  ← author subagents here, one .md per agent
├── context/always-on.md     ← canonical always-loaded framing (single source)
├── mcp/servers.source.json  ← canonical MCP server definitions
├── manifests/meta.json      ← name, version, author, repo (single source of truth)
│
├── .claude-plugin/          ← generated — Claude Code & VS Code Copilot
│                                (plugin.json, marketplace.json, mcp.json, hooks.json)
├── .cursor-plugin/          ← generated — Cursor
│                                (plugin.json, marketplace.json, mcp.json, rules/)
├── .codex-plugin/           ← generated — OpenAI Codex
│                                (plugin.json, mcp.json, hooks.json)
├── .agents/plugins/         ← generated — Codex marketplace catalog (Codex-only despite the generic name)
├── gemini-extension.json    ← generated — Gemini CLI manifest (root-required)
├── GEMINI.md                ← generated — Gemini always-on context (root-required)
│
├── scripts/               ← build, validate, new-skill
└── docs/                  ← authoring + distribution guides
```

The repo **is** the plugin for all 5 vendors. There's no per-vendor subdirectory — each tool reads its native manifest from one of the dot-folders or the root, and they all share `skills/` and `agents/`.

## Authoring

```bash
# Scaffold a new skill
npm run new-skill ct-cart-debugger

# After editing the skill body and frontmatter:
npm run check              # build + validate (incl. JSON Schema + claude plugin validate)

# Refresh vendored JSON Schemas from schemastore.org (run occasionally):
npm run update-schemas
```

`npm run validate` runs three layers of checks:
1. **Frontmatter + JSON syntax** on skills, agents, generated artifacts
2. **JSON Schema validation** (offline, via ajv) for the three files where schemas exist on schemastore.org: Claude `plugin.json`, Claude `marketplace.json`, and Codex `hooks.json`
3. **`claude plugin validate ./`** if the Claude CLI is on PATH (optional)

Cursor, VS Code Copilot, and Gemini CLI don't publish JSON Schemas or have a `validate` subcommand yet — when they do, the same pattern slots in.

- [`docs/authoring-skills.md`](docs/authoring-skills.md)
- [`docs/authoring-agents.md`](docs/authoring-agents.md)
- [`docs/authoring-mcp.md`](docs/authoring-mcp.md)
- [`docs/authoring-context.md`](docs/authoring-context.md) — the always-on framing
- [`docs/smoke-testing.md`](docs/smoke-testing.md) — what the CI smoke tests cover (and don't)

## Releasing

Bump `version` in `manifests/meta.json`, run `npm run build`, commit, tag, and push. Users on each platform get the update via their respective `/plugin marketplace update` (or equivalent) commands.

See [`docs/install.md`](docs/install.md) for the full publish flow including official marketplace submission.
