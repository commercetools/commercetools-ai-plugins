#!/usr/bin/env node
// Generate every vendor's plugin manifest + MCP config from the single source
// of truth at .internal/config.json.
//
// Skills (skills/) and agents (agents/) are read directly from the repo root by
// every vendor — with ONE exception: Codex. Its marketplace can't point a plugin's
// source at the repo root (openai/codex#17066), so Codex gets a self-contained
// plugin nested inside its mandated marketplace dir (.agents/plugins/<name>/) with
// a build-time COPY of skills/. Everything Codex needs lives under the single
// .agents/ folder. Revert to the shared root layout once that upstream issue ships
// (see codexMarketplace below).
//
// Usage: `npm run build` from .internal/.

import fs from "node:fs";
import path from "node:path";
import { ROOT, readJSON, writeJSON, config } from "./util.mjs";

// Recursively copy a directory tree (absolute paths). Plain readdir/copyFile so
// it works on every supported Node without relying on fs.cpSync.
const copyTree = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
};

// Mirror a directory (relative to ROOT) into another. The destination is wiped
// first so deletions in the source propagate to the generated copy.
const copyDir = (srcRel, destRel) => {
  const src = path.join(ROOT, srcRel);
  const dest = path.join(ROOT, destRel);
  fs.rmSync(dest, { recursive: true, force: true });
  if (!fs.existsSync(src)) return;
  copyTree(src, dest);
  console.log(`  copied ${srcRel}/ -> ${destRel}/`);
};

const cfg = config;
const logoPath = typeof cfg.branding?.logo === "string" ? cfg.branding.logo : null;
const codexLogoPath = logoPath ? `./${logoPath.replace(/^\.?\//, "")}` : null;

// ---------------------------------------------------------------------------
// MCP server config: produce per-vendor variants.
//   - http : streamable HTTP. {type, url} for everyone.
//   - stdio: local process. ${PLUGIN_ROOT}/${PROJECT_DIR} placeholders get
//            substituted with each vendor's native token.
// ---------------------------------------------------------------------------

const STDIO_TOKEN_MAP = {
  "claude-code": {
    "${PLUGIN_ROOT}": "${CLAUDE_PLUGIN_ROOT}",
    "${PROJECT_DIR}": "${CLAUDE_PROJECT_DIR}",
  },
  cursor: {
    "${PLUGIN_ROOT}": "${PLUGIN_ROOT}",
    "${PROJECT_DIR}": "${workspaceFolder}",
  },
  "vscode-copilot": {
    "${PLUGIN_ROOT}": "${CLAUDE_PLUGIN_ROOT}",
    "${PROJECT_DIR}": "${workspaceFolder}",
  },
  // Codex's exact stdio placeholder tokens are unverified — the only MCP server
  // today uses http transport, so this mapping is never exercised. Confirm the
  // real Codex tokens before adding any stdio server.
  codex: {
    "${PLUGIN_ROOT}": "${CODEX_PLUGIN_ROOT}",
    "${PROJECT_DIR}": "${CODEX_PROJECT_DIR}",
  },
};

const substituteTokens = (obj, mapping) => {
  let out = JSON.stringify(obj);
  for (const [from, to] of Object.entries(mapping)) {
    out = out.split(from).join(to);
  }
  return JSON.parse(out);
};

const serverFor = (vendor, server) => {
  const { transport, description, $comment, ...rest } = server;
  if (transport === "http") return { type: "http", ...rest };
  if (transport === "stdio" || transport === undefined) {
    return substituteTokens(rest, STDIO_TOKEN_MAP[vendor]);
  }
  throw new Error(`Unknown transport '${transport}' for server`);
};

