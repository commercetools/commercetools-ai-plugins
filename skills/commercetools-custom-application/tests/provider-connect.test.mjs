import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps } from '../scripts/lib/onboard-steps.mjs';
import { ctxFor, find, json, machine, run } from './machine.mjs';

// Connect hosts the app itself, built from a GitHub tag. The session's part: an API client for
// Connect, the repository and tag, a private Connector, a sandbox Deployment, and its URL.
const REPO = '/work/my-app';
const APP = '/work/my-app/my-app';
const ctx = (over = {}) => ctxFor({ hosting: 'connect', repoDir: REPO, appDir: APP, appName: 'My App', entryPoint: 'my-app', installPlan: `${APP}/install-plan.json`, ...over });
const CONFIG = "const config = { env: { production: { applicationId: 'app123', url: '${env:APPLICATION_URL}' } } };";
const files = () => ({ [`${APP}/package.json`]: '{}', [`${APP}/custom-application-config.mjs`]: CONFIG });

// A fake Connect API: routes keyed by "METHOD path", answering in sequence when given an array.
function api(routes) {
  const requests = [];
  const used = {};
  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const p = new URL(url).pathname;
    const parse = (b) => { try { return JSON.parse(b); } catch { return b; } };
    requests.push({ method, path: p, body: init.body ? parse(init.body) : null });
    const key = `${method} ${p}`;
    let reply = routes[key];
    if (Array.isArray(reply)) {
      used[key] = (used[key] ?? 0) + 1;
      reply = reply[Math.min(used[key], reply.length) - 1];
    }
    if (reply === undefined) throw new Error(`unrouted ${key}`);
    const r = typeof reply === 'function' ? reply(requests.at(-1)) : reply;
    const status = r.status ?? 200;
    const body = JSON.stringify(r.body ?? {});
    return { ok: status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
  };
  return { fetch, requests };
}
const TOKEN = { 'POST /oauth/token': { body: { access_token: 'tok' } } };
const withApi = (m, routes) => { m.deps.fetch = api(routes).fetch; return m; };
const GIT_OK = [
  ['git rev-parse --is-inside-work-tree', { stdout: 'true' }],
  ['git diff --cached --quiet', { code: 1 }],
  ['gh auth status', { stdout: 'Logged in to github.com' }],
  ['git remote get-url origin', { stdout: 'git@github.com:acme/my-app.git' }],
  ['gh repo view', { stdout: json({ url: 'https://github.com/acme/my-app', sshUrl: 'git@github.com:acme/my-app.git', nameWithOwner: 'acme/my-app', visibility: 'PUBLIC' }) }],
  ['git tag --list', { stdout: 'v0.1.1\nv0.1.2\n' }],
];
const STAGED = (over = {}) => ({ id: 'c1', key: 'my-app', version: 3, status: 'Published', hasChanges: false, repository: { url: 'https://github.com/acme/my-app.git', tag: 'v0.1.3' }, ...over });
const DEPLOYED = (over = {}) => ({ id: 'd1', key: 'my-app-sandbox', version: 2, status: 'Deployed', applications: [{ applicationName: 'my-app', url: 'https://my-app-abc.europe-west1.gcp.commercetools.app' }], ...over });

test('connect is a provider: the deploy step is titled after it and its CLI check is gh', () => {
  const steps = buildSteps(ctx(), machine([]).deps);
  assert.equal(find(steps, 'deploy').title, 'Deploy to commercetools Connect');
});

