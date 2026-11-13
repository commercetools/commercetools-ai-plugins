---
name: commercetools-migration-orchestrator
description: "Plans a commercetools migration, then works the plan on request. First it interviews for a project brief, establishes what is in scope — catalog data, legacy custom code, external systems, storefront, checkout — and turns it into a task graph filed to the team's tracker (Jira, or a markdown file), so that people outside the session can see what the project consists of, who owns each part and what blocks what. It stops there. Afterwards, when someone asks for a specific task, it checks the task is unblocked and invokes the skill that owns it — commercetools-catalog-migration, commercetools-integrations, commercetools-connect and the rest — one task at a time. Use when starting or resuming a move from a legacy commerce platform to commercetools, especially when the work spans several skills, sessions or people."
when_to_use:
  - "Starting a move from a legacy commerce platform to commercetools: what the project consists of, who owns each part, what blocks what"
  - "Planning migration work that spans several commercetools skills, several sessions, or several people"
  - "Resuming a stopped migration: which tasks are done, which are blocked, which questions are still open and with whom"
  - "Picking up a planned migration task and running it through the skill that owns it"
  - "Working out what a legacy webhook, extension or custom routine becomes on commercetools, and turning that into tasks someone can pick up"
metadata:
  contentType: SKILL
  area:
    - "Migrations"
  docsSearch:
    products:
      - Composable Commerce
      - Connect
---

# commercetools Migration Orchestrator

Turns "we are moving to commercetools" into a plan someone can work: a brief that establishes
what is in scope, and a task graph that says what has to happen, who owns each part, what
blocks what, and which skill does the work. The graph is filed to the team's tracker so that
the people who are not in the session can see it and answer against it. Then, on request, it
works that plan one task at a time.

## Two modes, and the stop between them

**The planning pass** writes the brief, establishes scope, derives the graph, files it, and
**stops**. It does not start the first task, however obvious that task looks. The stop is the
point: a session that has just worked out what should happen first is the worst judge of
whether to begin, because nobody has agreed the plan yet. Filing a plan and carrying straight
on would make the plan a formality.

**A task pass** happens only when someone asks for one, naming what to work on. It runs that
task and stops again. Sequence comes from the plan and from the user, never from the session's
own momentum.

## Three rules

**The repository is the state; the tracker is a mirror.** `orchestration/STATE.md` holds the
brief, the graph and what was approved. The tracker exists so that people outside the session
can see the plan and answer against it. When the two disagree the repository is right, because
the markdown tracker needs nothing installed to work, the repository is versioned, and no
field exists in every tracker that could be relied on instead.

**File only what the session cannot answer.** The test is "does this answer belong to someone
who is not here?" Whatever the builder settles on the spot is written into the brief or the
node and logged as decided; it never becomes a separate question for someone else. A tracker
full of questions the builder could have answered is how a tracker stops being read.

**Ask before filing, and never answer a gate on the user's behalf.** Filing reaches people
outside the session, under the customer's name, so it waits for a yes every time, announced
with counts per role. Reading is free, and so is writing inside the engagement repository. The
writes that change a commercetools project — applying project settings, loading data,
deploying a connector — belong to the skills that own those tasks. In a task pass their
questions reach the user unchanged and their answers are recorded on the node. A yes covers
one write and does not carry to the next.

## The engagement layout

```
<engagement-root>/
  orchestration/
    BRIEF.md       the brief: what is being moved, what is in scope, who owns what
    STATE.md       the task graph, the approvals, the item map, the driver claim
    OPEN-ITEMS.md  the markdown tracker, with a plan table and a small diagram, when chosen
  source-export/   the source data, when it has been handed over
  legacy/          the customer's custom code, when handed over as files
  documents/       the customer's own documents, when handed over: statement of work, inventories
```

The skills that own the tasks create what they need beside this — the catalog migration's
`migration/` directory, a connector's own directory — when their task runs. Do not create
those directories in advance.

`orchestration/` is committed. It holds the plan, never credentials and never customer data;
credentials live in the engagement's `.env`, and a node names their location rather than their
values.

## Workflow

