import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsClient } from '../scripts/lib/settings-api.mjs';

const URL_ = 'https://mc-api.europe-west1.gcp.commercetools.com';

function fakeFetch(body, calls) {
  return async (url, init) => {
    calls.push({ url, init, parsed: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => body, headers: new Headers() };
  };
}

test('requests hit /graphql with settings target, bearer token and local app id', async () => {
  const calls = [];
  const c = createSettingsClient({ mcApiUrl: URL_, token: 'tok', fetchImpl: fakeFetch({ data: { x: 1 } }, calls) });
  const data = await c.request('query { x }', {});
  assert.deepEqual(data, { x: 1 });
  assert.equal(calls[0].url, `${URL_}/graphql`);
  const h = calls[0].init.headers;
  assert.equal(h['x-graphql-target'], 'settings');
  assert.equal(h['Authorization'], 'Bearer tok');
  assert.match(h['x-application-id'], /^__local:/);
});

test('graphql errors throw with the first message and code', async () => {
  const body = { errors: [{ message: 'nope', extensions: { code: 'FORBIDDEN' } }] };
  const c = createSettingsClient({ mcApiUrl: URL_, token: 't', fetchImpl: fakeFetch(body, []) });
  await assert.rejects(() => c.request('query { x }', {}), /nope.*FORBIDDEN/s);
});

test('changeStatus sends PRIVATE_USAGE as the Ready state', async () => {
  const calls = [];
  const c = createSettingsClient({ mcApiUrl: URL_, token: 't', fetchImpl: fakeFetch({ data: { changeCustomApplicationStatus: { id: 'a', status: 'PRIVATE_USAGE' } } }, calls) });
  await c.changeStatus({ organizationId: 'o', applicationId: 'a', status: 'PRIVATE_USAGE' });
  assert.deepEqual(calls[0].parsed.variables, { organizationId: 'o', applicationId: 'a', status: 'PRIVATE_USAGE' });
  assert.match(calls[0].parsed.query, /changeCustomApplicationStatus/);
});

test('install passes the project keys, not install-in-all', async () => {
  const calls = [];
  const c = createSettingsClient({ mcApiUrl: URL_, token: 't', fetchImpl: fakeFetch({ data: { installCustomApplication: { id: 'i' } } }, calls) });
  await c.install({ organizationId: 'o', applicationId: 'a', projectKeys: ['proj'] });
  assert.deepEqual(calls[0].parsed.variables, { organizationId: 'o', applicationId: 'a', projectKeys: ['proj'] });
  assert.match(calls[0].parsed.query, /installCustomApplication/);
});

test('setContact sends the email', async () => {
  const calls = [];
  const c = createSettingsClient({ mcApiUrl: URL_, token: 't', fetchImpl: fakeFetch({ data: { setCustomApplicationsMaintainerContactInformation: { id: 'x' } } }, calls) });
  await c.setContact({ organizationId: 'o', email: 'a@b.co' });
  assert.deepEqual(calls[0].parsed.variables, { organizationId: 'o', data: { email: 'a@b.co' } });
});

test('me() asks the mc target for the signed-in user and returns the email', async () => {
  const calls = [];
  const c = createSettingsClient({ mcApiUrl: URL_, token: 't', fetchImpl: fakeFetch({ data: { me: { email: 'who@example.com' } } }, calls) });
  const data = await c.me();
  assert.equal(calls[0].init.headers['x-graphql-target'], 'mc');
  assert.match(calls[0].parsed.query, /\bme\b[^}]*email/s);
  assert.equal(data.me.email, 'who@example.com');
});

test('organizations() uses the administration target, not settings', async () => {
  const calls = [];
  const c = createSettingsClient({ mcApiUrl: URL_, token: 't', fetchImpl: fakeFetch({ data: { myOrganizations: { total: 1, results: [{ id: 'o', name: 'Org' }] } } }, calls) });
  const data = await c.organizations();
  assert.equal(calls[0].init.headers['x-graphql-target'], 'administration');
  assert.match(calls[0].parsed.query, /myOrganizations/);
  assert.equal(data.myOrganizations.results[0].id, 'o');
});

test('projects() lists projects with their owning org on the administration target', async () => {
  const calls = [];
  const data = { myProjects: { total: 1, results: [{ key: 'p', name: 'P', owner: { id: 'o' } }] } };
  const c = createSettingsClient({ mcApiUrl: URL_, token: 't', fetchImpl: fakeFetch({ data }, calls) });
  const out = await c.projects();
  assert.equal(calls[0].init.headers['x-graphql-target'], 'administration');
  assert.match(calls[0].parsed.query, /myProjects/);
  assert.match(calls[0].parsed.query, /owner\s*{\s*id/);
  assert.equal(out.myProjects.results[0].key, 'p');
});

test('install with no project keys omits the variable, which is how all projects is requested', async () => {
  const calls = [];
  const c = createSettingsClient({ mcApiUrl: URL_, token: 't', fetchImpl: fakeFetch({ data: { installCustomApplication: { id: 'i' } } }, calls) });
  await c.install({ organizationId: 'o', applicationId: 'a' });
  assert.equal('projectKeys' in calls[0].parsed.variables, false);
});

test('updateInstall sends the installation id, org and the exact project keys', async () => {
  const calls = [];
  const c = createSettingsClient({ mcApiUrl: URL_, token: 't', fetchImpl: fakeFetch({ data: { updateCustomApplicationProjectsInstallation: { id: 'i' } } }, calls) });
  await c.updateInstall({ organizationId: 'o', installedApplicationId: 'inst', projectKeys: ['a', 'b'] });
  assert.match(calls[0].parsed.query, /updateCustomApplicationProjectsInstallation/);
  assert.deepEqual(calls[0].parsed.variables, { organizationId: 'o', installedApplicationId: 'inst', projectKeys: ['a', 'b'] });
});

test('projects() refuses a truncated list instead of hiding projects', async () => {
  const data = { myProjects: { total: 600, results: [{ key: 'p', name: 'P', owner: { id: 'o' } }] } };
  const c = createSettingsClient({ mcApiUrl: URL_, token: 't', fetchImpl: fakeFetch({ data }, []) });
  await assert.rejects(() => c.projects(), /1 of 600/);
});
