import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactCommand } from '../scripts/lib/redact.mjs';

// Every command line goes to session.log. Secrets passed as flag values must not.
test('token and secret flag values are masked in the logged command line', () => {
  assert.equal(redactCommand('vercel', ['deploy', '--token', 'abc123', '--prod']), 'vercel deploy --token *** --prod');
  assert.equal(redactCommand('vercel', ['deploy', '--token=abc123']), 'vercel deploy --token=***');
  assert.equal(redactCommand('netlify', ['status', '--auth', 'nfp_x']), 'netlify status --auth ***');
  assert.equal(redactCommand('commercetools', ['auth', 'login', '--client-secret', 's3', '--client-id', 'id']), 'commercetools auth login --client-secret *** --client-id id');
});

test('everything else is left as typed', () => {
  assert.equal(redactCommand('pnpm', ['build']), 'pnpm build');
  assert.equal(redactCommand('node', ['x.mjs', '--url', 'https://a.b']), 'node x.mjs --url https://a.b');
});
