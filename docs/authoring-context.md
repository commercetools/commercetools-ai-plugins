# Authoring always-on context

The toolkit ships a short, always-loaded "framing" prompt that gives the assistant baseline commercetools knowledge before any skill is invoked — preferred sources of truth, key distinctions to keep clear, units to expect.

## Source of truth

```
context/always-on.md          ← single canonical file, authored by the team
```

Keep it **under 200 words**. Every session pays the token cost on every prompt, so anything that belongs in a situational skill should go in a skill, not here.

Write it as **factual statements**, not imperative commands. The Claude Code docs explicitly warn that text framed as out-of-band system instructions can trigger prompt-injection defenses and get surfaced to the user instead of treated as context. Compare:

- ✅ "Money fields use centAmount (integer) and a separate currencyCode."
- ❌ "You must always use centAmount when handling money."

## How each vendor delivers it

Each vendor has a different native mechanism (or none at all). The build script fans the canonical file out into vendor-appropriate artifacts:

| Vendor | Native? | Generated artifact | Mechanism |
| :--- | :--- | :--- | :--- |
| **Gemini CLI** | ✅ | `GEMINI.md` (root) | `contextFileName` in manifest auto-loads it |
| **Cursor** | ✅ | `.cursor-plugin/rules/commercetools-context.mdc` | `.mdc` rule with `alwaysApply: true` |
| **Claude Code** | ❌ | `.claude-plugin/hooks.json` | `SessionStart` hook runs `cat` on the context file; stdout becomes session context |
| **VS Code Copilot** | ❌ | (uses Claude's `hooks.json` via auto-detect) | Same hook as Claude Code |
| **OpenAI Codex** | ❌ | `.codex-plugin/hooks.json` | `SessionStart` hook (same shape, `${PLUGIN_ROOT}` instead of `${CLAUDE_PLUGIN_ROOT}`) |

## Updating the context

```bash
# Edit
vim context/always-on.md

# Regenerate all 5 vendor artifacts
npm run build

# Confirm everything is in sync
npm run validate
```

Bumping the content does NOT require a version bump on its own, but it's good practice to bump `manifests/meta.json` `version` so users get the update via their tool's plugin-update flow.

## Caveats

- **Shell dependency**: the Claude / Codex hooks use `cat`. Windows users not on WSL or Git Bash may not have it on PATH. If this becomes a real issue, swap the command in `build.mjs` for a `node`-based reader.
- **Hook runs on every session start**: this is the desired behavior, but on slow filesystems it adds a tiny startup cost.
- **Token cost**: as noted above, keep the file short.