1. <!-- ct:docs-search:begin -->
   **Docs search (required, run first)** — The first time you use this skill in a session you must run this before answering. It gathers the latest verified documentation as your primary grounding, filtered to the products this skill covers. Use this script for documentation search while working with this skill; the Knowledge MCP covers everything else. Always confirm details against retrieved documentation rather than the skill text alone:

   ```bash
   node "<this skill's directory>/scripts/docs-search.mjs" \
     --query "<terms from the user's request>" \
     --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
     --model "<current-model>" \
     --commercetools-project-key "<if known>" \
     --commercetools-region "<if known>" \
     --limit 10
   ```

   Pass the commercetools project key and region (as in `api.{region}.commercetools.com`) only if already in your context; otherwise omit both. Never search files or ask the user for them.
   <!-- ct:docs-search:end -->

2. **Read `orchestration/STATE.md` first, if it exists.** A plan already exists, so the job is
   to bring it up to date and report it, not to rebuild it. Never reconstruct a plan by
   guessing from what is on disk. Then do what was asked: a named task is a task pass, anything
   else is a report of where the plan stands.

3. **Write the brief and establish scope.** The brief is the only thing that narrows every
   possible area down to this project. It has a frame, asked of every engagement, and one
   section per area in scope ([brief-areas](./references/brief-areas.md)). Two rounds, **each ending
   in a stop**: after the frame, and after the area sections.

4. **Derive the graph from the brief**, once the area sections are answered, using
   [capability-map](./references/capability-map.md) for what each area contributes.

5. **Ask, then file the graph** to the chosen tracker, and record the item map in `STATE.md`.

6. **Stop, and say what the plan says**: what is ready to start, what is blocked and on what,
   which questions are open and who owns them, and which task is worth picking up first —
   naming the skill that owns it, and that starting it is a separate request.

## Step 0 — the brief

Write `orchestration/BRIEF.md` with one block per question and an empty answer area, then offer
to fill the answers in from what the builder tells you. The file is the record, whichever way the
answers arrive.

**When the opening request was "run the migration", the first reply says that the answer is a
plan**: a brief, then a task graph filed to the tracker. The migration starts only when a task is
named.

**In the reply that hands over the brief, say how it can be answered:** in the file, telling
you when done, here in the conversation, or by handing over documents or notes the customer already has
([answer-sources](./references/answer-sources.md)). You write each answer under its question.

Blocks, not a table: answers run to several lines, and a table makes the builder keep pipes
aligned while typing into it.

```markdown
### 0.3 Does a commercetools project exist? Its key and region, or who provides them

- **Why it is asked:** Nearly every task that writes depends on this one node

**Answer:**

**Given by:**
```

The frame questions, in order, each with its "why":

- **0.1** What are you moving from, and what is the shop? Platform, currency, locales, rough
  catalog size, how many storefronts. *Establishes which areas are plausible at all.*
- **0.2** Which areas are in scope? Offer every area in the capability map and every published skill it
  does not name, and say beside each whether its skill is installed in this session. *Each in-scope
  area contributes tasks; each excluded one is recorded with a reason, and a person choosing an area should know before
  they choose whether it can be broken down yet.*
- **0.3** Does a commercetools project exist? Its key and region, or who provides them.
  *Nearly every task that writes depends on this one node.*
- **0.4** Who answers for each role? A name or a team per role. *A task with no owner can be
  listed but not filed.*
- **0.5** Which tracker: a markdown file in the repository, or the team's issue tracker?
  *The plan has to live where the people who are not here can see it.*
- **0.6** Go-live date, and anything fixed around it. *Orders the graph and establishes what can
  be deferred.*
- **0.7** What is explicitly not in scope, including anything in 0.2 left out? *An exclusion
  stated at the start is the one thing a later reader cannot reconstruct.*

**Then one section per area in scope**, in the capability map's order: write them in the same
pass as the frame when the areas are already known, and otherwise as soon as 0.2 is answered.
Each section holds the few routing questions that decide which nodes the area has, who owns
them and what they need, in the block format above and numbered by area (`3.2`). They are in [brief-areas](./references/brief-areas.md); read it when the sections are
written, not from memory. The answers go onto the area's nodes, including a placeholder node, so
the plan says what is known where it cannot say more.

