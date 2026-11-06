import { spawn } from 'node:child_process';
import os from 'node:os';
import { readExpiry, readMarker, readSession, writeMarker } from './credentials.mjs';
import { checkProject, checkRegion, fieldErrors, mcApiUrl } from './validate.mjs';

// The one scope creating a managed MCP server needs. Without it the session reads nothing in the
// project and every call is a 403 insufficient_scope.
export const MCP_SCOPE = 'manage_mcp_servers';

const POLL_MS = 500;

export function checkTimeout(timeout) {
  const seconds = Number(timeout);
  return Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600 ? '' : 'Pass a whole number of seconds between 1 and 3600.';
}

// The command create-managed-mcp-server prints when it needs a session.
export function signInCommand(region, project, { force = false } = {}) {
  return `node scripts/sign-in.mjs --region ${region} --project ${project}${force ? ' --force' : ''}`;
}

// The login the custom-application scripts start, with the project and the scope passed
// explicitly. mc-scripts falls back to CTP_PROJECT_KEY and CTP_OAUTH_SCOPES from the environment,
// which would bind the session to whatever project the developer's shell has, so the child
// process doesn't see them. --force starts a new login even when mc-scripts holds a valid session.
const loginArgs = (api, project, force) => [
  '@commercetools-frontend/mc-scripts', 'login', '--mc-api-url', api,
  '--project-key', project, '--oauth-scope', MCP_SCOPE,
  ...(force ? ['--force'] : []),
];

function signedIn(region, via, expiry) {
  return {
    body: {
      ok: true,
      signedIn: true,
      region,
      via,
      ...(expiry ? { expiresAt: new Date(expiry * 1000).toISOString() } : {}),
    },
    code: 0,
  };
}

// Starts the login, forwards its output to stderr (the sign-in URL is on one of its streams),
// and returns when a valid session is stored, the login ends, or the timeout passes.
// The login gets its own process group: mc-scripts can leave a callback server running after it
// reports success, and ending the group ends that server too.
export async function runSignIn(values, { home = os.homedir(), env = process.env } = {}) {
  const errors = fieldErrors([
    ['region', checkRegion(values.region)],
    ['project', checkProject(values.project)],
    ['timeout', checkTimeout(values.timeout)],
  ]);
  if (errors) return { body: { ok: false, errors }, code: 2 };

  const api = mcApiUrl(values.region);
  const before = readExpiry({ mcApiUrl: api, home });
  // A stored session is reused only when this script stored it for this project and scope.
  // Anything else (another project, no scope, a login made elsewhere) is stale: it would fail
  // with insufficient_scope later, so a new login replaces it.
  const marker = readMarker({ mcApiUrl: api, home });
  const matches = marker && marker.project === values.project && marker.scope === MCP_SCOPE && marker.expiresAt === before;
  if (!values.force && matches && readSession({ mcApiUrl: api, home, env }).valid) {
    return signedIn(values.region, 'session', before);
  }

  const { CTP_PROJECT_KEY, CTP_OAUTH_SCOPES, ...cleanEnv } = env;
  const child = spawn('npx', loginArgs(api, values.project, true), {
    detached: true,
    env: { ...cleanEnv, FORCE_COLOR: '0', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let exited = false;
  let exitCode = null;
  let spawnError = null;
  child.on('exit', (code) => { exited = true; exitCode = code; });
  child.on('error', (e) => { exited = true; spawnError = e; });
  // Everything the login prints goes to stderr, so stdout stays one JSON object.
  child.stdout.on('data', (d) => process.stderr.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));

  const endLogin = () => {
    // Also after the launcher exited: a callback server it started can outlive it in the group.
    if (!child.pid) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); }
  };
  const finish = (body, code) => {
    endLogin();
    return { body, code };
  };
  // Ready only for a session that differs from the one found at the start: the new login's own.
  const sessionReady = () => {
    if (!readSession({ mcApiUrl: api, home, env }).valid) return null;
    const expiry = readExpiry({ mcApiUrl: api, home });
    return expiry !== before ? expiry ?? true : null;
  };

  const timeoutSec = Number(values.timeout);
  const deadline = Date.now() + timeoutSec * 1000;
  for (;;) {
    const expiry = sessionReady();
    if (expiry) {
      if (expiry !== true) writeMarker({ mcApiUrl: api, home, project: values.project, scope: MCP_SCOPE, expiresAt: expiry });
      return finish(signedIn(values.region, 'npx', expiry === true ? null : expiry).body, 0);
    }
    if (spawnError) return finish({ ok: false, error: `Could not start mc-scripts: ${spawnError.message}`, via: 'npx' }, 1);
    if (exited) {
      // One last look: the session may have been written just before the process ended.
      if (sessionReady()) continue;
      const error = exitCode === 0
        ? 'The login finished but no new session was stored.'
        : `mc-scripts login exited with ${exitCode}. Its output is on stderr.`;
      return finish({ ok: false, error, via: 'npx' }, 1);
    }
    if (Date.now() >= deadline) {
      return finish({ ok: false, error: `The sign-in was not completed within ${timeoutSec} seconds. Run it again for a new URL.`, via: 'npx' }, 3);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
