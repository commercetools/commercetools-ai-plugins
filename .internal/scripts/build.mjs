#!/usr/bin/env node
// Generate every vendor's plugin manifest + MCP config from the single source
// of truth at .internal/config.json.
//
// Skills (skills/) and agents (agents/) are NOT touched — every vendor reads
// them directly from the repo root.
//
// Usage: `npm run build` from .internal/.

import fs from "node:fs";
import path from "node:path";
import { ROOT, readJSON, writeJSON, config } from "./util.mjs";

const cfg = config;

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

console.log(
  "\nVS Code Copilot (auto-detects Claude format — no extra files):",
);
console.log("  reads .claude-plugin/plugin.json + .claude-plugin/mcp.json");

// ---------------------------------------------------------------------------
// skills.sh discovery file. Auto-populated from skills/<slug>/SKILL.md so it
// can't drift from the actual repo contents.
// ---------------------------------------------------------------------------

const discoverSkillSlugs = () => {
  const dir = path.join(ROOT, "skills");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => {
      const p = path.join(dir, name);
      return (
        fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "SKILL.md"))
      );
    })
    // Sort alphabetically so the generated skills.sh.json has stable ordering
    // regardless of filesystem readdir order. Using localeCompare for a clear,
    // deterministic comparison.
    .sort((a, b) => a.localeCompare(b, "en"));
};

const skillsShConfig = {
  $schema: "https://skills.sh/schemas/skills.sh.schema.json",
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
