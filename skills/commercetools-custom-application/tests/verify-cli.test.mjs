import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = process.env.VERIFY_SCRIPT ?? fileURLToPath(new URL('../scripts/verify.mjs', import.meta.url));
const html = '<html><body><div id="app"></div><script src="/main.js"></script></body></html>';
let server;
let url;

before(async () => {
  server = createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const run = (args) =>
  new Promise((resolve) => {
    const p = spawn('node', [script, ...args]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, json: JSON.parse(out) }));
  });
const base = (region) => ['--production-url', url, '--project-key', 'my-proj', '--entry-point', 'my-app', '--region', region];

test('openInBrowser is the production Merchant Center URL of the app in the project', async () => {
  const { code, json } = await run(base('gcp-eu'));
  assert.equal(code, 0);
  assert.equal(json.ok, true);
  assert.match(json.openInBrowser, /^https:\/\/mc\.[^/]+\/my-proj\/my-app$/);
  assert.doesNotMatch(json.openInBrowser, /localhost|127\.0\.0\.1/);
});

test('openInBrowser host follows the region', async () => {
  const eu = (await run(base('gcp-eu'))).json.openInBrowser;
  const us = (await run(base('gcp-us'))).json.openInBrowser;
  assert.notEqual(new URL(eu).host, new URL(us).host);
});

test('note tells the agent to open the page after register is done, not before', async () => {
  const { json } = await run(base('gcp-eu'));
  assert.match(json.note, /openInBrowser/);
  assert.match(json.note, /after register\.mjs reports done/);
  assert.doesNotMatch(json.note, /before finishing registration/);
});

test('a missing flag fails with a specific error and exit 1', async () => {
  const { code, json } = await run(['--production-url', url]);
  assert.equal(code, 1);
  assert.equal(json.ok, false);
  assert.match(json.error, /--project-key is required/);
});
