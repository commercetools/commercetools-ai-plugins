---
name: commercetools-mcp
description: "Connect a coding agent to commercetools Projects through managed Commerce MCP Servers with Merchant Center sign-in, configured per repository, and design focused Commerce MCP Servers for other agents: minimal tools, filtered responses, task-specific descriptions, validated with blind agent runs. Points to the documentation for the Knowledge MCP. Use when connecting a coding agent to a commercetools Project, continuing that setup after sign-in, or giving an agent only the Commerce MCP tools and data its task needs."
when_to_use:
  - "Connecting a coding agent to a commercetools Project, or adding another Project to a repository"
  - "Continuing a commercetools MCP setup after sign-in"
  - "Building a Commerce MCP surface for a specific agent: least-privilege tools, smaller responses, redacted fields"
  - "Creating or updating a Managed MCP Server, or emitting a self-hosted commerce-mcp config, for an agent"
  - "Asked where to start with managed or self-hosted Commerce MCP, or with the Knowledge MCP"
metadata:
  contentType: SKILL
  area:
    - Foundations
  docsSearch:
    products:
      - Composable Commerce
---

# commercetools MCP

| Server | Gives an agent | Access |
| :----- | :------------- | :----- |
| [Knowledge MCP](https://docs.commercetools.com/dev-tooling/mcp/knowledge-mcp.md) | Documentation search, GraphQL and OpenAPI schemas, query validation | Public, no sign-in. Bundled with this plugin. |
| [Commerce MCP](https://docs.commercetools.com/dev-tooling/mcp/commerce-mcp.md) | Tools that read and change Project data | Needs access to a Project. Managed (hosted by commercetools, configured in the Merchant Center) or self-hosted (you run the open-source package). |

## Connect your development environment

For a coding agent that reads and configures a Project while you build a solution, follow
[Repository connection](./references/repository-connection.md). Each developer signs in with their
Merchant Center account through a managed MCP Server, and the connection is shared through the
repository.

## Configure an MCP server for an agent

For an agent with one job, such as a support assistant or a promotion agent, follow
[Agent MCP server](./references/agent-server.md). It cuts the Commerce MCP down to the tools and fields
the task needs, sharpens tool descriptions and parameters, creates the managed MCP Server (or emits a
self-hosted configuration), and tests it with blind agent runs. The design work itself runs through the
repository connection.

## Other uses

Answer other Commerce MCP and Knowledge MCP questions from the documentation:

- [Managed MCP Servers overview](https://docs.commercetools.com/api/managed-mcp-servers-overview.md)
- [Self-hosted Commerce MCP](https://docs.commercetools.com/dev-tooling/mcp/self-hosted-commerce-mcp.md)
- Knowledge MCP: [recommended workflows](https://docs.commercetools.com/dev-tooling/mcp/knowledge-mcp.md#recommended-workflows)

## Checklist

- [ ] Development-environment connections follow the repository connection
- [ ] MCP servers for other agents follow the agent MCP server workflow, including its blind runs
- [ ] Other Commerce MCP and Knowledge MCP questions answered from the linked documentation
