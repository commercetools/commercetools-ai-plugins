---
name: commercetools-spec-driven-development
description: Wire the commercetools skills into a spec-driven development framework — GitHub Spec Kit (.specify/) or OpenSpec (openspec/). Use when user wants to setup or check the status of a spec-driven development framework that touches commercetools.
when_to_use:
  - "Setting up GitHub Spec Kit or OpenSpec in a project that touches commercetools, or wiring commercetools into an existing one"
  - "Checking the status of, or removing, the commercetools spec-driven-development overlay"
metadata:
  contentType: SKILL
  area:
    - spec-driven-development
    - workflow
---

# commercetools Spec-Driven Development Overlay

Makes a spec-driven development framework commercetools-aware, so every spec, plan, and task that touches commercetools loads the matching `commercetools-*` skill first. The framework keeps owning the workflow — this only adds commercetools rules to files the framework already has. It creates no new files.

| Detected directory | Framework |
| :--- | :--- |
| `.specify/` | GitHub Spec Kit |
| `openspec/` | OpenSpec |

Both present means both get the overlay.

## Workflow

1. **Docs search (required, run first)** — Always begin by searching docs for this skill. This is the mandatory grounding step: it gathers the latest verified documentation as context for you (the agent). **Do not skip it, and do not replace it with another tool** (such as an MCP documentation-search tool). This script optimizes for tuned search results — run this command:

   ```bash
   node scripts/docs-search.mjs \
     --query "<extract key terms from the user's question>" \
     --app-name "<current-app ex: claude, copilot, codex>" \
     --model "<current-model>" \
     --skill-name "commercetools-spec-driven-development" \
     --limit 10
   ```

   Query the commercetools areas the project targets, not the framework's own terminology — those results are what let you fill in the plan's "Platform Skills Resolution" table later.

2. **Run the setup script (required, do the work with this)** — never hand-edit the framework's files to apply the overlay; the script is idempotent and reversible, hand edits are neither:

   ```bash
   node scripts/setup.mjs
   ```

   | Argument | Effect |
   | :--- | :--- |
   | *(none)* or `init` | Apply the overlay to every detected framework |
   | `status` | Report which blocks are applied; writes nothing |
   | `remove` | Strip previously applied blocks |
   | `--dry-run` | Preview `init`/`remove` without writing |
   | `--framework speckit\|openspec` | Act on one framework only |
   | `--cwd <dir>` | Target a project other than the current directory |

3. **Report what the script printed**, and handle these outcomes:

   - **No framework detected** (exit 4) — tell the user to run `specify init` (Spec Kit) or `openspec init` (OpenSpec) first, then re-run. Do not create those directories yourself.
   - **A target file was skipped as missing** — the framework is only partially initialized. Name the missing file; do not create it.
   - **An anchor was not found** — the upstream template changed, so the block was appended at end-of-file instead of at its intended heading. It still works; say the placement is not ideal.
   - **Applied, or already up to date** — state which files changed and stop.

## What the overlay adds

| Framework | File | Adds |
| :--- | :--- | :--- |
| Spec Kit | `.specify/memory/constitution.md` | Non-negotiable articles: resolve the platform skill, annotate tasks, never invent API surface |
| Spec Kit | `.specify/templates/plan-template.md` | A "Platform Skills Resolution" table mapping each architectural area to its skill |
| Spec Kit | `.specify/templates/tasks-template.md` | The `[SKILL: <name>]` task-grammar extension |
| OpenSpec | `openspec/config.yaml` | `context:` guidance plus `rules:` for the proposal and tasks artifacts |

Each block is fenced by `commercetools-spec-extension:begin` / `commercetools-spec-extension:end` markers. Re-running `init` replaces a block in place rather than duplicating it, and `remove` restores the file to its original bytes.

## Checklist

- [ ] `node scripts/docs-search.mjs` ran first and its results were used as grounding
- [ ] The framework was initialized first (`.specify/` or `openspec/` exists)
- [ ] `node scripts/setup.mjs` ran and reported the blocks it applied
- [ ] No target was skipped as missing, and no anchor warning went unmentioned
- [ ] For OpenSpec, `config.yaml` has no duplicate `context:` or `rules:` keys
