#!/usr/bin/env node
// Validate the canonical sources + generated artifacts.
//
// Checks:
//   1. Every skills/<name>/SKILL.md has `name` and `description` frontmatter,
//      and the kebab-case name matches its directory.
//   2. Every agents/<name>.md has `name` and `description` frontmatter.
//   3. All generated JSON manifests parse and contain required fields.
//   4. JSON Schema validation (via ajv) of files where a public schema exists
//      on schemastore.org: Claude plugin.json, Claude marketplace.json, and
//      Codex hooks.json. Schemas are vendored locally in schemas/ — refresh
//      with `npm run update-schemas`. Cursor / Copilot / Gemini have no
//      published schemas yet.
//   5. If `claude` is on PATH, run `claude plugin validate ./` for the
//      most thorough check on the Claude artifacts.
//
// Exits non-zero on any failure. Used by `npm run validate` and CI.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let errors = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  errors++;
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

// ---- Frontmatter parser (no YAML dep) -------------------------------------
const parseFrontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
};

// ---- Skills ---------------------------------------------------------------
console.log("Validating skills/");
const skillsDir = path.join(ROOT, "skills");
if (fs.existsSync(skillsDir)) {
  for (const entry of fs.readdirSync(skillsDir)) {
    const skillPath = path.join(skillsDir, entry);
    if (!fs.statSync(skillPath).isDirectory()) continue;
    const skillFile = path.join(skillPath, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      fail(`${entry}/ missing SKILL.md`);
      continue;
    }
    const fm = parseFrontmatter(fs.readFileSync(skillFile, "utf8"));
    if (!fm) {
      fail(`${entry}/SKILL.md missing frontmatter`);
      continue;
    }
    if (!fm.name) fail(`${entry}/SKILL.md missing 'name'`);
    if (!fm.description) fail(`${entry}/SKILL.md missing 'description'`);
    if (fm.name && fm.name !== entry)
      fail(`${entry}/SKILL.md: frontmatter name '${fm.name}' must match directory name`);
    if (fm.name && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(fm.name))
      fail(`${entry}/SKILL.md: name '${fm.name}' must be kebab-case`);
    if (fm.name && fm.description) ok(`skills/${entry}`);
  }
} else {
  ok("(no skills directory yet)");
}

// ---- Agents ---------------------------------------------------------------
console.log("\nValidating agents/");
const agentsDir = path.join(ROOT, "agents");
if (fs.existsSync(agentsDir)) {
  for (const entry of fs.readdirSync(agentsDir)) {
    if (!entry.endsWith(".md")) continue;
    const fm = parseFrontmatter(fs.readFileSync(path.join(agentsDir, entry), "utf8"));
    if (!fm) {
      fail(`${entry} missing frontmatter`);
      continue;
    }
    if (!fm.name) fail(`${entry} missing 'name'`);
    if (!fm.description) fail(`${entry} missing 'description'`);
    if (fm.name && fm.name !== entry.replace(/\.md$/, ""))
      fail(`${entry}: frontmatter name must match filename`);
    if (fm.name && fm.description) ok(`agents/${entry}`);
  }
} else {
  ok("(no agents directory yet)");
}

// ---- Generated manifests --------------------------------------------------
console.log("\nValidating generated manifests");
const generated = [
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".claude-plugin/mcp.json",
  ".claude-plugin/hooks.json",
  ".cursor-plugin/plugin.json",
  ".cursor-plugin/marketplace.json",
  ".cursor-plugin/mcp.json",
  ".codex-plugin/plugin.json",
  ".codex-plugin/mcp.json",
  ".codex-plugin/hooks.json",
  ".agents/plugins/marketplace.json",
  "gemini-extension.json",
];
for (const rel of generated) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    fail(`${rel} missing — run 'npm run build'`);
    continue;
  }
  try {
    const obj = JSON.parse(fs.readFileSync(full, "utf8"));
    // Each generated file must have at least one of these recognized top-level
    // keys: `name` (manifests/marketplaces), `mcpServers` (mcp configs), or
    // `hooks` (hook configs).
    if (!obj.name && !obj.mcpServers && !obj.hooks)
      fail(`${rel} has no recognized top-level key (name / mcpServers / hooks)`);
    else ok(rel);
  } catch (e) {
    fail(`${rel} invalid JSON: ${e.message}`);
  }
}

// ---- JSON Schema validation (offline; schemas vendored in schemas/) -------
console.log("\nJSON Schema validation");
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schemaChecks = [
  {
    schema: "schemas/claude-code-plugin-manifest.json",
    target: ".claude-plugin/plugin.json",
  },
  {
    schema: "schemas/claude-code-marketplace.json",
    target: ".claude-plugin/marketplace.json",
  },
  {
    schema: "schemas/codex-hooks.json",
    target: ".codex-plugin/hooks.json",
  },
];

for (const { schema, target } of schemaChecks) {
  const schemaPath = path.join(ROOT, schema);
  const targetPath = path.join(ROOT, target);
  if (!fs.existsSync(schemaPath)) {
    fail(`${schema} not found — run 'npm run update-schemas'`);
    continue;
  }
  if (!fs.existsSync(targetPath)) {
    fail(`${target} not found — run 'npm run build'`);
    continue;
  }
  const schemaDoc = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const targetDoc = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  const validate = ajv.compile(schemaDoc);
  if (validate(targetDoc)) {
    ok(`${target} against ${schema}`);
  } else {
    fail(`${target} failed schema ${schema}:`);
    for (const err of validate.errors ?? []) {
      console.error(`      ${err.instancePath || "/"}: ${err.message}`);
    }
  }
}

// ---- Optional: claude CLI validator --------------------------------------
console.log("\nOptional: claude plugin validate");
try {
  execSync("command -v claude", { stdio: "ignore" });
  try {
    execSync("claude plugin validate ./", {
      cwd: ROOT,
      stdio: "inherit",
    });
    ok("claude plugin validate passed");
  } catch {
    fail("claude plugin validate reported issues");
  }
} catch {
  ok("(claude CLI not installed — skipping)");
}

// ---- Done -----------------------------------------------------------------
console.log("");
if (errors > 0) {
  console.error(`${errors} validation error${errors === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log("All checks passed.");
