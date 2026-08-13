<!-- commercetools-spec-extension:begin v=1 id=task-skill-annotation -->
## commercetools Skill Annotation (commercetools-spec-extension overlay)
Extend the task format above to: `[ID] [P?] [Story?] [SKILL: <name>?] Description with file path`.

- Every task that touches commercetools MUST carry a `[SKILL: <name>]` token,
  placed immediately before the description. Resolve `<name>` from this feature's
  "Platform Skills Resolution" table in plan.md.
- Tasks that do not touch commercetools omit the token.

✅ CORRECT: `- [ ] T012 [P] [US1] [SKILL: commercetools-checkout] Implement payment session in src/checkout/session.ts`

Before starting any task that carries a `[SKILL: <name>]` annotation, load that
skill. Do not begin implementing the task before the skill is loaded.
<!-- commercetools-spec-extension:end id=task-skill-annotation -->