// ---- scaffold and build know about the Connect layout --------------------------------------
test('scaffold for connect uses npm, writes connect.yaml and .gitignore at the repo root, and points the url at the APPLICATION_URL reference', async () => {
  const m = machine([['create-mc-app', { createsApp: true }]], {});
  m.deps.exec = ((orig) => async (cmd, args, opts) => {
    const r = await orig(cmd, args, opts);
    if (args.includes('@commercetools-frontend/create-mc-app@latest')) {
      m.written[`${APP}/package.json`] = '{}';
      m.written[`${APP}/custom-application-config.mjs`] = "const config = { mainMenuLink: { defaultLabel: 'Template starter' }, env: { production: { applicationId: 'TODO', url: 'https://your_app_hostname.com' } } };";
    }
    return r;
  })(m.deps.exec);
  const c = ctx();
  const r = await run(buildSteps(c, m.deps), 'scaffold', c);
  assert.equal(r.status, 'done', r.error);
  const scaffold = m.calls.find((x) => x.includes('create-mc-app'));
  assert.match(scaffold, /--package-manager npm\b/);
  assert.ok(scaffold.includes(` ${APP} `), 'the app is scaffolded into the subfolder');
  const yaml = m.written[`${REPO}/connect.yaml`];
  assert.match(yaml, /^deployAs:\n  - name: my-app\n    applicationType: merchant-center-custom-application/m);
  assert.match(yaml, /key: CUSTOM_APPLICATION_ID/);
  assert.match(yaml, /key: ENTRY_POINT_URI_PATH/);
  const ignore = m.written[`${REPO}/.gitignore`];
  for (const line of ['node_modules/', '.mc-onboarding/', 'install-plan.json', '.env']) assert.ok(ignore.split('\n').includes(line), `.gitignore lacks ${line}`);
  assert.ok(m.calls.some((x) => x.includes('patch-config.mjs') && x.includes('--url ${env:APPLICATION_URL}')), m.calls.join('\n'));
});

test('build for connect runs npm run build with a placeholder APPLICATION_URL and no pnpm allow-builds', async () => {
  const m = machine([], files());
  const c = ctx();
  const r = await run(buildSteps(c, m.deps), 'build', c);
  assert.equal(r.status, 'done', r.error);
  assert.ok(!m.calls.some((x) => x.includes('allow-builds')), 'allow-builds is pnpm-only');
  const i = m.calls.findIndex((x) => x === 'npm run build');
  assert.ok(i >= 0, m.calls.join('\n'));
  assert.equal(m.envs[i].APPLICATION_URL, 'https://your_app_hostname.com');
});

test('build for a static host is unchanged: allow-builds, then pnpm build', async () => {
  const m = machine([], files());
  const c = ctxFor();
  await run(buildSteps(c, m.deps), 'build', c);
  assert.deepEqual(m.calls.map((x) => x.split(' ').slice(0, 2).join(' ')), ['node /skill/scripts/allow-builds.mjs', 'pnpm build']);
});

// ---- credentials ----------------------------------------------------------------------------
test('without an API client the step asks for the client id, then the secret as a secret', async () => {
  const m = machine([], files());
  const c = ctx();
  let r = await run(buildSteps(c, m.deps), 'deploy', c);
  assert.equal(r.status, 'fail');
  assert.equal(r.input.ctx, 'ctClientId');
  assert.match(r.error, /manage_connectors\b/);
  assert.match(r.error, /manage_connectors_deployments\b/);
  c.ctClientId = 'id1';
  r = await run(buildSteps(c, m.deps), 'deploy', c);
  assert.equal(r.status, 'fail');
  assert.deepEqual(r.input, { ctx: 'ctClientSecret', label: 'API client secret', secret: true });
  assert.equal(m.calls.length, 0, 'nothing runs before the credentials are known');
});

test('a rejected secret is forgotten and asked for again', async () => {
  const m = withApi(machine([], files()), { 'POST /oauth/token': { status: 401, body: { error: 'invalid_client' } } });
  const c = ctx({ ctClientId: 'id1', ctClientSecret: 'bad' });
  const r = await run(buildSteps(c, m.deps), 'deploy', c);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /invalid_client/);
  assert.equal(r.input.ctx, 'ctClientSecret');
  assert.equal(c.ctClientSecret, undefined);
});

