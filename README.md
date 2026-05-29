# AI Plugins for commercetools Builders

> Stop pasting commercetools docs into chat. One install makes your agents "think commercetools". You focus on the what.

The official commercetools Plugins gives **Claude Code**, **Cursor**, **VS Code Copilot**, or other coding agents access to:

🔌 **commercetools Knowledge MCP** — live up to date documentation search, GraphQL & OpenAPI schema lookup, query validation, and developer best practices. Public endpoint, no API key needed. [--> Read the docs!](https://docs.commercetools.com/sdk/mcp/knowledge-mcp)
 
📚 **commercetools Skills** — smoke tested playbooks the agent reaches for to build commercetools solutions. [--> Read the docs!](https://docs.commercetools.com/docs/build-with-ai)

🧑‍🏫 **Subagents** — specialized task (sub)agents your agent can delegate standard procedures to. [--> Read the source!](./agents/)

> Get started with the **[Agentic Builder Tutorials](https://docs.commercetools.com/docs/build-with-ai)**

## Plugin installation

| Tool | Command |
| :--- | :--- |
| **Claude Code** | Chat: `/plugin marketplace add commercetools/commercetools-ai-plugins` <br>`/plugin install commercetools@commercetools` |
| **Cursor** | Settings → Plugins → *Install from Git URL* → `https://github.com/commercetools/commercetools-ai-plugins` |
| **VS Code Copilot** | Command Palette → *Chat: Install Plugin From Source* → `https://github.com/commercetools/commercetools-ai-plugins` |

# Partial installations

| Tool | Command |
| :--- | :--- |
| **All tools: Skills-only installation** | Terminal: `npx skills add commercetools/commercetools-ai-plugins` <br/> Does not auto-update and lacks agents. Run `npx skills update` regularly to update. |
| **VS Code: Knowledge MCP only** | [Click here to install](vscode:mcp/install?%7B%22name%22%3A%22commercetools-knowledge%22%2C%22transport%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fdocs.commercetools.com%2Fapis%2Fmcp%22%7D) |


## Why this exists

LLMs trained on the open web have stale or hallucinated information about commercetools APIs, capabilites, best practices or the specific business behavior behind the commerce resources. They tend to "invent" features, hallucinate APIs from other commerce vendors, or even generate code that will not scale under load, or even be insecure. 

This bundle ensures **every commercetools developer's AI assistant has the same authoritative knowledge your team's senior architects have** — at the speed of autocomplete.

## Try it

After installing, ask your agent:

> *"Use the commercetools Knowledge MCP to show me how to create a cart with a custom line item."*

The agent will reach for the bundled MCP server, query the live docs, and respond with the right API call — with the right field names, the right scope, and the right caveats.

