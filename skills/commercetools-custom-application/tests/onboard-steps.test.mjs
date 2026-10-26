import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, deployHelpOn } from '../scripts/lib/onboard-steps.mjs';
import { runSession } from '../scripts/lib/session.mjs';

// A fake machine: exec answers by matching the command line, and everything is recorded.
function machine(answers, files = {}) {
  const calls = [];
  const cwds = [];
  const written = {};
  const relocated = [];
  const exec = async (cmd, args, opts = {}) => {
    const line = [cmd, ...args].join(' ');
    calls.push(line);
    cwds.push(opts.cwd);
    for (const [pattern, reply] of answers) {
      if (line.includes(pattern)) {
        const r = typeof reply === 'function' ? reply(line, calls) : reply;
        for (const l of String(r.stdout ?? '').split('\n').filter(Boolean)) opts.onLine?.(l);
        return { code: 0, stdout: '', stderr: '', ...r };
      }
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const deps = {
    exec,
    readFile: async (p) => { if (p in files) return files[p]; if (p in written) return written[p]; throw new Error(`ENOENT ${p}`); },
    writeFile: async (p, c) => { written[p] = c; },
    exists: (p) => p in files || p in written,
    rename: async (from, to) => { written[to] = files[from] ?? written[from]; },
    relocateLog: (to) => { relocated.push(to); },
    platform: 'darwin',
    sessionValid: () => true,
    skillDir: '/skill',
  };
  return { calls, cwds, written, files, relocated, deps };
}
const ctxFor = (over = {}) => ({
  appDir: '/app', region: 'gcp-eu', entryPoint: 'this-is-a-test', hosting: 'vercel', appName: 'Test App',
  menuLabel: 'Test App', template: 'starter-typescript', projectKey: 'fct-dev',
  installPlan: '/app/install-plan.json', orgId: 'org1', contactEmail: 'a@b.co', openProjectKey: 'fct-dev', ...over,
});
const existingApp = { '/app/package.json': '{}', '/app/custom-application-config.mjs': "defaultLabel: 'Test App'," };
const find = (steps, id) => steps.find((s) => s.id === id);
const json = (o) => JSON.stringify(o);
const run = (steps, id, ctx, log = () => {}) => find(steps, id).run(ctx, log);

test('the session lists its steps in the order the user will see them', () => {
  const { deps } = machine([]);
  assert.deepEqual(buildSteps(ctxFor(), deps).map((s) => s.id), ['preflight', 'session', 'scaffold', 'git-init', 'build', 'register', 'deploy', 'check', 'finish', 'open']);
});

test('preflight passes when only the session check fails (the session step handles that)', async () => {
  const { deps } = machine([['preflight.mjs', { stdout: json({ ok: false, checks: [{ name: 'Merchant Center session', ok: false, detail: 'expired', required: true }, { name: 'git', ok: true, required: true }] }), code: 1 }]]);
  assert.equal((await run(buildSteps(ctxFor(), deps), 'preflight', ctxFor())).status, 'done');
});

test('preflight fails on any other required check and says which', async () => {
  const { deps } = machine([['preflight.mjs', { stdout: json({ ok: false, checks: [{ name: 'port 3001 is free', ok: false, detail: 'node (pid 9) is listening', required: true }] }), code: 1 }]]);
  const r = await run(buildSteps(ctxFor(), deps), 'preflight', ctxFor());
  assert.equal(r.status, 'fail');
  assert.match(r.error, /port 3001/);
});

// Before the scaffold step the app folder does not exist, and spawning inside a missing folder
// fails with a misleading "spawn node ENOENT". Preflight runs in the parent until then.
test('preflight runs in the parent folder while the app does not exist yet, and in the app once it does', async () => {
  const fresh = machine([['preflight.mjs', { stdout: json({ ok: true, checks: [] }) }]]);
  const ctx = ctxFor({ appDir: '/work/app' });
  assert.equal((await run(buildSteps(ctx, fresh.deps), 'preflight', ctx)).status, 'done');
  assert.deepEqual(fresh.cwds, ['/work']);
  const existing = machine([['preflight.mjs', { stdout: json({ ok: true, checks: [] }) }]], { '/work/app': '', ...existingApp });
  await run(buildSteps(ctx, existing.deps), 'preflight', ctx);
  assert.deepEqual(existing.cwds, ['/work/app']);
});

// With the Connect layout neither the app nor its repository root exists before the scaffold.
test('preflight runs in the nearest existing ancestor when the Connect repository root is not there yet', async () => {
  const fresh = machine([['preflight.mjs', { stdout: json({ ok: true, checks: [] }) }]]);
  const ctx = ctxFor({ hosting: 'connect', repoDir: '/work/repo', appDir: '/work/repo/app' });
  assert.equal((await run(buildSteps(ctx, fresh.deps), 'preflight', ctx)).status, 'done');
  assert.deepEqual(fresh.cwds, ['/work']);
  const rooted = machine([['preflight.mjs', { stdout: json({ ok: true, checks: [] }) }]], { '/work/repo': '' });
  await run(buildSteps(ctx, rooted.deps), 'preflight', ctx);
  assert.deepEqual(rooted.cwds, ['/work/repo']);
});

test('asking for deployment help on a host the session does not know stops early with a pointer to the hosting contract', async () => {
  const { deps } = machine([]);
  const ctx = ctxFor({ hosting: 'render', deployHelp: true });
  const r = await run(buildSteps(ctx, deps), 'preflight', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /render/);
  assert.match(r.error, /other\.md/);
});

// Deployment help defaults on for every host the session has a provider for, and off otherwise.
test('deployHelpOn follows the provider table, not a hard-coded host', () => {
  assert.equal(deployHelpOn({ hosting: 'vercel' }), true);
  assert.equal(deployHelpOn({ hosting: 'render' }), false);
  assert.equal(deployHelpOn({ hosting: 'other' }), false);
  assert.equal(deployHelpOn({ hosting: 'render', deployHelp: true }), true);
});

test('the deploy step is titled after the host', () => {
  const { deps } = machine([]);
  assert.equal(find(buildSteps(ctxFor({ hosting: 'vercel' }), deps), 'deploy').title, 'Deploy to Vercel');
  assert.equal(find(buildSteps(ctxFor({ hosting: 'other' }), deps), 'deploy').title, 'Deploy');
});

// The login command never exits on its own (its callback server stays up), so the step starts it in
// the background and treats the credentials file as the signal, waiting with the session's quit key.
function loginMachine(answers = []) {
  const m = machine(answers);
  m.logins = [];
  m.deps.startLogin = ({ mcApiUrl, onLine }) => {
    const handle = { mcApiUrl, alive: true, killed: false, running: () => handle.alive, kill: () => { handle.killed = true; handle.alive = false; } };
    onLine?.('  https://mc-api.example/login/authorize?state=abc');
    m.logins.push(handle);
    return handle;
  };
  return m;
}

test('session step is skipped when the session is valid', async () => {
  assert.equal(await find(buildSteps(ctxFor(), machine([]).deps), 'session').isDone(ctxFor()), true);
});

test('session step starts the login in the background and waits, showing the login URL', async () => {
  const m = loginMachine();
  m.deps.sessionValid = () => false;
  const ctx = ctxFor();
  const lines = [];
  const r = await run(buildSteps(ctx, m.deps), 'session', ctx, (l) => lines.push(l));
  assert.equal(r.status, 'wait');
  assert.match(r.reason, /login/i);
  assert.ok(r.pollMs <= 3000, 'the login wait re-checks quickly');
  assert.equal(m.logins.length, 1);
  assert.equal(m.logins[0].mcApiUrl, 'https://mc-api.europe-west1.gcp.commercetools.com');
  assert.ok(lines.some((l) => l.includes('/login/authorize')));
  assert.equal(m.calls.length, 0, 'the login is not run through exec, which would block on exit');
});

test('while the login is still running a re-check waits again without starting a second login', async () => {
  const m = loginMachine();
  m.deps.sessionValid = () => false;
  const ctx = ctxFor();
  const steps = buildSteps(ctx, m.deps);
  await run(steps, 'session', ctx);
  const r = await run(steps, 'session', ctx);
  assert.equal(r.status, 'wait');
  assert.equal(m.logins.length, 1);
});

test('once the credentials file is valid the step finishes and stops the login process', async () => {
  const m = loginMachine();
  let ok = false;
  m.deps.sessionValid = () => ok;
  const ctx = ctxFor();
  const steps = buildSteps(ctx, m.deps);
  await run(steps, 'session', ctx);
  ok = true;
  const r = await run(steps, 'session', ctx);
  assert.equal(r.status, 'done');
  assert.equal(m.logins[0].killed, true);
  assert.equal(ctx.login, null);
});

test('if the login process ends without a valid session the step fails and can be restarted', async () => {
  const m = loginMachine();
  m.deps.sessionValid = () => false;
  const ctx = ctxFor();
  const steps = buildSteps(ctx, m.deps);
  await run(steps, 'session', ctx);
  m.logins[0].alive = false;
  const r = await run(steps, 'session', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /login/i);
  assert.equal(ctx.login, null);
});

test('first registration pass waits on the email click, then finishes at DEPLOY', async () => {
  let n = 0;
  const m = machine([['register.mjs', () => (++n === 1
    ? { code: 3, stdout: json({ ok: true, done: false, stoppedAt: { step: 'VERIFY_EMAIL', reason: 'Open the verification link sent to a@b.co.' } }) }
    : { code: 3, stdout: json({ ok: true, done: false, stoppedAt: { step: 'DEPLOY', reason: 'not hosted' } }) })]]);
  const steps = buildSteps(ctxFor(), m.deps);
  const first = await run(steps, 'register', ctxFor());
  assert.equal(first.status, 'wait');
  assert.match(first.reason, /verification link/);
  assert.equal((await run(steps, 'register', ctxFor())).status, 'done');
  assert.ok(m.calls[0].includes('--org-id org1') && m.calls[0].includes('--install-plan /app/install-plan.json') && m.calls[0].includes('--contact-email a@b.co'));
  assert.equal(m.calls[0].includes('--production-url'), false);
});

test('registration errors become failures with the script\'s message', async () => {
  const m = machine([['register.mjs', { code: 1, stdout: json({ ok: false, error: 'FORBIDDEN (no code)' }) }]]);
  const r = await run(buildSteps(ctxFor(), m.deps), 'register', ctxFor());
  assert.deepEqual([r.status, r.error], ['fail', 'FORBIDDEN (no code)']);
});

const deployAnswers = (deployedUrl) => [
  ['vercel link', {}],
  ['vercel deploy', { stdout: `Production: https://x-abc-team.vercel.app [3s]\nAliased: ${deployedUrl} [3s]` }],
];
const projectFile = { '/app/.vercel/project.json': json({ projectName: 'this-is-a-test' }) };

test('deploy runs allow-builds, link, config patch, pull, build, deploy in that order and records the URL', async () => {
  const m = machine(deployAnswers('https://this-is-a-test.vercel.app'), projectFile);
  const ctx = ctxFor();
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx);
  assert.equal(r.status, 'done');
  assert.equal(ctx.productionUrl, 'https://this-is-a-test.vercel.app');
  const order = ['allow-builds.mjs', 'vercel link', 'patch-config.mjs', 'vercel pull', 'vercel build', 'vercel deploy'].map((k) => m.calls.findIndex((c) => c.includes(k)));
  assert.ok(order.every((i) => i >= 0), order.join());
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(m.calls.find((c) => c.includes('patch-config.mjs')).includes('--url https://this-is-a-test.vercel.app'));
  assert.ok(m.calls.find((c) => c.includes('vercel deploy')).includes('--prebuilt --prod'));
});

test('deploy writes vercel.json with the rewrite before building', async () => {
  const m = machine(deployAnswers('https://this-is-a-test.vercel.app'), projectFile);
  const ctx = ctxFor();
  await run(buildSteps(ctx, m.deps), 'deploy', ctx);
  const written = JSON.parse(m.written['/app/vercel.json']);
  assert.deepEqual(written.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
});

test('if Vercel serves a different domain than planned, deploy repatches the config and redeploys once', async () => {
  const m = machine(deployAnswers('https://other-name.vercel.app'), projectFile);
  const ctx = ctxFor();
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx);
  assert.equal(r.status, 'done');
  assert.equal(ctx.productionUrl, 'https://other-name.vercel.app');
  assert.equal(m.calls.filter((c) => c.includes('vercel deploy')).length, 2);
  assert.ok(m.calls.filter((c) => c.includes('patch-config.mjs')).at(-1).includes('--url https://other-name.vercel.app'));
});

test('deploy fails with the raw output when no trustworthy URL can be found', async () => {
  const m = machine([['vercel link', {}], ['vercel deploy', { stdout: 'Inspect: https://vercel.com/t/p/abc [2s]' }]], projectFile);
  const ctx = ctxFor();
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /Inspect: https:\/\/vercel\.com/);
  assert.equal(ctx.productionUrl, undefined);
});