// ---- repository and tag ---------------------------------------------------------------------
test('a fresh folder is initialised, committed, and pushed to a new GitHub repository with the visibility the user picks', async () => {
  const m = withApi(machine([
    ['git rev-parse --is-inside-work-tree', { code: 128 }],
    ['git diff --cached --quiet', { code: 1 }],
    ['gh auth status', {}],
    ['git remote get-url origin', { code: 2 }],
  ], files()), TOKEN);
  const c = ctx({ ctClientId: 'id1', ctClientSecret: 's' });
  const r = await run(buildSteps(c, m.deps), 'deploy', c);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /visibility/i);
  assert.deepEqual(r.input.options.map((o) => o.id), ['public', 'private']);
  assert.equal(r.input.ctx, 'ghVisibility');
  assert.ok(m.calls.some((x) => x === 'git init -b main'));
  assert.ok(m.calls.some((x) => x === 'git add -A'));
  assert.ok(m.calls.some((x) => x.startsWith('git commit -m ')));
  assert.ok(!m.calls.some((x) => x.includes('gh repo create')), 'no repository is created before the user picks');
  assert.ok(m.cwds.filter(Boolean).every((d) => d === REPO), 'git and gh run in the repository root');
});

test('with a visibility chosen the repository is created from the root and pushed; private adds the connect-mu reader and uses the SSH url', async () => {
  const m = withApi(machine([
    ...GIT_OK.filter(([k]) => !k.startsWith('git remote') && !k.startsWith('gh repo view')),
    ['git remote get-url origin', { code: 2 }],
    ['gh repo create', {}],
    ['gh repo view', { stdout: json({ url: 'https://github.com/acme/my-app', sshUrl: 'git@github.com:acme/my-app.git', nameWithOwner: 'acme/my-app', visibility: 'PRIVATE' }) }],
  ], files()), {
    ...TOKEN,
    'GET /connectors/drafts/key=my-app': { status: 404, body: {} },
    'POST /connectors/drafts': (req) => ({ body: { id: 'c1', version: 1, status: 'Draft', ...req.body } }),
    'POST /connectors/drafts/key=my-app': { body: STAGED({ version: 2, status: 'Draft' }) },
  });
  const c = ctx({ ctClientId: 'id1', ctClientSecret: 's', ghVisibility: 'private' });
  const r = await run(buildSteps(c, m.deps), 'deploy', c);
  assert.equal(r.status, 'wait', r.error);
  assert.match(m.calls.find((x) => x.startsWith('gh repo create')), /gh repo create my-app --private --source \/work\/my-app --remote origin --push/);
  assert.ok(m.calls.some((x) => x.includes('gh api') && x.includes('repos/acme/my-app/collaborators/connect-mu') && x.includes('permission=pull')));
  const created = m.deps.fetch.requests?.find?.(() => true);
  assert.ok(m.calls.some((x) => /^git tag v0\.1\.3$/.test(x)), 'the next tag after v0.1.2');
  assert.ok(m.calls.some((x) => x === 'git push origin main v0.1.3'));
  void created;
});

