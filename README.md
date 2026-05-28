# commercetools for your AI coding agent

> One install. Five tools. Your assistant now thinks in commercetools.

Stop pasting commercetools docs into chat. This bundle gives your AI coding agent — Claude Code, Cursor, VS Code Copilot, OpenAI Codex, or Gemini CLI — **live access** to the commercetools Composable Commerce API surface, GraphQL & REST schemas, and the conventions your senior architects already know.

---

## Install in one command

| Your editor | Command |
| :--- | :--- |
| **Any agent** | `npx skills add commercetools/commercetools-skills` |
| **Claude Code** | `/plugin marketplace add commercetools/commercetools-skills` <br>`/plugin install commercetools@commercetools` |
| **Cursor** | Settings → Plugins → *Install from Git URL* → `https://github.com/commercetools/commercetools-skills` |
| **VS Code Copilot** | Command Palette → *Chat: Install Plugin From Source* → `https://github.com/commercetools/commercetools-skills` |
| **OpenAI Codex** | `codex plugin marketplace add commercetools/commercetools-skills` <sup>1</sup> |
| **Gemini CLI** | `gemini extensions install https://github.com/commercetools/commercetools-skills` |

<sup>1</sup> *Codex marketplace install is currently blocked by an upstream issue — [openai/codex#17066](https://github.com/openai/codex/issues/17066). Tracking.*

Full per-tool walkthrough → [`.internal/docs/install.md`](.internal/docs/install.md)

---

## What you get

🔌 **`commercetools-knowledge` MCP server** — live documentation search, GraphQL & OpenAPI schema lookup, query validation, and developer best practices. Public endpoint, no API key needed.

📚 **Skills** — focused playbooks the agent reaches for when you ask about specific commercetools tasks (API exploration, cart debugging, custom object modeling, …).

🧑‍🏫 **Subagents** — specialized personas the agent can delegate to (e.g. architecture decisions, support debugging). Bundle ships with a placeholder; team-authored subagents land in follow-up.

📌 **Always-on context** — every session opens knowing it's working on commercetools. No more re-explaining the cart-to-order lifecycle.

---

## Why this exists

LLMs trained on the open web have stale or wrong information about commercetools APIs. They confuse REST with GraphQL, hallucinate field names, and miss platform-specific conventions like `centAmount`, `ResourceIdentifier`, and the project/store scope split.

This bundle ensures **every commercetools developer's AI assistant has the same authoritative knowledge your team's senior architects have** — at the speed of autocomplete.

---

## Try it

After installing, ask your agent:

> *"Use the commercetools Knowledge MCP to show me how to create a cart with a custom line item."*

The agent will reach for the bundled MCP server, query live docs, and respond with the right API call — with the right field names, the right scope, and the right caveats.

---

## Contributing

This repo is open to commercetools team contributions. See the contributor guide for repo layout, authoring workflow, and release process:

→ [`.internal/docs/contributing.md`](.internal/docs/contributing.md)

## License

MIT — see [`manifests/meta.json`](.internal/manifests/meta.json).
