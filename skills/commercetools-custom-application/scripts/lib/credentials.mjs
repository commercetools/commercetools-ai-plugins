import fs from 'node:fs';
import path from 'node:path';

// Reads the session that `mc-scripts login` stores, keyed by MC API origin.
// MC_ACCESS_TOKEN overrides it, matching mc-scripts' own CredentialsStorage.
export function readSession({ mcApiUrl, home, env = {}, nowSec = Math.floor(Date.now() / 1000) }) {
  if (env.MC_ACCESS_TOKEN) return { valid: true, token: env.MC_ACCESS_TOKEN, reason: '' };
  const loginHint = `Run \`npx @commercetools-frontend/mc-scripts login --mc-api-url ${mcApiUrl}\` (add --headless in CI).`;
  const file = path.join(home, '.commercetools', 'mc-credentials.json');
  let all;
  try {
    all = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { valid: false, token: null, reason: `No readable credentials file at ${file}. ${loginHint}` };
  }
  const entry = all[mcApiUrl];
  if (!entry) return { valid: false, token: null, reason: `No session for ${mcApiUrl}. ${loginHint}` };
  if (nowSec >= entry.expiresAt) return { valid: false, token: null, reason: `Session for ${mcApiUrl} expired. ${loginHint}` };
  return { valid: true, token: entry.token, reason: '' };
}
