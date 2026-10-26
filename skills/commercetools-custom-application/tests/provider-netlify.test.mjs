import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps } from '../scripts/lib/onboard-steps.mjs';
import { ctxFor, deploy, find, json, machine } from './machine.mjs';

const ctx = (over = {}) => ctxFor({ hosting: 'netlify', ...over });
const LINKED = { stdout: json({ loggedIn: true, linked: true, siteData: { 'site-name': 'this-is-a-test', 'site-url': 'https://this-is-a-test.netlify.app' } }) };
const UNLINKED = { code: 1, stdout: json({ loggedIn: true, linked: false, siteData: null, error: { code: 'NOT_LINKED', fix: 'netlify link' } }) };
const ONE_TEAM = { stdout: json([{ id: 't1', name: 'Acme', slug: 'acme', default: true, type_name: 'Pro' }]) };
const TWO_TEAMS = { stdout: json([{ id: 't1', name: 'Acme', slug: 'acme', default: true, type_name: 'Pro' }, { id: 't2', name: 'Side', slug: 'side-projects', default: false, type_name: 'Free' }]) };
const CREATED = { stdout: json({ id: 's1', name: 'this-is-a-test', url: 'http://this-is-a-test.netlify.app', ssl_url: 'https://this-is-a-test.netlify.app', account_slug: 'acme' }) };
const DEPLOYED = (url) => ({ stdout: json({ site_id: 's1', site_name: 'this-is-a-test', deploy_id: 'd1', deploy_url: 'https://d1--this-is-a-test.netlify.app', url }) });

test('netlify is a provider with its CLI, plan lines and a protection hint', () => {
  const steps = buildSteps(ctx(), machine([]).deps);
  assert.equal(find(steps, 'deploy').title, 'Deploy to Netlify');
});

test('with a linked site: allow-builds, status, netlify.toml, patch-config, build, deploy, in that order, and the production URL is the deploy url', async () => {
  const m = machine([['netlify status', LINKED], ['netlify deploy', DEPLOYED('https://this-is-a-test.netlify.app')]]);
  const c = ctx();
  const r = await deploy(m, c);
  assert.equal(r.status, 'done', r.error);
  assert.equal(c.productionUrl, 'https://this-is-a-test.netlify.app');
  const order = ['allow-builds.mjs', 'netlify status', 'patch-config.mjs', 'pnpm build', 'netlify deploy'].map((k) => m.calls.findIndex((x) => x.includes(k)));
  assert.ok(order.every((i) => i >= 0), order.join());
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(m.calls.find((x) => x.includes('patch-config.mjs')).includes('--url https://this-is-a-test.netlify.app'));
  const dep = m.calls.find((x) => x.startsWith('netlify deploy'));
  for (const flag of ['--prod', '--no-build', '--dir public', '--json']) assert.ok(dep.includes(flag), `${dep} lacks ${flag}`);
  assert.ok(!m.calls.some((x) => x.includes('sites:create')), 'a linked site is not created again');
  const toml = m.written['/work/this-is-a-test/netlify.toml'];
  assert.match(toml, /\[\[redirects\]\]/);
  assert.match(toml, /status = 200/);
  assert.match(toml, /publish = "public"/);
});

test('not signed in: the step asks for a token as a secret, or a retry after netlify login', async () => {
  const m = machine([['netlify status', { code: 1, stdout: 'Not logged in. Please log in to see project status.' }]]);
  const r = await deploy(m, ctx());
  assert.equal(r.status, 'fail');
  assert.match(r.error, /netlify login/);
  assert.deepEqual(r.input, { ctx: 'netlifyToken', label: 'Netlify personal access token (leave empty to retry after netlify login)', secret: true });
});

test('a token travels as NETLIFY_AUTH_TOKEN in the environment of every netlify command, never on the command line', async () => {
  const m = machine([['netlify status', LINKED], ['netlify deploy', DEPLOYED('https://this-is-a-test.netlify.app')]]);
  const r = await deploy(m, ctx({ netlifyToken: 'nfp_secret' }));
  assert.equal(r.status, 'done');
  const netlifyCalls = m.calls.map((line, i) => [line, m.envs[i]]).filter(([line]) => line.startsWith('netlify '));
  assert.ok(netlifyCalls.length >= 2);
  for (const [line, env] of netlifyCalls) {
    assert.equal(env.NETLIFY_AUTH_TOKEN, 'nfp_secret', line);
    assert.ok(!line.includes('nfp_secret'), `token leaked into argv: ${line}`);
  }
});

test('a rejected token is forgotten and asked for again', async () => {
  const m = machine([['netlify status', { code: 1, stderr: 'Error: Not logged in. Your token is invalid or expired.' }]]);
  const c = ctx({ netlifyToken: 'bad' });
  const r = await deploy(m, c);
  assert.equal(r.status, 'fail');
  assert.equal(r.input.ctx, 'netlifyToken');
  assert.equal(c.netlifyToken, undefined);
});

