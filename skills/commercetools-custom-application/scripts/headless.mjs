#!/usr/bin/env node
// The onboarding session without a terminal, for an agent that gathers the inputs in chat.
// See --help. Prints one JSON object on stdout; step events go to stderr.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readAppFacts } from './lib/app-facts.mjs';
import { renderHelp, toParseArgsOptions } from './lib/cli-help.mjs';
import { readSession } from './lib/credentials.mjs';
import { REGIONS } from './lib/form.mjs';
import { SECRET_ENV, runHeadless } from './lib/headless.mjs';
import { signedInEmail } from './lib/identity.mjs';
import { slugify, validateAnswers } from './lib/intake.mjs';
import { resolveLayout } from './lib/layout.mjs';
import { createDeps } from './lib/real-deps.mjs';
import { createSettingsClient } from './lib/settings-api.mjs';
import { mcApiUrlForRegion } from './lib/validate.mjs';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DOC = {
  name: 'headless.mjs',
  summary: 'the onboarding session without a terminal: every input as a flag, one JSON result',
  synopsis: [
    'headless.mjs --app-name <name> --project-key <key> --contact-email <email> [...]',
    'headless.mjs ... --install-plan <file> [--org-id <id>]',
    'headless.mjs ... --install-plan <file> --confirmed',
    'headless.mjs --app-dir <dir> --install-plan <file> --confirmed [--set <ctx>=<value>]...',
  ],
  description: `The same steps as onboard.mjs, with no screens. An agent gathers the inputs in chat and passes them as flags.

Without --install-plan it runs the tool checks and the sign-in (a browser login prints its URL on stderr and waits for the credentials file), then stops with exit 4 and a "needs" object listing the Organizations and their projects: the user chooses where to install, the agent writes the plan file. Without --confirmed it then prints the review (the app's facts, the install targets, the owner Organization, the deployment help switch) and exits without changing anything. The agent shows that review and asks for an explicit yes. With --confirmed it runs the rest: create the app, build, register, deploy, check the host, finish registration, open the browser.

When a step needs a value it cannot have (a hosting team or account, a token, the production URL with deployment help off, the Connect API client, the GitHub repository visibility), the run stops with exit 4 and a "needs" object naming the field and, for a secret, the environment variable to set. Answer it with --set <field>=<value> or that variable and run the same command again; it resumes. Polling waits (the verification email, the host check, Connect publishing and deploying) poll by themselves up to --poll-limit, then stop with exit 3; rerunning resumes. A browser login prints its URL and waits for the credentials file.

Secrets are read from the environment only: VERCEL_TOKEN, NETLIFY_AUTH_TOKEN, CLOUDFLARE_API_TOKEN, CTP_CLIENT_ID, CTP_CLIENT_SECRET. They never appear in the command line or the log. Every command's full output goes to <app-dir>/.mc-onboarding/session.log.`,
  options: {
    'app-name': { type: 'string', arg: 'name', description: 'The app name. Required unless --app-dir names an existing app.' },
    region: { type: 'string', arg: 'id', description: 'Cloud identifier: gcp-eu (default), gcp-us, gcp-au, aws-eu or aws-us.' },
    'project-key': { type: 'string', arg: 'key', description: 'The Project key used for local development. Required.' },
    'entry-point': { type: 'string', arg: 'path', description: 'The entryPointUriPath. Default: derived from the app name.' },
    'menu-label': { type: 'string', arg: 'text', description: 'The main menu label. Default: the app name.' },
    'contact-email': { type: 'string', arg: 'email', description: 'The maintainer contact email. Default: the email of your Merchant Center sign-in, when a stored session is valid.' },
    'app-dir': { type: 'string', arg: 'dir', description: 'The folder. Default: ./<slug of the app name>. An existing app there is reused and the run resumes.' },
    template: { type: 'string', arg: 'name', description: 'starter-typescript (default) or starter.' },
    hosting: { type: 'string', arg: 'provider', description: 'vercel (default), netlify, cloudflare, connect, surge or other. The first four have deployment help.' },
    'install-plan': { type: 'string', arg: 'file', description: 'The install plan JSON: one entry per Organization with orgId, orgName, allProjects and projectKeys. Without it the run stops after the sign-in with the Organizations and projects to choose from.' },
    'org-id': { type: 'string', arg: 'id', description: 'Owner Organization id. Required when the plan names several Organizations.' },
    'deploy-help': { type: 'string', arg: 'on|off', description: 'Deployment help. Default: on for hosts that have it.' },
    'production-url': { type: 'string', arg: 'url', description: 'With deployment help off: the https URL you deployed to.' },
    set: { type: 'string', multiple: true, arg: 'field=value', description: 'Answer a "needs" field up front, for instance vercelTeam=acme, cfAccount=<id>, ghVisibility=public. Repeatable.' },
    confirmed: { type: 'boolean', default: false, description: 'The user has seen the review and said yes. Without it nothing in the account changes.' },
    poll: { type: 'string', arg: 'seconds', description: 'Seconds between polls while waiting. Default 10.' },
    'poll-limit': { type: 'string', arg: 'count', description: 'Polls before a waiting step gives up for this run. Default 60.' },
    fixture: { type: 'string', arg: 'file', description: 'Scripted answers instead of real commands, for tests and demos. Changes nothing.' },
    help: { type: 'boolean', default: false, description: 'Print this page and exit.' },
  },
  exit: { 0: 'Done, or the review was printed (no --confirmed).', 1: 'A step failed. The JSON names it and the error; rerun to resume.', 2: 'Bad or missing input. The JSON lists the errors.', 3: 'A step was still waiting after the poll limit. Rerun to resume.', 4: 'A step needs a value. The JSON "needs" object says which; answer and rerun.' },
  examples: [
    ['Sign in and list the install targets', 'headless.mjs --app-name "My App" --project-key my-project --contact-email me@example.com'],
    ['Review first', 'headless.mjs --app-name "My App" --project-key my-project --contact-email me@example.com --install-plan ./install-plan.json'],
    ['Then run it', 'headless.mjs --app-name "My App" --project-key my-project --contact-email me@example.com --install-plan ./install-plan.json --confirmed'],
    ['Answer a need and resume', 'headless.mjs --app-dir ./my-app --install-plan ./my-app/install-plan.json --confirmed --set vercelTeam=acme'],
  ],
};

