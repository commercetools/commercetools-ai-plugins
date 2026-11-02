# Inspect the project's real data

The commercetools data model is highly configurable: two projects expose the same resources but model
their data very differently, and the generic schema can't tell you which choices a project made. **Look
at the real data.** It shapes all three levers — which tools are correct, how to describe them, and what
to filter. This is the highest-value step in the workflow.

**Read it through a Commerce MCP, not raw credentials** — no API client is needed here. First confirm the
connected MCP can reach what you need (products, categories, custom objects, …) and points at the project
the user named. **If it can't**, walk the user through connecting one
([connect-commerce-mcp.md](./connect-commerce-mcp.md)). As a last resort they can run the reads
themselves and share the output. Never work around a missing read path with raw credentials, and never
emit a tool selection, filter, or description you haven't grounded in real data.

## Response shapes

Commerce MCP tools wrap commercetools API resources, so a tool's response fields map to that resource's
API fields. To decide what to drop or redact ([field-filtering.md](./field-filtering.md)), fetch the
resource schema with `openApi-schemata.mjs` (invocation in the skill's *Optional scripts* section) rather
than guessing field names.

The best signal of all is a **real `tools/call` response**: call the tool once against a representative
project and read the actual payload — that shows you the concrete field names, nesting, and the volume of
data you'll want to trim.

## How the project uses the model

**Which tools to select.** Feature choices map to different tools. Prices can be **embedded** on product
variants or modelled as **standalone prices** (a separate resource with its own tool) — the right read
tool differs, and the wrong one gives the agent a tool that returns nothing useful. If the project doesn't
use a feature at all, don't include its tools ([select-tools.md](./select-tools.md)).

**What to filter.** Custom fields (`custom.fields.*`, defined via Types) and custom objects are
project-defined and opaque in the generic schema. They may hold critical business data or pure integration
noise — you can only tell by reading real values.

**How to describe tools.** Descriptions need project-specific knowledge baked in
([tool-customizations.md](./tool-customizations.md)); the facts below are what feeds them.

## What to inspect

Use the MCP read tools themselves, or the API. Always load a few items before customizing any tool, plus
related items that are linked (e.g. categories link to products and can be used to search or filter):
- **Catalog structure** — top-level categories; product types and their attribute definitions (keys and
  allowed values).
- **Pricing model** — embedded vs standalone prices; whether price channels / stores are in play.
- **Custom data** — the Types (custom-field definitions) on the resources in scope, plus a few real
  objects to see what those fields actually hold; and any custom objects relevant to the task.
