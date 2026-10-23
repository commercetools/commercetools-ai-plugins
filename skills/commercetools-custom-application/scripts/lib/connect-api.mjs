// A small client for the commercetools Connect API, enough to publish a private Connector and
// deploy it: client-credentials token, ConnectorStaged get/create/update, Deployment
// get/create/update. `fetchImpl` is injected so the provider is tested without the network.
// Hosts and scopes: https://docs.commercetools.com/connect/hosts-and-authorization.md

// Cloud identifier (the config's cloudIdentifier) to the Connect region host.
const CONNECT_HOSTS = {
  'gcp-eu': 'europe-west1.gcp',
  'gcp-us': 'us-central1.gcp',
  'gcp-au': 'australia-southeast1.gcp',
  'aws-eu': 'eu-central-1.aws',
  'aws-us': 'us-east-2.aws',
  'aws-fra': 'eu-central-1.aws',
  'aws-ohio': 'us-east-2.aws',
};

export const connectHostFor = (cloudIdentifier) => CONNECT_HOSTS[cloudIdentifier] ?? null;

export function connectUrls(cloudIdentifier) {
  const host = connectHostFor(cloudIdentifier);
  return host ? { api: `https://connect.${host}.commercetools.com`, auth: `https://auth.${host}.commercetools.com` } : null;
}

export function createConnectClient({ region, projectKey, clientId, clientSecret, fetchImpl }) {
  const urls = connectUrls(region);
  if (!urls) throw new Error(`No Connect host for the cloud identifier "${region}".`);
  const scopes = [`manage_connectors:${projectKey}`, `manage_connectors_deployments:${projectKey}`];
  let token = null;

  const fail = async (res, what) => {
    const text = await res.text();
    let message = text;
    try {
      message = JSON.parse(text).message ?? JSON.parse(text).error ?? text;
    } catch {
      // keep the raw text
    }
    const e = new Error(`${what} answered ${res.status}: ${message}`);
    e.status = res.status;
    throw e;
  };

  async function getToken() {
    if (token) return token;
    const res = await fetchImpl(`${urls.auth}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(scopes.join(' '))}`,
    });
    if (!res.ok) await fail(res, 'The token request');
    token = (await res.json()).access_token;
    return token;
  }

  async function call(method, path, body, { nullOn404 = false } = {}) {
    const res = await fetchImpl(`${urls.api}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await getToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 404 && nullOn404) return null;
    if (!res.ok) await fail(res, `${method} ${path}`);
    return res.json();
  }

  return {
    token: getToken,
    getStaged: (key) => call('GET', `/connectors/drafts/key=${key}`, null, { nullOn404: true }),
    createStaged: (draft) => call('POST', '/connectors/drafts', draft),
    updateStaged: (key, version, actions) => call('POST', `/connectors/drafts/key=${key}`, { version, actions }),
    getDeployment: (key) => call('GET', `/${projectKey}/deployments/key=${key}`, null, { nullOn404: true }),
    createDeployment: (draft) => call('POST', `/${projectKey}/deployments`, draft),
    updateDeployment: (key, version, actions) => call('POST', `/${projectKey}/deployments/key=${key}`, { version, actions }),
  };
}
