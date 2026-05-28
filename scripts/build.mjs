#!/usr/bin/env node
// Build all vendor-specific manifest files, MCP configs, and always-on context
// artifacts from the canonical sources in:
//   - manifests/meta.json           (plugin/marketplace metadata)
//   - mcp/servers.source.json       (MCP server definitions)
//   - context/always-on.md          (always-loaded commercetools framing)
//
// Skills (`skills/`) and agents (`agents/`) are NOT touched — every vendor
// reads them directly from the repo root. This script only generates the thin
// wrapper files that differ between vendors.
//
// Usage: `node scripts/build.mjs` (or `npm run build`).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const readJSON = (rel) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const writeJSON = (rel, obj) => {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj, null, 2) + "\n");
  console.log(`  wrote ${rel}`);
};
const writeText = (rel, text) => {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
  console.log(`  wrote ${rel}`);
};
const removeIfExists = (rel) => {
  const full = path.join(ROOT, rel);
  if (fs.existsSync(full)) {
    fs.unlinkSync(full);
    console.log(`  removed ${rel} (stale)`);
  }
};

const meta = readJSON("manifests/meta.json");
const mcpSource = readJSON("mcp/servers.source.json");
const alwaysOnContext = readText("context/always-on.md");

// ---------------------------------------------------------------------------
// MCP server config: produce per-vendor variants.
//   - http  : streamable HTTP. Gemini uses `httpUrl`; others use `type` + `url`.
//   - stdio : local process. ${PLUGIN_ROOT}/${PROJECT_DIR} substituted per vendor.
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
  codex: {
    "${PLUGIN_ROOT}": "${PLUGIN_ROOT}",
    "${PROJECT_DIR}": "${PROJECT_DIR}",
  },
  gemini: {
    "${PLUGIN_ROOT}": "${extensionPath}",
    "${PROJECT_DIR}": "${workspacePath}",
  },
};

const substituteTokens = (obj, mapping) => {
  const json = JSON.stringify(obj);
  let out = json;
  for (const [from, to] of Object.entries(mapping)) {
    out = out.split(from).join(to);
  }
  return JSON.parse(out);
};

const serverFor = (vendor, server) => {
  const { transport, description, $comment, ...rest } = server;
  if (transport === "http") {
    if (vendor === "gemini") {
      const { url, ...others } = rest;
      return { httpUrl: url, ...others };
    }
    return { type: "http", ...rest };
  }
  if (transport === "stdio" || transport === undefined) {
    return substituteTokens(rest, STDIO_TOKEN_MAP[vendor]);
  }
  throw new Error(`Unknown transport '${transport}' for server`);
};

const mcpFor = (vendor) => {
  const out = { mcpServers: {} };
  for (const [name, server] of Object.entries(mcpSource.mcpServers)) {
    out.mcpServers[name] = serverFor(vendor, server);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Always-on context: produce per-vendor artifacts.
//
// Each vendor has a different native mechanism (or none). For Claude / Codex
// we generate a SessionStart hook that prints the file content; the stdout is
// injected into the session as context. For Cursor we emit an .mdc rule with
// `alwaysApply: true`. For Gemini we copy the file to GEMINI.md, which the
// manifest's `contextFileName` points at.
// ---------------------------------------------------------------------------

const cursorRule = `---
description: commercetools toolkit context (always-on framing)
alwaysApply: true
---

${alwaysOnContext}`;

const sessionStartHook = (pluginRootToken) => ({
  hooks: {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: `cat "${pluginRootToken}/context/always-on.md"`,
          },
        ],
      },
    ],
  },
});

// ---------------------------------------------------------------------------
// Manifest builders.
// ---------------------------------------------------------------------------

const commonMeta = {
  name: meta.name,
  displayName: meta.displayName,
  version: meta.version,
  description: meta.description,
  author: meta.author,
  homepage: meta.homepage,
  repository: meta.repository,
  license: meta.license,
  keywords: meta.keywords,
};

const claudePlugin = {
  $schema: "https://json.schemastore.org/claude-code-plugin-manifest.json",
  ...commonMeta,
  // skills/ and agents/ are at the default locations, so we omit the manifest
  // fields — they're for ADDITIONAL paths beyond the defaults. mcpServers and
  // hooks are explicitly pointed at the dot-folder to keep root tidy.
  mcpServers: "./.claude-plugin/mcp.json",
  hooks: "./.claude-plugin/hooks.json",
};

