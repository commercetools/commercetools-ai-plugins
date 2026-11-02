# Worked example: high-inventory sell-off promotion agent

**Task.** An agent that finds products sitting on a lot of inventory and creates a promotion to sell them
off. It reads the catalog and inventory, then creates one product discount. It operates on a single
store. It never touches customers, orders, or payments.

Tool names below are illustrative — discover the real ones live ([../references/discover-tools.md](../references/discover-tools.md)).

## 1. Workflow → tools

| Step | Tool |
|---|---|
| Find candidate products (by category / high inventory) | `read_product_search` |
| Read a specific product's details | `read_products` |
| Check inventory levels | `read_inventory` |
| Create the promotion | `create_product_discounts` |

Four tools. No write access to anything but discounts; no customer/order/payment tools.

## 2. Trim and sharpen

Nothing sensitive is in scope, so filtering here is purely about token cost: drop audit metadata
(`createdBy`, `lastModifiedBy`, `createdAt`, `lastModifiedAt`) and the unused `masterData.staged` branch.
Then pin the store and `staged: false` so the agent can't get either wrong, and rewrite the search
description to point at inventory-based discovery.

## Managed MCP Server config

```jsonc
{
  "key": "sell-off-agent",
  "name": { "en": "High-inventory sell-off agent" },
  "state": "Enabled",
  "mcpServer": {
    "type": "CommerceMCP",
    "majorVersion": "v4",
    "tools": ["read_product_search", "read_products", "read_inventory", "create_product_discounts"],
    "toolCustomizations": [
      {
        "tool": "read_product_search",
        "description": "Find products to discount. Use this to locate candidates by category or attribute; pair it with read_inventory to rank by stock on hand. Do NOT use it to read one known product (use read_products with an id). Returns a compact list; prices are not included."
      },
      {
        "tool": "create_product_discounts",
        "description": "Create the sell-off promotion for the products you identified. Create ONE discount targeting the selected products; do not create per-product discounts.",
        "parameters": [
          { "name": "staged", "const": false }
        ]
      },
      {
        "tool": "read_inventory",
        "parameters": [
          { "name": "storeKey", "const": "outlet-store" }
        ]
      }
    ],
    "jsonOutputFiltering": {
      "drop": {
        "fieldNames": ["createdBy", "lastModifiedBy", "createdAt", "lastModifiedAt"],
        "fieldPaths": ["masterData.staged"]
      }
    },
    "toolOutputFormatting": "JsonToTabular"
  }
}
```

Create it with `create_mcp_servers`, passing this draft as `body` — see
[../references/managed-server-api.md](../references/managed-server-api.md). (Parameter names like
`storeKey`/`staged` must match each tool's real input schema — verify with `tools/list`.)

## Test it with a blind run, then iterate

Once the server is `Enabled` and the user has created the runtime client and connected the server to this
session ([../references/test-and-iterate.md](../references/test-and-iterate.md)), spawn a blind
sub-agent. It gets the task and nothing else — no mention of the four tools, the filters, or the pinned
`staged`/`storeKey`:

> You manage inventory for the outlet store. There's a large overstock of last-season road bikes sitting
> in the outlet. Set up a promotion to sell it off. Use only the `sell-off-agent` MCP server's tools;
> assume any approval or notification step is handled. Report which tools you used, whether their
> descriptions were enough, any data you needed but couldn't get, and any response fields you ignored.

What a run like this typically surfaces, and the fix:

| Blind-run finding | Iteration |
|---|---|
| Agent called `read_product_search`, got names but no stock, and couldn't tell which products are actually overstocked. | The search response was over-trimmed for this task — its description already points to `read_inventory`, but the agent expected stock inline. Keep `read_inventory` and add to the search description that stock comes from `read_inventory`, keyed by SKU. |
| Agent tried to set the discount `value` but wasn't sure whether a percentage or absolute amount fit "sell-off". | Sharpen `create_product_discounts`'s description with the project's convention (e.g. relative % for clearances) and an example. |
| Agent never used `read_products` — it worked entirely from search + inventory. | Drop `read_products` from the set. |

Apply with `setTools` / `setToolCustomizations` update actions, have the user reconnect so the new
`tools/list` loads, and re-run the same scenario until it completes cleanly on the first tool choices.

## Self-hosted fallback

Same four tools and the same field trimming, with the store pinned by a context flag instead of a `const`
parameter. Flags are illustrative — confirm current names and defaults against the
[Commerce MCP docs](https://docs.commercetools.com/dev-tooling/mcp/commerce-mcp.md); auth flags omitted.

```json
"args": [
  "-y", "@commercetools/commerce-mcp",
  "--tools=read_product_search,read_products,read_inventory,create_product_discounts",
  "--storeKey=outlet-store",
  "--fieldFiltering={\"properties\":[{\"value\":\"createdBy\",\"type\":\"filter\",\"caseSensitive\":true},{\"value\":\"lastModifiedBy\",\"type\":\"filter\",\"caseSensitive\":true}]}",
  "--toolOutputFormat=tabular"
]
```

It can't rewrite the descriptions or force `staged: false` — that guidance has to live in the agent's own
prompt instead. Exactly the gap that makes Managed the better default.
