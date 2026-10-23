#!/usr/bin/env node
// Drives Merchant Center registration to the furthest point that needs no human:
// contact email -> create app -> (deploy) -> sync url -> Ready -> install in every plan target.
// --install-plan comes from install-plan.mjs; --project-key is shorthand for one allowlisted project in the owner Organization.
// Safe to rerun: every pass re-reads real state. Prints one JSON object on stdout.
//
// Usage:
//   node register.mjs --app-dir <dir> (--install-plan <plan.json> | --project-key <key>) [--contact-email <e>]
//        [--production-url https://...] [--org-id <id> | --org-name <name>] [--region gcp-eu] [--dry-run]
//
// Exit codes: 0 DONE, 3 stopped at a step only a person or the deploy step can do, 1 error.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { readAppFacts } from './lib/app-facts.mjs';
import { renderHelp, toParseArgsOptions } from './lib/cli-help.mjs';
import { readSession } from './lib/credentials.mjs';
import { drive } from './lib/drive.mjs';
import { envPlaceholder, patchConfig } from './lib/patch-config.mjs';
import { validatePlanFile } from './lib/install-plan.mjs';
import { planNextStep } from './lib/plan.mjs';
import { createSettingsClient } from './lib/settings-api.mjs';
import { mcApiUrlForRegion, validateEntryPointUriPath } from './lib/validate.mjs';

const DOC = {
  name: 'register.mjs',
  summary: 'register the Custom Application in the Merchant Center, make it Ready and install it',
  synopsis: [
    'register.mjs --app-dir <dir> --install-plan <file> [--contact-email <e>] [--production-url <url>] [--org-id <id>]',
    'register.mjs --app-dir <dir> --project-key <key> [--contact-email <e>] [--production-url <url>] [--org-id <id>]',
  ],
  description: `Drives registration as far as it can go without a person: maintainer contact email, create the app in Draft, sync the production URL, move it to Ready, and install it in every target of the install plan. Every pass re-reads real Merchant Center state, so it is safe to rerun after any interruption and resumes where things actually stand.

The app is registered in one owner Organization. It is installed in the Organizations chosen with install-plan.mjs, which can be different ones. Install targets are matched exactly: an allowlist that omits an installed project removes it. Switching a target between all projects and an allowlist needs an uninstall, so the script stops and asks (INSTALL_MISMATCH). --project-key is shorthand that only adds a project in the owner Organization and never removes or narrows anything.

It prints one JSON object. Read ok, steps and stoppedAt.`,
  options: {
    'app-dir': { type: 'string', arg: 'dir', description: 'The scaffolded app directory. Required. Its custom-application-config.mjs supplies the entry point path and region, and receives the applicationId and url.' },
    'install-plan': { type: 'string', arg: 'file', description: 'Install plan JSON written by install-plan.mjs. Use this or --project-key, not both.' },
    'project-key': { type: 'string', arg: 'key', description: 'Shorthand: ensure the app is installed on this one project of the owner Organization, adding it if missing and never removing others. Use this or --install-plan.' },
    'contact-email': { type: 'string', arg: 'email', description: 'Maintainer contact for the owner Organization. Needed once; a verification email is sent and the script stops at VERIFY_EMAIL until it is clicked.' },
    'production-url': { type: 'string', arg: 'url', description: 'The deployed https URL. Leave out on the first pass; the script stops at DEPLOY. Pass it on the second pass to sync the URL, make the app Ready and install.' },
    'org-id': { type: 'string', arg: 'id', description: 'Owner Organization id, when you belong to several. Never guessed.' },
    'org-name': { type: 'string', arg: 'name', description: 'Owner Organization name, as an alternative to --org-id.' },
    region: { type: 'string', arg: 'id', description: 'Cloud identifier. Defaults to the cloudIdentifier in the app config.' },
    'entry-point': { type: 'string', arg: 'path', description: 'entryPointUriPath. Defaults to the one in the app source.' },
    'dry-run': { type: 'boolean', default: false, description: 'Print the next step that would run and stop. Changes nothing.' },
    help: { type: 'boolean', default: false, description: 'Print this page and exit.' },
  },
  exit: { 0: 'Done: registered, Ready and installed in every target.', 1: 'Error. Read the error field.', 3: 'Stopped at a step only a person or the deploy step can do: VERIFY_EMAIL, DEPLOY, CHOOSE_TARGETS or INSTALL_MISMATCH.' },
  examples: [
    ['First pass, before deploying', 'register.mjs --app-dir ./my-app --install-plan install-plan.json --contact-email me@example.com'],
    ['Finish after deploying', 'register.mjs --app-dir ./my-app --install-plan install-plan.json --production-url https://my-app.vercel.app'],
    ['See what would happen next', 'register.mjs --app-dir ./my-app --install-plan install-plan.json --dry-run'],
  ],
};