const claudeMarketplace = {
  name: meta.marketplace.name,
  description: meta.marketplace.description,
  owner: meta.marketplace.owner,
  plugins: [
    {
      name: meta.name,
      source: "./",
      description: meta.description,
      version: meta.version,
      author: meta.author,
      keywords: meta.keywords,
      category: "commerce",
    },
  ],
};

const cursorPlugin = {
  ...commonMeta,
  // Cursor also auto-discovers skills/ and agents/ at the plugin root by
  // default, so omit them here. Custom paths only.
  mcpServers: "./.cursor-plugin/mcp.json",
  rules: "./.cursor-plugin/rules/",
};

const cursorMarketplace = {
  name: meta.marketplace.name,
  description: meta.marketplace.description,
  owner: meta.marketplace.owner,
  plugins: [
    {
      name: meta.name,
      source: "./",
      description: meta.description,
      version: meta.version,
    },
  ],
};

const codexPlugin = {
  name: meta.name,
  version: meta.version,
  description: meta.description,
  author: meta.author,
  homepage: meta.homepage,
  repository: meta.repository,
  license: meta.license,
  keywords: meta.keywords,
  // skills/ is at default location; manifest field is for additional paths only.
  mcpServers: "./.codex-plugin/mcp.json",
  hooks: "./.codex-plugin/hooks.json",
  interface: {
    displayName: meta.displayName,
    shortDescription: meta.description,
    developerName: meta.author.name,
    category: "Productivity",
    websiteURL: meta.homepage,
  },
};

const codexMarketplace = {
  name: meta.marketplace.name,
  interface: { displayName: meta.marketplace.displayName },
  plugins: [
    {
      name: meta.name,
      source: {
        source: "git-subdir",
        url: `${meta.repository}.git`,
        path: "./",
        ref: "main",
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL",
      },
      category: "Productivity",
    },
  ],
};

const geminiExtension = {
  name: meta.name,
  version: meta.version,
  description: meta.description,
  mcpServers: mcpFor("gemini").mcpServers,
  contextFileName: "GEMINI.md",
};

// ---------------------------------------------------------------------------
// Emit everything.
// ---------------------------------------------------------------------------

console.log(`Building ${meta.name} v${meta.version}\n`);

console.log("Claude Code:");
writeJSON(".claude-plugin/plugin.json", claudePlugin);
writeJSON(".claude-plugin/marketplace.json", claudeMarketplace);
writeJSON(".claude-plugin/mcp.json", mcpFor("claude-code"));
writeJSON(".claude-plugin/hooks.json", sessionStartHook("${CLAUDE_PLUGIN_ROOT}"));
removeIfExists(".mcp.json"); // legacy location — superseded by .claude-plugin/mcp.json

console.log("\nCursor:");
writeJSON(".cursor-plugin/plugin.json", cursorPlugin);
writeJSON(".cursor-plugin/marketplace.json", cursorMarketplace);
writeJSON(".cursor-plugin/mcp.json", mcpFor("cursor"));
writeText(".cursor-plugin/rules/commercetools-context.mdc", cursorRule);

console.log(
  "\nVS Code Copilot (uses Claude manifest via auto-detect — no extra files):",
);
console.log("  reads .claude-plugin/plugin.json + .claude-plugin/mcp.json");
console.log("  honors the SessionStart hook in .claude-plugin/hooks.json");

console.log("\nOpenAI Codex:");
writeJSON(".codex-plugin/plugin.json", codexPlugin);
writeJSON(".codex-plugin/mcp.json", mcpFor("codex"));
writeJSON(".codex-plugin/hooks.json", sessionStartHook("${PLUGIN_ROOT}"));
// NOTE: .agents/ is a Codex-specific path despite the generic-sounding name.
// OpenAI documents .agents/plugins/marketplace.json as the canonical location
// for Codex marketplace catalogs. No other vendor uses .agents/. Keeping it
// here (instead of .codex-plugin/marketplace.json) preserves the default
// install UX: `codex plugin marketplace add commercetools/commercetools-skills`
// works without `--sparse .codex-plugin`.
writeJSON(".agents/plugins/marketplace.json", codexMarketplace);

console.log("\nGemini CLI:");
writeJSON("gemini-extension.json", geminiExtension);
writeText("GEMINI.md", alwaysOnContext);

console.log("\nDone.");
