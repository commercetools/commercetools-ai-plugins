import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchPage, isCaError } from '../scripts/lib/host-fetch.mjs';

// On a managed machine Node's fetch cannot verify the host's certificate (the corporate CA is in
// the system keychain, which Node does not read) while curl, which does read it, gets through.
// So a certificate-authority error falls back to curl; any other error is the caller's.
const caError = (code) => Object.assign(new Error('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
const okFetch = async () => ({ status: 200, text: async () => '<html>app</html>' });

test('a certificate-authority error is recognised by its code, other errors are not', () => {
  for (const code of ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED']) {
    assert.equal(isCaError(caError(code)), true, code);
  }
  assert.equal(isCaError(caError('ENOTFOUND')), false);
  assert.equal(isCaError(new Error('plain')), false);
});

test('fetch is used when it works, and says so', async () => {
  const r = await fetchPage('https://x.test/a', { fetchImpl: okFetch, curl: async () => { throw new Error('not called'); } });
  assert.deepEqual(r, { status: 200, body: '<html>app</html>', via: 'fetch' });
});

test('a certificate error falls back to curl, which returns the body and the status code on its last line', async () => {
  const calls = [];
  const curl = async (args) => { calls.push(args); return { code: 0, stdout: '<html>app</html>\n200', stderr: '' }; };
  const r = await fetchPage('https://x.test/a', { fetchImpl: async () => { throw caError('UNABLE_TO_GET_ISSUER_CERT_LOCALLY'); }, curl });
  assert.deepEqual(r, { status: 200, body: '<html>app</html>', via: 'curl' });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('https://x.test/a'));
  assert.ok(calls[0].some((a) => /%\{http_code\}/.test(a)), 'asks curl for the status code');
  assert.ok(!calls[0].includes('-L'), 'redirects are not followed, the proxy would not follow them either');
  const notFound = await fetchPage('https://x.test/a', { fetchImpl: async () => { throw caError('SELF_SIGNED_CERT_IN_CHAIN'); }, curl: async () => ({ code: 0, stdout: 'nope\n404', stderr: '' }) });
  assert.deepEqual(notFound, { status: 404, body: '', via: 'curl' });
});

test('when curl fails too, the error names both, so the user knows what to fix', async () => {
  const curl = async () => ({ code: 60, stdout: '', stderr: 'curl: (60) SSL certificate problem' });
  await assert.rejects(
    fetchPage('https://x.test/a', { fetchImpl: async () => { throw caError('UNABLE_TO_GET_ISSUER_CERT_LOCALLY'); }, curl }),
    (e) => /UNABLE_TO_GET_ISSUER_CERT_LOCALLY/.test(e.message) && /curl: \(60\)/.test(e.message) && /NODE_EXTRA_CA_CERTS/.test(e.message),
  );
});

test('a non-certificate error is thrown as is, with no curl attempt', async () => {
  let called = false;
  await assert.rejects(
    fetchPage('https://x.test/a', { fetchImpl: async () => { throw caError('ENOTFOUND'); }, curl: async () => { called = true; return { code: 0, stdout: '\n200', stderr: '' }; } }),
    /fetch failed/,
  );
  assert.equal(called, false);
});