const mcpFor = (vendor) => {
  const out = { mcpServers: {} };
  for (const [name, server] of Object.entries(cfg.mcpServers)) {
    out.mcpServers[name] = serverFor(vendor, server);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Manifest builders.
// ---------------------------------------------------------------------------

const commonMeta = {
  name: cfg.name,
  displayName: cfg.displayName,
  version: cfg.version,
  description: cfg.description,
  author: cfg.author,
  homepage: cfg.homepage,
  repository: cfg.repository,
  license: cfg.license,
  keywords: cfg.keywords,
};

const claudePlugin = {
  $schema: "https://json.schemastore.org/claude-code-plugin-manifest.json",
  ...commonMeta,
  // skills/ and agents/ are at the default locations, so we don't set those
  // manifest fields (they're for ADDITIONAL paths beyond the defaults).
  mcpServers: "./.claude-plugin/mcp.json",
};

const claudeMarketplace = {
  name: cfg.marketplace.name,
  description: cfg.marketplace.description,
  owner: cfg.marketplace.owner,
  plugins: [
    {
      name: cfg.name,
      source: "./",
      description: cfg.description,
      version: cfg.version,
      author: cfg.author,
      keywords: cfg.keywords,
      category: "commerce",
    },
  ],
};

const cursorPlugin = {
  ...commonMeta,
  ...(logoPath ? { logo: logoPath } : {}),
  mcpServers: "./.cursor-plugin/mcp.json",
};

const cursorMarketplace = {
  name: cfg.marketplace.name,
  description: cfg.marketplace.description,
  owner: cfg.marketplace.owner,
  plugins: [
    {
      name: cfg.name,
      source: "./",
      description: cfg.description,
      version: cfg.version,
      ...(logoPath ? { logo: logoPath } : {}),
    },
  ],
};

// Codex plugin root, nested inside the marketplace dir so the whole Codex
// footprint is one hidden folder. Manifest at <root>/.codex-plugin/plugin.json;
// skills/ and .mcp.json sit alongside it at the plugin root.
const CODEX_PLUGIN_DIR = `.agents/plugins/${cfg.name}`;

const codexPlugin = {
  ...commonMeta,
  skills: "./skills/",
  mcpServers: "./.mcp.json",
  interface: {
    displayName: cfg.displayName,
    category: "commerce",
    ...(codexLogoPath ? { logo: codexLogoPath } : {}),
  },
};

// Codex repo marketplace, read from $REPO_ROOT/.agents/plugins/marketplace.json
// (a path Codex hardcodes for both install and auto-discovery). The plugin
// source.path is a SUBDIR rather than the repo root ("./") — root paths are
// rejected by openai/codex#17066. Once that ships, set path to "./", drop the
// nested copy, and let Codex share the root skills/ like every other vendor.
const codexMarketplace = {
  name: cfg.marketplace.name,
  interface: {
    displayName: cfg.marketplace.name,
    description: cfg.marketplace.description,
  },
  plugins: [
    {
      name: cfg.name,
      source: {
        source: "local",
        path: `./${CODEX_PLUGIN_DIR}`,
      },
      policy: {
        installation: "AVAILABLE",
      },
      category: "commerce",
    },
  ],
};

// ---------------------------------------------------------------------------
// Emit.
// ---------------------------------------------------------------------------

console.log(`Building ${cfg.name} v${cfg.version}\n`);

console.log("Claude Code:");
writeJSON(".claude-plugin/plugin.json", claudePlugin);
writeJSON(".claude-plugin/marketplace.json", claudeMarketplace);
writeJSON(".claude-plugin/mcp.json", mcpFor("claude-code"));

console.log("\nCursor:");
writeJSON(".cursor-plugin/plugin.json", cursorPlugin);
writeJSON(".cursor-plugin/marketplace.json", cursorMarketplace);
writeJSON(".cursor-plugin/mcp.json", mcpFor("cursor"));

console.log("\nCodex:");
writeJSON(".agents/plugins/marketplace.json", codexMarketplace);
writeJSON(`${CODEX_PLUGIN_DIR}/.codex-plugin/plugin.json`, codexPlugin);
writeJSON(`${CODEX_PLUGIN_DIR}/.mcp.json`, mcpFor("codex"));
// Codex needs skills inside its plugin root; copy them from the shared root dir.
copyDir("skills", `${CODEX_PLUGIN_DIR}/skills`);
// Codex install-surface assets must also live inside the generated plugin root.
copyDir("assets", `${CODEX_PLUGIN_DIR}/assets`);

console.log(
  "\nVS Code Copilot (auto-detects Claude format — no extra files):",
);
console.log("  reads .claude-plugin/plugin.json + .claude-plugin/mcp.json");

// ---------------------------------------------------------------------------
// skills.sh discovery file. Auto-populated from skills/<slug>/SKILL.md so it
// can't drift from the actual repo contents.
// ---------------------------------------------------------------------------

// Skills listed here are pinned to the top in this exact order. Anything not
// listed falls back to alphabetical ordering after the pinned ones.
const SKILL_ORDER = [
  "commercetools-platform",
  "commercetools-storefront"
  // add more slugs here to pin their position
];

const discoverSkillSlugs = () => {
  const dir = path.join(ROOT, "skills");
  if (!fs.existsSync(dir)) return [];
  const rank = (name) => {
    const i = SKILL_ORDER.indexOf(name);
    return i === -1 ? Infinity : i;
  };
  return fs
    .readdirSync(dir)
    .filter((name) => {
      const p = path.join(dir, name);
      return (
        fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "SKILL.md"))
      );
    })
    // Pinned skills first (in SKILL_ORDER order), then everything else
    // alphabetically. localeCompare keeps the fallback deterministic.
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "en"));
};

const skillsShConfig = {
  // schema is broken 404 at the moment .. uncomment when its working again
  // $schema: "https://skills.sh/schemas/skills.sh.schema.json",
  groupings: [
    {
      title: "commercetools-skills",
      description: "Official commercetools skills bundled in the commercetools plugin.",
      skills: discoverSkillSlugs(),
    },
  ],
};

console.log("\nskills.sh:");
writeJSON("skills.sh.json", skillsShConfig);

console.log("\nDone.");