// ---- connector and deployment ---------------------------------------------------------------
test('first run end to end: the ConnectorStaged is created from the repo and tag, published privately, and the step waits while Connect publishes', async () => {
  const a = api({
    ...TOKEN,
    'GET /connectors/drafts/key=my-app': { status: 404, body: {} },
    'POST /connectors/drafts': (req) => ({ body: { id: 'c1', version: 1, status: 'Draft', ...req.body } }),
    'POST /connectors/drafts/key=my-app': { body: STAGED({ version: 2, status: 'Draft' }) },
  });
  const m = machine(GIT_OK, files());
  m.deps.fetch = a.fetch;
  const c = ctx({ ctClientId: 'id1', ctClientSecret: 's' });
  const r = await run(buildSteps(c, m.deps), 'deploy', c);
  assert.equal(r.status, 'wait', r.error);
  assert.equal(r.polling, true);
  assert.match(r.reason, /publish/i);
  const create = a.requests.find((q) => q.method === 'POST' && q.path === '/connectors/drafts').body;
  assert.equal(create.key, 'my-app');
  assert.equal(create.name, 'My App');
  assert.deepEqual(create.repository, { url: 'https://github.com/acme/my-app.git', tag: 'v0.1.3' });
  assert.deepEqual(create.supportedRegions, ['europe-west1.gcp']);
  assert.deepEqual(create.privateProjects, ['europe-west1.gcp:fct-dev']);
  assert.equal(create.creator.email, 'a@b.co');
  const publish = a.requests.find((q) => q.method === 'POST' && q.path === '/connectors/drafts/key=my-app').body;
  assert.deepEqual(publish, { version: 1, actions: [{ action: 'publish', certification: false }] });
});

test('while Connect is still publishing the step keeps waiting; once Published it creates the sandbox Deployment with the app id, entry point and region, and waits again', async () => {
  const a = api({
    ...TOKEN,
    'GET /connectors/drafts/key=my-app': [{ body: STAGED({ status: 'Publishing', hasChanges: true }) }, { body: STAGED() }],
    'GET /fct-dev/deployments/key=my-app-sandbox': { status: 404, body: {} },
    'POST /fct-dev/deployments': (req) => ({ body: { id: 'd1', version: 1, status: 'Queued', ...req.body } }),
  });
  const m = machine(GIT_OK, files());
  m.deps.fetch = a.fetch;
  const c = ctx({ ctClientId: 'id1', ctClientSecret: 's', connectTag: 'v0.1.3', connectRepoUrl: 'https://github.com/acme/my-app.git', connectPublished: true });
  const steps = buildSteps(c, m.deps);
  let r = await run(steps, 'deploy', c);
  assert.equal(r.status, 'wait');
  assert.match(r.reason, /publish/i);
  r = await run(steps, 'deploy', c);
  assert.equal(r.status, 'wait', r.error);
  assert.match(r.reason, /deploy/i);
  const dep = a.requests.find((q) => q.method === 'POST' && q.path === '/fct-dev/deployments').body;
  assert.equal(dep.key, 'my-app-sandbox');
  assert.equal(dep.type, 'sandbox');
  assert.deepEqual(dep.connector, { key: 'my-app', version: 3, staged: false });
  assert.equal(dep.region, 'europe-west1.gcp');
  const conf = dep.configurations[0];
  assert.equal(conf.applicationName, 'my-app');
  assert.deepEqual(conf.standardConfiguration, [
    { key: 'CUSTOM_APPLICATION_ID', value: 'app123' },
    { key: 'ENTRY_POINT_URI_PATH', value: 'my-app' },
    { key: 'CLOUD_IDENTIFIER', value: 'gcp-eu' },
  ]);
  assert.ok(!m.calls.some((x) => x.startsWith('git tag v')), 'a tag made earlier in this run is reused');
});

test('once the Deployment is Deployed its application url becomes the production URL', async () => {
  const a = api({ ...TOKEN, 'GET /connectors/drafts/key=my-app': { body: STAGED() }, 'GET /fct-dev/deployments/key=my-app-sandbox': { body: DEPLOYED() } });
  const m = machine(GIT_OK, files());
  m.deps.fetch = a.fetch;
  const c = ctx({ ctClientId: 'id1', ctClientSecret: 's', connectTag: 'v0.1.3', connectRepoUrl: 'https://github.com/acme/my-app.git', connectPublished: true, connectDeployed: true });
  const r = await run(buildSteps(c, m.deps), 'deploy', c);
  assert.equal(r.status, 'done', r.error);
  assert.equal(c.productionUrl, 'https://my-app-abc.europe-west1.gcp.commercetools.app');
});