test('deploy fails clearly when a command exits non-zero, naming it', async () => {
  const m = machine([['vercel build', { code: 1, stderr: 'Error: build failed' }]], projectFile);
  const r = await run(buildSteps(ctxFor(), m.deps), 'deploy', ctxFor());
  assert.equal(r.status, 'fail');
  assert.match(r.error, /vercel build/);
  assert.match(r.error, /build failed/);
});

// The Vercel CLI refuses to pick a team without a terminal, and may not be signed in at all.
// Both become answers typed into the screen, not dead ends.
const MULTI = { code: 1, stderr: 'Vercel CLI 63.1.2\nLoading teams…\nError: Multiple teams found. Teams are never auto-selected when the CLI runs without an interactive terminal. Re-run this command with "--team <slug>", or run `vercel teams ls` to list your teams.' };
const TEAMS = { stdout: '  id              Team name       Plan\n✔ acme-projects   acme projects   hobby\n  commercetools   commercetools   pro' };

test('when Vercel has several teams, deploy offers them as a list to pick from', async () => {
  const m = machine([['vercel link', MULTI], ['vercel teams ls', TEAMS]], projectFile);
  const ctx = ctxFor();
  const logged = [];
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx, (l) => logged.push(l));
  assert.equal(r.status, 'fail');
  assert.match(r.error, /several teams/i);
  assert.deepEqual(r.input, {
    ctx: 'vercelTeam',
    label: 'Vercel team',
    options: [
      { id: 'acme-projects', name: 'acme projects', plan: 'hobby', current: true },
      { id: 'commercetools', name: 'commercetools', plan: 'pro', current: false },
    ],
  });
  assert.ok(m.calls.some((c) => c.startsWith('vercel teams ls')));
  assert.ok(!logged.some((l) => l.includes('commercetools')), 'the table is not repeated in the step output');
});

