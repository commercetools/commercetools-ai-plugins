import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostingChecks } from '../scripts/lib/hosting.mjs';

const runner = (present) => (cmd, args) => (present[`${cmd} ${args.join(' ')}`] ?? null);

test('no provider named: no checks, never a Vercel assumption', () => {
  assert.deepEqual(hostingChecks(undefined, runner({})), []);
});

test('vercel with no CLI: one failing install check, no login check', () => {
  const r = hostingChecks('vercel', runner({}));
  assert.equal(r.length, 1);
  assert.equal(r[0].ok, false);
  assert.match(r[0].name, /vercel/i);
});

test('vercel CLI present but not logged in: install ok, login fails', () => {
  const r = hostingChecks('vercel', runner({ 'vercel --version': '39.0.0' }));
  assert.deepEqual(r.map((c) => c.ok), [true, false]);
  assert.match(r[1].detail, /vercel login/);
});

test('netlify uses its own CLI and status check', () => {
  const r = hostingChecks('netlify', runner({ 'netlify --version': 'netlify-cli/17', 'netlify status': 'Logged in' }));
  assert.deepEqual(r.map((c) => c.ok), [true, true]);
});

test('cloudflare checks wrangler and its login as JSON; connect checks the GitHub CLI, since the Connect API itself needs no CLI', () => {
  const cf = hostingChecks('cloudflare', runner({ 'wrangler --version': '4.151.1' }));
  assert.deepEqual(cf.map((c) => c.ok), [true, false]);
  assert.match(cf[1].detail, /wrangler login/);
  const ct = hostingChecks('connect', runner({ 'gh --version': 'gh version 2.80.0', 'gh auth status': 'Logged in to github.com' }));
  assert.deepEqual(ct.map((c) => c.ok), [true, true]);
  assert.match(hostingChecks('connect', runner({}))[0].detail, /brew install gh/);
});

test('provider without a table entry gets one advisory, non-required check', () => {
  const r = hostingChecks('render', runner({}));
  assert.equal(r.length, 1);
  assert.equal(r[0].required, false);
  assert.match(r[0].detail, /references\/hosting\/other\.md/);
});
