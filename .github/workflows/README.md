# `.github/workflows/`

These workflows run in this repository's CI only. They are **not** part of any installed plugin — Claude Code, Cursor, and Copilot never read this folder when a customer installs the plugin.

This repository is a **distribution mirror**: its skills, commands, and vendor manifests are generated and synced in from a private source repository via automated "chore(release): publish content" PRs. There is no build tooling in this repo — CI only smoke-tests the already-synced layout.

What runs here:

- **`ci.yml` → Claude Code smoke test** — installs the Claude Code CLI on a clean runner and runs `claude plugin validate ./` against the committed layout.
- **`ci.yml` → Codex smoke test** — installs the Codex CLI and verifies the committed `.agents/` marketplace installs and enables the plugin (offline, no auth).
- **`notify-docs.yml`** — on push to `main` that changes published content (skills, commands, vendor manifests, `skills.sh.json`), sends a `repository_dispatch` event (`event_type: skills-updated`) to `commercetools/commercetools-docs`, triggering its `sync-skills.yml` workflow. Edits to `README.md`, `LICENSE`, or this `.github/` folder do not fire it.

If you're a plugin user, you can ignore this folder entirely.