const { values: a } = parseArgs({ options: toParseArgsOptions(DOC.options) });
if (a.help) {
  process.stdout.write(renderHelp(DOC));
  process.exit(0);
}
const fail = (msg) => {
  console.log(JSON.stringify({ ok: false, error: msg }));
  process.exit(1);
};

if (!a['app-dir']) fail('--app-dir is required');
if (!a['project-key'] && !a['install-plan']) fail('--install-plan or --project-key is required');
if (a['project-key'] && a['install-plan']) fail('Pass --install-plan or --project-key, not both.');
const appDir = path.resolve(a['app-dir']);
const configPath = path.join(appDir, 'custom-application-config.mjs');
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const constantsSource = ['src/constants.js', 'src/constants.ts'].map((f) => read(path.join(appDir, f))).join('\n');

let facts;
try {
  facts = readAppFacts({ configSource: read(configPath), constantsSource });
} catch (e) {
  if (!(a.region && a['entry-point'])) fail(e.message);
}
const entryPointUriPath = a['entry-point'] ?? facts.entryPointUriPath;
const region = a.region ?? facts.cloudIdentifier;
const v = validateEntryPointUriPath(entryPointUriPath);
if (!v.ok) fail(`entryPointUriPath "${entryPointUriPath}": ${v.error}`);
const mcApiUrl = mcApiUrlForRegion(region);
if (!mcApiUrl) fail(`Unknown cloud identifier "${region}".`);

const session = readSession({ mcApiUrl, home: os.homedir(), env: process.env });
if (!session.valid) fail(session.reason);

const client = createSettingsClient({ mcApiUrl, token: session.token, entryPointUriPath });

// Pick the Organization once. Ambiguity is an error, never a guess.
async function resolveOrg() {
  const { myOrganizations } = await client.organizations();
  const orgs = myOrganizations.results;
  const hit = a['org-id']
    ? orgs.filter((o) => o.id === a['org-id'])
    : a['org-name']
      ? orgs.filter((o) => o.name === a['org-name'])
      : orgs;
  if (hit.length !== 1) {
    fail(`Cannot pick one Organization (${hit.length} match). Pass --org-id. Available: ${orgs.map((o) => `${o.name} (${o.id})`).join(', ')}`);
  }
  return hit[0];
}

const org = await resolveOrg();

// Where to install. The owner Organization (above) is only where the app is registered.
let planned;
if (a['install-plan']) {
  planned = JSON.parse(fs.readFileSync(a['install-plan'], 'utf8'));
  const check = validatePlanFile(planned);
  if (!check.ok) fail(check.error);
} else {
  planned = [{ orgId: org.id, orgName: org.name, allProjects: false, projectKeys: [a['project-key']], ensure: true }];
}

