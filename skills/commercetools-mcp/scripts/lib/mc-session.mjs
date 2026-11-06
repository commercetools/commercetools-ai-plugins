// GENERATED FILE — DO NOT EDIT.
// Source: .internal/skill-libs/mc-session.mjs. Edit that file and run `npm run build` in .internal/.
// The build overwrites changes made here, and CI fails on the resulting diff.
import fs from 'node:fs';
import path from 'node:path';

// Reads the Merchant Center session that `mc-scripts login` stores, keyed by MC API origin, in
// ~/.commercetools/mc-credentials.json. MC_ACCESS_TOKEN overrides the file, matching mc-scripts'
// own CredentialsStorage. The token is returned to the caller and never printed.
// Imports only node: modules, so a skill that ships this file stays installable on its own.

export function credentialsFile(home) {
  return path.join(home, '.commercetools', 'mc-credentials.json');
}

// `loginHint` is appended to every "no valid session" reason, so each skill words its own next step.
export function readSession({ mcApiUrl, home, env = {}, nowSec = Math.floor(Date.now() / 1000), loginHint = '' }) {
  if (env.MC_ACCESS_TOKEN) return { valid: true, token: env.MC_ACCESS_TOKEN, reason: '' };
  const invalid = (reason) => ({ valid: false, token: null, reason: loginHint ? `${reason} ${loginHint}` : reason });
  let all;
  try {
    all = JSON.parse(fs.readFileSync(credentialsFile(home), 'utf8'));
  } catch {
    return invalid(`No readable credentials file at ${credentialsFile(home)}.`);
  }
  const entry = all[mcApiUrl];
  if (!entry) return invalid(`No session for ${mcApiUrl}.`);
  if (nowSec >= entry.expiresAt) return invalid(`Session for ${mcApiUrl} expired.`);
  return { valid: true, token: entry.token, reason: '' };
}

// The expiry of the stored session, or null when the file or the entry is missing.
export function readExpiry({ mcApiUrl, home }) {
  try {
    return JSON.parse(fs.readFileSync(credentialsFile(home), 'utf8'))[mcApiUrl]?.expiresAt ?? null;
  } catch {
    return null;
  }
}
