import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntryPointUriPath, mcApiUrlForRegion } from '../scripts/lib/validate.mjs';

test('accepts a plain lowercase path', () => {
  assert.deepEqual(validateEntryPointUriPath('my-channels'), { ok: true });
});

test('rejects uppercase', () => {
  const r = validateEntryPointUriPath('MyChannels');
  assert.equal(r.ok, false);
  assert.match(r.error, /lowercase/i);
});

test('rejects length 1 and length 65', () => {
  assert.equal(validateEntryPointUriPath('a').ok, false);
  assert.equal(validateEntryPointUriPath('a'.repeat(65)).ok, false);
  assert.equal(validateEntryPointUriPath('a'.repeat(64)).ok, true);
});

test('rejects leading, trailing and adjacent separators', () => {
  for (const bad of ['-abc', 'abc-', '_abc', 'abc_', 'a--b', 'a__b', 'a-_b']) {
    assert.equal(validateEntryPointUriPath(bad).ok, false, bad);
  }
  assert.equal(validateEntryPointUriPath('a_b-c').ok, true);
});

test('rejects reserved names with a reserved message', () => {
  for (const r of ['products', 'orders', 'settings', 'dashboard', 'standalone-prices']) {
    const res = validateEntryPointUriPath(r);
    assert.equal(res.ok, false, r);
    assert.match(res.error, /reserved/i);
  }
});

test('maps cloud identifiers to the MC API origin', () => {
  assert.equal(mcApiUrlForRegion('gcp-eu'), 'https://mc-api.europe-west1.gcp.commercetools.com');
  assert.equal(mcApiUrlForRegion('aws-us'), 'https://mc-api.us-east-2.aws.commercetools.com');
  assert.equal(mcApiUrlForRegion('gcp-au'), 'https://mc-api.australia-southeast1.gcp.commercetools.com');
  assert.equal(mcApiUrlForRegion('nope'), null);
});
