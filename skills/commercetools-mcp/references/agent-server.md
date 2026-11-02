---
name: Agent MCP server
description: Design a focused Commerce MCP configuration for one agent — minimal tools, filtered responses, task-specific descriptions and pinned parameters — create the managed MCP Server, and validate it with blind agent runs.
metadata:
  contentType: REFERENCE
---

# Configure a focused Commerce MCP

The base Commerce MCP is a broad translation of the commercetools API: 100+ tools, each with many
parameters and verbose responses. Handing all of that to an agent with one job wastes context and invites
wrong tool calls. **You do not build new tools — you subtract and sharpen** an existing surface down to
what one agent needs.

Two config targets, same underlying tools (snake_case) and filtering engine:
- **Managed MCP Server** (preferred) — hosted by commercetools; the agent's credential is scoped to *only
  this server*, so a leak can't reach beyond its curated tools and filtered fields. Supports per-tool
  description overrides and parameter constraints.
  [API reference](https://docs.commercetools.com/api/projects/managed-mcp-servers.md),
  [overview](https://docs.commercetools.com/api/managed-mcp-servers-overview.md).
- **Self-hosted `@commercetools/commerce-mcp`** (fallback) — CLI flags / `mcp.json`; tool curation and
  field filtering only.

## Ground rules

You do the legwork, the user supplies intent and confirms fit. These four rules govern every step below
and keep the skill from producing a confident, wrong config.

- **The task comes from the user — don't invent it.** Ask an **open** question and let them describe the
  agent's job in their own words. **Never present a multiple-choice menu of use cases** ("Read/analyze
  catalog", "Customer support", …) — invented options are still inventing the task, and push the user
  into a box that may not fit. If the answer is vague, ask open follow-ups until you can name the
  concrete workflow steps.
- **Work on the project the user points you at — don't go hunting.** Confirm the project (region + key)
  and read it through a Commerce MCP they have connected. Never search the disk, `.env` files, or other
  projects for a project key or credentials — a stray credential is almost never the one they meant, and
  creating a server in the wrong project is hard to undo.
- **Ground every choice in real data; never guess.** Which tools are correct, what to filter, and how to
  describe tools all depend on how *this* project models its data. If you can't inspect it, get the data
  from the user — never fall back to a generic config built from assumptions.
- **Propose, then confirm.** Show your proposal and reasoning for the choices that decide fit — tools,
  dropped/redacted fields, descriptions — and adjust before finalizing or creating anything. They know
  the business; you know the data.

## Workflow

Always follow these steps:

1. <!-- ct:docs-search:begin -->
   **Docs search (required, run first)** — The first time you use this skill in a session you must run this before answering. It gathers the latest verified documentation as your primary grounding, filtered to the products this skill covers. Use this script for documentation search while working with this skill; the Knowledge MCP covers everything else. Always confirm details against retrieved documentation rather than the skill text alone:

   ```bash
   node "<this skill's directory>/scripts/docs-search.mjs" \
     --query "<extract key terms — the resources/operations the agent needs>" \
     --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
     --model "<current-model>" \
     --commercetools-project-key "<if known>" \
     --commercetools-region "<if known>" \
     --limit 10
   ```

   Pass the commercetools project key and region (as in `api.{region}.commercetools.com`) only if already in your context; otherwise omit both. Never search files or ask the user for them.
   <!-- ct:docs-search:end -->

2. **Establish the task, its callers, and the target project** — Per ground rules 1 and 2. Also ask **who
   or what invokes this agent, and how far they're trusted** — it shapes the tool set as much as the task
   does ([select-tools.md](./select-tools.md)).

   Then make sure a Commerce MCP is **connected to that project** — every later step reads or writes
   through it. If none is, or it lacks the MCP-server tools, walk the user through the setup now, in one go
   → [connect-commerce-mcp.md](./connect-commerce-mcp.md).

3. **Choose the variant** — **Default to Managed and recommend it**, including for local development.
   Pick self-hosted *only* for the two reasons in [choose-variant.md](./choose-variant.md).

4. **Discover the available tools** — Pull the live inventory; never design against a memorized list →
   [discover-tools.md](./discover-tools.md).

5. **Inspect the project's real data (required)** — The step that makes the config correct, per ground
   rule 3 → [inspect-project-data.md](./inspect-project-data.md).

6. **Curate the minimal tool set** — Least privilege, grounded in step 5 →
   [select-tools.md](./select-tools.md).

7. **Strip and sharpen** —
   - Field filtering (both variants): drop noise, redact sensitive fields →
     [field-filtering.md](./field-filtering.md).
   - Tool customizations (Managed only): rewrite descriptions for the task, pin/constrain parameters →
     [tool-customizations.md](./tool-customizations.md).

8. **Emit / apply the config** —
   - Managed: assemble the draft, create/update the server with the Commerce MCP's `create_mcp_servers` /
     `update_mcp_servers` tools, and tell the user how to create the agent's runtime client →
     [managed-server-api.md](./managed-server-api.md).
   - Self-hosted: emit the `mcp.json` / CLI config → [choose-variant.md](./choose-variant.md).

9. **Test with blind agent runs, then iterate (required)** — A config drafted from data inspection is a
   first guess. Validate it by having a fresh agent with **no design context** attempt the task using only
   this server; feed the findings back into steps 6–8 and re-run until clean →
   [test-and-iterate.md](./test-and-iterate.md).

### Optional scripts

**Fetch OpenAPI (REST) schema** — inspect a resource's payload/response shape before deciding filters or
which tool parameters matter:
```bash
node "<this skill's directory>/scripts/openApi-schemata.mjs" \
  --resource-name "<e.g. api-Product-read, api-Customer-read, api-CartDiscount-write>" \
  --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
  --model "<current-model>"
```

## Output

Close with a short report — the user needs to know what now exists and what is still on them:

```markdown
## Managed MCP Server: <key>
- **URL:** <mcpServer.url> · **State:** Enabled · **Auth:** ClientCredentials | CommercetoolsIdentity
- **Tools (N):** <list> — <one line on the scope this covers>
- **Filtering:** <what's dropped/redacted, and why> · **Formatting:** <if set>
- **Customizations (N):** <tool> — <one-line reason each>
- **Blind runs:** <scenarios run, what they hit, what changed as a result>
- **Over to you:** create the runtime client at <Merchant Center link to the server's new-API-client form>,
  connect it, export the token before launching the client. Token expires <date> — plan the refresh.
```

For a self-hosted config, report the emitted `mcp.json` and the client scopes it needs instead.

## Worked example

[examples/sell-off-inventory-agent.md](../examples/sell-off-inventory-agent.md) walks the method end to end
for an agent that finds high-inventory products and creates a promotion to sell them off — as both a
Managed config and a self-hosted fallback.

## Checklist

Before shipping a config:
- [ ] Task came from an open question to the user; tools, filters, and descriptions were confirmed with them.
- [ ] Project (region + key) confirmed and inspected through a Commerce MCP — no credentials scavenged from disk or pasted into the chat.
- [ ] Design-time connection signed in through the Merchant Center (no API client); on production, widened by the two management tools at most.
- [ ] Tool selection, filtering, and descriptions came from real project data, not assumptions.
- [ ] Least privilege: only the tools the task needs, read-only unless it must write, no broad `all` group in production.
- [ ] Who invokes the agent — and how much they're trusted — was asked and factored into the tool set.
- [ ] Tool names and parameters verified against the live catalog, and matched to how this project models its data.
- [ ] Responses trimmed to what the task reads; PII exposed only where the task needs it; list-heavy tools formatted or paginated.
- [ ] Parameters the agent shouldn't choose are pinned (Managed `const` / self-hosted context flags) — e.g. store key, `staged`.
- [ ] Descriptions (Managed) are task- and project-specific, and were written from the default text rather than replacing it blind — the agent never sees the original.
- [ ] `state: "Enabled"` — new servers default to `Disabled`. `authenticationMode` was set explicitly, not defaulted into.
- [ ] `create_mcp_servers` / `update_mcp_servers` are not on the agent's own server — they let it widen its own surface.
- [ ] Blind runs passed and the config was iterated on their findings, not shipped as the first draft.
