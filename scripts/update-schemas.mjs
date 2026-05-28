#!/usr/bin/env node
// Refresh the vendored JSON Schemas in schemas/ from schemastore.org.
//
// We vendor schemas locally so `npm run validate` works offline in CI and is
// not subject to schemastore outages. Run this script periodically (or before
// a release) to pick up upstream schema improvements.
//
// Usage: `node scripts/update-schemas.mjs` (or `npm run update-schemas`).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCHEMAS_DIR = path.join(ROOT, "schemas");

const SCHEMAS = [
  {
    name: "claude-code-plugin-manifest.json",
    url: "https://json.schemastore.org/claude-code-plugin-manifest.json",
  },
  {
    name: "claude-code-marketplace.json",
    url: "https://json.schemastore.org/claude-code-marketplace.json",
  },
  {
    name: "codex-hooks.json",
    url: "https://json.schemastore.org/codex-hooks.json",
  },
];

fs.mkdirSync(SCHEMAS_DIR, { recursive: true });

for (const { name, url } of SCHEMAS) {
  const dest = path.join(SCHEMAS_DIR, name);
  process.stdout.write(`fetching ${url} ... `);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAIL (HTTP ${res.status})`);
    process.exit(1);
  }
  const body = await res.text();
  // Sanity-check it parses as JSON before writing.
  JSON.parse(body);
  fs.writeFileSync(dest, body);
  console.log(`OK -> schemas/${name}`);
}

console.log("\nDone. Commit the updated schemas/ files if anything changed.");
