# Choose the variant: Managed vs self-hosted

Both variants run the **same Commerce MCP tools** (snake_case names) and the **same field-filtering
engine** (`@commercetools/processors`). They differ in hosting, configuration surface, and a few
capabilities.

> Flags, config field names, and per-variant capabilities change over time. Treat the specifics below as
> orientation and **read the current docs before finalizing**:
> [Commerce MCP docs](https://docs.commercetools.com/dev-tooling/mcp/commerce-mcp.md) and the
> [`@commercetools/commerce-mcp`](https://www.npmjs.com/package/@commercetools/commerce-mcp) README for
> self-hosted; [managed-server-api.md](./managed-server-api.md) for Managed.

> Version alignment: the managed Commerce MCP `v4` tool set matches self-hosted Commerce MCP `4.0.0` and
> up. This skill assumes that shared snake_case tool set — for self-hosted, use `4.0.0`+; earlier
> releases expose a different, older tool surface.

## Default to Managed

**Choose self-hosted only for the two cases the docs call out:** building **completely custom tools**
beyond customizing existing ones, or embedding the tool code **directly in an AI agent framework**
(LangChain, Vercel AI, Mastra, …) without a dedicated MCP server. Otherwise present Managed as the
recommendation.

Managed wins on two counts. The sharpening levers this skill is built around — description overrides and
pinned parameters — are Managed-only. And the credential blast radius is far smaller: the agent's
credential is scoped to **only this MCP server**, so a leak reaches just the curated tools and filtered
fields. Self-hosted hands the agent process a **broad CT API client** whose scopes cover whole resources
(e.g. all of `view_products`), so a leak grants direct API access that bypasses your curation and
filtering entirely — the confused-deputy problem.

**Not reasons to pick self-hosted:** *"easier to run locally"* (creating the Managed server is a couple of
tool calls you make for the user; Managed is the right default for local dev too) or *"it matches an
existing `commerce-mcp`"* (a broad dev server is a different thing from a locked-down, task-focused one —
don't reuse it as the agent's surface).

## Capability differences (verify against current docs)

| Lever | Self-hosted | Managed | Configured via |
|---|---|---|---|
| Curate the tool set | Yes | Yes | self-hosted: tools flag · Managed: `tools` ([select-tools.md](./select-tools.md)) |
| Filter / redact response fields | Yes | Yes | self-hosted: field-filtering flag (stringified `FieldFilteringManagerConfig`) · Managed: `jsonOutputFiltering` ([field-filtering.md](./field-filtering.md)) |
| Compact output formatting | Yes | Yes | self-hosted: output-format flag · Managed: `toolOutputFormatting` |
| Pin operating context (store, etc.) | Yes | Yes | self-hosted: store/customer/cart/business-unit/admin flags · Managed: parameter `const` |
| Override individual tool **descriptions** | No, at time of writing | Yes | Managed: `toolCustomizations` ([tool-customizations.md](./tool-customizations.md)) |
| Constrain individual tool **parameters** (`const`/`default`/`allowedTypes`) | No, at time of writing | Yes | Managed: `toolCustomizations` |

Tool curation and field filtering exist in both, so a focused config is achievable either way. Look flag
names up live rather than memorizing them, and confirm the per-tool reshaping gap against current
self-hosted docs — the feature set moves.

## Self-hosted registration shape

Self-hosted runs as an MCP server (stdio locally, or a remote mode). Register it in `mcp.json` roughly
like this — **fill in the current flags from the docs**, don't copy a fixed list:

```jsonc
{
  "mcpServers": {
    "commerce-mcp": {
      "command": "npx",
      "args": [
        "-y", "@commercetools/commerce-mcp",
        // tools, auth (project key + client credentials or access token), field filtering,
        // output format, context pinning, dynamic tool-loading threshold, remote/stateless, etc.
        // → see the Commerce MCP docs for the current flags and their defaults.
      ]
    }
  }
}
```

Keep credentials in env vars / a secrets manager — never commit them. (The credential-free commercetools
Knowledge MCP is safe to commit; the Commerce MCP, which carries project credentials, is not.)
