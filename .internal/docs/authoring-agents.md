# Authoring subagents

A **subagent** is a specialized persona that the main agent can delegate a problem to. Each subagent is a single `.md` file under `agents/`.

## Layout

```
agents/
├── ct-architect.md
└── ct-support-debugger.md
```

The filename (without `.md`) must match the `name` field in the frontmatter.

## Frontmatter

We use **Claude Code's frontmatter format** as the canonical superset — it's the richest of the five vendors. Other vendors ignore fields they don't recognize.

```yaml
---
name: ct-architect
description: commercetools solution architect. Invoke when designing data models, planning customizations, scoping new integrations, or making platform-level architecture decisions on commercetools Composable Commerce.
model: sonnet
effort: medium
maxTurns: 30
---
```

| Field | Required | Used by |
| :--- | :--- | :--- |
| `name` | yes | all |
| `description` | yes | all — drives auto-invocation |
| `model` | no | Claude Code (⚠️ rejected by Gemini today) |
| `effort` | no | Claude Code (`low` / `medium` / `high`) (⚠️ rejected by Gemini) |
| `maxTurns` | no | Claude Code (⚠️ rejected by Gemini) |
| `tools` / `disallowedTools` | no | Claude Code (⚠️ likely rejected by Gemini) |

**Cross-vendor rule of thumb:** only `name` and `description` are universally accepted today. Gemini's agent loader is in preview and rejects unknown frontmatter keys with `Unrecognized key(s) in object: '<field>'`, which fails the whole extension load.

If a specific agent genuinely needs Claude-only tuning (e.g. `effort: high` for an expensive reasoning agent), the right approach is to make `agents/` vendor-specific via the build:

1. Move the source file to `agents/source/<name>.md` with the full Claude frontmatter
2. Update `.internal/scripts/build.mjs` to emit:
   - `.claude-plugin/agents/<name>.md` — full frontmatter
   - `agents/<name>.md` — stripped to `name` + `description`
3. Point Claude's `plugin.json` at `./.claude-plugin/agents/<name>.md`

For now (placeholder agents), keeping the frontmatter minimal works fine across all five vendors.

Don't add `hooks`, `mcpServers`, or `permissionMode` to any agent frontmatter — Claude Code disallows those in plugin-shipped agents for security, and other vendors don't understand them either.

## Writing the body

The body is the agent's system prompt. Write it in second person ("You are...", "You help..."). Be explicit about:

1. **What the agent does** — its specialty.
2. **How it responds** — process, ordering of steps.
3. **What it does NOT do** — boundaries that prevent overlap with other agents.

Keep the body under ~150 lines.

## Validation

```bash
npm run validate
```

Checks each agent file has `name` + `description` and the name matches the filename.

## Vendor compatibility

| Vendor | Subagent support |
| :--- | :--- |
| Claude Code | ✅ Full (all frontmatter fields honored) |
| Cursor | ✅ Reads `name` + `description`; other fields ignored |
| VS Code Copilot | ✅ via Claude format auto-detect |
| OpenAI Codex | ⚠️ No first-class agent concept — these are exposed as skills |
| Gemini CLI | ⚠️ Preview / experimental — basic name + description |

When Codex/Gemini support catches up, no changes will be needed here — the build script will pick up the new format.