// Vercel CLI 63 without a terminal prints a JSON payload with the teams in `choices` instead of
// "Multiple teams found". The picker reads the teams from it and needs no `teams ls`.
const MISSING_SCOPE = {
  code: 1,
  stdout: 'Vercel CLI 63.1.2\nLoading teams…\n{\n  "status": "action_required",\n  "reason": "missing_scope",\n  "message": "Provide --team or --scope explicitly. No default is applied in non-interactive mode.",\n  "choices": [\n    { "id": "team_aaa", "name": "personal-projects" },\n    { "id": "team_bbb", "name": "commercetools" }\n  ]\n}\n',
};

test('a missing_scope payload from vercel link becomes the team picker, using the payload\'s teams', async () => {
  const m = machine([['vercel link', MISSING_SCOPE]], projectFile);
  const ctx = ctxFor();
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /several teams/i);
  assert.deepEqual(r.input, {
    ctx: 'vercelTeam',
    label: 'Vercel team',
    options: [
      { id: 'team_aaa', name: 'personal-projects', plan: '', current: false },
      { id: 'team_bbb', name: 'commercetools', plan: '', current: false },
    ],
  });
  assert.ok(!m.calls.some((c) => c.startsWith('vercel teams ls')), 'the payload already lists the teams');
});

test('a missing_scope payload without choices falls back to the team table, then to typing the id', async () => {
  const bare = { code: 1, stdout: '{"status":"action_required","reason":"missing_scope"}' };
  const withTable = machine([['vercel link', bare], ['vercel teams ls', TEAMS]], projectFile);
  const ctx = ctxFor();
  const r = await run(buildSteps(ctx, withTable.deps), 'deploy', ctx);
  assert.equal(r.input.options.length, 2);
  assert.ok(withTable.calls.some((c) => c.startsWith('vercel teams ls')));
  const unreadable = machine([['vercel link', bare], ['vercel teams ls', { stdout: 'Something unexpected' }]], projectFile);
  assert.deepEqual((await run(buildSteps(ctx, unreadable.deps), 'deploy', ctx)).input, { ctx: 'vercelTeam', label: 'Vercel team id' });
});

