#!/usr/bin/env node
// Provider-neutral proof that the host serves the app the way the Merchant Center proxy expects.
// "In the nav" itself is only visible in a logged-in browser, so this prints the URL to open.
//
// Usage: node verify.mjs --production-url https://x.vercel.app --project-key <key> --entry-point <path> --region gcp-eu
import { execFile } from 'node:child_process';
import { parseArgs } from 'node:util';
import { mcApiUrlForRegion } from './lib/validate.mjs';
import { evaluateHost } from './lib/host-check.mjs';
import { fetchPage } from './lib/host-fetch.mjs';

const { values: a } = parseArgs({
  options: {
    'production-url': { type: 'string' },
    'project-key': { type: 'string' },
    'entry-point': { type: 'string' },
    region: { type: 'string' },
  },
});
for (const k of ['production-url', 'project-key', 'entry-point', 'region']) {
  if (!a[k]) {
    console.log(JSON.stringify({ ok: false, error: `--${k} is required` }));
    process.exit(1);
  }
}

// The MC proxy forwards /:projectKey/:entryPointUriPath/* to the app url, so both the app path
// and a deeper path must return the same index.html. Works for any host.
const base = `${a['production-url'].replace(/\/$/, '')}/${a['project-key']}/${a['entry-point']}`;
// A certificate-authority error (corporate TLS inspection) falls back to curl, see host-fetch.mjs.
const curl = (args) => new Promise((resolve) => {
  execFile('curl', args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr: stderr || (err && typeof err.code !== 'number' ? err.message : '') }));
});
const get = (url) => fetchPage(url, { fetchImpl: fetch, curl });
let root, deep;
try {
  [root, deep] = [await get(base), await get(`${base}/__spa-rewrite-check/deep`)];
} catch (e) {
  const why = e.cause?.code ?? e.cause?.message ?? e.message;
  console.log(JSON.stringify({ ok: false, error: `Could not reach ${base}: ${why}` }));
  process.exit(1);
}
const host = evaluateHost({ root, deep });

const mcHost = mcApiUrlForRegion(a.region)?.replace('mc-api.', 'mc.');
const result = {
  ok: host.ok,
  hostCheck: { url: base, rootStatus: root.status, deepStatus: deep.status, problems: host.problems, via: root.via },
  openInBrowser: `${mcHost}/${a['project-key']}/${a['entry-point']}`,
  note: 'Open openInBrowser (Playwright if available), log in, and confirm the menu item and app content. Run it after register.mjs reports done. Before that, only the hostCheck is meaningful.',
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
