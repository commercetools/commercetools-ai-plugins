# AI Plugins for commercetools Builders

> Stop pasting commercetools docs into chat. One install makes your agents "think commercetools". You focus on the what.

The official commercetools Plugins gives **Claude Code**, **Cursor**, **VS Code Copilot**, **OpenAI Codex**, or other coding agents access to:

🔌 **commercetools Knowledge MCP** — live up to date documentation search, GraphQL & OpenAPI schema lookup, query validation, and developer best practices. Public endpoint, no API key needed. [--> Read the docs!](https://docs.commercetools.com/sdk/mcp/knowledge-mcp)


🔌 **commercetools Commerce MCP** — The commercetools Commerce MCP enables agent to interact directly with commercetools APIs through function calling. [--> Read the docs!](https://docs.commercetools.com/sdk/mcp/commerce-mcp)

📚 **commercetools Skills** — smoke tested playbooks the agent reaches for to build commercetools solutions. [--> Read the docs!](https://docs.commercetools.com/docs/build-with-ai)

🧪 **commercetools labs** — an optional companion plugin that tracks fast-moving industry developments, so you can adopt new technologies and patterns as they emerge. [See below](#commercetools-labs-optional).

> Get started with the **[Agentic Builder Tutorials](https://docs.commercetools.com/docs/build-with-ai)**

## Plugin installation

| Tool | Command |
| :--- | :--- |
| **Claude Code** | Chat: `/plugin marketplace add commercetools/commercetools-ai-plugins` <br>`/plugin install commercetools@commercetools` <br>Optional: `/plugin install commercetools-labs@commercetools` |
| **Cursor** | Settings → Plugins → *Install from Git URL* → `https://github.com/commercetools/commercetools-ai-plugins` |
| **VS Code Copilot** | Command Palette → *Chat: Install Plugin From Source* → `https://github.com/commercetools/commercetools-ai-plugins` |
| **OpenAI Codex** | Terminal: `codex plugin marketplace add commercetools/commercetools-ai-plugins && codex plugin add commercetools@commercetools` (or install via `/plugins`) <br>Optional: `codex plugin add commercetools-labs@commercetools` |

The bundled `commercetools-knowledge` MCP endpoint is publicly accessible and does not require an API key. Depending on the host tool, you may still need to trust the plugin source, enable the plugin, or reload the tool after installation.


To enable the commerce-mcp, you must export the API client credentials to your CLI/OS environment and reload the plugin.

```
export CLIENT_ID=<client-id> CLIENT_SECRET=<client-secret> PROJECT_KEY=<project-key> AUTH_URL=<auth-url> API_URL=<api-url>
```

## commercetools labs (optional)

**commercetools labs** is a second, optional plugin that ships from this same repository and marketplace. It exists to keep pace with a fast-moving field: emerging agent frameworks, new integration patterns, and techniques that are proving themselves in the industry right now. Labs is where those land first, so you can start building with them early instead of waiting.

Labs is **opt-in and installed separately**. Installing the main `commercetools` plugin never pulls it in, and nothing changes in your setup until you ask for it.

| Tool | Command |
| :--- | :--- |
| **Claude Code** | Chat: `/plugin install commercetools-labs@commercetools` |
| **OpenAI Codex** | Terminal: `codex plugin add commercetools-labs@commercetools` |
| **Cursor / VS Code Copilot** | Same source as above — select `commercetools-labs` in addition to `commercetools` |

Labs builds on the main plugin and requires it: install `commercetools` first, or alongside. Labs ships no MCP servers of its own, because the main plugin already provides them.

**What to expect.** Labs skills move quickly and are not put through the same thorough testing and review as the main plugin's skills. They may change shape, or be removed, more frequently — sometimes because a better approach emerged, sometimes because the underlying technology moved on. Content that proves itself in labs can graduate into the main plugin. For production work where stability matters most, the main `commercetools` plugin remains the reliable baseline.

# Partial installations

| Tool | Command |
| :--- | :--- |
| **All tools: Skills-only installation** | Terminal: `npx skills add commercetools/commercetools-ai-plugins` <br/> Does not auto-update and lacks agents. Run `npx skills update` regularly to update. Covers the main plugin's skills only — labs is available through the plugin installation above. |
| **Knowledge MCP only** | [See its documentation for installation instructions](https://docs.commercetools.com/sdk/mcp/knowledge-mcp) |

## Why this exists

LLMs trained on the open web have stale or hallucinated information about commercetools APIs, capabilites, best practices or the specific business behavior behind the commerce resources. They tend to "invent" features, hallucinate APIs from other commerce vendors, or even generate code that will not scale under load, or even be insecure. 

This bundle ensures **every commercetools developer's AI assistant has the same authoritative knowledge your team's senior architects have** — at the speed of autocomplete.

## Try it

After installing, ask your agent:

> *"Use the commercetools Knowledge MCP to show me how to create a cart with a custom line item."*

The agent will reach for the bundled MCP server, query the live docs, and respond with the right API call — with the right field names, the right scope, and the right caveats.

## Support

For support, installation issues, or questions about these plugins and skills, visit:
https://support.commercetools.com

## License

**Skills & Text**: All Markdown (.md) text is licensed under [Creative Commons BY 4.0](LICENSE). You may freely use, share, and adapt it, provided you give clear attribution to commercetools and indicate if changes were made.

**Code Snippets**: All code, both markdown embedded as well as in its own files, is licensed under [MIT](LICENSE-MIT). 

**Brand Assets**: All rights reserved on the commercetools logo, name, and related trademarks. 