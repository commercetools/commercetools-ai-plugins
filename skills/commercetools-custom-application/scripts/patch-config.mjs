#!/usr/bin/env node
// Writes env.production.url (and optionally applicationId) into custom-application-config.mjs.
// Run it BEFORE the production build: the url feeds the compiled Content-Security-Policy.
// Usage: node patch-config.mjs --app-dir <dir> --url https://<project>.vercel.app
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { patchConfig } from './lib/patch-config.mjs';

const { values: a } = parseArgs({
  options: { 'app-dir': { type: 'string' }, url: { type: 'string' }, 'application-id': { type: 'string' } },
});
if (!a['app-dir'] || (!a.url && !a['application-id'])) {
  console.log(JSON.stringify({ ok: false, error: 'Usage: --app-dir <dir> [--url https://...] [--application-id <id>]' }));
  process.exit(1);
}
const file = path.join(path.resolve(a['app-dir']), 'custom-application-config.mjs');
try {
  const before = fs.readFileSync(file, 'utf8');
  const after = patchConfig(before, { url: a.url, applicationId: a['application-id'] });
  if (after !== before) fs.writeFileSync(file, after);
  console.log(JSON.stringify({ ok: true, file, changed: after !== before }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
}
