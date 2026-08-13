<!-- commercetools-spec-extension:begin v=1 id=platform-skills-constitution -->
## commercetools Platform Skills (commercetools-spec-extension overlay)

These articles are non-negotiable for any work that touches commercetools.

### Article: Platform skill resolution
Any specification, plan, task, or implementation that touches commercetools —
its APIs, SDKs, storefronts, Merchant Center apps, Connect applications, or the
Checkout — MUST first load the matching `commercetools-*` skill. Consult the
available `commercetools-*` skills (their descriptions are in context) during
planning to decide which skills apply.

### Article: Task annotation
Every task that touches commercetools MUST carry a `[SKILL: <name>]` annotation,
resolved during planning. A task that turns out to need commercetools APIs but
carries no annotation is a planning defect: return to the plan step and resolve
it before implementing.

### Article: Verified API surface
Every commercetools endpoint, GraphQL field, and update action MUST be grounded in
the loaded skill and confirmed with the `commercetools-knowledge` MCP before it is
written: `commercetools-graphql-validate` for queries and mutations,
`commercetools-rest-validate` for REST calls, and `commercetools-graphql-schemata`
or `commercetools-oas-schemata` to look up fields and types.
<!-- commercetools-spec-extension:end id=platform-skills-constitution -->
