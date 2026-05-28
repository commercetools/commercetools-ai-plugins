# Authoring skills

A **skill** is a focused playbook the agent invokes when it sees a matching task. Each skill is a directory under `skills/` with a `SKILL.md` file.

## Layout

```
skills/
└── <skill-name>/
    ├── SKILL.md             ← required
    ├── reference.md         ← optional supporting context
    └── scripts/             ← optional helper scripts
```

`<skill-name>` must be **kebab-case** and match the `name` field in the frontmatter.

## SKILL.md frontmatter

```yaml
---
name: ct-cart-debugger
description: Debug commercetools cart issues. Use when the user reports cart-related errors, line-item discrepancies, tax/price miscalculations, or 409 version conflicts on cart updates.
---
```

| Field | Required | Purpose |
| :--- | :--- | :--- |
| `name` | yes | Kebab-case identifier; must match the directory name. |
| `description` | yes | One or two sentences. **Start with a verb**, and explicitly state *when* the agent should invoke this skill — this is what the model uses to decide. |

## Writing the body

The body of `SKILL.md` is loaded into the model's context when the skill activates, so write it like instructions, not documentation. A good template:

```markdown
## When to use this skill
- Bulleted list of situations where this is the right skill.

## How to respond
1. Step one.
2. Step two.
3. Step three.

## Common pitfalls
- Watch out for X.
- Don't confuse Y with Z.

## Reference
- Link to authoritative commercetools docs.
```

Keep it under ~200 lines. If you need more detail, factor it into a `reference.md` and link to it from the body — the agent can read referenced files on demand.

## Scaffolding a new skill

```bash
npm run new-skill ct-product-search
```

This creates `skills/ct-product-search/SKILL.md` with a stub frontmatter and template body.

## Validation

```bash
npm run validate
```

Checks each `SKILL.md` has `name` + `description` frontmatter, the name is kebab-case, and the name matches the directory.

## Cross-vendor notes

The same `SKILL.md` is served to all five vendors — there are **no vendor-specific skill files**. Avoid skill bodies that rely on features only one vendor supports (e.g. don't reference `${CLAUDE_PLUGIN_ROOT}` in skill body text; that token resolves correctly in MCP/hook configs but not inside skill markdown content for non-Claude vendors).
