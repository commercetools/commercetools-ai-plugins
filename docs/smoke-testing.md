# Smoke testing

This repo runs two complementary checks in CI:

1. **`ci.yml`** — static checks: regenerate manifests, fail if they drift, run frontmatter + JSON Schema + `claude plugin validate`. Free, offline.
2. **`smoke-test.yml`** — Tier 1 smoke tests: install each supported vendor's CLI in a clean runner, install this plugin from the repo's local files, verify the CLI can see it. No LLM calls.

The smoke test is what catches the bugs JSON Schema can't — things like "the cache-copy step drops a symlink target" or "Cursor's manifest parser is stricter than the schema."

## What's covered

| Vendor | Smoke test | What it asserts |
| :--- | :--- | :--- |
| Claude Code | `claude plugin validate ./` | Manifest + components validate against Claude's own internal schema (which is sometimes stricter than the published JSON Schema) |
| OpenAI Codex | Register `./.agents/plugins` as marketplace → `codex plugin install` → `codex plugin list \| grep commercetools-ai-toolkit` | Marketplace catalog parses, install pipeline succeeds, plugin is discoverable |
| Gemini CLI | `gemini extensions link .` → `gemini extensions list \| grep commercetools-ai-toolkit` | Extension manifest loads, `gemini-extension.json` is well-formed |

## What's NOT covered, and why

| Vendor | Why no smoke test |
| :--- | :--- |
| **Cursor** | GUI-only. No headless CLI exists, so there's nothing to drive from a GitHub Actions runner. Falls back to JSON Schema validation in `ci.yml`. |
| **GitHub Copilot CLI** | `copilot plugin install` accepts `owner/repo`, `owner/repo:path`, or `https://...`, but **not** a local path. We can't install a PR branch's contents this way. Will revisit when local-path or `--ref` install lands. |

## What the smoke test does NOT catch (and what Tier 2 would)

Tier 1 verifies the plugin **installs and is discoverable**. It does NOT verify:

- The MCP server actually answers requests (network path to `https://docs.commercetools.com/apis/mcp`)
- Skill descriptions trigger correctly when the agent is asked relevant questions
- The always-on context actually gets injected on session start
- Agents activate when their `description` matches the user's prompt

Those are Tier 2/3 concerns — they need an actual LLM call and API keys. We'll add a separate `release-smoke-test.yml` workflow for those when we want them, gated on manual dispatch or release events so we don't burn credits on every PR.

## When a smoke test fails

The job logs show the full output of the vendor CLI command that failed. Common failure modes:

- **"plugin not found in list"** — the install step succeeded but the discovery step doesn't see our plugin. Usually means a wrong path in `manifests/meta.json` or the build script. Look at the `tee /tmp/<vendor>-plugins.txt` step output.
- **"validate failed"** — the vendor's own validator rejected the manifest. Means our schema check was too lenient. Add the new rule to `scripts/validate.mjs` or fix `scripts/build.mjs`.
- **Vendor CLI auth prompt** — should not happen for any of the commands we run, but if a vendor changes behavior and starts requiring auth for a local-only command, we'll need to either pass a token or switch to a different verification command.
