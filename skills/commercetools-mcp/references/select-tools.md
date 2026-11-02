# Select the minimal tool set

Tool curation is the highest-leverage decision: every tool you include costs context (its name +
description + input schema) on every request, and every extra tool is one more thing the agent can call
wrongly. This lever works in **both** variants — Managed `mcpServer.tools` and self-hosted `--tools`.

**One server, one job.** Scope the config to a single agent role, not "everything a team might need." A
focused server of ~5–15 tools is the target; if you're approaching the full catalog, it isn't focused.

## Two questions, not one

Task fit is only half the decision. The other half is **who is on the other end of the conversation with
this agent** — because the same workflow warrants a different surface depending on who can steer it. An
agent taking instructions from an anonymous end customer, one used by an employee, and one running
unattended on a trusted internal trigger all deserve different answers, even where the task steps are
identical. Anything a caller can talk the agent into doing is in the blast radius.

So after the user has described the task, ask **who or what invokes this agent, and how much you trust
them.** Ask it openly — do not offer a menu of caller types, for the same reason ground rule 1 forbids
inventing a menu of use cases. Their answer changes which write tools are defensible and how much you lean
on pinned parameters ([tool-customizations.md](./tool-customizations.md)).

## Method

1. Write down the agent's workflow as concrete steps ("find products with inventory > N", "read their
   current price", "create a product discount"). Map tools to the task, not to resources — if a step
   doesn't map to a tool, the agent doesn't need that data.
2. From the live inventory ([discover-tools.md](./discover-tools.md)), pick **one tool per step**. Favor
   search/read tools for discovery and a single specific write tool for the action.
3. **Match the tool to how the project models its data.** If prices are standalone rather than embedded
   on variants, the agent needs the standalone-price read tool, not just `read_products`; if a feature
   isn't used at all, its tools are dead weight ([inspect-project-data.md](./inspect-project-data.md)).
4. **Least privilege.** Include a tool only if the task actually needs it. A read/report agent gets read
   tools only — writing tools widen the blast radius of a bad call. The catalog's `operationType`
   (`read` / `write`) tells you which is which without guessing from the name
   ([discover-tools.md](./discover-tools.md)).
5. **Drop anything speculative.** If you're unsure, leave it out — adding it later is a one-line change
   (Managed: `addTool`; self-hosted: edit `--tools`).

**Prefer explicit tools over broad groups in production.** Groups like `all` and `read_all` are convenient
for exploration, but a production agent should list the individual snake_case tools it needs. `all` is not a
snapshot of today's catalog — it's a standing subscription to whatever ships next:

> The `minor` and `patch` versions are applied automatically. If you have enabled `all` or `read_all` for
> your MCP Server, new tools can become available through an automatic release. If you select tools
> individually, new tools are not added unless you explicitly include them in your configuration.
> — [Versioning](https://docs.commercetools.com/api/managed-mcp-servers-overview.md#versioning)

So a group widens the agent's surface with no config change, no review, and nothing in your diff. The docs
take the same line for both reasons — "For security and performance, only enable the tools required for
your use case, instead of using `all`" — and that holds however much you trust the agent: a trusted agent
still gets tools you never evaluated.

## Output

- **Managed:** a `tools` array on the server sub-object, e.g.
  `"tools": ["read_product_search", "read_products", "read_inventory", "create_product_discounts"]`.
  Names must be unique and valid for the server's `(type, majorVersion)`.
- **Self-hosted:** `--tools=read_product_search,read_products,read_inventory,create_product_discounts`.

Run the proposed set past the user with your reasoning before finalizing — they may spot a step you
missed or a tool that isn't needed.