test('after the user picks a team from a missing_scope payload, the link goes through with --scope', async () => {
  const m = machine([['vercel link', (line) => (line.includes('--scope team_bbb') ? {} : MISSING_SCOPE)], ...deployAnswers('https://x.vercel.app').filter(([p]) => p !== 'vercel link')], projectFile);
  const ctx = ctxFor();
  assert.equal((await run(buildSteps(ctx, m.deps), 'deploy', ctx)).status, 'fail');
  ctx.vercelTeam = 'team_bbb';
  assert.equal((await run(buildSteps(ctx, m.deps), 'deploy', ctx)).status, 'done');
});

test('when the team table cannot be read, deploy shows the raw output and asks for the team id typed', async () => {
  const m = machine([['vercel link', MULTI], ['vercel teams ls', { stdout: 'Something unexpected' }]], projectFile);
  const ctx = ctxFor();
  const logged = [];
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx, (l) => logged.push(l));
  assert.equal(r.status, 'fail');
  assert.deepEqual(r.input, { ctx: 'vercelTeam', label: 'Vercel team id' });
  assert.ok(logged.some((l) => l.includes('Something unexpected')), 'the raw output is shown in the step output');
});

test('with a team chosen every Vercel command carries --scope, and the link goes through', async () => {
  const m = machine(deployAnswers('https://x.vercel.app'), projectFile);
  const ctx = ctxFor({ vercelTeam: 'commercetools' });
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx);
  assert.equal(r.status, 'done');
  const vercelCalls = m.calls.filter((c) => c.startsWith('vercel '));
  assert.ok(vercelCalls.length >= 4);
  for (const c of vercelCalls) assert.match(c, /--scope commercetools/, c);
});

test('a team id Vercel does not know is asked for again, and the wrong one is forgotten', async () => {
  const m = machine([['vercel link', { code: 1, stderr: 'Error: The specified scope does not exist' }]], projectFile);
  const ctx = ctxFor({ vercelTeam: 'typo' });
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /typo/);
  assert.equal(r.input.ctx, 'vercelTeam');
  assert.equal(ctx.vercelTeam, undefined);
});

test('when the Vercel CLI is not signed in, deploy asks for a token as a secret, or a retry after vercel login', async () => {
  const m = machine([['vercel link', { code: 1, stderr: 'Error: No existing credentials found. Please run `vercel login` or pass "--token"' }]], projectFile);
  const ctx = ctxFor();
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /vercel login/);
  assert.equal(r.input.ctx, 'vercelToken');
  assert.equal(r.input.secret, true);
});

test('a token that Vercel rejects is forgotten and asked for again', async () => {
  const m = machine([['vercel link', { code: 1, stderr: 'Error: The token provided via `--token` argument is not valid. Please provide a valid token.' }]], projectFile);
  const ctx = ctxFor({ vercelToken: 'bad' });
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx);
  assert.equal(r.status, 'fail');
  assert.equal(r.input.ctx, 'vercelToken');
  assert.equal(ctx.vercelToken, undefined);
});

test('with a token every Vercel command carries --token', async () => {
  const m = machine(deployAnswers('https://x.vercel.app'), projectFile);
  const ctx = ctxFor({ vercelToken: 'tok' });
  assert.equal((await run(buildSteps(ctx, m.deps), 'deploy', ctx)).status, 'done');
  for (const c of m.calls.filter((c) => c.startsWith('vercel '))) assert.match(c, /--token tok/, c);
});

test('deploy fails if the link did not produce a project name (no guessing from the folder)', async () => {
  const m = machine(deployAnswers('https://x.vercel.app'), {});
  const r = await run(buildSteps(ctxFor(), m.deps), 'deploy', ctxFor());
  assert.equal(r.status, 'fail');
  assert.match(r.error, /project\.json/);
});

