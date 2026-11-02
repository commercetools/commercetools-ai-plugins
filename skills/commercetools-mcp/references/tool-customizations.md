# Tool customizations (Managed MCP Server only)

After curating the tool set, sharpen each survivor. `toolCustomizations` (a) replaces a tool's generic API
description with task-specific guidance and (b) constrains its parameters. Self-hosted has no equivalent
for built-in tools — for context you'd use CLI flags (`--storeKey`, etc.).

Applied at the gateway: descriptions merge into `tools/list`; parameter rules are enforced on
`tools/call`.

## Shape

```jsonc
"toolCustomizations": [
  {
    "tool": "read_product_search",          // required; must be one of the server's tools
    "description": "…",                       // optional: overrides the default description entirely
    "parameters": [                            // optional: per-parameter overrides
      {
        "name": "storeKey",                    // required; must exist in the tool's input schema
        "description": "…",                     // optional
        "const": "main-store",                  // optional: fixes the value; agent cannot change it
        "default": "main-store",                // optional: fills the value when the agent omits it
        "allowedTypes": ["main-store", "secondary-store"]  // optional: restricts to an allowed set
      }
    ]
  }
]
```

### Rules (enforced; violating them is rejected at write time)
- Each entry needs **at least one** of `description` or `parameters`.
- Each parameter override needs **at least one** of `description`, `const`, `default`, `allowedTypes`.
- `const` is **mutually exclusive** with both `allowedTypes` and `default`.
- `tool` must be one of the server's `tools`; each parameter `name` must resolve to a property in that
  tool's input schema (value types must match the schema). Duplicate `tool` entries or duplicate parameter
  `name`s are rejected.
- Description **overwrites** the default (no append) — you own the full text.

### What each parameter lever is for
- **`const`** — remove a decision entirely. The agent never sees a choice and can't get it wrong. Use for
  anything that is fixed for this agent: a store key, `staged: false`, a channel, a currency.
- **`allowedTypes`** — narrow a choice to the values that make sense for the task, without hardcoding one.
- **`default`** — supply a sensible value the agent may still override (e.g. a page `limit`).

### What parameter overrides can't do

An override targets **one named parameter** of the tool's input schema. That is a poor fit for `update_*`
tools, which funnel many differently-typed update actions through a single `actions` array — some harmless
for a low-trust caller, others not. There is no documented way to restrict *which action types* that array
accepts, so **granting an `update_*` tool grants every action it accepts.**

Treat this as the limit of the config as a security boundary: for a lower-trust caller, either leave the
tool out, or make it explicit that the calling application must allowlist the actions it forwards. Don't
present a broad `update_*` tool as safely scoped just because you filtered its response fields.

If you need this narrowed, attempt an override on the nested action path and see whether the API accepts it
— a rejection at write time is a definitive answer, and it's cheap to test. Only claim it works after
you've seen it work.

## Writing a good description override

The description is the agent's only instruction for when and how to use the tool. Make it **narrow,
unambiguous, and task-specific** — what *this* agent should use it for, not what the API does.

**Start from the default text, don't discard it.** An override replaces the original, so the agent never
sees the default again and anything useful in it is gone unless you carry it forward:

> Your AI agent won't have the original tool description available. Base your new tool description on the
> existing one, so that your AI agent has all the information it needs to use the tool correctly.
> — [Customize for AI accuracy](https://docs.commercetools.com/api/managed-mcp-servers-overview.md#customize-for-ai-accuracy)

Some defaults are load-bearing — search tools in particular document their own error codes and retry
guidance — and an override carrying only your project-specific notes silently drops that. So read the
current description first (the tool catalog or `tools/list`,
[discover-tools.md](./discover-tools.md)), then write one that keeps what was working and adds what's
missing. This is about not losing information, not about staying generic.

A strong override covers:
- **What it does** in one line, scoped to the agent's job.
- **When to use / when not to use** — steer away from tempting-but-wrong tools.
- **Key parameters** the agent must set, with example values.
- **What it returns** at a high level (especially after filtering — describe the *trimmed* shape).
- **Project-specific knowledge** that makes the tool usable here — this is the highest-value part of an
  override and the one a generic API description can never give.

Bake in what the project actually looks like — "search products" is a different job in a grocery retailer
than in a bicycle store, and the agent can't know the difference unless you tell it. For a search or query
tool, fold in the facts from [inspect-project-data.md](./inspect-project-data.md): the **top-level
categories**, the **product-type attributes worth filtering/searching by** (keys and allowed values), and
any domain vocabulary. Same for tools touching custom fields — name the fields that matter and what they
mean.

Example (sell-off agent's search tool, for a project whose catalog you've inspected):

```
Search the catalog for products to discount. Use this to find candidates by category or attribute —
NOT to read a single known product (use read_products with an id).
This project's top-level categories are: Road, Mountain, E-Bikes, Apparel, Accessories.
Useful filter attributes: frameSize (enum: xs|s|m|l|xl), wheelSize (in inches), color, brand.
Returns a compact list of { id, name, key, totalInventory } (other fields are filtered out).
Set `limit` to at most 50. Prices are not included here — read them separately if needed.
```

Keep it tight: the override competes for the same context window the tools are meant to save. Include the
project facts that change how the agent searches — not the whole category tree or every attribute.

Confirm the description with the user — they know which categories, attributes, and vocabulary their
agent should lean on, and can catch a misleading example before it ships.
