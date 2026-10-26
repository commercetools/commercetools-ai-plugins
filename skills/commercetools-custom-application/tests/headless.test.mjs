import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECRET_ENV, runHeadless } from '../scripts/lib/headless.mjs';
import { ctxFor, json, machine } from './machine.mjs';

// The headless runner is the session without a terminal: an agent gathers every input in chat,
// shows the review and gets one explicit yes, then runs the steps. A wait that needs a value is
// not a prompt but a result the agent reads, answers, and reruns with.
const owners = [{ id: 'o1', name: 'Alpha' }, { id: 'o2', name: 'Beta' }];
const plan = [{ orgId: 'o1', orgName: 'Alpha', allProjects: true }];
const existing = { '/work/this-is-a-test/package.json': '{}', '/work/this-is-a-test/custom-application-config.mjs': "defaultLabel: 'Test App'," };
const PRE = ['preflight.mjs', { stdout: json({ ok: true, checks: [] }) }];
const REG = ['register.mjs', { seq: [{ code: 3, stdout: json({ ok: true, done: false, stoppedAt: { step: 'DEPLOY', reason: 'not hosted' } }) }] }];
const FIN = ['--production-url', { stdout: json({ ok: true, done: true, steps: ['SYNC_URL', 'SET_READY', 'INSTALL'] }) }];
const VERIFY_OK = ['verify.mjs', { stdout: json({ ok: true, openInBrowser: 'https://mc.example/fct-dev/this-is-a-test' }) }];
const run = (m, ctx, over = {}) => runHeadless({ ctx, deps: m.deps, plan, owners, pollLimit: 3, sleep: async () => {}, ...over });
// The shared ctx names an owner the fake Organizations do not have; the headless runner derives
// the owner from the plan, so these tests start without one unless they say otherwise.
const base = (over = {}) => ctxFor({ orgId: undefined, ...over });

// `seq` answers one reply per call, like the fixture runner.
function machineSeq(answers, files) {
  const used = {};
  const resolved = answers.map(([pattern, reply]) => [pattern, reply.seq ? (line) => { used[pattern] = (used[pattern] ?? 0) + 1; return reply.seq[Math.min(used[pattern], reply.seq.length) - 1]; } : reply]);
  return machine(resolved, files);
}

test('without confirmation: preflight and sign-in run, the review comes back, and nothing in phase two runs', async () => {
  const m = machineSeq([PRE, REG], existing);
  const ctx = base({ deployHelp: false, productionUrl: 'https://x.example' });
  const r = await run(m, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.stage, 'review');
  assert.equal(r.review.owner.id, 'o1', 'one Organization in the plan is the owner without asking');
  assert.deepEqual(r.review.plan, plan);
  assert.equal(r.review.app.name, 'Test App');
  assert.equal(r.review.deployHelp, false);
  assert.ok(m.calls.every((c) => c.includes('preflight.mjs')), m.calls.join('\n'));
});