const { values: a } = parseArgs({ options: toParseArgsOptions(DOC.options) });
if (a.help) {
  process.stdout.write(renderHelp(DOC));
  process.exit(0);
}
const out = (body, code) => {
  console.log(JSON.stringify(body, null, 2));
  process.exit(code);
};
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const fixture = a.fixture ? JSON.parse(fs.readFileSync(a.fixture, 'utf8')) : null;

// ---- inputs -----------------------------------------------------------------------------------
const given = {
  appName: a['app-name'], region: a.region, projectKey: a['project-key'], entryPointUriPath: a['entry-point'],
  menuLabel: a['menu-label'], contactEmail: a['contact-email'], appDir: a['app-dir'] && path.resolve(a['app-dir']),
  template: a.template, hosting: a.hosting, ...(fixture?.form ?? {}),
};
if (given.appDir && fs.existsSync(path.join(given.appDir, 'custom-application-config.mjs'))) {
  const facts = readAppFacts({ configSource: read(path.join(given.appDir, 'custom-application-config.mjs')), constantsSource: ['src/constants.js', 'src/constants.ts'].map((f) => read(path.join(given.appDir, f))).join('\n') });
  given.region ??= facts.cloudIdentifier;
  given.entryPointUriPath ??= facts.entryPointUriPath;
  given.projectKey ??= facts.initialProjectKey;
  given.appName ??= path.basename(given.appDir);
  given.menuLabel ??= read(path.join(given.appDir, 'custom-application-config.mjs')).match(/defaultLabel:\s*'([^']*)'/)?.[1];
}
given.region ??= 'gcp-eu';
given.template ??= 'starter-typescript';
given.hosting ??= 'vercel';
if (given.appName) {
  given.entryPointUriPath ??= slugify(given.appName);
  given.menuLabel ??= given.appName;
  given.appDir ??= path.resolve(slugify(given.appName));
}
if (!given.contactEmail && !fixture) {
  given.contactEmail = await signedInEmail({
    regions: [given.region],
    readSession: ({ mcApiUrl: url }) => readSession({ mcApiUrl: url, home: os.homedir(), env: process.env }),
    clientFor: ({ mcApiUrl: url, token }) => createSettingsClient({ mcApiUrl: url, token }),
  }) ?? undefined;
}
const checked = validateAnswers(given);
if (!checked.ok) out({ ok: false, errors: checked.errors }, 2);
const answers = checked.inputs;

// ---- the machine ------------------------------------------------------------------------------
const mcApiUrl = mcApiUrlForRegion(answers.region);
const startedAt = Date.now();
const sessionValid = () => (fixture !== null
  ? Date.now() - startedAt >= (fixture.loginDelayMs ?? 0)
  : readSession({ mcApiUrl, home: os.homedir(), env: process.env }).valid);
