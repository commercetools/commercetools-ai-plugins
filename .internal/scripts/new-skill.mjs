#!/usr/bin/env node
// Scaffold a new skill directory.
// Usage: node scripts/new-skill.mjs <skill-name>
//   e.g. node scripts/new-skill.mjs ct-cart-debugger

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Scripts live at .internal/scripts/, so the repo root is two levels up.
const ROOT = path.resolve(__dirname, "../..");

const name = process.argv[2];
if (!name) {
  console.error("Usage: npm run new-skill -- <skill-name>");
  console.error("       (name must be kebab-case, e.g. ct-cart-debugger)");
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name)) {
  console.error(`Invalid name '${name}'. Use kebab-case: lowercase letters, digits, hyphens.`);
  process.exit(1);
}

const dir = path.join(ROOT, "skills", name);
if (fs.existsSync(dir)) {
  console.error(`skills/${name}/ already exists.`);
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });

const template = `---
name: ${name}
description: TODO — one sentence describing when an agent should invoke this skill. Start with a verb.
---

# ${name}

TODO: replace this with the skill body. The body is loaded into the model's
context when the skill is invoked, so write it like a focused playbook.

## When to use this skill

- List the situations where this skill is the right tool.

## How to respond

1. Step one.
2. Step two.
3. Step three.

## Reference

- Link to canonical commercetools docs the skill relies on.
`;

fs.writeFileSync(path.join(dir, "SKILL.md"), template);
console.log(`Created skills/${name}/SKILL.md`);
console.log("Next steps:");
console.log("  1. Edit the description and body.");
console.log("  2. Run `npm run validate` to lint.");
console.log("  3. Run `npm run build` (no-op for skills, but keeps manifests in sync).");