// The host check polls on its own while the deploy propagates: the wait is marked as polling so
// the screen shows progress, not a problem. Answers that no amount of waiting fixes fail at once.
test('host check polls while the host is not ready, says which attempt it is, and fails after the attempts are used', async () => {
  const bad = { code: 1, stdout: json({ ok: false, hostCheck: { problems: ['App path returned 404 without an app shell.'] } }) };
  const m = machine([['verify.mjs', bad]]);
  const ctx = ctxFor({ productionUrl: 'https://x.vercel.app', hostAttempts: 2 });
  const steps = buildSteps(ctx, m.deps);
  const first = await run(steps, 'check', ctx);
  assert.equal(first.status, 'wait');
  assert.equal(first.polling, true);
  assert.match(first.reason, /attempt 1 of 2/);
  assert.match(first.reason, /404/);
  const last = await run(steps, 'check', ctx);
  assert.equal(last.status, 'fail');
  assert.match(last.error, /404/);
  assert.equal(ctx.hostTries, 0, 'r after the failure starts a fresh round of checks, not a single one');
  assert.match((await run(steps, 'check', ctx)).reason, /attempt 1 of 2/);
});

test('a 401 or 403 from the host is Deployment Protection, not propagation: the check fails at once with that guidance', async () => {
  const bad = { code: 1, stdout: json({ ok: false, hostCheck: { problems: ['App path returned 401 without an app shell.'] } }) };
  const m = machine([['verify.mjs', bad]]);
  const ctx = ctxFor({ productionUrl: 'https://x.vercel.app' });
  const r = await run(buildSteps(ctx, m.deps), 'check', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /401/);
  assert.match(r.error, /Deployment Protection/i);
  assert.match(r.error, /vercel\.com/i, 'says where to turn it off');
});

test('a certificate error from the host check is not retried: it fails at once with the CA hint', async () => {
  const bad = { code: 1, stdout: json({ ok: false, error: 'Could not reach https://x.vercel.app/p/e: UNABLE_TO_GET_ISSUER_CERT_LOCALLY; curl: (60) SSL problem. Set NODE_EXTRA_CA_CERTS to the trusted CA bundle.' }) };
  const m = machine([['verify.mjs', bad]]);
  const ctx = ctxFor({ productionUrl: 'https://x.vercel.app' });
  const r = await run(buildSteps(ctx, m.deps), 'check', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /NODE_EXTRA_CA_CERTS/);
  assert.equal(ctx.hostTries ?? 0, 0, 'no attempt is counted, nothing was waited for');
});

test('host check passes and records the URL to open', async () => {
  const m = machine([['verify.mjs', { stdout: json({ ok: true, openInBrowser: 'https://mc.europe-west1.gcp.commercetools.com/fct-dev/this-is-a-test' }) }]]);
  const ctx = ctxFor({ productionUrl: 'https://x.vercel.app' });
  assert.equal((await run(buildSteps(ctx, m.deps), 'check', ctx)).status, 'done');
  assert.equal(ctx.openUrl, 'https://mc.europe-west1.gcp.commercetools.com/fct-dev/this-is-a-test');
  assert.ok(m.calls[0].includes('--production-url https://x.vercel.app') && m.calls[0].includes('--project-key fct-dev'));
});

test('finishing registration passes the production URL and succeeds on done', async () => {
  const m = machine([['register.mjs', { stdout: json({ ok: true, done: true, steps: ['SYNC_URL', 'SET_READY', 'INSTALL'] }) }]]);
  const ctx = ctxFor({ productionUrl: 'https://x.vercel.app' });
  const r = await run(buildSteps(ctx, m.deps), 'finish', ctx);
  assert.equal(r.status, 'done');
  assert.match(r.detail, /SYNC_URL/);
  assert.ok(m.calls[0].includes('--production-url https://x.vercel.app'));
});

test('finishing registration stops with the reason when a person must decide (install mismatch)', async () => {
  const m = machine([['register.mjs', { code: 3, stdout: json({ ok: true, done: false, stoppedAt: { step: 'INSTALL_MISMATCH', reason: 'installed on selected projects only' } }) }]]);
  const ctx = ctxFor({ productionUrl: 'https://x.vercel.app' });
  const r = await run(buildSteps(ctx, m.deps), 'finish', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /INSTALL_MISMATCH/);
});

test('open launches the browser with the URL from the host check, via an argument array', async () => {
  const m = machine([]);
  const ctx = ctxFor({ openUrl: 'https://mc.europe-west1.gcp.commercetools.com/fct-dev/this-is-a-test' });
  const r = await run(buildSteps(ctx, m.deps), 'open', ctx);
  assert.equal(r.status, 'done');
  assert.equal(m.calls[0], 'open https://mc.europe-west1.gcp.commercetools.com/fct-dev/this-is-a-test');
});

test('open fails without a URL instead of opening something else', async () => {
  const m = machine([]);
  assert.equal((await run(buildSteps(ctxFor(), m.deps), 'open', ctxFor())).status, 'fail');
});

