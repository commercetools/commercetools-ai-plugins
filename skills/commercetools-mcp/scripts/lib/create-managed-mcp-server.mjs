import os from 'node:os';
import { readExpiry, readMarker, readSession } from './credentials.mjs';
import { MCP_SCOPE, signInCommand } from './sign-in.mjs';
import { checkProject, checkRegion, fieldErrors, mcApiUrl } from './validate.mjs';

// The Merchant Center GraphQL gateway, in the same shape the custom-application settings
// client uses. `ctp` is the commerce API; the project key selects which Project.
const MC_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-graphql-target': 'ctp',
  'x-application-id': '__local:mcp',
};

const KEY = /^[A-Za-z0-9_-]{2,256}$/;

// Development gets every tool, the point of a coding-agent connection. Everything else is
// read-only, so nothing can be changed through the agent. Same rule as the repository connection.
export function toolsFor(environment) {
  return environment.toLowerCase() === 'development' ? 'all' : 'read_all';
}

export function serverDraft({ key, tools }) {
  return {
    key,
    authenticationMode: 'CommercetoolsIdentity',
    state: 'Enabled',
    mcpServer: { commerce: { majorVersion: 'v4', tools: [tools] } },
  };
}

function needsSignIn(values, label, opts) {
  return {
    body: {
      ok: false,
      needs: {
        ctx: 'signIn',
        label,
        command: signInCommand(values.region, values.project, opts),
        hint: 'Show the user this command and say it signs them in through the Merchant Center in a browser (it runs mc-scripts through npx, which can download it). Wait for an explicit yes before running it. Then run it in the background and show the user the sign-in URL it prints on stderr: the user opens it in a browser and finishes the sign-in there. Wait for the command to end. It prints "ok": true when the session is stored. Then run this script again. A session that is already valid finishes immediately.',
      },
    },
    code: 4,
  };
}

// Turns the Merchant Center response into the JSON result. `insufficient_scope` (HTTP 403 or a
// GraphQL error on HTTP 200) is a sign-in need: the session is real, it just lacks the scope.
// Any other 403 is a permission denial that signing in again cannot fix, so it stays a failure.
export function interpretCreateResponse({ status, body }) {
  const err = body.errors?.[0] ?? (status < 200 || status >= 300 ? body : null);
  if ((err?.extensions?.code ?? err?.code) === 'insufficient_scope') {
    return { signIn: true };
  }
  if (err) {
    // The message and its code only. The response can name the user's permissions.
    return {
      body: {
        ok: false,
        error: err.message ?? 'The Merchant Center API refused the request.',
        code: err.extensions?.code ?? err.code ?? status,
        fallback: 'Create the server in the Merchant Center form instead.',
      },
      code: 1,
    };
  }
  const s = body.data.createMcpServer;
  return {
    body: { ok: true, stage: 'created', changed: true, serverKey: s.key, state: s.state, tools: s.mcpServer.tools, url: s.mcpServer.url },
    code: 0,
  };
}

export async function runCreate(values, { home = os.homedir(), env = process.env, fetchImpl = fetch } = {}) {
  const errors = fieldErrors([
    ['region', checkRegion(values.region)],
    ['project', checkProject(values.project)],
    ['environment', values.environment ? '' : 'Pass development or production. Production and any other value get read-only tools.'],
    ['key', KEY.test(values.key) ? '' : 'Letters, digits, hyphens and underscores, 2 to 256 characters.'],
  ]);
  if (errors) return { body: { ok: false, errors }, code: 2 };

  const tools = toolsFor(values.environment);
  const session = readSession({ mcApiUrl: mcApiUrl(values.region), home, env });
  if (!session.valid) return needsSignIn(values, session.reason);
  // A session this skill's sign-in didn't store for this project and scope would only end in a 403.
  if (!env.MC_ACCESS_TOKEN) {
    const api = mcApiUrl(values.region);
    const marker = readMarker({ mcApiUrl: api, home });
    if (!marker || marker.project !== values.project || marker.scope !== MCP_SCOPE || marker.expiresAt !== readExpiry({ mcApiUrl: api, home })) {
      return needsSignIn(values, `The stored session was not made for managing MCP servers in ${values.project}.`);
    }
  }

  if (!values.confirmed) {
    return {
      body: {
        ok: true,
        stage: 'plan',
        changed: false,
        plan: {
          projectKey: values.project,
          region: values.region,
          serverKey: values.key,
          authenticationMode: 'Identity sign-in',
          state: 'Enabled',
          tools,
        },
        next: 'Show this plan to the user. After an explicit yes, run the same command with --confirmed.',
      },
      code: 0,
    };
  }

  let res;
  try {
    res = await fetchImpl(`${mcApiUrl(values.region)}/graphql`, {
      method: 'POST',
      headers: {
        ...MC_HEADERS,
        Authorization: `Bearer ${session.token}`,
        'x-project-key': values.project,
      },
      body: JSON.stringify({
        query: 'mutation($draft: McpServerDraft!) { createMcpServer(draft: $draft) { key version state mcpServer { url tools } } }',
        variables: { draft: serverDraft({ key: values.key, tools }) },
      }),
    });
  } catch (e) {
    return { body: { ok: false, error: `Request failed: ${e.message}` }, code: 1 };
  }

  const body = await res.json().catch(() => ({}));
  const result = interpretCreateResponse({ status: res.status, body });
  if (result.signIn && env.MC_ACCESS_TOKEN) {
    // readSession prefers MC_ACCESS_TOKEN over a stored session, so a new login would not be used.
    return {
      body: {
        ok: false,
        error: 'The token in MC_ACCESS_TOKEN was rejected for managing MCP servers in this project. Unset it or replace it with a token that has the manage_mcp_servers scope, then run this script again.',
        code: 'insufficient_scope',
        fallback: 'Create the server in the Merchant Center form instead.',
      },
      code: 1,
    };
  }
  if (result.signIn) return needsSignIn(values, 'The session cannot manage MCP servers in this project. Sign in again.', { force: true });
  return result;
}