const machine = createDeps({ fixture, skillDir, sessionValid });
const layout = resolveLayout({ hosting: answers.hosting, folder: path.resolve(answers.appDir), appName: answers.appName, exists: (p) => fs.existsSync(p) });
const { appDir, repoDir } = layout;
const appExists = fs.existsSync(path.join(appDir, 'custom-application-config.mjs'));
const topDir = repoDir ?? appDir;
const beside = (suffix) => path.join(path.dirname(topDir), `.${path.basename(topDir)}.${suffix}`);
// The plan: the given file, or the one a previous run left in the usual place. None yet is fine:
// the run then stops after the sign-in with the Organizations and projects to choose from.
const installPlan = a['install-plan'] ? path.resolve(a['install-plan']) : appExists ? path.join(appDir, 'install-plan.json') : beside('install-plan.json');
if (a['install-plan'] && !fs.existsSync(installPlan)) out({ ok: false, errors: { installPlan: `No file at ${installPlan}.` } }, 2);
const plan = fixture?.plan ?? (fs.existsSync(installPlan) ? JSON.parse(fs.readFileSync(installPlan, 'utf8')) : null);

// Answers given up front: non-secret fields as --set, secrets from the environment only.
const ctx = {
  appDir, repoDir, region: answers.region, entryPoint: answers.entryPointUriPath, hosting: answers.hosting,
  appName: answers.appName, menuLabel: answers.menuLabel, template: answers.template, projectKey: answers.projectKey,
  contactEmail: answers.contactEmail, productionUrl: a['production-url'], installPlan,
  orgId: a['org-id'], deployHelp: a['deploy-help'] ? a['deploy-help'] === 'on' : undefined,
};
for (const pair of a.set ?? []) {
  const i = pair.indexOf('=');
  if (i <= 0) out({ ok: false, errors: { set: `"${pair}" is not field=value.` } }, 2);
  const field = pair.slice(0, i);
  if (SECRET_ENV[field]) out({ ok: false, errors: { set: `${field} is a secret: set ${SECRET_ENV[field]} in the environment instead.` } }, 2);
  ctx[field] = pair.slice(i + 1);
}
for (const [field, envName] of Object.entries(SECRET_ENV)) if (process.env[envName]) ctx[field] = process.env[envName];
if (process.env.CTP_CLIENT_ID) ctx.ctClientId = process.env.CTP_CLIENT_ID;

// Read after the sign-in step, so a run that starts signed out still lists the Organizations.
const settings = () => {
  const session = readSession({ mcApiUrl, home: os.homedir(), env: process.env });
  if (!session.valid) throw new Error(session.reason);
  return createSettingsClient({ mcApiUrl, token: session.token });
};
const owners = async () => fixture?.owners ?? (await settings().organizations()).myOrganizations.results;
const targets = async () => fixture?.projects ?? (await settings().projects()).myProjects.results;

// create-mc-app refuses an existing folder, so until the app exists the log lives beside it.
let logPath;
if (appExists) {
  fs.mkdirSync(path.join(appDir, '.mc-onboarding'), { recursive: true });
  logPath = path.join(appDir, '.mc-onboarding', 'session.log');
} else {
  logPath = beside('session.log');
}
machine.setLogPath(logPath);
fs.appendFileSync(logPath, `# headless run started ${new Date().toISOString()}\n`);
ctx.logPath = logPath;
process.on('SIGINT', () => { machine.killActive(); process.exit(130); });

// Command output stays in the log; the sign-in's lines are the exception, because the login URL
// is in them and the agent has to hand it to the user.
const report = (e) => {
  if (e.type === 'log') {
    if (e.id === 'session') process.stderr.write(`[session] ${e.line}\n`);
    return;
  }
  const detail = e.detail ?? e.reason ?? e.error ?? '';
  process.stderr.write(`[${e.id}] ${e.type}${detail ? `  ${detail}` : ''}\n`);
};
let result;
try {
  result = await runHeadless({
    ctx, deps: machine.deps, plan, owners, targets, confirmed: a.confirmed,
    pollMs: Number(a.poll ?? 10) * 1000, pollLimit: Number(a['poll-limit'] ?? 60), onEvent: report,
  });
} catch (e) {
  out({ ok: false, error: e.message, log: machine.getLogPath() }, 1);
}
const code = result.ok ? 0 : result.needs ? 4 : result.failedAt ? 1 : 3;
// The owners list is what the agent needs to ask about an Organization; the review carries the
// owner that was resolved, and a "needs" for orgId carries every option.
out({ ...result, log: machine.getLogPath() }, code);