test('the whole session runs end to end against the fake machine and ends with the browser opening', async () => {
  const m = machine([
    ['preflight.mjs', { stdout: json({ ok: true, checks: [] }) }],
    ['register.mjs', (line) => (line.includes('--production-url')
      ? { stdout: json({ ok: true, done: true, steps: ['INSTALL'] }) }
      : { code: 3, stdout: json({ ok: true, done: false, stoppedAt: { step: 'DEPLOY', reason: '' } }) })],
    ['vercel link', {}],
    ['vercel deploy', { stdout: 'Aliased: https://this-is-a-test.vercel.app [3s]' }],
    ['verify.mjs', { stdout: json({ ok: true, openInBrowser: 'https://mc.example.com/fct-dev/this-is-a-test' }) }],
  ], { ...projectFile, ...existingApp });
  const ctx = ctxFor();
  const events = [];
  const r = await runSession({ steps: buildSteps(ctx, m.deps), ctx, report: (e) => events.push(e), wake: async () => 'retry' });
  assert.deepEqual(r, { ok: true });
  assert.equal(m.calls.at(-1), 'open https://mc.example.com/fct-dev/this-is-a-test');
  assert.deepEqual(events.filter((e) => e.type === 'done' || e.type === 'skip').map((e) => e.id), ['preflight', 'session', 'scaffold', 'git-init', 'build', 'register', 'deploy', 'check', 'finish', 'open']);
});

// ---- deployment help is optional -------------------------------------------------------------

test('deployment help defaults on for a host with a provider and off for every other host, unless set', () => {
  assert.equal(deployHelpOn({ hosting: 'vercel' }), true);
  assert.equal(deployHelpOn({ hosting: 'render' }), false);
  assert.equal(deployHelpOn({ hosting: 'vercel', deployHelp: false }), false);
  assert.equal(deployHelpOn({ hosting: 'render', deployHelp: true }), true);
});

test('with help off the deploy step asks for the production URL and runs nothing', async () => {
  const m = machine([]);
  const ctx = ctxFor({ deployHelp: false });
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx);
  assert.equal(r.status, 'wait');
  assert.equal(r.input, 'url');
  assert.match(r.reason, /production URL/i);
  assert.deepEqual(m.calls, []);
});

test('with help off a valid https URL is accepted without touching Vercel', async () => {
  const m = machine([]);
  const ctx = ctxFor({ deployHelp: false, productionUrl: 'https://my-app.example.com' });
  const r = await run(buildSteps(ctx, m.deps), 'deploy', ctx);
  assert.equal(r.status, 'done');
  assert.deepEqual(m.calls, []);
  assert.equal(ctx.productionUrl, 'https://my-app.example.com');
});

test('with help off an http or malformed URL is rejected and asked for again', async () => {
  for (const bad of ['http://my-app.example.com', 'my-app.example.com', 'not a url']) {
    const ctx = ctxFor({ deployHelp: false, productionUrl: bad });
    const r = await run(buildSteps(ctx, machine([]).deps), 'deploy', ctx);
    assert.equal(r.status, 'wait', bad);
    assert.equal(r.input, 'url');
    assert.match(r.reason, /https/);
    assert.equal(ctx.productionUrl, undefined);
  }
});

test('a non-Vercel host with help off passes preflight', async () => {
  const m = machine([['preflight.mjs', { stdout: json({ ok: true, checks: [] }) }]]);
  const ctx = ctxFor({ hosting: 'netlify' });
  assert.equal((await run(buildSteps(ctx, m.deps), 'preflight', ctx)).status, 'done');
});

test('help off on Vercel never runs link, build or deploy in a full session', async () => {
  const m = machine([
    ['preflight.mjs', { stdout: json({ ok: true, checks: [] }) }],
    ['register.mjs', (line) => (line.includes('--production-url')
      ? { stdout: json({ ok: true, done: true, steps: [] }) }
      : { code: 3, stdout: json({ ok: true, done: false, stoppedAt: { step: 'DEPLOY', reason: '' } }) })],
    ['verify.mjs', { stdout: json({ ok: true, openInBrowser: 'https://mc.example.com/p/e' }) }],
  ], existingApp);
  const ctx = ctxFor({ deployHelp: false, productionUrl: 'https://mine.example.com' });
  const r = await runSession({ steps: buildSteps(ctx, m.deps), ctx, report: () => {}, wake: async () => 'retry' });
  assert.equal(r.ok, true);
  assert.equal(m.calls.some((c) => c.startsWith('vercel')), false);
});

test('a passing host check without an app URL fails right there, not one step later', async () => {
  const m = machine([['verify.mjs', { stdout: json({ ok: true }) }]]);
  const ctx = ctxFor({ productionUrl: 'https://x.vercel.app' });
  const r = await run(buildSteps(ctx, m.deps), 'check', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /app URL/i);
  assert.equal(ctx.openUrl, undefined);
});

// ---- starting from scratch: scaffold and build -------------------------------------------------
const CONFIG = `const config = {\n  mainMenuLink: {\n    defaultLabel: 'Template starter',\n    labelAllLocales: [],\n  },\n};`;

test('scaffold is skipped when the app folder already has a config', async () => {
  const m = machine([], existingApp);
  assert.equal(await find(buildSteps(ctxFor(), m.deps), 'scaffold').isDone(ctxFor()), true);
  assert.equal(await find(buildSteps(ctxFor(), machine([]).deps), 'scaffold').isDone(ctxFor()), false);
});