test('with confirmation: phase two runs to the end and the result carries the URLs', async () => {
  const m = machineSeq([PRE, VERIFY_OK, FIN, REG], existing);
  const ctx = base({ deployHelp: false, productionUrl: 'https://x.example' });
  const events = [];
  const r = await run(m, ctx, { confirmed: true, onEvent: (e) => events.push(e) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.productionUrl, 'https://x.example');
  assert.equal(r.opened, 'https://mc.example/fct-dev/this-is-a-test');
  assert.equal(r.owner, 'o1');
  assert.deepEqual(events.filter((e) => e.type === 'done' || e.type === 'skip').map((e) => e.id), ['preflight', 'session', 'scaffold', 'git-init', 'build', 'register', 'deploy', 'check', 'finish', 'open']);
});

test('several Organizations in the plan and no owner given: the run stops at the review with the owner as a list to pick from', async () => {
  const m = machineSeq([PRE], existing);
  const r = await runHeadless({ ctx: base({ orgId: undefined }), deps: m.deps, plan: [...plan, { orgId: 'o2', orgName: 'Beta', allProjects: true }], owners, sleep: async () => {} });
  assert.equal(r.ok, false);
  assert.equal(r.at, 'review');
  assert.deepEqual(r.needs, { ctx: 'orgId', label: 'Owner Organization', options: [{ id: 'o1', name: 'Alpha', plan: '', current: false }, { id: 'o2', name: 'Beta', plan: '', current: false }] });
});

test('a step that needs a value stops with that need, names the env var for a secret, and runs nothing more', async () => {
  const MULTI = { code: 1, stderr: 'Error: Multiple teams found. Teams are never auto-selected when the CLI runs without an interactive terminal.' };
  const TEAMS = { stdout: '  id              Team name       Plan\n✔ acme-projects   acme projects   hobby\n  commercetools   commercetools   pro' };
  const m = machineSeq([PRE, REG, ['vercel link', MULTI], ['vercel teams ls', TEAMS]], { ...existing, '/work/this-is-a-test/.vercel/project.json': json({ projectName: 'this-is-a-test' }) });
  const r = await run(m, base(), { confirmed: true });
  assert.equal(r.ok, false);
  assert.equal(r.at, 'deploy');
  assert.equal(r.needs.ctx, 'vercelTeam');
  assert.equal(r.needs.options.length, 2);
  assert.ok(!m.calls.some((c) => c.includes('vercel deploy')));
  const notSignedIn = machineSeq([PRE, REG, ['vercel link', { code: 1, stderr: 'Error: No existing credentials found. Please run `vercel login`' }]], existing);
  const r2 = await run(notSignedIn, base(), { confirmed: true });
  assert.equal(r2.needs.ctx, 'vercelToken');
  assert.equal(r2.needs.secret, true);
  assert.equal(r2.needs.env, 'VERCEL_TOKEN');
  assert.equal(SECRET_ENV.ctClientSecret, 'CTP_CLIENT_SECRET');
});

test('an answer given up front fills the ctx and the run carries on past that question', async () => {
  const m = machineSeq([PRE, VERIFY_OK, FIN, REG, ['vercel deploy', { stdout: 'Aliased: https://this-is-a-test.vercel.app [3s]' }]], { ...existing, '/work/this-is-a-test/.vercel/project.json': json({ projectName: 'this-is-a-test' }) });
  const r = await run(m, base({ vercelTeam: 'commercetools' }), { confirmed: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  for (const c of m.calls.filter((c) => c.startsWith('vercel '))) assert.match(c, /--scope commercetools/);
});

test('a polling wait polls by itself up to the limit, then stops naming the step', async () => {
  const m = machineSeq([PRE, ['verify.mjs', { code: 1, stdout: json({ ok: false, hostCheck: { problems: ['App path returned 404 without an app shell.'] } }) }], FIN, REG, ['vercel deploy', { stdout: 'Aliased: https://this-is-a-test.vercel.app [3s]' }]], { ...existing, '/work/this-is-a-test/.vercel/project.json': json({ projectName: 'this-is-a-test' }) });
  const slept = [];
  const r = await run(m, base({ vercelTeam: 'commercetools', hostAttempts: 12 }), { confirmed: true, pollLimit: 2, sleep: async (ms) => { slept.push(ms); } });
  assert.equal(r.ok, false);
  assert.equal(r.at, 'check');
  assert.equal(r.needs, undefined);
  assert.equal(m.calls.filter((c) => c.includes('verify.mjs')).length, 3, 'the first check plus two polls');
  assert.equal(slept.length, 2);
});

// The agent cannot list Organizations before the sign-in, and the runner owns the sign-in. So a run
// without a plan signs in, then stops with the Organizations and their projects to choose from.
test('no plan yet: after the sign-in the run stops with needs installPlan listing Organizations and projects, and runs nothing more', async () => {
  const m = machineSeq([PRE, REG], existing);
  const projects = [{ key: 'p1', name: 'One', owner: { id: 'o1' } }, { key: 'p2', name: 'Two', owner: { id: 'o2' } }, { key: 'p0', name: 'Zero', owner: { id: 'o1' } }];
  const r = await runHeadless({ ctx: base(), deps: m.deps, plan: null, owners, targets: async () => projects, confirmed: true, sleep: async () => {} });
  assert.equal(r.ok, false);
  assert.equal(r.at, 'review');
  assert.equal(r.needs.ctx, 'installPlan');
  assert.match(r.needs.hint, /--install-plan/);
  assert.deepEqual(r.needs.options, [
    { id: 'o1', name: 'Alpha', projects: [{ key: 'p0', name: 'Zero' }, { key: 'p1', name: 'One' }] },
    { id: 'o2', name: 'Beta', projects: [{ key: 'p2', name: 'Two' }] },
  ]);
  assert.ok(m.calls.every((c) => c.includes('preflight.mjs')), m.calls.join('\n'));
});

// A run that starts without a session signs in first, so the Organizations are read only after
// that sign-in, never from the empty list a signed-out start would give.
test('owners and targets given as functions are read after the sign-in', async () => {
  let valid = false;
  const m = machineSeq([PRE, REG], existing);
  m.deps.sessionValid = () => valid;
  m.deps.startLogin = () => { valid = true; return { running: () => true, kill: () => {} }; };
  const reads = [];
  const lateOwners = async () => { reads.push(valid); return owners; };
  const r = await runHeadless({ ctx: base({ deployHelp: false, productionUrl: 'https://x.example' }), deps: m.deps, plan, owners: lateOwners, sleep: async () => {} });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.review.owner.id, 'o1');
  assert.deepEqual(reads, [true], 'the Organizations were listed once, with a valid session');
});

// The login runs detached and holds port 3001. A run that gives up waiting for it has to kill it,
// or the rerun's preflight fails on the port instead of resuming.
test('a sign-in that is not finished within the poll limit stops at the session step and kills the login it started', async () => {
  const m = machineSeq([PRE], existing);
  m.deps.sessionValid = () => false;
  let killed = 0;
  m.deps.startLogin = () => ({ running: () => true, kill: () => { killed += 1; } });
  const r = await runHeadless({ ctx: base(), deps: m.deps, plan, owners, pollLimit: 1, sleep: async () => {} });
  assert.equal(r.ok, false);
  assert.equal(r.at, 'session');
  assert.equal(r.needs, undefined);
  assert.equal(killed, 1, 'the login was killed before the run returned');
});

test('a plain failure stops with the step and its error, and never prompts', async () => {
  const m = machineSeq([PRE, REG, ['vercel link', {}], ['vercel build', { code: 1, stderr: 'Error: build failed' }]], { ...existing, '/work/this-is-a-test/.vercel/project.json': json({ projectName: 'this-is-a-test' }) });
  const r = await run(m, base(), { confirmed: true });
  assert.equal(r.ok, false);
  assert.equal(r.failedAt, 'deploy');
  assert.match(r.error, /build failed/);
  assert.equal(r.needs, undefined);
});
