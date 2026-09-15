---
name: commercetools-scaffold-anthropic-agent
description: Entrypoint for scaffolding a shopping or merchant agent on the anthropics/commerce-agents packages, backed by commercetools. Clones the commercetools/commercetools-anthropic-agents reference implementation and interviews the user before generating code. Use when the user wants to build an agent (shopping, merchant, or both) backed by commercetools, and no project scaffold exists yet.
---

# Scaffold an Anthropic commerce agent on commercetools

This skill is the starting point for building a shopping agent, a merchant agent, or both, on the
`anthropics/commerce-agents` packages with a commercetools backend. It does not contain the
scaffolding logic itself — that logic, and the reference implementation it is built from, live in
a separate repo: [`commercetools/commercetools-anthropic-agents`](https://github.com/commercetools/commercetools-anthropic-agents).

That repo already did this integration once against a live commercetools project. Its `ct_common/`
is reusable commercetools infrastructure (auth, GraphQL/REST transport, price and id mapping,
caching, error handling), its `CLAUDE.md` is the decision record for every non-obvious choice made
along the way, and its `scaffold-commercetools-agent` command is the actual interview-and-generate
flow this skill hands off to.

## Steps

1. If a local checkout of `commercetools/commercetools-anthropic-agents` does not already exist,
   clone it:

   ```bash
   git clone https://github.com/commercetools/commercetools-anthropic-agents
   ```

2. Change into the clone and run its `scaffold-commercetools-agent` command. That repo registers
   its own plugin (`commercetools-commerce-agent`, via its `.claude-plugin/marketplace.json`) —
   if it is installed as a plugin, run `/scaffold-commercetools-agent` directly. Otherwise, read
   the command body straight from
   `plugins/commercetools-commerce-agent/commands/scaffold-commercetools-agent.md` and follow it.
   Pass along whatever the user has already told you about the agent being built — role
   (shopping, merchant, or both), and the commercetools project key if known.

3. Follow that command's interview, plan-back, and scaffold steps as written. Do not duplicate,
   summarize, or reimplement its logic here — this skill only exists to get the user from "I want
   an agent backed by commercetools" to that repo, with the right context in hand.
