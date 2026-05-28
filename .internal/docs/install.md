# Install commercetools-skills

This guide walks through installing the bundle in each supported tool.

## Universal install (any compatible agent)

[`npx skills`](https://github.com/vercel-labs/skills) is a tool-agnostic installer that works across Claude Code, Cursor, Codex, OpenCode, and more:

```bash
npx skills add commercetools/commercetools-skills
```

It auto-detects which agent(s) you have installed and drops the skills in the right place. Run `npx skills list` afterward to confirm.

## Claude Code

```text
# Add the marketplace once
/plugin marketplace add commercetools/commercetools-skills

# Install the bundle
/plugin install commercetools@commercetools
```

Plugin contents (skills, agents, MCP) become available immediately. Pin a version with `@<version>` or update with `/plugin marketplace update`.

## Cursor

1. Open Cursor → Settings → **Plugins**.
2. Click **Install from Git URL**.
3. Paste `https://github.com/commercetools/commercetools-skills` and confirm.

Cursor reads `.cursor-plugin/plugin.json` and registers all bundled components.

Official Cursor Marketplace submission (review-gated): tracked in `docs/release.md`.

## VS Code Copilot

1. Open Command Palette → **Chat: Install Plugin From Source**.
2. Paste `https://github.com/commercetools/commercetools-skills`.

VS Code auto-detects the `.claude-plugin/plugin.json` manifest and loads the same skills/agents/MCP as Claude Code.

To install from a marketplace once we submit it, configure `chat.plugins.marketplaces` in settings.

## OpenAI Codex

```bash
# Add the marketplace
codex plugin marketplace add commercetools/commercetools-skills

# Install
codex plugin install commercetools
```

Codex installs the bundle into `~/.codex/plugins/cache/commercetools/commercetools/<version>/`.

## Gemini CLI

```bash
gemini extensions install https://github.com/commercetools/commercetools-skills
```

Pin a version: `--ref v0.1.0`. Local development: `gemini extensions link ./commercetools-skills`.

## Verifying the install

After installing in any tool, ask the agent:

> What commercetools skills do you have?

It should list the skills shipped in this repo (e.g. `ct-api-explorer`). If it doesn't, run the tool's reload command (`/reload-plugins`, restart Cursor, etc.).
