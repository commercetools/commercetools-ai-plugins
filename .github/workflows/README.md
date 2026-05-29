# `.github/workflows/`

These workflows run in this repository's CI only. They are **not** part of any installed plugin — Claude Code, Cursor, Copilot, and Codex never read this folder when a customer installs the plugin.

What runs here:

- **`ci.yml` → Validate** — regenerates every vendor manifest from `.internal/config.json`, fails if the diff isn't already committed, and runs frontmatter + JSON Schema checks.
- **`ci.yml` → Claude Code smoke test** — installs the Claude Code CLI on a clean runner and runs `claude plugin validate ./` against the live layout.

If you're a plugin user, you can ignore this folder entirely. If you're contributing to the generator, see `.internal/README.md`.
