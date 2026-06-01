#!/usr/bin/env node
// Validate the canonical sources + generated artifacts.
//
// Checks:
//   1. Every skills/<name>/SKILL.md has `name` and `description` frontmatter,
//      and the kebab-case name matches its directory.
//   2. Every agents/<name>.md has `name` and `description` frontmatter.
//   3. All generated JSON manifests parse and contain expected top-level keys.
//      Generated files are only checked for output-specific wiring here; shared
//      metadata coming from .internal/config.json is validated once at source.
//   4. JSON Schema validation (via ajv) of files where a public schema exists
//      on schemastore.org: Claude plugin.json + Claude marketplace.json.
//      Schemas are vendored locally in .internal/schemas/ — refresh with
//      `npm run update-schemas`. Cursor / Copilot have no published schemas.
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
// Scripts live at .internal/scripts/, so the repo root is two levels up.
const ROOT = path.resolve(__dirname, "../..");

let errors = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  errors++;
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

// Vendor references for the static checks below:
// - GitHub Copilot CLI plugin reference:
//   https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference
// - VS Code agent plugins:
//   https://code.visualstudio.com/raw/docs/copilot/customization/agent-plugins.md
// - VS Code agent skills:
//   https://code.visualstudio.com/raw/docs/copilot/customization/agent-skills.md
// - Claude Code plugin marketplaces:
//   https://code.claude.com/docs/en/plugin-marketplaces
// - Claude Code plugins reference:
//   https://code.claude.com/docs/en/plugins-reference
// - Cursor plugin reference:
//   https://cursor.com/docs/reference/plugins.md

const KEBAB_CASE_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const HTTPS_URL_RE = /^https:\/\//;
// Copilot and VS Code document a 64 char limit for plugin names.
// Claude marketplace docs also describe public-facing kebab-case names.
const MAX_PLUGIN_NAME_CHARS = 64;
// This limit is intentionally for plugin and marketplace listing descriptions
// only. Skill and agent frontmatter descriptions are discoverability metadata,
// not marketplace listing copy, and should be handled separately.
// Source: Copilot CLI plugin reference and VS Code agent plugins docs.
const MAX_LISTING_DESCRIPTION_CHARS = 1024;
// Reserved names are documented by Anthropic for marketplace catalogs.
const RESERVED_CLAUDE_MARKETPLACES = new Set([
  "claude-code-marketplace",
  "claude-code-plugins",
  "claude-plugins-official",
  "anthropic-marketplace",
  "anthropic-plugins",
  "agent-skills",
  "anthropic-agent-skills",
  "knowledge-work-plugins",
  "life-sciences",
  "claude-for-legal",
  "claude-for-financial-services",
  "financial-services-plugins",
]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const looksLikeHttpsUrl = (value) => {
  if (typeof value !== "string" || !HTTPS_URL_RE.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
};
const isRelativePluginPath = (value) =>
  typeof value === "string" && value.startsWith("./") && !value.includes("..");

const validateName = (label, value) => {
  if (typeof value !== "string") return;
  if (!KEBAB_CASE_RE.test(value)) fail(`${label} '${value}' must be kebab-case`);
  if (value.length > MAX_PLUGIN_NAME_CHARS)
    fail(`${label} '${value}' must be <= ${MAX_PLUGIN_NAME_CHARS} characters`);
};

const validateListingDescription = (label, value) => {
  if (typeof value !== "string") return;
  if (value.length > MAX_LISTING_DESCRIPTION_CHARS)
    fail(`${label} must be <= ${MAX_LISTING_DESCRIPTION_CHARS} characters`);
};

const validateHttpsUrl = (label, value) => {
  if (value === undefined) return;
  if (!looksLikeHttpsUrl(value)) fail(`${label} must be a valid https:// URL`);
};

const validateAuthor = (label, author) => {
  if (!isObject(author)) return;
  if (typeof author.name !== "string" || author.name.trim() === "")
    fail(`${label}.name is required`);
  if (author.url !== undefined) validateHttpsUrl(`${label}.url`, author.url);
};

const validatePluginManifestMetadata = (label, manifest) => {
  if (!isObject(manifest)) return;
  validateName(`${label}.name`, manifest.name);
  // Treat plugin.json description as marketplace/install-surface copy.
  validateListingDescription(`${label}.description`, manifest.description);
  validateAuthor(`${label}.author`, manifest.author);
  validateHttpsUrl(`${label}.homepage`, manifest.homepage);
  validateHttpsUrl(`${label}.repository`, manifest.repository);
};

const validateGeneratedPluginPaths = (label, manifest) => {
  if (!isObject(manifest)) return;
  // Static path hygiene only: vendor docs require relative plugin paths and
  // reject traversal outside the plugin root.
  for (const field of ["skills", "agents", "commands", "hooks", "mcpServers", "lspServers"]) {
    const value = manifest[field];
    if (typeof value === "string" && !isRelativePluginPath(value)) {
      fail(`${label}.${field} must be a relative path starting with './' and must not contain '..'`);
    }
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        if (typeof item === "string" && !isRelativePluginPath(item)) {
          fail(
            `${label}.${field}[${index}] must be a relative path starting with './' and must not contain '..'`,
          );
        }
      }
    }
  }
};

