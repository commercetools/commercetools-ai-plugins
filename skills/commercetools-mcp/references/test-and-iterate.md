# Test with blind agent runs, then iterate

Inspection tells you what the data looks like; only a real run tells you whether an agent with **no
design context** can drive the surface you built. Steps 6–8 produce a draft — this is where the config
earns its shape. Loops back into steps 6–8 until the runs come back clean.

## Precondition: a live, connectable server

- **Server `Enabled`** and the **runtime client created by the user** —
  [hand-off](./managed-server-api.md#hand-off-the-agents-runtime-client).
- **Server connected to this session.** Blind sub-agents inherit the session's MCP connections, so the
  user must add the server to the current client (e.g. `claude mcp add`, using the runtime client) and
  reconnect. Then **confirm the tools are callable** — list them, make one real call — before spawning any
  tester. For a cleaner test, ask the user to temporarily disable the design-time connection
  (`ct-{projectKey}`) so it can't leak into the run.

- **On a `CommercetoolsIdentity` server, note whose permissions you're testing.** The surface under test is
  the intersection of your tool list and the signed-in user's Merchant Center permissions, so a tool missing
  from `tools/list` may be a permissions result rather than a config bug — and a test account with wider
  permissions than the real users will pass runs they would fail.

If in-session connection isn't possible, use a fallback (below) — don't skip the test.

## Run blind sub-agents

Each tester gets **only the production task brief** and **nothing about the config**: no chosen tools, no
filter rules, no rationale, no "the intended tool for this step is…". Hand it the design and you're
testing your design notes, not the surface.

Each tester's prompt must:
- State the task exactly as the real agent would get it (from what the user described in step 2), plus
  any starting inputs.
- **Restrict it to the server:** ONLY the `{key}` server's tools; every other tool (broad Commerce MCP,
  Knowledge MCP, web, docs, file search) is unavailable.
- **Mock steps outside the MCP's job** ("assume the notification is sent", "assume the human approved").
- Ask for the report format below.

**Cover a few scenarios** (parallel is fine): the happy path; a realistic variation (different entry
point / phrasing / data); an edge case the real agent will hit; and for a writing agent an
**out-of-scope probe** — a task it should *not* be able to do.

### Report format

- **Completed?** Final action/result, and whether it matches the task.
- **Tool-by-tool:** was each description enough to know *when* and *how* to use it? Right on the first
  call, or fumbled parameters / retried?
- **Missing:** steps with no matching tool; responses lacking a needed field.
- **Excess:** response fields it never used.
- **Wrong-tool / ambiguity:** where it hesitated or two tools looked interchangeable.
- **Parameter friction:** values it guessed; anything constant for this task.
- **Verdict + concrete config-change suggestions.**

Read the actual transcript, not just the summary — a tester often "succeeds" while quietly doing the
wrong thing first.

## Map findings → config levers

| Symptom in the run | Fix |
|---|---|
| Wrong tool chosen / unsure when to use / fumbled the call | Sharpen the description; add when-*not*-to-use ([tool-customizations.md](./tool-customizations.md)) |
| Needed data the response didn't include | Loosen the field filter (over-dropped) or add a missing tool ([field-filtering.md](./field-filtering.md), [select-tools.md](./select-tools.md)) |
| Response carried fields it never used | Tighten the field filter; add `JsonToTabular` for list-heavy tools |
| Guessed a value that's fixed for this agent | `const` it; narrow with `allowedTypes`; `default` for soft ones |
| A tool was never called across all runs | Remove it |
| Overreached / did something out of scope | Remove the tool or pin params to shrink the blast radius |

Propose the changes to the user with the run evidence before applying.

## Apply and re-test

Apply with update actions ([managed-server-api.md](./managed-server-api.md)). **Refresh matters:** tool
set, description, and parameter changes surface via `tools/list`, so the test client must reconnect
before the next round; field-filter changes apply live on `tools/call`. Re-run the same scenarios, but
**cap at ~2–3 rounds and confirm with the user** — past that you overfit to one tester's quirks.

**Exit criteria:** the task completes using only the intended tools with first-try selection; no missing
data; no unused response fields; no parameter guessing on values that should be pinned; no tool went
uncalled; the out-of-scope probe (if run) fails safely.

## Fallbacks (don't skip the test)

- **Can't connect in-session:** ask the user to run a test agent in their own client against the server
  (task brief only, restricted to its tools) and paste back the transcript; iterate from that.
- **Last resort — self-test:** the main agent calls the tools itself. Weaker, since it knows the design;
  to stay honest, use *only* the server's tools, ignore what you know of the filters and tool choices,
  and follow the brief literally. A smoke check, not a blind eval.
- **Self-hosted:** identical method, but the only levers are the tool set and field filtering. If runs
  fail because descriptions are unclear or parameters get misused, that *is* the signal to switch to
  Managed ([choose-variant.md](./choose-variant.md)).
