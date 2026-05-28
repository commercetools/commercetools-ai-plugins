---
name: example-agent
description: commercetools example agent. 
---

<!--
NOTE on cross-vendor agent frontmatter:

Only `name` and `description` are accepted by ALL five vendors today.
Claude Code supports richer keys (`model`, `effort`, `maxTurns`, `tools`,
`disallowedTools`), but Gemini's agent loader rejects them as
"Unrecognized key(s)" and refuses to load the file. Since all vendors
read this same `agents/` directory, the frontmatter has to be the
intersection of what they accept.

If a future agent genuinely needs Claude-specific tuning, the right move
is to:
  - Move the full-fidelity source under `agents/source/<name>.md`
  - Update `scripts/build.mjs` to emit two versions:
      - `.claude-plugin/agents/<name>.md`  (full frontmatter)
      - `agents/<name>.md`                  (stripped to name+description)
  - Update Claude's plugin.json to point `agents` at the .claude-plugin path

See `docs/authoring-agents.md` for the current cross-vendor compatibility
matrix.
-->


this is an example agent
