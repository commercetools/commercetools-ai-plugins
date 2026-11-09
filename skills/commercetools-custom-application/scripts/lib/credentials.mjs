import { readSession as readStoredSession } from './mc-session.mjs';

// Reads the session that `mc-scripts login` stores, keyed by MC API origin. The reader is shared
// with the commercetools-mcp skill and generated from .internal/skill-libs/mc-session.mjs; this
// wrapper adds the login command this skill tells the user to run.
export function readSession(options) {
  const loginHint = `Run \`npx @commercetools-frontend/mc-scripts login --mc-api-url ${options.mcApiUrl}\` (add --headless in CI).`;
  return readStoredSession({ loginHint, ...options });
}