const validateClaudeMarketplaceOutput = (label, marketplace) => {
  if (!isObject(marketplace)) return;
  if (Array.isArray(marketplace.plugins)) {
    for (const [index, plugin] of marketplace.plugins.entries()) {
      const prefix = `${label}.plugins[${index}]`;
      if (typeof plugin?.source === "string" && !isRelativePluginPath(plugin.source)) {
        fail(`${prefix}.source must be a relative path starting with './' and must not contain '..'`);
      }
    }
  }
};

const validateCodexMarketplaceOutput = (label, marketplace) => {
  if (!isObject(marketplace)) return;
  if (Array.isArray(marketplace.plugins)) {
    for (const [index, plugin] of marketplace.plugins.entries()) {
      const prefix = `${label}.plugins[${index}]`;
      const pathValue = plugin?.source?.path;
      if (pathValue !== undefined && !isRelativePluginPath(pathValue)) {
        fail(`${prefix}.source.path must be a relative path starting with './' and must not contain '..'`);
      }
    }
  }
};

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

// ---- Canonical config ------------------------------------------------------
console.log("Validating .internal/config.json");
try {
  const config = JSON.parse(
    fs.readFileSync(path.join(ROOT, ".internal/config.json"), "utf8"),
  );
  const errorsBefore = errors;
  // This canonical config currently stores plugin-level listing metadata used
  // to generate install-surface manifests. If listing copy is later split out
  // into dedicated central metadata fields, keep the 1024-char limit scoped to
  // those listing fields rather than skill/agent discoverability text.
  validatePluginManifestMetadata(".internal/config.json", config);
  if (isObject(config.marketplace)) {
    validateName(".internal/config.json marketplace.name", config.marketplace.name);
    validateListingDescription(
      ".internal/config.json marketplace.description",
      config.marketplace.description,
    );
    validateAuthor(".internal/config.json marketplace.owner", config.marketplace.owner);
    if (
      typeof config.marketplace.name === "string" &&
      RESERVED_CLAUDE_MARKETPLACES.has(config.marketplace.name)
    ) {
      fail(
        `.internal/config.json marketplace.name '${config.marketplace.name}' is reserved by Anthropic and cannot be used`,
      );
    }
  }
  if (errors === errorsBefore) ok(".internal/config.json");
} catch (e) {
  fail(`.internal/config.json invalid JSON: ${e.message}`);
}

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
    const errorsBefore = errors;
    if (!fm.name) fail(`${entry}/SKILL.md missing 'name'`);
    if (!fm.description) fail(`${entry}/SKILL.md missing 'description'`);
    if (fm.name && fm.name !== entry)
      fail(`${entry}/SKILL.md: frontmatter name '${fm.name}' must match directory name`);
    if (fm.name && !KEBAB_CASE_RE.test(fm.name))
      fail(`${entry}/SKILL.md: name '${fm.name}' must be kebab-case`);
    if (fm.name && fm.name.length > MAX_PLUGIN_NAME_CHARS)
      fail(`${entry}/SKILL.md: name '${fm.name}' must be <= ${MAX_PLUGIN_NAME_CHARS} characters`);
    // Do not impose plugin-listing description limits on skill frontmatter.
    // Skill descriptions are primarily discoverability metadata for agents.
    // Source: VS Code and Cursor skill docs; both emphasize trigger/use-case
    // matching rather than marketplace listing constraints.
    // Repo convention: every skill ships under the `commercetools-` namespace
    // so it's instantly recognizable on skills.sh, in /plugin lists, and in
    // grep output across someone's whole skills directory.
    if (fm.name && !fm.name.startsWith("commercetools-"))
      fail(`${entry}/SKILL.md: name '${fm.name}' must start with 'commercetools-'`);
    if (errors === errorsBefore) ok(`skills/${entry}`);
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
    const errorsBefore = errors;
    if (!fm.name) fail(`${entry} missing 'name'`);
    if (!fm.description) fail(`${entry} missing 'description'`);
    if (fm.name && fm.name !== entry.replace(/\.md$/, ""))
      fail(`${entry}: frontmatter name must match filename`);
    if (fm.name && !KEBAB_CASE_RE.test(fm.name))
      fail(`${entry}: frontmatter name '${fm.name}' must be kebab-case`);
    if (fm.name && fm.name.length > MAX_PLUGIN_NAME_CHARS)
      fail(`${entry}: frontmatter name '${fm.name}' must be <= ${MAX_PLUGIN_NAME_CHARS} characters`);
    // Agent descriptions are also discoverability/delegation metadata, not
    // marketplace listing copy, so they should not inherit plugin listing caps.
    if (errors === errorsBefore) ok(`agents/${entry}`);
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
  ".cursor-plugin/plugin.json",
  ".cursor-plugin/marketplace.json",
  ".cursor-plugin/mcp.json",
  ".agents/plugins/marketplace.json",
  ".agents/plugins/commercetools/.codex-plugin/plugin.json",
  ".agents/plugins/commercetools/.mcp.json",
  "skills.sh.json",
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
    // `groupings` (skills.sh.json).
    if (!obj.name && !obj.mcpServers && !obj.groupings)
      fail(`${rel} has no recognized top-level key (name / mcpServers / groupings)`);
    else {
      if (rel === ".claude-plugin/plugin.json" || rel === ".cursor-plugin/plugin.json") {
        validateGeneratedPluginPaths(rel, obj);
      }
      if (rel === ".claude-plugin/marketplace.json") validateClaudeMarketplaceOutput(rel, obj);
      if (rel === ".agents/plugins/marketplace.json") validateCodexMarketplaceOutput(rel, obj);
      if (rel === ".agents/plugins/commercetools/.codex-plugin/plugin.json") {
        validateGeneratedPluginPaths(rel, obj);
      }
      ok(rel);
    }
  } catch (e) {
    fail(`${rel} invalid JSON: ${e.message}`);
  }
}

