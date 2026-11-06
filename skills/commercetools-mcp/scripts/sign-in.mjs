#!/usr/bin/env node
// Merchant Center sign-in, the same mc-scripts login the custom-application scripts use. See --help.
// Prints one JSON object on stdout. The sign-in URL is passed through on stderr.
import { parseArgs } from 'node:util';
import { renderHelp, toParseArgsOptions } from './lib/cli-help.mjs';
import { runSignIn } from './lib/sign-in.mjs';

const DOC = {
  name: 'sign-in.mjs',
  summary: 'Merchant Center sign-in, the same mc-scripts login the custom-application scripts use',
  synopsis: ['sign-in.mjs --region <region> --project <projectKey>', 'sign-in.mjs ... --force'],
  description: `Starts \`npx @commercetools-frontend/mc-scripts login --mc-api-url <url> --project-key <key> --oauth-scope manage_mcp_servers\` in the background, passes on the sign-in URL it prints, and waits until a valid session is stored. A session this script stored earlier for the same project and scope finishes immediately, without starting a login. Any other session (another project, no scope, a login made elsewhere) is replaced by a new login, because it would fail with insufficient_scope. CTP_PROJECT_KEY and CTP_OAUTH_SCOPES from the environment are not passed on. The agent runs this script, shows the URL to the user, and the user only opens it in a browser. The session lands in ~/.commercetools/mc-credentials.json, where create-managed-mcp-server.mjs reads it. No API client or secret is involved: the Merchant Center session carries the user's permissions, limited to the project and the one scope above. What it asked for is recorded in ~/.commercetools/mc-mcp-session.json, which holds no token.

mc-scripts login can keep a callback server running on port 3001 after it reports success, so this script ends the login's whole process group once the session arrives, on failure and on timeout. Nothing is left running.

The sign-in stores a session token valid for about an hour. This script reads the credentials file only to see that a valid session is there, and never prints the token.`,
  options: {
    region: { type: 'string', arg: 'region', description: 'Region part of the Merchant Center host, as in mc.<region>.commercetools.com, for example europe-west1.gcp. Required.' },
    project: { type: 'string', arg: 'projectKey', description: 'The project the server is created in. The session is bound to it. Required.' },
    force: { type: 'boolean', default: false, description: 'Start a new login even when a matching session is stored. Use it when the create script still reports a missing scope.' },
    timeout: { type: 'string', arg: 'seconds', default: '300', description: 'How long to wait for the user to finish in the browser. Default 300. Whole seconds from 1 to 3600.' },
    help: { type: 'boolean', default: false, description: 'Print this page and exit.' },
  },
  exit: {
    0: 'Signed in, or a valid session was already stored.',
    1: 'The sign-in failed or stored no session. The JSON has error.',
    2: 'Bad input. The JSON has errors.',
    3: 'The user did not finish in time. Run it again: it starts a new login with a new URL.',
  },
  examples: [
    ['Sign in for a project', 'node sign-in.mjs --region europe-west1.gcp --project my-project'],
  ],
};

const { values } = parseArgs({ options: toParseArgsOptions(DOC.options) });
if (values.help) {
  process.stdout.write(renderHelp(DOC));
  process.exit(0);
}

const { body, code } = await runSignIn(values);
console.log(JSON.stringify(body, null, 2));
process.exit(code);
