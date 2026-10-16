---
name: commercetools-mcp
description: "Connect a coding agent to commercetools Projects through managed Commerce MCP Servers with Merchant Center sign-in, configured per repository, for building and configuring a solution. Points to the documentation for the Knowledge MCP and for other Commerce MCP uses. Use when connecting a coding agent to a commercetools Project, adding another Project to a repository, or continuing that setup after sign-in."
when_to_use:
  - "Connecting a coding agent to a commercetools Project, or adding another Project to a repository"
  - "Continuing a commercetools MCP setup after sign-in"
  - "Asked where to start with managed or self-hosted Commerce MCP, or with the Knowledge MCP"
metadata:
  contentType: SKILL
  area:
    - Foundations
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

## Other uses

Answer other Commerce MCP and Knowledge MCP questions from the documentation:

- Managed MCP Servers for other agents and applications:
  [overview](https://docs.commercetools.com/api/managed-mcp-servers-overview.md),
  [in the Merchant Center](https://docs.commercetools.com/merchant-center/managed-mcp-servers.md),
  [connecting a client](https://docs.commercetools.com/api/managed-mcp-servers-get-started.md#use-the-mcp-server-with-a-client)
- [Self-hosted Commerce MCP](https://docs.commercetools.com/dev-tooling/mcp/self-hosted-commerce-mcp.md)
- Knowledge MCP: [recommended workflows](https://docs.commercetools.com/dev-tooling/mcp/knowledge-mcp.md#recommended-workflows)

## Checklist

- [ ] Development-environment connections follow the repository connection
- [ ] Other Commerce MCP and Knowledge MCP questions answered from the linked documentation