test('scaffold runs create-mc-app with every answer as a flag, no prompts', async () => {
  const m = machine([['create-mc-app', () => { m.files['/app/package.json'] = '{}'; m.files['/app/custom-application-config.mjs'] = CONFIG; return {}; }]]);
  const ctx = ctxFor({ template: 'starter', projectKey: 'my-proj' });
  const r = await run(buildSteps(ctx, m.deps), 'scaffold', ctx);
  assert.equal(r.status, 'done');
  const line = m.calls.find((c) => c.includes('create-mc-app'));
  for (const part of ['/app', '--template starter', '--entry-point-uri-path this-is-a-test', '--initial-project-key my-proj', '--cloud-identifier gcp-eu', '--package-manager pnpm', '--yes']) {
    assert.ok(line.includes(part), `${part} missing from: ${line}`);
  }
});

test('scaffold sets the menu label in the new config', async () => {
  const m = machine([['create-mc-app', () => { m.files['/app/package.json'] = '{}'; m.files['/app/custom-application-config.mjs'] = CONFIG; return {}; }]]);
  const ctx = ctxFor({ menuLabel: 'Channels Plus' });
  await run(buildSteps(ctx, m.deps), 'scaffold', ctx);
  assert.match(m.written['/app/custom-application-config.mjs'], /defaultLabel: 'Channels Plus'/);
  assert.doesNotMatch(m.written['/app/custom-application-config.mjs'], /Template starter/);
});

test('scaffold tolerates create-mc-app exiting non-zero for ignored build scripts when the app was created', async () => {
  const m = machine([['create-mc-app', () => { m.files['/app/package.json'] = '{}'; m.files['/app/custom-application-config.mjs'] = CONFIG; return { code: 1, stderr: 'ERR_PNPM_IGNORED_BUILDS Ignored build scripts: esbuild@1' }; }]]);
  const ctx = ctxFor();
  assert.equal((await run(buildSteps(ctx, m.deps), 'scaffold', ctx)).status, 'done');
});

test('scaffold fails when create-mc-app fails and no app appeared', async () => {
  const m = machine([['create-mc-app', { code: 1, stderr: 'network down' }]]);
  const ctx = ctxFor();
  const r = await run(buildSteps(ctx, m.deps), 'scaffold', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /network down/);
});

// ---- git init in the app folder ----------------------------------------------------------------

test('git-init runs `git init -b main` inside the app folder when it has no .git', async () => {
  const m = machine([], existingApp);
  const ctx = ctxFor();
  const r = await run(buildSteps(ctx, m.deps), 'git-init', ctx);
  assert.equal(r.status, 'done');
  const i = m.calls.indexOf('git init -b main');
  assert.ok(i >= 0, `no git init in: ${m.calls.join(' | ')}`);
  assert.equal(m.cwds[i], '/app');
});

test('git-init only initialises: no add, commit, remote or push', async () => {
  const m = machine([], existingApp);
  const ctx = ctxFor();
  await run(buildSteps(ctx, m.deps), 'git-init', ctx);
  assert.deepEqual(m.calls.filter((c) => c.startsWith('git ')), ['git init -b main']);
});

// The check is the folder's own .git, not "inside a work tree": an app nested in some other
// repository still gets its own.
test('git-init is done once the folder has its own .git and ignores the onboarding folder, and not before', async () => {
  const ctx = ctxFor();
  const ignored = { '/app/.gitignore': 'node_modules\n.mc-onboarding/\n' };
  assert.equal(await find(buildSteps(ctx, machine([], { ...existingApp, '/app/.git': '', ...ignored }).deps), 'git-init').isDone(ctx), true);
  assert.equal(await find(buildSteps(ctx, machine([], existingApp).deps), 'git-init').isDone(ctx), false);
  // A repository that predates this step still gets the ignore line on a rerun.
  assert.equal(await find(buildSteps(ctx, machine([], { ...existingApp, '/app/.git': '' }).deps), 'git-init').isDone(ctx), false);
});

test('git-init uses the repository root when the host layout has one (Connect)', async () => {
  const m = machine([], existingApp);
  const ctx = ctxFor({ repoDir: '/repo', appDir: '/repo/app' });
  await run(buildSteps(ctx, m.deps), 'git-init', ctx);
  assert.equal(m.cwds[m.calls.indexOf('git init -b main')], '/repo');
  assert.match(m.written['/repo/.gitignore'], /^\.mc-onboarding\/$/m);
  assert.equal(await find(buildSteps(ctx, machine([], { '/repo/.git': '', '/repo/.gitignore': '.mc-onboarding/\n' }).deps), 'git-init').isDone(ctx), true);
});

// The session log lives in <app>/.mc-onboarding/ and would otherwise show up as untracked.
test('git-init creates a .gitignore that ignores .mc-onboarding/', async () => {
  const m = machine([], existingApp);
  const ctx = ctxFor();
  await run(buildSteps(ctx, m.deps), 'git-init', ctx);
  assert.match(m.written['/app/.gitignore'], /^\.mc-onboarding\/$/m);
});

