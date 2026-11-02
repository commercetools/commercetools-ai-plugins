# Connect a Commerce MCP for design work

Every later step runs through a Commerce MCP connected to the user's project: the tool catalog and data
inspection (steps 4–5) need its read tools, and creating or updating the agent's Managed MCP Server
(step 8) needs `create_mcp_servers` and `update_mcp_servers`. This is the **design-time** connection —
separate from the server you're building for the agent.

## Use the repository connection

Connect through the [repository connection](./repository-connection.md): a Managed MCP Server the user
creates in the Merchant Center, signed in with their own Merchant Center account. No API client, no secret
in the chat, the environment, or the repository. Follow its steps as written — it creates the server,
writes the connection, and hands the sign-in back to the user. Once `read_project` succeeds, continue the
agent-server workflow here instead of offering another project.

What the design work needs on top:

- **The management tools.** A development project's connection uses the **All** tool group, which already
  includes `create_mcp_servers` and `update_mcp_servers`. A production project's uses **All read**, which
  doesn't — see [production projects](#production-projects).
- **Permission to manage MCP servers.** The tools a signed-in user sees are capped by their Merchant Center
  permissions; without the Managed MCP Servers permission, the management tools stay hidden even on an
  **All** server.

## Verify before going further

- `read_project` returns the confirmed project's `key` and `name`. A mismatch means the connection points
  at another project — stop.
- `create_mcp_servers` and `update_mcp_servers` are listed. If they aren't, either the server's tools
  don't include them (production) or the user's Merchant Center permissions don't allow managing MCP
  servers. Check `tools/list` rather than guessing which.

## Production projects

The repository connection gives a production project **All read**, so nothing can change there through a
coding agent — and that includes creating MCP servers. Don't widen it to **All**. Instead, offer two
options and let the user choose:

- **Add only the two management tools** to that server in the Merchant Center (the server's tool
  selection), keeping everything else read-only. Data stays unwritable; the session can create and update
  MCP server configs.
- **Design on development, recreate on production.** Build and test the config against a development
  project, then create the final server on production in the Merchant Center from the finished draft.
  Only possible if the development project models its data the same way — check, don't assume
  ([inspect-project-data.md](./inspect-project-data.md)).

## Keep the management tools off the agent's server

Never add `create_mcp_servers` or `update_mcp_servers` to the server you're building for the agent: a tool
that can rewrite MCP server configs lets its caller widen its own surface, undoing the least-privilege work
this skill exists for. They belong on the design-time connection only.

## If you can't make the call yourself

If the management tools aren't available and the user can't enable them, don't stall or fake it: produce
the finished server draft, ask the user to create the server in the Merchant Center from it, and continue
from what they report back. Never invent a result you didn't get.
