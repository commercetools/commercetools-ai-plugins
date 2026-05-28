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
| `model` | no | Claude Code |
| `effort` | no | Claude Code (`low` / `medium` / `high`) |
| `maxTurns` | no | Claude Code |
| `tools` / `disallowedTools` | no | Claude Code |

Don't add `hooks`, `mcpServers`, or `permissionMode` — Claude Code disallows those in plugin-shipped agents for security.

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
