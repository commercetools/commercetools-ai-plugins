# commercetools for your AI coding agent

> One install. Your assistant now thinks in commercetools.

Stop pasting commercetools docs into chat. This bundle gives your AI coding agent — **Claude Code**, **Cursor**, **VS Code Copilot**, or **OpenAI Codex** — live access to the commercetools API surface, GraphQL & REST schemas, and the conventions your senior architects already know.

---

## Install in one command

| Your editor | Command |
| :--- | :--- |
| **Claude Code** | `/plugin marketplace add commercetools/commercetools-ai-plugins` <br>`/plugin install commercetools@commercetools` |
| **Cursor** | Settings → Plugins → *Install from Git URL* → `https://github.com/commercetools/commercetools-ai-plugins` |
| **VS Code Copilot** | Command Palette → *Chat: Install Plugin From Source* → `https://github.com/commercetools/commercetools-ai-plugins` |
| **OpenAI Codex** | `codex plugin marketplace add commercetools/commercetools-ai-plugins` <br>then `codex plugin add commercetools@commercetools` (or install via `/plugins`) |
| **Any agent** | `npx skills add commercetools/commercetools-ai-plugins` |

---

## What you get

🔌 **`commercetools-knowledge` MCP server** — live documentation search, GraphQL & OpenAPI schema lookup, query validation, and developer best practices. Public endpoint, no API key needed.

📚 **Skills** — focused playbooks the agent reaches for when you ask about specific commercetools tasks.

🧑‍🏫 **Subagents** — specialized personas the agent can delegate to. The bundle ships with a placeholder; team-authored subagents land in follow-up.

---

## Why this exists

LLMs trained on the open web have stale or wrong information about commercetools APIs. They confuse REST with GraphQL, hallucinate field names, and miss platform-specific conventions like `centAmount`, `ResourceIdentifier`, and the project/store scope split.

This bundle ensures **every commercetools developer's AI assistant has the same authoritative knowledge your team's senior architects have** — at the speed of autocomplete.

---

## Try it

After installing, ask your agent:

> *"Use the commercetools Knowledge MCP to show me how to create a cart with a custom line item."*

The agent will reach for the bundled MCP server, query the live docs, and respond with the right API call — with the right field names, the right scope, and the right caveats.

---

## License

MIT
