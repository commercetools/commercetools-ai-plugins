---
name: commercetools-spec-driven-development
description: Wire the commercetools skills into a spec-driven development framework — GitHub Spec Kit (.specify/), OpenSpec (openspec/), or BMad Method (_bmad/). Use when user wants to set up or check the status of a spec-driven development framework that touches commercetools.
when_to_use:
  - "Setting up GitHub Spec Kit, OpenSpec, or the BMad Method in a project that touches commercetools, or wiring commercetools into an existing one"
  - "Checking the status of, or removing, the commercetools spec-driven-development overlay"
metadata:
  contentType: SKILL
  area:
    - Foundations
  docsSearch:
    products:
      - Composable Commerce
      - Checkout
      - Connect
      - InStore
      - AI Hub
---

# commercetools Spec-Driven Development Overlay

Makes a spec-driven development framework commercetools-aware, so every spec, plan, and task that touches commercetools loads the matching `commercetools-*` skill first. The framework keeps owning the workflow — this only adds commercetools rules through the surface each framework already offers for that.

| Detected directory | Framework | How the overlay applies |
| :--- | :--- | :--- |
| `.specify/` | GitHub Spec Kit | Marker-fenced blocks in files it already has; creates no files |
| `openspec/` | OpenSpec | Marker-fenced blocks in files it already has; creates no files |
| `_bmad/` | BMad Method | Sparse override files in `_bmad/custom/`, the directory BMad contracts for this |

Any combination present means each detected framework gets the overlay. BMad never has its installed files edited: it regenerates them on every install, so patching them would be destructive.

## Workflow

1. <!-- ct:docs-search:begin -->
   **Docs search (required, run first)** — The first time you use this skill in a session you must run this before answering. It gathers the latest verified documentation as your primary grounding, filtered to the products this skill covers. Use this script for documentation search while working with this skill; the Knowledge MCP covers everything else. Always confirm details against retrieved documentation rather than the skill text alone:

   ```bash
   node scripts/docs-search.mjs \
     --query "<extract key terms from the user's question>" \
     --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
     --model "<current-model>" \
     --limit 10
   ```
   <!-- ct:docs-search:end -->

   Query the commercetools areas the project targets, not the framework's own terminology — those results are what let you fill in the plan's "Platform Skills Resolution" table later. This script queries the same index as the commercetools Knowledge MCP, with the product filters this skill needs — use it rather than the MCP tool while working in this skill.

2. **Run the setup script (required, do the work with this)** — never hand-edit the framework's files to apply the overlay; the script is idempotent and reversible, hand edits are neither:

   ```bash
   node scripts/setup.mjs
   ```

   | Argument | Effect |
   | :--- | :--- |
   | *(none)* or `init` | Apply the overlay to every detected framework |
   | `status` | Report what is applied; writes nothing |
   | `remove` | Strip applied blocks and delete files the overlay wrote |
   | `--dry-run` | Preview `init`/`remove` without writing |
   | `--framework speckit\|openspec\|bmad` | Act on one framework only |
   | `--cwd <dir>` | Target a project other than the current directory |

3. **Report what the script printed**, and handle these outcomes:

   - **No framework detected** (exit 4) — tell the user to run `specify init` (Spec Kit), `openspec init` (OpenSpec), or `npx bmad-method install` (BMad) first, then re-run. Do not create those directories yourself.
   - **A target file was skipped as missing** — the framework is only partially initialized. Name the missing file; do not create it.
   - **An anchor was not found** — the upstream template changed, so the block was appended at end-of-file instead of at its intended heading. It still works; say the placement is not ideal.
   - **Unsupported framework variant** (exit 5) — the install predates the override surface the overlay needs. Relay the upgrade command the script named; do not work around the gate.
   - **Rolled back** (exit 6) — a written override failed the framework's own resolver and every write was reverted. Nothing is applied; report the named failure verbatim.
   - **A target was skipped as not ours**, **validation could not run**, or **an override is inert because the skill is not installed** — BMad-specific. None is silent, so none may go unmentioned.
   - **Applied, or already up to date** — state which files changed and stop.

## What the overlay adds

| Framework | File | Adds |
| :--- | :--- | :--- |
| Spec Kit | `.specify/memory/constitution.md` | Non-negotiable articles: resolve the platform skill, annotate tasks, never invent API surface |
| Spec Kit | `.specify/templates/plan-template.md` | A "Platform Skills Resolution" table mapping each architectural area to its skill |
| Spec Kit | `.specify/templates/tasks-template.md` | The `[SKILL: <name>]` task-grammar extension |
| OpenSpec | `openspec/config.yaml` | `context:` guidance plus `rules:` for the proposal and tasks artifacts |
| BMad | `_bmad/custom/commercetools-spec-extension-rules.md` | The three rules — resolve the skill, annotate the task, verify the API surface — loaded as a persistent fact by every override below |
| BMad | `_bmad/custom/bmad-agent-{dev,pm,architect}.toml` | Agent-scope facts and principles, inherited by every workflow that agent dispatches |
| BMad | `_bmad/custom/bmad-{prd,architecture,spec,create-epics-and-stories}.toml` | Planning-workflow facts; `bmad-architecture` also gets `commercetools-knowledge` MCP consultation and an API-surface review lens |
| BMad | `_bmad/custom/bmad-build.toml` | The `[SKILL: <name>]` task grammar — emitted at planning, carried to the implementation subagent via the spec's `context:` list |

Patch-mode blocks are fenced by `commercetools-spec-extension:begin` / `commercetools-spec-extension:end` markers. Re-running `init` replaces a block in place rather than duplicating it, and `remove` restores the file to its original bytes. Write-mode files carry a `commercetools-spec-extension:file` marker on their first line; `init` replaces only files carrying it, and `remove` deletes only those — a same-named file the user wrote is never touched.

## Checklist

- [ ] `node scripts/docs-search.mjs` ran first and its results were used as grounding
- [ ] The framework was initialized first (`.specify/`, `openspec/` or `_bmad/` exists)
- [ ] `node scripts/setup.mjs` ran and reported the blocks and files it applied
- [ ] No target was skipped as missing or as not ours, and no anchor warning went unmentioned
- [ ] For OpenSpec, `config.yaml` has no duplicate `context:` or `rules:` keys
- [ ] For BMad, every override validated and none was reported inert — or the user was told what to install or upgrade
- [ ] For BMad, the install is v6.4.0 or later; older ones exit 5 rather than being worked around