// ---- Codex skills copy in sync with root skills/ --------------------------
// Codex can't share the root skills/ (openai/codex#17066), so build.mjs copies
// them into its nested plugin dir. Guard against a stale copy (the CI
// uncommitted-changes gate also catches this, but this gives a clear local error).
const CODEX_SKILLS_DIR = ".agents/plugins/commercetools/skills";
console.log(`\nValidating ${CODEX_SKILLS_DIR}/ is in sync with skills/`);
const slugsIn = (rel) => {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return null;
  return new Set(
    fs
      .readdirSync(dir)
      .filter((name) => fs.statSync(path.join(dir, name)).isDirectory()),
  );
};
const rootSlugs = slugsIn("skills");
const codexSlugs = slugsIn(CODEX_SKILLS_DIR);
if (rootSlugs === null) {
  ok("(no skills directory — nothing to mirror)");
} else if (codexSlugs === null) {
  fail(`${CODEX_SKILLS_DIR}/ missing — run 'npm run build'`);
} else {
  const missing = [...rootSlugs].filter((s) => !codexSlugs.has(s));
  const extra = [...codexSlugs].filter((s) => !rootSlugs.has(s));
  if (missing.length || extra.length) {
    fail(
      `${CODEX_SKILLS_DIR}/ out of sync with skills/ (run 'npm run build') — ` +
        `missing: [${missing.join(", ")}], extra: [${extra.join(", ")}]`,
    );
  } else {
    ok(`${CODEX_SKILLS_DIR}/ matches skills/`);
  }
}

// ---- JSON Schema validation (offline; schemas vendored in schemas/) -------
console.log("\nJSON Schema validation");
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schemaChecks = [
  {
    schema: ".internal/schemas/claude-code-plugin-manifest.json",
    target: ".claude-plugin/plugin.json",
  },
  {
    schema: ".internal/schemas/claude-code-marketplace.json",
    target: ".claude-plugin/marketplace.json",
  },
  {
    schema: ".internal/schemas/skills.sh.schema.json",
    target: "skills.sh.json",
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
