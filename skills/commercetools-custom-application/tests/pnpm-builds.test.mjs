import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIgnoredBuilds, mergeAllowBuilds } from '../scripts/lib/pnpm-builds.mjs';

const ERR = `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @commercetools/nimbus@3.5.1, @swc/core@1.16.18, core-js-pure@3.50.0, core-js@3.50.0, esbuild@0.25.12, esbuild@0.28.2, msw@1.3.5, unrs-resolver@1.12.2

Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.`;

test('parses package names from the pnpm error: scoped names kept, versions dropped, duplicates merged', () => {
  assert.deepEqual(parseIgnoredBuilds(ERR), [
    '@commercetools/nimbus', '@swc/core', 'core-js', 'core-js-pure', 'esbuild', 'msw', 'unrs-resolver',
  ]);
});

test('output without the error yields no packages', () => {
  assert.deepEqual(parseIgnoredBuilds('Done in 2s'), []);
  assert.deepEqual(parseIgnoredBuilds(''), []);
});

test('creates a workspace file denying every package, scoped names quoted', () => {
  const y = mergeAllowBuilds('', ['msw', '@swc/core']);
  assert.equal(y, "allowBuilds:\n  '@swc/core': false\n  msw: false\n");
});

test('an existing decision is never overridden, including an explicit true', () => {
  const before = "allowBuilds:\n  esbuild: true\n  msw: false\n";
  const after = mergeAllowBuilds(before, ['esbuild', 'msw', 'core-js']);
  assert.match(after, /esbuild: true/);
  assert.equal((after.match(/esbuild/g) ?? []).length, 1);
  assert.match(after, /core-js: false/);
});

test('other keys in the file are preserved when allowBuilds is added', () => {
  const after = mergeAllowBuilds("packages:\n  - 'apps/*'\n", ['msw']);
  assert.match(after, /^packages:\n  - 'apps\/\*'\n/);
  assert.match(after, /allowBuilds:\n  msw: false\n$/);
});

test('merging is idempotent', () => {
  const once = mergeAllowBuilds('', ['msw', 'esbuild']);
  assert.equal(mergeAllowBuilds(once, ['msw', 'esbuild']), once);
});

test('no packages leaves the file untouched', () => {
  assert.equal(mergeAllowBuilds('packages:\n  - x\n', []), 'packages:\n  - x\n');
});
