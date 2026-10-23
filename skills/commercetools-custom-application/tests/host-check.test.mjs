import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHost } from '../scripts/lib/host-check.mjs';

const html = '<html><body><div id="app"></div><script src="/main.js"></script></body></html>';

test('root and deep path serve the same SPA shell: ok', () => {
  const r = evaluateHost({ root: { status: 200, body: html }, deep: { status: 200, body: html } });
  assert.deepEqual(r, { ok: true, problems: [] });
});

test('deep path 404 means the rewrite to index.html is missing', () => {
  const r = evaluateHost({ root: { status: 200, body: html }, deep: { status: 404, body: 'Not found' } });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /rewrite/i);
});

test('deep path 200 with different content is not a rewrite', () => {
  const r = evaluateHost({ root: { status: 200, body: html }, deep: { status: 200, body: '<h1>Custom 404</h1>' } });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /rewrite/i);
});

test('root that is not an app shell fails even if deep matches it', () => {
  const r = evaluateHost({ root: { status: 200, body: 'Index of /' }, deep: { status: 200, body: 'Index of /' } });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /index\.html/);
});

test('a redirect is reported as such, since the MC proxy will not follow it to the app', () => {
  const r = evaluateHost({ root: { status: 301, body: '' }, deep: { status: 301, body: '' } });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /redirect/i);
});