test('git-init appends to the .gitignore the scaffold made, keeps its lines, and never duplicates', async () => {
  const m = machine([], { ...existingApp, '/app/.gitignore': 'node_modules\nbuild' });
  const ctx = ctxFor();
  await run(buildSteps(ctx, m.deps), 'git-init', ctx);
  assert.equal(m.written['/app/.gitignore'], 'node_modules\nbuild\n.mc-onboarding/\n');
  const again = machine([], { ...existingApp, '/app/.gitignore': 'node_modules\n.mc-onboarding/\n' });
  await run(buildSteps(ctx, again.deps), 'git-init', ctx);
  assert.equal(again.written['/app/.gitignore'], undefined, 'an existing entry means no rewrite');
});

test('git-init fails with git\'s own message when it cannot initialise', async () => {
  const m = machine([['git init', { code: 128, stderr: 'fatal: cannot mkdir' }]], existingApp);
  const ctx = ctxFor();
  const r = await run(buildSteps(ctx, m.deps), 'git-init', ctx);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /git init/);
  assert.match(r.error, /cannot mkdir/);
});

test('scaffold moves the install plan written before the folder existed into the app', async () => {
  const m = machine([['create-mc-app', () => { m.files['/app/package.json'] = '{}'; m.files['/app/custom-application-config.mjs'] = CONFIG; return {}; }]], { '/work/.my-app.install-plan.json': '[]' });
  const ctx = ctxFor({ installPlan: '/work/.my-app.install-plan.json' });
  await run(buildSteps(ctx, m.deps), 'scaffold', ctx);
  assert.equal(ctx.installPlan, '/app/install-plan.json');
  assert.equal(m.written['/app/install-plan.json'], '[]');
});

test('build fixes pnpm build scripts, then builds, and fails with the output when the build breaks', async () => {
  const ok = machine([], existingApp);
  const r = await run(buildSteps(ctxFor(), ok.deps), 'build', ctxFor());
  assert.equal(r.status, 'done');
  const order = ['allow-builds.mjs', 'pnpm build'].map((k) => ok.calls.findIndex((c) => c.includes(k)));
  assert.ok(order[0] >= 0 && order[0] < order[1]);
  const bad = machine([['pnpm build', { code: 1, stderr: 'TS2322: type error' }]], existingApp);
  const f = await run(buildSteps(ctxFor(), bad.deps), 'build', ctxFor());
  assert.equal(f.status, 'fail');
  assert.match(f.error, /TS2322/);
});

test('a scratch session: scaffold and build run before registration', async () => {
  const m = machine([
    ['preflight.mjs', { stdout: json({ ok: true, checks: [] }) }],
    ['create-mc-app', () => { m.files['/app/package.json'] = '{}'; m.files['/app/custom-application-config.mjs'] = CONFIG; return {}; }],
    ['register.mjs', (line) => (line.includes('--production-url')
      ? { stdout: json({ ok: true, done: true, steps: ['INSTALL'] }) }
      : { code: 3, stdout: json({ ok: true, done: false, stoppedAt: { step: 'DEPLOY', reason: '' } }) })],
    ['vercel link', {}],
    ['vercel deploy', { stdout: 'Aliased: https://this-is-a-test.vercel.app [3s]' }],
    ['verify.mjs', { stdout: json({ ok: true, openInBrowser: 'https://mc.example.com/fct-dev/this-is-a-test' }) }],
  ], projectFile);
  const ctx = ctxFor();
  const events = [];
  const r = await runSession({ steps: buildSteps(ctx, m.deps), ctx, report: (e) => events.push(e), wake: async () => 'retry' });
  assert.deepEqual(r, { ok: true });
  const at = (k) => m.calls.findIndex((c) => c.includes(k));
  assert.ok(at('create-mc-app') < at('pnpm build') && at('pnpm build') < at('register.mjs'));
  assert.ok(events.some((e) => e.type === 'done' && e.id === 'scaffold'));
});

// ---- the two seams a real scratch run goes through ---------------------------------------------
test('nothing exists under the app folder when create-mc-app runs, and the log moves in afterwards', async () => {
  const m = machine([['create-mc-app', (line, calls) => {
    assert.ok([...Object.keys(m.written), ...Object.keys(m.files)].every((p) => !p.startsWith('/app/')), 'app folder must not exist yet');
    assert.equal(m.relocated.length, 0, 'log must not be moved before the app exists');
    m.files['/app/package.json'] = '{}';
    m.files['/app/custom-application-config.mjs'] = CONFIG;
    return {};
  }]]);
  const ctx = ctxFor({ logPath: '/work/.app.session.log' });
  const r = await run(buildSteps(ctx, m.deps), 'scaffold', ctx);
  assert.equal(r.status, 'done');
  assert.deepEqual(m.relocated, ['/app/.mc-onboarding/session.log']);
});

test('an expired Merchant Center session during registration asks for a login instead of failing', async () => {
  const m = machine([['register.mjs', { code: 1, stdout: json({ ok: false, error: 'Session for https://mc-api.europe-west1.gcp.commercetools.com expired. Run `npx ...`' }) }]]);
  const r = await run(buildSteps(ctxFor(), m.deps), 'register', ctxFor());
  assert.equal(r.status, 'wait');
  assert.equal(r.input, 'login');
  assert.match(r.reason, /sign in/i);
});
