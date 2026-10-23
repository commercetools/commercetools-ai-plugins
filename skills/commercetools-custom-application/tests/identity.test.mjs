import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signedInEmail } from '../scripts/lib/identity.mjs';

// A fake credentials store: which MC API origins hold a valid session.
const sessions = (valid) => ({ mcApiUrl }) => (valid[mcApiUrl] ? { valid: true, token: valid[mcApiUrl] } : { valid: false, token: null });
const clients = (emails, calls = []) => ({ mcApiUrl, token }) => ({
  me: async () => {
    calls.push([mcApiUrl, token]);
    if (emails[mcApiUrl] instanceof Error) throw emails[mcApiUrl];
    return { me: { email: emails[mcApiUrl] } };
  },
});
const EU = 'https://mc-api.europe-west1.gcp.commercetools.com';
const US = 'https://mc-api.us-central1.gcp.commercetools.com';

test('with a valid session for the region, the email of the signed-in user comes back', async () => {
  const calls = [];
  const email = await signedInEmail({ regions: ['gcp-eu'], readSession: sessions({ [EU]: 'tok' }), clientFor: clients({ [EU]: 'me@example.com' }, calls) });
  assert.equal(email, 'me@example.com');
  assert.deepEqual(calls, [[EU, 'tok']]);
});

test('without any valid session nothing is asked and nothing comes back', async () => {
  const calls = [];
  const email = await signedInEmail({ regions: ['gcp-eu', 'gcp-us'], readSession: sessions({}), clientFor: clients({ [EU]: 'x' }, calls) });
  assert.equal(email, null);
  assert.deepEqual(calls, []);
});

test('regions are tried in order and the first valid session wins', async () => {
  const calls = [];
  const email = await signedInEmail({ regions: ['gcp-eu', 'gcp-us'], readSession: sessions({ [US]: 'us-tok' }), clientFor: clients({ [US]: 'us@example.com' }, calls) });
  assert.equal(email, 'us@example.com');
  assert.deepEqual(calls, [[US, 'us-tok']]);
});

test('a failing request is not an error for the form: it just yields nothing', async () => {
  const email = await signedInEmail({ regions: ['gcp-eu'], readSession: sessions({ [EU]: 't' }), clientFor: clients({ [EU]: new Error('network down') }) });
  assert.equal(email, null);
});
