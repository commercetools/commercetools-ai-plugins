import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Scripts live at .internal/scripts/, so the repo root is two levels up.
export const ROOT = path.resolve(__dirname, "../..");

export const readJSON = (rel) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

export const writeJSON = (rel, obj) => {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj, null, 2) + "\n");
  console.log(`  wrote ${rel}`);
};

export const config = readJSON(".internal/config.json");