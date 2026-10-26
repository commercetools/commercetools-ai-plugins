import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectHostFor, connectUrls, createConnectClient } from '../scripts/lib/connect-api.mjs';

// A fake fetch that records every request and answers from a queue keyed by method and path.
function fakeFetch(routes) {
  const requests = [];
  const impl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const u = new URL(url);
    requests.push({ method, url: String(url), path: u.pathname, headers: init.headers ?? {}, body: init.body });
    const key = `${method} ${u.pathname}`;
    const reply = routes[key] ?? routes[`${method} *`];
    if (!reply) throw new Error(`unrouted ${key}`);
    const r = typeof reply === 'function' ? reply(requests.at(-1)) : reply;
    const status = r.status ?? 200;
    const body = r.body === undefined ? '' : typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
  };
  return { impl, requests };
}

const client = (routes, over = {}) => {
  const f = fakeFetch(routes);
  const c = createConnectClient({ region: 'gcp-eu', projectKey: 'fct-dev', clientId: 'id1', clientSecret: 's3cret', fetchImpl: f.impl, ...over });
  return { c, ...f };
};

test('cloud identifiers map to the Connect hosts, and unknown ones to null', () => {
  assert.equal(connectHostFor('gcp-eu'), 'europe-west1.gcp');
  assert.equal(connectHostFor('gcp-us'), 'us-central1.gcp');
  assert.equal(connectHostFor('gcp-au'), 'australia-southeast1.gcp');
  assert.equal(connectHostFor('aws-eu'), 'eu-central-1.aws');
  assert.equal(connectHostFor('aws-us'), 'us-east-2.aws');
  assert.equal(connectHostFor('mars'), null);
  assert.deepEqual(connectUrls('gcp-eu'), { api: 'https://connect.europe-west1.gcp.commercetools.com', auth: 'https://auth.europe-west1.gcp.commercetools.com' });
});

test('the token is fetched once with client credentials and the two Connect scopes, then reused', async () => {
  const { c, requests } = client({
    'POST /oauth/token': { body: { access_token: 'tok', expires_in: 172800 } },
    'GET /connectors/drafts/key=my-app': { body: { key: 'my-app', version: 1 } },
  });
  await c.getStaged('my-app');
  await c.getStaged('my-app');
  const tokenCalls = requests.filter((r) => r.path === '/oauth/token');
  assert.equal(tokenCalls.length, 1);
  assert.equal(tokenCalls[0].url, 'https://auth.europe-west1.gcp.commercetools.com/oauth/token');
  assert.equal(tokenCalls[0].headers.Authorization, `Basic ${Buffer.from('id1:s3cret').toString('base64')}`);
  assert.equal(tokenCalls[0].body, 'grant_type=client_credentials&scope=manage_connectors%3Afct-dev%20manage_connectors_deployments%3Afct-dev');
  assert.equal(requests.at(-1).headers.Authorization, 'Bearer tok');
});

test('a 401 from the token endpoint throws an error that says so', async () => {
  const { c } = client({ 'POST /oauth/token': { status: 401, body: { error: 'invalid_client' } } });
  await assert.rejects(c.getStaged('x'), (e) => e.status === 401 && /invalid_client/.test(e.message));
});

test('get returns null on 404 and the parsed body otherwise; other statuses throw with the body message', async () => {
  const { c, requests } = client({
    'POST /oauth/token': { body: { access_token: 'tok' } },
    'GET /connectors/drafts/key=missing': { status: 404, body: { message: 'not found' } },
    'GET /fct-dev/deployments/key=d1': { body: { key: 'd1', status: 'Deployed', applications: [{ url: 'https://x' }] } },
    'GET /fct-dev/deployments/key=boom': { status: 500, body: { message: 'it broke' } },
  });
  assert.equal(await c.getStaged('missing'), null);
  assert.deepEqual((await c.getDeployment('d1')).applications, [{ url: 'https://x' }]);
  assert.equal(requests.at(-1).url, 'https://connect.europe-west1.gcp.commercetools.com/fct-dev/deployments/key=d1');
  await assert.rejects(c.getDeployment('boom'), (e) => e.status === 500 && /it broke/.test(e.message));
});

test('create posts the draft as JSON and update posts version plus actions', async () => {
  const { c, requests } = client({
    'POST /oauth/token': { body: { access_token: 'tok' } },
    'POST /connectors/drafts': (r) => ({ body: { ...JSON.parse(r.body), id: 'c1', version: 1 } }),
    'POST /connectors/drafts/key=my-app': (r) => ({ body: { key: 'my-app', version: JSON.parse(r.body).version + 1 } }),
    'POST /fct-dev/deployments': (r) => ({ body: { ...JSON.parse(r.body), id: 'd1', version: 1, status: 'Queued' } }),
    'POST /fct-dev/deployments/key=my-app-sandbox': (r) => ({ body: { key: 'my-app-sandbox', version: JSON.parse(r.body).version + 1 } }),
  });
  const created = await c.createStaged({ key: 'my-app', name: 'My App', repository: { url: 'https://github.com/o/r.git', tag: 'v0.1.1' } });
  assert.equal(created.id, 'c1');
  assert.equal(requests.at(-1).headers['Content-Type'], 'application/json');
  const updated = await c.updateStaged('my-app', 1, [{ action: 'publish', certification: false }]);
  assert.equal(updated.version, 2);
  assert.deepEqual(JSON.parse(requests.at(-1).body), { version: 1, actions: [{ action: 'publish', certification: false }] });
  const dep = await c.createDeployment({ key: 'my-app-sandbox', connector: { key: 'my-app', version: 2, staged: false }, region: 'europe-west1.gcp', type: 'sandbox', configurations: [] });
  assert.equal(dep.status, 'Queued');
  assert.equal(requests.at(-1).url, 'https://connect.europe-west1.gcp.commercetools.com/fct-dev/deployments');
  const re = await c.updateDeployment('my-app-sandbox', 1, [{ action: 'redeploy', updateConnector: true }]);
  assert.equal(re.version, 2);
});

test('an unknown region refuses to build a client', () => {
  assert.throws(() => createConnectClient({ region: 'mars', projectKey: 'p', clientId: 'a', clientSecret: 'b', fetchImpl: async () => {} }), /mars/);
});
