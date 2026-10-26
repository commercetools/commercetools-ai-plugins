#!/usr/bin/env node
// Reports what is and is not in place before onboarding starts. Prints one JSON object.
// Exit 0 when every required check passes, 1 otherwise. Never changes anything.
//
// Usage: node preflight.mjs --region gcp-eu [--entry-point my-app] [--hosting vercel|netlify|surge|<any>]
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { validateEntryPointUriPath, mcApiUrlForRegion } from './lib/validate.mjs';
import { readSession } from './lib/credentials.mjs';
import { hostingChecks } from './lib/hosting.mjs';
import { portCheck, parseLsof } from './lib/port.mjs';

const { values } = parseArgs({
  options: {
    region: { type: 'string' },
    'entry-point': { type: 'string' },
    hosting: { type: 'string' },
  },
});

const has = (cmd, args = ['--version']) => {
  try {
    return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n')[0];
  } catch {
    return null;
  }
};

const checks = [];
const add = (name, ok, detail, required = true) => checks.push({ name, ok, detail, required });

const nodeMajor = Number(process.versions.node.split('.')[0]);
add('node >= 20', nodeMajor >= 20, process.version);
const pm = has('pnpm') ?? has('npm');
add('package manager (pnpm or npm)', Boolean(pm), pm ?? 'neither found');
add('git', Boolean(has('git')), has('git') ?? 'not found');

const lsofListener = (port) => {
  try {
    return parseLsof(execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  } catch {
    return null; // lsof exits 1 when nothing matches
  }
};
const port = portCheck(3001, lsofListener);
add(port.name, port.ok, port.detail, port.required);

const mcApiUrl = values.region ? mcApiUrlForRegion(values.region) : null;
add('region is a known cloud identifier', Boolean(mcApiUrl), values.region ?? 'pass --region');

if (mcApiUrl) {
  const session = readSession({ mcApiUrl, home: os.homedir(), env: process.env });
  add('Merchant Center session', session.valid, session.valid ? 'valid' : session.reason);
}

if (values['entry-point']) {
  const v = validateEntryPointUriPath(values['entry-point']);
  add('entryPointUriPath is valid', v.ok, v.ok ? values['entry-point'] : v.error);
}

const runOrNull = (cmd, args) => has(cmd, args);
for (const c of hostingChecks(values.hosting, runOrNull)) add(c.name, c.ok, c.detail, c.required);

const ok = checks.filter((c) => c.required).every((c) => c.ok);
console.log(JSON.stringify({ ok, checks }, null, 2));
process.exit(ok ? 0 : 1);