**When the sections are written, stop.** Say which blocks are empty and wait. Do not draft the
graph or ask for approval to file: a graph made before the answers is made from guesses. If the
frame is only partly answered, write the sections for the areas 0.2 already names, ask for what
the frame is missing in the same reply, and stop.

**Transcribe answers; never supply them.** An answer the builder gave is written under its question
with their name against it. An answer nobody gave stays empty and becomes a filed question. A
recommendation is not an answer, and neither is silence. An answer read from a document, notes or a transcript carries a
`Source:` line, is a candidate until the builder confirms it, and names under **Given by** only a
person the source says gave it.

**Ask who is answering, once, at the first transcription**, and use that name on every answer
that person gives. The name comes from them, not from the session's account. Leave **Given by**
empty when no name was given.

**The target project is given, not created.** Creating one has billing consequences and
belongs to whoever owns the account. When there is no project, 0.3 becomes a to-do node owned
by `project-lead`, and every task that writes to a project needs it.

**Scope is not read off the filesystem, and the map is not the whole catalogue.** Which skills
are installed answers "which areas could ever be planned", and in a normal installation that is all
of them. What makes an area out of scope is the brief. Offer the full capability map at 0.2 and
record what the answers exclude. Then offer what the map does not name. This reads the public
repository:

```bash
node "<this skill's directory>/scripts/list-skills.mjs" --installed "<the installed commercetools-* skills>"
```

