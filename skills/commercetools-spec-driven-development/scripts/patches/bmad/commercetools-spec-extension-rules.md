<!-- commercetools-spec-extension:file v=1 id=spec-extension-rules -->
# commercetools Spec Extension Rules

**Not a skill — a rules document.** Loaded as a persistent fact by the
`_bmad/custom/*.toml` overrides beside it. Written and removed by the
`commercetools-spec-driven-development` skill, so hand edits are replaced on the
next `init`.

## Resolve the platform skill

Any brief, PRD, architecture spine, epic, story, spec, task, or implementation
that touches commercetools — its APIs, SDKs, storefronts, Merchant Center apps,
Connect applications, or the Checkout — MUST load the matching `commercetools-*`
skill before that work starts.

Consult the available `commercetools-*` skills (their descriptions and
`when_to_use` are in context) and load the ones that apply. Those descriptions are
the only authority on what each skill covers: resolve against them every time,
never against a remembered or summarized mapping, and never invent a skill name.

Work that does not touch commercetools resolves no skill.

## Annotate the task

A task that touches commercetools carries a `[SKILL: <name>]` token naming the
skill it resolved to. In a Build spec that is the `**Execution:**` list under
`## Tasks & Acceptance`:

- [ ] `src/checkout/session.ts` -- create the payment session -- [SKILL: commercetools-checkout]

Tasks that do not touch commercetools omit the token.

When a spec carries at least one annotated task, add
`{project-root}/_bmad/custom/commercetools-spec-extension-rules.md` to the spec's
frontmatter `context:` list. The implementing agent starts with no conversation
context and loads only the spec and its `context:` files, so this is the only way
these rules reach it.

**Before implementing a task annotated `[SKILL: <name>]`, load that skill.** A
task that turns out to need commercetools APIs but carries no annotation is a
planning defect: resolve the annotation before implementing.

## Verify the API surface

Every commercetools endpoint, GraphQL field, and update action MUST be grounded
in the loaded skill and confirmed with the `commercetools-knowledge` MCP before it
is written:

- `commercetools-graphql-validate` — queries and mutations
- `commercetools-rest-validate` — REST calls
- `commercetools-graphql-schemata` / `commercetools-oas-schemata` — look up fields and types
- `commercetools-documentation-search` — domain and business-logic questions

Never assert an endpoint, field, or update action from memory. When the MCP is
unavailable, say so and cite <https://docs.commercetools.com> instead of guessing.
