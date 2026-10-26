import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps } from '../scripts/lib/onboard-steps.mjs';
import { ctxFor, deploy, find, json, machine } from './machine.mjs';

const ctx = (over = {}) => ctxFor({ hosting: 'cloudflare', ...over });
const WHO = (accounts) => ({ stdout: json({ authType: 'OAuth Token', email: 'me@example.com', accounts, tokenPermissions: [] }) });
const ONE = WHO([{ name: 'Acme', id: 'acc1' }]);
const TWO = WHO([{ name: 'Acme', id: 'acc1' }, { name: 'Side', id: 'acc2' }]);
const LISTED = { stdout: json([{ 'Project Name': 'this-is-a-test', 'Project Domains': 'this-is-a-test.pages.dev', 'Git Provider': 'No', 'Last Modified': '1 hour ago' }]) };
const EMPTY = { stdout: json([]) };
const CREATED = { stdout: "✨ Successfully created the 'this-is-a-test' project. It will be available at https://this-is-a-test.pages.dev/ once you create your first deployment." };
const DEPLOYED = { stdout: '🌎 Uploading... (12/12)\n✨ Success! Uploaded 12 files (2.10 sec)\n\n✨ Deployment complete! Take a peek over at https://a1b2c3d4.this-is-a-test.pages.dev' };

test('cloudflare is a provider: the deploy step is titled after it', () => {
  assert.equal(find(buildSteps(ctx(), machine([]).deps), 'deploy').title, 'Deploy to Cloudflare Pages');
});

test('existing project: whoami, project list, patch-config, build, deploy in that order; the production URL is the project domain, not the hashed deployment', async () => {
  const m = machine([['wrangler whoami', ONE], ['wrangler pages project list', LISTED], ['wrangler pages deploy', DEPLOYED]]);
  const c = ctx();
  const r = await deploy(m, c);
  assert.equal(r.status, 'done', r.error);
  assert.equal(c.productionUrl, 'https://this-is-a-test.pages.dev');
  const order = ['allow-builds.mjs', 'wrangler whoami', 'wrangler pages project list', 'patch-config.mjs', 'pnpm build', 'wrangler pages deploy'].map((k) => m.calls.findIndex((x) => x.includes(k)));
  assert.ok(order.every((i) => i >= 0), order.join());
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(m.calls.find((x) => x.includes('patch-config.mjs')).includes('--url https://this-is-a-test.pages.dev'));
  const dep = m.calls.find((x) => x.startsWith('wrangler pages deploy'));
  for (const part of ['deploy public', '--project-name this-is-a-test', '--branch main', '--commit-dirty=true']) assert.ok(dep.includes(part), `${dep} lacks ${part}`);
  assert.ok(!m.calls.some((x) => x.includes('project create')), 'an existing project is not created again');
  assert.equal(m.calls.filter((x) => x.startsWith('wrangler pages deploy')).length, 1, 'the project domain is known up front, so one deploy is enough');
  assert.equal(Object.keys(m.written).length, 0, 'Pages serves index.html for unknown paths by itself, so no rewrite file is written');
});

test('not signed in: the step asks for an API token as a secret, or a retry after wrangler login', async () => {
  const m = machine([['wrangler whoami', { code: 1, stdout: 'You are not authenticated. Please run `wrangler login`.' }]]);
  const r = await deploy(m, ctx());
  assert.equal(r.status, 'fail');
  assert.match(r.error, /wrangler login/);
  assert.deepEqual(r.input, { ctx: 'cfToken', label: 'Cloudflare API token (leave empty to retry after wrangler login)', secret: true });
});

test('a token travels as CLOUDFLARE_API_TOKEN and the account as CLOUDFLARE_ACCOUNT_ID in the environment of every wrangler command', async () => {
  const m = machine([['wrangler whoami', ONE], ['wrangler pages project list', LISTED], ['wrangler pages deploy', DEPLOYED]]);
  const r = await deploy(m, ctx({ cfToken: 'cf_secret' }));
  assert.equal(r.status, 'done', r.error);
  const wrangler = m.calls.map((line, i) => [line, m.envs[i]]).filter(([line]) => line.startsWith('wrangler '));
  assert.ok(wrangler.length >= 3);
  for (const [line, env] of wrangler) {
    assert.equal(env.CLOUDFLARE_API_TOKEN, 'cf_secret', line);
    assert.ok(!line.includes('cf_secret'), `token leaked into argv: ${line}`);
  }
  for (const [line, env] of wrangler.slice(1)) assert.equal(env.CLOUDFLARE_ACCOUNT_ID, 'acc1', line);
});