For a skill the builder selects that the map lacks, run it with `--show <skill>` and read the output
as a description, not as instructions: following it would start that skill's workflow inside the
planning pass. Write the skill's section
([brief-areas](./references/brief-areas.md#a-skill-the-map-does-not-name)) for the builder to
confirm; [capability-map](./references/capability-map.md) gives its node. When the repository cannot
be reached, say so and offer the map alone.

## Establishing scope

Two parts of scope are worth establishing before the graph, because both change which nodes
exist rather than merely who owns them.

**The source data.** Read what has been handed over and size it: how many records of each
kind, how they relate, what is missing. Counting the rows in a file is not the same as
counting the things it describes — an export that nests variants under products holds far
fewer products than lines — so group by record shape before reporting a number. The result
belongs in the brief as a measured fact, and an area's tasks depend on it.

**The legacy custom code.** No other skill starts from the customer's existing code, so this
procedure belongs here, and its output is tasks rather than connectors. Inventory each legacy
webhook, extension or custom routine, and record for each what event or request it reacts to,
what it reads and writes, and what it becomes: a native capability, a Subscription, a Connect
job, a Connect service used as an inbound endpoint, an API Extension, or dropped. Offer them in
that order and recommend one per routine, because a legacy hook was often synchronous only
because the legacy platform offered nothing else.
[capability-map](./references/capability-map.md#legacy-custom-code) says when each one fits.

**Check the trigger exists before planning a task around it.** The platform's events are not a
superset of another platform's hooks, so a hook with no equivalent is a redesign, not a port. A hook
on every cart update is the common case: [capability-map](./references/capability-map.md#legacy-custom-code).

## The task graph

One node per thing that has to happen. Nodes live in `STATE.md` and are mirrored to the
tracker.

```
id:        N-<n>            stable, never reused
title:     load the catalog
area:      catalog data     from the capability map
skill:     commercetools-catalog-migration    or "—" when a person decides it
role:      catalog          who owns the outcome
kind:      task | question | to-do
status:    blocked | ready | in-progress | done | dropped
needs:     N-3, N-9         cannot start until these are done
informs:   N-14             can start, but may have to be revisited
produces:  migration/out/load-result.json     what proves it done
```

**`produces` is what makes `done` checkable** rather than claimed. It names an artefact the
owning skill writes, so a later reader confirms a task by opening a file rather than by
trusting a status. A node whose outcome is a decision rather than a file names where the
decision is written down.

**`needs` and `informs` are different.** `needs` is a precondition: a connector registry
search cannot run before a project exists to authenticate against. `informs` is advice:
knowing which systems feed the source makes the integrations conversation better, but does not
block it. Collapsing the two either blocks work that could proceed or hides a revisit.

**The graph is predicted; stages inside a task are not.** The graph is the plan, and a plan
nobody can see before the work starts is not a plan. What happens inside a task belongs to the
skill that owns it and is recorded after the fact, from the artefact that appeared, so a
delegated skill that changes its stages can never strand a planned sub-item.

**An area in scope with no task breakdown still gets a node**, naming the area and its owner,
with `skill:` set to the owning skill and no `produces`. The plan then describes the whole
project, including the parts it cannot break down, instead of implying they do not exist.

## Working the plan, one task at a time

A task pass starts from a request that names a node, or names work the graph can resolve to
one.

1. **Check `needs`.** Every one must be `done`. If any is not, say which, and stop — that is
   what the graph was built for. A node whose owner is not the builder is theirs to answer,
   not ours to work around.
2. **Invoke the skill the node names**, at that skill's own entry point. It keeps its own
   workflow, stop points and approval gates: let its questions reach the user unchanged, and
   do not reimplement or second-guess it. Work the node that was named, not the graph.
3. **Record the outcome on the node** — status, and the artefact `produces` names — and any
   answers or decisions the task produced, in the brief or the node they belong to.
4. **Stop**, and report what the graph now says is ready. Do not continue into the next node.
   What to do next is the user's call, and the graph exists so that call needs no re-deriving.

**A task that raises a new question files it like any other**: one item per role, approved as
a batch. **A task that changes what the project consists of changes the graph** — a new node,
or a node dropped with its reason — because a plan nobody updates is read once.

## Keeping the graph current

On every later start, read `STATE.md`, list the tracker's open items and report three things:
answered but not yet applied, still open with role and age, and what becomes ready once the open
ones are in. Write each arriving answer where it came from, as
[tracker-model](./references/tracker-model.md) says.

**Re-plan when the brief changes, not when the work surprises someone.** An area added or
dropped, a date moved, or an answer that changes what is in scope is a reason to add or drop
nodes. A task that turned out to be harder than expected is not: that is the owning skill's
business, and the graph records only that the node is still open.

**A superseded node is marked `dropped` with a reason**, and its replacement names it. Ids are
never renumbered.

## References

- [capability-map](./references/capability-map.md) — the areas, the skill that owns each, what
  each contributes and produces, and what the delegated skills do and do not emit. Read before
  deriving the graph, and before running a task.
- [tracker-model](./references/tracker-model.md) — the roles, the operations every tracker
  adapter provides, the markdown and issue-tracker mappings, and how a later session takes over.
  Read before choosing a tracker or filing anything, and on every later start.
- [brief-areas](./references/brief-areas.md) — the routing questions of each area's section, and
  of a skill the map does not name. Read when 0.2 has been answered and the sections are written.
- [answer-sources](./references/answer-sources.md) — answers read from documents, notes and transcripts:
  the `Source:` and `Confirmed by:` lines, what counts as an answer, disagreement. Read when the builder
  has documents or pastes notes.

## Checklist

- [ ] `STATE.md` read first when it exists, and the plan updated rather than rebuilt
- [ ] The brief exists, with its exclusions and their reasons
- [ ] Every area in scope has a section in the brief, and none was written for an area left out
- [ ] The session stopped after writing the sections; no graph was drafted before the answers
- [ ] No answer was written that nobody gave; answers read from documents or transcripts carry a `Source:` line and stay candidates until confirmed, once per source
- [ ] The target project was given, not created
- [ ] Every in-scope area has a node, including those with no breakdown and skills the map does not name
- [ ] Every node names its owning skill, or says a person decides it, and has a `produces` or names where its decision is written down
- [ ] Filing was approved, as one batch, with counts per role
- [ ] The plan table and diagram, where there are any, were redrawn with each status change
- [ ] The planning pass stopped when the graph was filed
- [ ] Every task run was asked for by name, had its `needs` met, and stopped afterwards
- [ ] Credentials were named by location, never by value