async function observe() {
  const { organizationExtension: ext } = await client.contact(org.id);
  const { organizationExtensionForCustomApplication: reg } = await client.orgState(entryPointUriPath);
  if (reg && reg.organizationId !== org.id) {
    fail(`entryPointUriPath "${entryPointUriPath}" is registered in another Organization (${reg.organizationId}), not ${org.name} (${org.id}).`);
  }
  const app = reg?.application ?? null;
  const installTargets = [];
  for (const t of planned) {
    let tExt = ext;
    if (t.orgId !== org.id) {
      try {
        ({ organizationExtension: tExt } = await client.contact(t.orgId));
      } catch (e) {
        fail(`Cannot read installations for ${t.orgName} (${t.orgId}): ${e.message}. Drop it from the plan or get Administrators access there.`);
      }
    }
    const inst = app ? tExt.installedApplications.find((i) => i.application.id === app.id) : null;
    installTargets.push({
      ...t,
      actual: inst
        ? { installedApplicationId: inst.id, installInAllProjects: inst.installInAllProjects, projectKeys: inst.projects.map((p) => p.projectKey) }
        : null,
    });
  }
  return {
    contact: ext.applicationsMaintainerContactInformation,
    app,
    installTargets,
    productionUrl: a['production-url'] ?? null,
  };
}

// config:sync:ci owns the mapping from config file to the app draft, so we reuse it
// instead of rebuilding that mapping here. It needs the session token and org in env. When the
// config's url is an environment reference (a Connect-hosted app), that variable is set to the
// production URL, or to the starter's placeholder before one exists, so the sync can resolve it.
function configSync() {
  const args = ['mc-scripts', 'config:sync:ci'];
  const urlVar = envPlaceholder(fs.readFileSync(configPath, 'utf8'));
  const out = execFileSync('npx', args, {
    cwd: appDir,
    env: {
      ...process.env,
      MC_ACCESS_TOKEN: session.token,
      CT_ORGANIZATION_ID: org.id,
      ...(urlVar ? { [urlVar]: a['production-url'] ?? 'https://your_app_hostname.com' } : {}),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  }).toString();
  return out.match(/^ID:\s*(\S+)/m)?.[1] ?? null;
}

const patch = (patchValues) => {
  const before = fs.readFileSync(configPath, 'utf8');
  const after = patchConfig(before, patchValues);
  if (after !== before) fs.writeFileSync(configPath, after);
};

const actions = {
  async SET_CONTACT() {
    if (!a['contact-email']) fail('--contact-email is required to register a maintainer contact.');
    await client.setContact({ organizationId: org.id, email: a['contact-email'] });
    await client.sendVerification(org.id);
  },
  async CREATE_APP() {
    const id = configSync();
    if (id) patch({ applicationId: id });
  },
  async SYNC_URL() {
    // A url that is an environment reference stays one: the host injects it at build time, and
    // configSync gets it through the environment instead.
    if (!envPlaceholder(fs.readFileSync(configPath, 'utf8'))) patch({ url: a['production-url'] });
    configSync();
  },
  async SET_READY() {
    const { app } = await observe();
    await client.changeStatus({ organizationId: org.id, applicationId: app.id, status: 'PRIVATE_USAGE' });
  },
  async INSTALL({ target }) {
    const { app } = await observe();
    // Omitting projectKeys is how all projects is requested.
    await client.install({
      organizationId: target.orgId,
      applicationId: app.id,
      ...(target.allProjects ? {} : { projectKeys: target.projectKeys }),
    });
  },
  async UPDATE_INSTALL({ target }) {
    await client.updateInstall({
      organizationId: target.orgId,
      installedApplicationId: target.actual.installedApplicationId,
      projectKeys: target.projectKeys,
    });
  },
};

if (a['dry-run']) {
  // Acting is skipped in dry-run, so the driver would (correctly) report no progress.
  // Show what the next step would be and stop.
  const next = planNextStep(await observe());
  console.log(JSON.stringify({ ok: true, dryRun: true, organization: org, entryPointUriPath, next }, null, 2));
  process.exit(0);
}

try {
  const result = await drive({ observe, actions, plan: planNextStep, maxSteps: 10 + 2 * planned.length });
  console.log(JSON.stringify({ ok: true, organization: org, entryPointUriPath, ...result }, null, 2));
  process.exit(result.done ? 0 : 3);
} catch (e) {
  fail(e.message);
}
