#!/usr/bin/env node
// Fixes pnpm's ERR_PNPM_IGNORED_BUILDS in a scaffolded app by denying every undecided
// dependency build script in pnpm-workspace.yaml, then proves it by installing again.
// Safe to rerun, never changes an existing allowBuilds decision. Prints one JSON object.
//
// Usage: node allow-builds.mjs --app-dir <dir>
// Exit: 0 pnpm installs cleanly, 1 it still fails (or --app-dir is wrong).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { mergeAllowBuilds, parseIgnoredBuilds } from './lib/pnpm-builds.mjs';

const { values } = parseArgs({ options: { 'app-dir': { type: 'string' } } });
const done = (body, code) => {
  console.log(JSON.stringify(body, null, 2));
  process.exit(code);
};
if (!values['app-dir']) done({ ok: false, error: '--app-dir is required' }, 1);
const cwd = path.resolve(values['app-dir']);
if (!fs.existsSync(path.join(cwd, 'package.json'))) done({ ok: false, error: `No package.json in ${cwd}` }, 1);

const install = () => {
  const r = spawnSync('pnpm', ['install'], { cwd, encoding: 'utf8' });
  return { status: r.status, output: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
};

const first = install();
if (first.status === 0) done({ ok: true, changed: false, denied: [] }, 0);

const packages = parseIgnoredBuilds(first.output);
if (!packages.length) {
  done({ ok: false, error: 'pnpm install failed, but not because of ignored build scripts.', output: first.output.slice(-1500) }, 1);
}

const file = path.join(cwd, 'pnpm-workspace.yaml');
const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const after = mergeAllowBuilds(before, packages);
if (after === before) {
  done({ ok: false, error: 'Every ignored package already has an allowBuilds entry, yet pnpm still fails.', packages, output: first.output.slice(-1500) }, 1);
}
fs.writeFileSync(file, after);

const second = install();
done(
  second.status === 0
    ? { ok: true, changed: true, file, denied: packages }
    : { ok: false, error: 'pnpm install still fails after writing allowBuilds.', file, denied: packages, output: second.output.slice(-1500) },
  second.status === 0 ? 0 : 1,
);
