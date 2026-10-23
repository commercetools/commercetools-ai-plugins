import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The exit-code and JSON contract of headless.mjs, which the reference documents: the agent
// branches on the exit code and reads one JSON object from stdout.
const script = fileURLToPath(new URL('../scripts/headless.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/headless-signin.json', import.meta.url));
// An empty fixture keeps a test off this machine's credentials file and the network.
const empty = fileURLToPath(new URL('./fixtures/empty.json', import.meta.url));
const run = (args, { cwd, env = {} } = {}) => {
  const r = spawnSync('node', [script, ...args], { cwd, encoding: 'utf8', timeout: 20000, env: { ...process.env, ...env } });
  let body = null;
  try { body = JSON.parse(r.stdout); } catch { /* asserted below */ }
  return { ...r, body };
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'headless-cli-'));

test('missing inputs: exit 2 with the errors keyed by field, and no log written', () => {
  const cwd = tmp();
  const r = run(['--fixture', empty, '--app-name', 'Nothing Else'], { cwd });
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.body.ok, false);
  assert.ok(r.body.errors.projectKey, JSON.stringify(r.body.errors));
  assert.ok(r.body.errors.contactEmail, JSON.stringify(r.body.errors));
  assert.deepEqual(fs.readdirSync(cwd), []);
});

test('a secret given with --set is refused, naming the environment variable to use instead', () => {
  const r = run(['--fixture', fixture, '--set', 'vercelToken=abc'], { cwd: tmp() });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.body.errors.set, /VERCEL_TOKEN/);
  assert.doesNotMatch(r.stderr + r.stdout, /abc/);
});

test('no plan: the run signs in (the login URL reaches stderr), then exits 4 with the Organizations and projects to choose from', () => {
  const cwd = tmp();
  const r = run(['--fixture', fixture], { cwd });
  assert.equal(r.status, 4, `${r.stderr}\n${r.stdout}`);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.needs.ctx, 'installPlan');
  assert.deepEqual(r.body.needs.options, [{ id: 'o1', name: 'Alpha', projects: [{ key: 'fct-dev', name: 'Dev' }] }]);
  assert.match(r.stderr, /https:\/\/mc-api\.example\/login\/authorize/);
  assert.ok(r.body.log && fs.existsSync(r.body.log), 'the log path is reported and exists');
});

test('with a plan and no --confirmed: exit 0 and the review, with nothing created', () => {
  const cwd = tmp();
  const planFile = path.join(cwd, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify([{ orgId: 'o1', orgName: 'Alpha', allProjects: true, projectKeys: [] }]));
  const r = run(['--fixture', fixture, '--install-plan', planFile], { cwd });
  assert.equal(r.status, 0, `${r.stderr}\n${r.stdout}`);
  assert.equal(r.body.stage, 'review');
  assert.equal(r.body.review.owner.id, 'o1');
  assert.equal(r.body.review.app.name, 'Fixture App');
  assert.equal(r.body.review.app.exists, false);
  assert.ok(!fs.existsSync(path.join(cwd, 'fixture-app')), 'nothing scaffolded without --confirmed');
});