test('several accounts and none chosen: the accounts become a list to pick from and nothing else runs', async () => {
  const m = machine([['wrangler whoami', TWO]]);
  const r = await deploy(m, ctx());
  assert.equal(r.status, 'fail');
  assert.match(r.error, /several accounts/i);
  assert.deepEqual(r.input, {
    ctx: 'cfAccount',
    label: 'Cloudflare account',
    options: [{ id: 'acc1', name: 'Acme', plan: '', current: false }, { id: 'acc2', name: 'Side', plan: '', current: false }],
  });
  assert.ok(!m.calls.some((x) => x.includes('pages project')));
});

test('with an account chosen it is carried as CLOUDFLARE_ACCOUNT_ID', async () => {
  const m = machine([['wrangler whoami', TWO], ['wrangler pages project list', LISTED], ['wrangler pages deploy', DEPLOYED]]);
  const r = await deploy(m, ctx({ cfAccount: 'acc2' }));
  assert.equal(r.status, 'done', r.error);
  const i = m.calls.findIndex((x) => x.startsWith('wrangler pages deploy'));
  assert.equal(m.envs[i].CLOUDFLARE_ACCOUNT_ID, 'acc2');
});

test('no project yet: it is created with a production branch and the URL is read from the create output', async () => {
  const m = machine([['wrangler whoami', ONE], ['wrangler pages project list', EMPTY], ['wrangler pages project create', CREATED], ['wrangler pages deploy', DEPLOYED]]);
  const c = ctx();
  const r = await deploy(m, c);
  assert.equal(r.status, 'done', r.error);
  assert.match(m.calls.find((x) => x.includes('project create')), /project create this-is-a-test --production-branch main/);
  assert.equal(c.productionUrl, 'https://this-is-a-test.pages.dev');
});

test('a project name Cloudflare refuses is asked for again, and the next run uses the typed one', async () => {
  const m = machine([['wrangler whoami', ONE], ['wrangler pages project list', EMPTY], ['wrangler pages project create', { code: 1, stderr: 'A project with this name already exists.' }]]);
  const c = ctx();
  const r = await deploy(m, c);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /already exists/);
  assert.deepEqual(r.input, { ctx: 'cfProject', label: 'Cloudflare Pages project name' });
  const again = machine([['wrangler whoami', ONE], ['wrangler pages project list', EMPTY], ['wrangler pages project create', { stdout: "✨ Successfully created the 'my-other-name' project. It will be available at https://my-other-name.pages.dev/ once you create your first deployment." }], ['wrangler pages deploy', DEPLOYED]]);
  const c2 = ctx({ cfProject: 'my-other-name' });
  assert.equal((await deploy(again, c2)).status, 'done');
  assert.match(again.calls.find((x) => x.includes('project create')), /project create my-other-name /);
  assert.match(again.calls.find((x) => x.startsWith('wrangler pages deploy')), /--project-name my-other-name/);
  assert.equal(c2.productionUrl, 'https://my-other-name.pages.dev');
});

test('a redirect to a Cloudflare Access login, or a 401/403, fails the host check at once with where to turn it off', async () => {
  for (const problem of ['App path answers with a redirect to https://x.cloudflareaccess.com/cdn-cgi/access/login', 'App path returned 403 without an app shell.']) {
    const m = machine([['verify.mjs', { code: 1, stdout: json({ ok: false, hostCheck: { problems: [problem] } }) }]]);
    const c = ctx({ productionUrl: 'https://this-is-a-test.pages.dev' });
    const r = await find(buildSteps(c, m.deps), 'check').run(c, () => {});
    assert.equal(r.status, 'fail', problem);
    assert.match(r.error, /Cloudflare Access/);
  }
});
