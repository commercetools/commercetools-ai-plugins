import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSession } from '../scripts/lib/credentials.mjs';

const URL_ = 'https://mc-api.europe-west1.gcp.commercetools.com';

function homeWith(creds) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mcsess-'));
  if (creds) {
    fs.mkdirSync(path.join(home, '.commercetools'));
    fs.writeFileSync(path.join(home, '.commercetools', 'mc-credentials.json'), JSON.stringify(creds));
  }
  return home;
}

test('valid unexpired token for the region', () => {
  const home = homeWith({ [URL_]: { token: 'tok', expiresAt: 2000 } });
  assert.deepEqual(readSession({ mcApiUrl: URL_, home, nowSec: 1000 }), { valid: true, token: 'tok', reason: '' });
});

test('expired token is invalid and tells the user to log in', () => {
  const home = homeWith({ [URL_]: { token: 'tok', expiresAt: 500 } });
  const r = readSession({ mcApiUrl: URL_, home, nowSec: 1000 });
  assert.equal(r.valid, false);
  assert.equal(r.token, null);
  assert.match(r.reason, /mc-scripts login/);
});

test('token stored for a different region does not count', () => {
  const home = homeWith({ 'https://mc-api.us-east-2.aws.commercetools.com': { token: 't', expiresAt: 2000 } });
  assert.equal(readSession({ mcApiUrl: URL_, home, nowSec: 1000 }).valid, false);
});

test('missing credentials file is invalid, not a crash', () => {
  const r = readSession({ mcApiUrl: URL_, home: homeWith(null), nowSec: 1000 });
  assert.equal(r.valid, false);
});

test('MC_ACCESS_TOKEN env wins and is treated as valid', () => {
  const r = readSession({ mcApiUrl: URL_, home: homeWith(null), env: { MC_ACCESS_TOKEN: 'envtok' }, nowSec: 1000 });
  assert.deepEqual(r, { valid: true, token: 'envtok', reason: '' });
});

test('login hint works before any app exists: package name and region url included', () => {
  const r = readSession({ mcApiUrl: URL_, home: homeWith(null), nowSec: 1000 });
  assert.match(r.reason, /npx @commercetools-frontend\/mc-scripts login --mc-api-url https:\/\/mc-api\.europe-west1\.gcp\.commercetools\.com/);
});
