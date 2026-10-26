import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAppFacts } from '../scripts/lib/app-facts.mjs';

const config = `import { entryPointUriPath } from './src/constants';
const config = { name: 'x', entryPointUriPath, cloudIdentifier: 'gcp-us', env: {} };`;

test('reads the constant and the cloud identifier from a starter project', () => {
  const r = readAppFacts({ configSource: config, constantsSource: `export const entryPointUriPath = 'my-channels';` });
  assert.deepEqual(r, { entryPointUriPath: 'my-channels', cloudIdentifier: 'gcp-us' });
});

test('prefers a literal entryPointUriPath in the config over the constants file', () => {
  const src = `const config = { entryPointUriPath: 'literal-one', cloudIdentifier: "aws-eu" };`;
  const r = readAppFacts({ configSource: src, constantsSource: `export const entryPointUriPath = 'other';` });
  assert.deepEqual(r, { entryPointUriPath: 'literal-one', cloudIdentifier: 'aws-eu' });
});

test('throws naming what is missing rather than returning nulls', () => {
  assert.throws(() => readAppFacts({ configSource: 'export default {};', constantsSource: '' }), /entryPointUriPath/);
  assert.throws(() => readAppFacts({ configSource: `const c = { entryPointUriPath: 'ab' };`, constantsSource: '' }), /cloudIdentifier/);
});

test('a ${env:...} cloudIdentifier cannot be resolved statically and says so', () => {
  const src = "const c = { entryPointUriPath: 'ab', cloudIdentifier: '${env:CLOUD_IDENTIFIER}' };";
  assert.throws(() => readAppFacts({ configSource: src, constantsSource: '' }), /--region/);
});

test('initialProjectKey is read when present and left undefined when absent', () => {
  const withKey = `const config = { entryPointUriPath: 'x', cloudIdentifier: 'gcp-eu', env: { development: { initialProjectKey: 'my-proj' } } };`;
  assert.equal(readAppFacts({ configSource: withKey, constantsSource: '' }).initialProjectKey, 'my-proj');
  const without = `const config = { entryPointUriPath: 'x', cloudIdentifier: 'gcp-eu' };`;
  assert.equal(readAppFacts({ configSource: without, constantsSource: '' }).initialProjectKey, undefined);
});