test('a failed publish shows the report and stops; a failed deployment too', async () => {
  const a = api({ ...TOKEN, 'GET /connectors/drafts/key=my-app': { body: STAGED({ status: 'Failed', publishingReport: { entries: [{ type: 'SAST', message: 'Critical finding in src/x.ts' }] } }) } });
  const m = machine(GIT_OK, files());
  m.deps.fetch = a.fetch;
  const c = ctx({ ctClientId: 'id1', ctClientSecret: 's', connectTag: 'v0.1.3', connectRepoUrl: 'https://github.com/acme/my-app.git', connectPublished: true });
  const r = await run(buildSteps(c, m.deps), 'deploy', c);
  assert.equal(r.status, 'fail');
  assert.match(r.error, /Critical finding in src\/x\.ts/);
  const b = api({ ...TOKEN, 'GET /connectors/drafts/key=my-app': { body: STAGED() }, 'GET /fct-dev/deployments/key=my-app-sandbox': { body: DEPLOYED({ status: 'Failed', details: { report: { entries: [{ message: 'build exploded' }] } } }) } });
  const m2 = machine(GIT_OK, files());
  m2.deps.fetch = b.fetch;
  const c2 = ctx({ ctClientId: 'id1', ctClientSecret: 's', connectTag: 'v0.1.3', connectRepoUrl: 'https://github.com/acme/my-app.git', connectPublished: true, connectDeployed: true });
  const r2 = await run(buildSteps(c2, m2.deps), 'deploy', c2);
  assert.equal(r2.status, 'fail');
  assert.match(r2.error, /build exploded/);
});

test('a rerun with an existing Deployment republishes the new tag and redeploys with the updated Connector', async () => {
  const a = api({
    ...TOKEN,
    'GET /connectors/drafts/key=my-app': [{ body: STAGED({ repository: { url: 'https://github.com/acme/my-app.git', tag: 'v0.1.2' } }) }],
    'POST /connectors/drafts/key=my-app': [{ body: STAGED({ version: 4, hasChanges: true }) }, { body: STAGED({ version: 5, status: 'Publishing' }) }],
  });
  const m = machine(GIT_OK, files());
  m.deps.fetch = a.fetch;
  const c = ctx({ ctClientId: 'id1', ctClientSecret: 's' });
  const r = await run(buildSteps(c, m.deps), 'deploy', c);
  assert.equal(r.status, 'wait', r.error);
  const updates = a.requests.filter((q) => q.method === 'POST' && q.path === '/connectors/drafts/key=my-app').map((q) => q.body);
  assert.deepEqual(updates[0], { version: 3, actions: [{ action: 'setRepository', repository: { url: 'https://github.com/acme/my-app.git', tag: 'v0.1.3' } }] });
  assert.deepEqual(updates[1], { version: 4, actions: [{ action: 'publish', certification: false }] });
  const b = api({ ...TOKEN, 'GET /connectors/drafts/key=my-app': { body: STAGED({ version: 5 }) }, 'GET /fct-dev/deployments/key=my-app-sandbox': { body: DEPLOYED() }, 'POST /fct-dev/deployments/key=my-app-sandbox': { body: DEPLOYED({ version: 3, status: 'Queued' }) } });
  const m2 = machine(GIT_OK, files());
  m2.deps.fetch = b.fetch;
  const c2 = ctx({ ctClientId: 'id1', ctClientSecret: 's', connectTag: 'v0.1.3', connectRepoUrl: 'https://github.com/acme/my-app.git', connectPublished: true });
  const r2 = await run(buildSteps(c2, m2.deps), 'deploy', c2);
  assert.equal(r2.status, 'wait', r2.error);
  assert.deepEqual(b.requests.find((q) => q.method === 'POST' && q.path === '/fct-dev/deployments/key=my-app-sandbox').body, { version: 2, actions: [{ action: 'redeploy', updateConnector: true }] });
});