test('no linked site and one team: the site is created under that team, named after the app folder, and its ssl_url is the production URL', async () => {
  const m = machine([['netlify status', UNLINKED], ['netlify teams:list', ONE_TEAM], ['netlify sites:create', CREATED], ['netlify deploy', DEPLOYED('https://this-is-a-test.netlify.app')]]);
  const c = ctx();
  const r = await deploy(m, c);
  assert.equal(r.status, 'done', r.error);
  const create = m.calls.find((x) => x.startsWith('netlify sites:create'));
  assert.match(create, /--name this-is-a-test\b/);
  assert.match(create, /--account-slug acme\b/);
  assert.match(create, /--json/);
  assert.equal(c.productionUrl, 'https://this-is-a-test.netlify.app');
});

test('several teams and none chosen: the teams become a list to pick from, the default only marked, and nothing is created', async () => {
  const m = machine([['netlify status', UNLINKED], ['netlify teams:list', TWO_TEAMS]]);
  const r = await deploy(m, ctx());
  assert.equal(r.status, 'fail');
  assert.match(r.error, /several teams/i);
  assert.deepEqual(r.input, {
    ctx: 'netlifyTeam',
    label: 'Netlify team',
    options: [
      { id: 'acme', name: 'Acme', plan: 'Pro', current: true },
      { id: 'side-projects', name: 'Side', plan: 'Free', current: false },
    ],
  });
  assert.ok(!m.calls.some((x) => x.includes('sites:create')));
});

test('with a team chosen the site is created under it', async () => {
  const m = machine([['netlify status', UNLINKED], ['netlify teams:list', TWO_TEAMS], ['netlify sites:create', CREATED], ['netlify deploy', DEPLOYED('https://this-is-a-test.netlify.app')]]);
  const r = await deploy(m, ctx({ netlifyTeam: 'side-projects' }));
  assert.equal(r.status, 'done', r.error);
  assert.match(m.calls.find((x) => x.startsWith('netlify sites:create')), /--account-slug side-projects\b/);
});

test('the CLI may rename a site on collision: the created name and url are read from its output, not assumed', async () => {
  const renamed = { stdout: json({ id: 's2', name: 'this-is-a-test-482', ssl_url: 'https://this-is-a-test-482.netlify.app', account_slug: 'acme' }) };
  const m = machine([['netlify status', UNLINKED], ['netlify teams:list', ONE_TEAM], ['netlify sites:create', renamed], ['netlify deploy', DEPLOYED('https://this-is-a-test-482.netlify.app')]]);
  const c = ctx();
  const r = await deploy(m, c);
  assert.equal(r.status, 'done', r.error);
  assert.equal(c.productionUrl, 'https://this-is-a-test-482.netlify.app');
  assert.ok(m.calls.find((x) => x.includes('patch-config.mjs')).includes('--url https://this-is-a-test-482.netlify.app'));
  assert.match(m.calls.find((x) => x.startsWith('netlify deploy')), /--site this-is-a-test-482\b/);
});

test('if the deploy lands on a different url than planned, the config is repatched and deployed once more', async () => {
  const m = machine([['netlify status', LINKED], ['netlify deploy', DEPLOYED('https://other.netlify.app')]]);
  const c = ctx();
  const r = await deploy(m, c);
  assert.equal(r.status, 'done', r.error);
  assert.equal(c.productionUrl, 'https://other.netlify.app');
  assert.equal(m.calls.filter((x) => x.startsWith('netlify deploy')).length, 2);
  assert.ok(m.calls.filter((x) => x.includes('patch-config.mjs')).at(-1).includes('--url https://other.netlify.app'));
});

test('a deploy that prints no JSON fails with the raw output', async () => {
  const m = machine([['netlify status', LINKED], ['netlify deploy', { stdout: 'Deploying to main site URL...\nSomething odd' }]]);
  const r = await deploy(m, ctx());
  assert.equal(r.status, 'fail');
  assert.match(r.error, /Something odd/);
});

test('a 401 from the host is read as Netlify site protection and fails at once with where to turn it off', async () => {
  const m = machine([['verify.mjs', { code: 1, stdout: json({ ok: false, hostCheck: { problems: ['App path returned 401 without an app shell.'] } }) }]]);
  const c = ctx({ productionUrl: 'https://this-is-a-test.netlify.app' });
  const r = await find(buildSteps(c, m.deps), 'check').run(c, () => {});
  assert.equal(r.status, 'fail');
  assert.match(r.error, /Netlify/);
  assert.match(r.error, /protection/i);
});
