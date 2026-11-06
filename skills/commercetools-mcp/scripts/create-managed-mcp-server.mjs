#!/usr/bin/env node
// Create a managed Commerce MCP Server with the user's Merchant Center sign-in. See --help.
// Prints one JSON object on stdout. Not interactive: it never signs in itself.
import { parseArgs } from 'node:util';
import { renderHelp, toParseArgsOptions } from './lib/cli-help.mjs';
import { runCreate } from './lib/create-managed-mcp-server.mjs';

const DOC = {
  name: 'create-managed-mcp-server.mjs',
  summary: 'create a managed Commerce MCP Server with the user\'s Merchant Center sign-in',
  synopsis: [
    'create-managed-mcp-server.mjs --region <region> --project <projectKey> --environment <development|production>',
    'create-managed-mcp-server.mjs ... --confirmed',
  ],
  description: `Replaces the "create the server in the Merchant Center form" step of the repository connection. Uses the session that mc-scripts login stores, so no API client or secret is involved. When there is no usable session it prints the sign-in command (scripts/sign-in.mjs) for the agent to run in the background, and exits 4.

Without --confirmed nothing is created: the plan is printed. Show that plan to the user. After an explicit yes, run the same command with --confirmed.

The server uses Identity sign-in, so each developer signs in with their own Merchant Center account. The token is read from ~/.commercetools/mc-credentials.json and is never printed or logged. Development gets every tool. Production and any other environment get read-only tools.`,
  options: {
    region: { type: 'string', arg: 'region', description: 'Region part of the Merchant Center host, as in mc.<region>.commercetools.com, for example europe-west1.gcp. Required.' },
    project: { type: 'string', arg: 'key', description: 'The project key. Required.' },
    environment: { type: 'string', arg: 'name', description: 'development (tools: all) or production (tools: read_all). Anything else is a read-only server, like production. Required.' },
    key: { type: 'string', arg: 'key', default: 'coding-agent', description: 'Server key. Letters, digits, hyphens and underscores, 2 to 256 characters. Default: coding-agent.' },
    confirmed: { type: 'boolean', default: false, description: 'The user has seen the plan and said yes. Without it nothing is created: the plan is printed.' },
    help: { type: 'boolean', default: false, description: 'Print this page and exit.' },
  },
  exit: {
    0: 'The plan was printed (no --confirmed), or the server was created.',
    1: 'The request failed. The JSON has error.',
    2: 'Bad input. The JSON has errors.',
    4: 'Sign-in needed. The JSON has needs, with the command to give the user.',
  },
  examples: [
    ['Print the plan', 'node create-managed-mcp-server.mjs --region europe-west1.gcp --project my-project --environment development'],
    ['Create after the user agrees', 'node create-managed-mcp-server.mjs --region europe-west1.gcp --project my-project --environment development --confirmed'],
    ['A read-only server under its own key', 'node create-managed-mcp-server.mjs --region europe-west1.gcp --project my-project --environment production --key agent-ro --confirmed'],
  ],
};

const { values } = parseArgs({ options: toParseArgsOptions(DOC.options) });
if (values.help) {
  process.stdout.write(renderHelp(DOC));
  process.exit(0);
}

const { body, code } = await runCreate(values);
console.log(JSON.stringify(body, null, 2));
process.exit(code);
