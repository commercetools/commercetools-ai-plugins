import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envPlaceholder, patchConfig } from '../scripts/lib/patch-config.mjs';

const starter = `const config = {
  env: {
    development: { initialProjectKey: '\${env:CTP_INITIAL_PROJECT_KEY}' },
    production: {
      applicationId: 'TODO',
      url: 'https://your_app_hostname.com',
    },
  },
};`;

test('sets applicationId and leaves url alone when url is omitted', () => {
  const out = patchConfig(starter, { applicationId: 'abc123' });
  assert.match(out, /applicationId: 'abc123'/);
  assert.match(out, /url: 'https:\/\/your_app_hostname\.com'/);
});

test('sets url and leaves applicationId alone when it is omitted', () => {
  const out = patchConfig(starter, { url: 'https://x.vercel.app' });
  assert.match(out, /url: 'https:\/\/x\.vercel\.app'/);
  assert.match(out, /applicationId: 'TODO'/);
});

// Connect injects the URL at build time, so the config holds an environment reference instead
// of a literal. The patcher accepts it, and the register script can see which variable it is.
test('an environment reference is an accepted url value, and envPlaceholder names its variable', () => {
  const out = patchConfig(starter, { url: '${env:APPLICATION_URL}' });
  assert.match(out, /url: '\$\{env:APPLICATION_URL\}'/);
  assert.equal(envPlaceholder(out), 'APPLICATION_URL');
  assert.equal(envPlaceholder(starter), null);
  assert.throws(() => patchConfig(starter, { url: 'http://insecure.example' }), /https/);
});

test('is idempotent: patching twice with the same values changes nothing', () => {
  const once = patchConfig(starter, { applicationId: 'abc', url: 'https://x.vercel.app' });
  assert.equal(patchConfig(once, { applicationId: 'abc', url: 'https://x.vercel.app' }), once);
});

test('does not touch other url-like keys outside env.production', () => {
  const src = starter.replace('const config = {', "const config = {\n  mainMenuLink: { url: 'keep-me' },");
  assert.match(patchConfig(src, { url: 'https://x.vercel.app' }), /url: 'keep-me'/);
});

test('throws when the production block is missing, instead of silently doing nothing', () => {
  assert.throws(() => patchConfig('export default {};', { applicationId: 'a' }), /production/);
});

test('rejects a url without https', () => {
  assert.throws(() => patchConfig(starter, { url: 'http://x.com' }), /https/);
});
