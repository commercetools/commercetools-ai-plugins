import fs from 'node:fs';
import path from 'node:path';
import { credentialsFile } from './mc-session.mjs';

// The session reader (`readSession`, `readExpiry`) is shared with the custom-application skill and
// generated from .internal/skill-libs/mc-session.mjs. Only what is specific to MCP-server
// management stays here.
export { credentialsFile, readExpiry, readSession } from './mc-session.mjs';

// What this skill's sign-in asked for when it stored the session. mc-credentials.json holds only
// the token and its expiry, so the project and scope are kept next to it. A session without a
// matching marker is not trusted for MCP-server management.
export function markerFile(home) {
  return path.join(path.dirname(credentialsFile(home)), 'mc-mcp-session.json');
}

export function readMarker({ mcApiUrl, home }) {
  try {
    return JSON.parse(fs.readFileSync(markerFile(home), 'utf8'))[mcApiUrl] ?? null;
  } catch {
    return null;
  }
}

export function writeMarker({ mcApiUrl, home, project, scope, expiresAt }) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(markerFile(home), 'utf8')); } catch { /* new file */ }
  all[mcApiUrl] = { project, scope, expiresAt };
  fs.mkdirSync(path.dirname(markerFile(home)), { recursive: true });
  fs.writeFileSync(markerFile(home), JSON.stringify(all), { mode: 0o600 });
}
