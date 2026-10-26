#!/usr/bin/env node
// One running session from "which Organizations" to the app open in the browser. See --help.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readAppFacts } from './lib/app-facts.mjs';
import { FIELDS, REGIONS, formAnswers, initForm, reduceForm } from './lib/form.mjs';
import { signedInEmail } from './lib/identity.mjs';
import { renderHelp, toParseArgsOptions } from './lib/cli-help.mjs';
import { readSession } from './lib/credentials.mjs';
import { FORM_HINTS, hintSegments } from './lib/hints.mjs';
import { buildSteps, deployHelpOn } from './lib/onboard-steps.mjs';
import { initInput, reduceInput } from './lib/input-box.mjs';
import { createPainter } from './lib/paint.mjs';
import { createDeps } from './lib/real-deps.mjs';
import { resolveLayout } from './lib/layout.mjs';
import { initReview, reduceReview, reviewLines } from './lib/review.mjs';
import { initSession, reduceSession, runSession } from './lib/session.mjs';
import { sessionLines } from './lib/session-view.mjs';
import { createSettingsClient } from './lib/settings-api.mjs';
import { colorEnabled, createStyle, fitSegments } from './lib/style.mjs';
import { mcApiUrlForRegion } from './lib/validate.mjs';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DOC = {
  name: 'onboard.mjs',
  summary: 'from nothing to a Merchant Center Custom Application open in your browser, in one session',
  synopsis: [
    'onboard.mjs',
    'onboard.mjs [--app-name <name>] [--region <id>] [--project-key <key>] [--contact-email <email>] [--app-dir <dir>] [--deploy-help on|off]',
    'onboard.mjs --yes --app-name <name> --project-key <key> --contact-email <email> [--install-plan <file>] [--org-id <id>] [...]',
  ],
  description: `One full-screen session that starts from scratch. It asks everything first, then does the work while you watch, and ends with the app open in the cloud Merchant Center.

Screens, in order: a form (app name, region, project key, entry path, menu label, contact email, folder, language, hosting; the name fills in the derived fields until you edit them), tool checks and the Merchant Center sign-in (a browser login if your session is missing or expired), the Organization picker (which Organizations, all projects or an allowlist each; enter opens an Organization or ticks a project, tab continues), and a review screen. Nothing is created or changed until you press Enter on the review screen, which is also where you pick the owner Organization and decide on deployment help; b there goes back to the picker.

Then the steps run with live progress: create the app with create-mc-app, install dependencies and build, register the app in Draft (pausing for the verification email), deploy, a host check, finish registration (Ready and installed in every chosen Organization), and open the browser. Deployment help is one toggle: on (the default for Vercel, Netlify, Cloudflare Pages and commercetools Connect) the session creates or links the site, builds and deploys, or for Connect pushes a tagged GitHub repository and publishes and deploys a private Connector; off, you deploy and the session asks for the production URL. For Connect the folder you name is the repository root and the app is created one level down.

A failed step stays on the screen with its error: r runs it again, q quits, and rerunning the session later resumes from there. When a step needs an answer it shows an input box instead: the production URL, a team or account to deploy under when your login has several (pick one with the arrows and Enter), a token when a CLI is not signed in (leave it empty and press Enter after logging in in another terminal), or for Connect an API client id and secret and the GitHub repository visibility. Tokens and secrets stay in memory and never reach the log.

By default every flag only pre-fills the form. With --yes the form is skipped when the flags make a complete, valid form (at least --app-name, --project-key and --contact-email; the rest has defaults), the picker is skipped when --install-plan names a plan, and --org-id and --deploy-help pre-set the review. The review screen itself always shows: it is the one place that confirms changing your account. Point --app-dir at an existing app to skip creating it; the session then reads its config and resumes from wherever things stand. Every step is safe to rerun. The full output of every command goes to <app-dir>/.mc-onboarding/session.log.`,
  options: {
    'app-name': { type: 'string', arg: 'name', description: 'Pre-fills the app name.' },
    region: { type: 'string', arg: 'id', description: 'Pre-fills the cloud identifier: gcp-eu, gcp-us, gcp-au, aws-eu or aws-us.' },
    'project-key': { type: 'string', arg: 'key', description: 'Pre-fills the Project key used for local development.' },
    'entry-point': { type: 'string', arg: 'path', description: 'Pre-fills the entryPointUriPath. Otherwise derived from the app name.' },
    'menu-label': { type: 'string', arg: 'text', description: 'Pre-fills the main menu label. Otherwise the app name.' },
    'contact-email': { type: 'string', arg: 'email', description: 'Pre-fills the maintainer contact email. Otherwise the email of your Merchant Center sign-in, when a stored session is still valid.' },
    'app-dir': { type: 'string', arg: 'dir', description: 'Pre-fills the folder. If it already holds an app, the session reuses it and skips creating it.' },
    template: { type: 'string', arg: 'name', description: 'Pre-fills the starter: starter-typescript (default) or starter.' },
    hosting: { type: 'string', arg: 'provider', description: 'Pre-fills the host: vercel, netlify, cloudflare, connect, surge or other. The first four have deployment help.' },
    'install-plan': { type: 'string', arg: 'file', description: 'Use this install plan instead of running the Organization picker.' },
    'deploy-help': { type: 'string', arg: 'on|off', description: 'Start the review screen with deployment help on or off.' },
    'production-url': { type: 'string', arg: 'url', description: 'With deployment help off: the https URL you deployed to, so the session does not need to ask.' },
    'org-id': { type: 'string', arg: 'id', description: 'Owner Organization id, pre-selected on the review screen.' },
    poll: { type: 'string', arg: 'seconds', description: 'Seconds between automatic re-checks while waiting. Default 10.' },
    yes: { type: 'boolean', default: false, description: 'Skip the form when the flags fill it in completely and validly. An incomplete form is shown with the missing fields marked. The review screen still shows.' },
    fixture: { type: 'string', arg: 'file', description: 'Scripted answers instead of real commands, for tests and demos. Changes nothing.' },
    help: { type: 'boolean', default: false, description: 'Print this page and exit.' },
  },
  exit: { 0: 'The app was opened in the browser.', 1: 'You quit on a failed step. The error and the log path were printed. Rerun to resume.', 2: 'Not an interactive terminal, or a tool check failed.', 3: 'You quit while a step was waiting for you. Rerun to resume.', 130: 'You quit on a screen before the work started. Nothing changed.' },
  examples: [
    ['Everything, from scratch', 'onboard.mjs'],
    ['Pre-fill what you know', 'onboard.mjs --app-name "My App" --region gcp-eu --project-key my-project --contact-email me@example.com'],
    ['Skip the form and the picker, straight to the review', 'onboard.mjs --yes --app-name "My App" --project-key my-project --contact-email me@example.com --install-plan ./install-plan.json --org-id <id>'],
    ['Resume an existing app', 'onboard.mjs --app-dir ./my-app'],
  ],
};

const { values: a } = parseArgs({ options: toParseArgsOptions(DOC.options) });
if (a.help) {
  process.stdout.write(renderHelp(DOC));
  process.exit(0);
}
const die = (msg, code = 1) => {
  console.log(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
};
if (!process.stdin.isTTY || !process.stderr.isTTY) die('The session needs an interactive terminal. Run it with the `!` prefix.', 2);

const fixture = a.fixture ? JSON.parse(fs.readFileSync(a.fixture, 'utf8')) : null;
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
let mcApiUrl = null; // known once the region is answered
// A fixture may delay validity (loginDelayMs) to show the sign-in wait without a real login.
const startedAt = Date.now();
const sessionValid = () => (fixture !== null
  ? Date.now() - startedAt >= (fixture.loginDelayMs ?? 0)
  : mcApiUrl !== null && readSession({ mcApiUrl, home: os.homedir(), env: process.env }).valid);

// An existing app pre-fills the form from its config. Anything else is typed on the first screen.
const prefill = {
  appName: a['app-name'], region: a.region, projectKey: a['project-key'], entryPointUriPath: a['entry-point'],
  menuLabel: a['menu-label'], contactEmail: a['contact-email'], appDir: a['app-dir'] && path.resolve(a['app-dir']),
  template: a.template, hosting: a.hosting,
};
const existingConfig = prefill.appDir && fs.existsSync(path.join(prefill.appDir, 'custom-application-config.mjs'));
if (existingConfig) {
  try {
    const facts = readAppFacts({ configSource: read(path.join(prefill.appDir, 'custom-application-config.mjs')), constantsSource: ['src/constants.js', 'src/constants.ts'].map((f) => read(path.join(prefill.appDir, f))).join('\n') });
    prefill.region ??= facts.cloudIdentifier;
    prefill.entryPointUriPath ??= facts.entryPointUriPath;
    prefill.projectKey ??= facts.initialProjectKey;
    prefill.appName ??= path.basename(prefill.appDir);
    prefill.menuLabel ??= read(path.join(prefill.appDir, 'custom-application-config.mjs')).match(/defaultLabel:\s*'([^']*)'/)?.[1];
  } catch (e) {
    die(`Could not read the app in ${prefill.appDir}: ${e.message}`);
  }
}
// The contact email starts as the signed-in user's own, when a stored session is still valid.
// The region given (or every region, in form order) is tried; the field stays editable.
if (!prefill.contactEmail && !fixture) {
  prefill.contactEmail = await signedInEmail({
    regions: prefill.region ? [prefill.region] : REGIONS,
    readSession: ({ mcApiUrl: url }) => readSession({ mcApiUrl: url, home: os.homedir(), env: process.env }),
    clientFor: ({ mcApiUrl: url, token }) => createSettingsClient({ mcApiUrl: url, token }),
  }) ?? undefined;
}

// ---- running commands ------------------------------------------------------------------------
// The real machine (subprocesses, files, login, network) and its fixture twin live in one module
// shared with the headless runner; this file only owns the screens.
const machine = createDeps({ fixture, skillDir, sessionValid: () => sessionValid() });
const { deps } = machine;

// ---- terminal -------------------------------------------------------------------------------
const out = process.stderr;
const st = createStyle({ color: colorEnabled(process.env, out.isTTY) });
const both = (...fns) => (t) => fns.reduceRight((x, f) => f(x), t);
const boldCyan = both(st.bold, st.cyan);
const width = () => out.columns ?? 80;
let inAlt = false;
const painter = createPainter((text) => out.write(text), () => out.rows);
const enter = () => { if (!inAlt) { out.write('\x1b[?1049h\x1b[?25l'); painter.reset(); } inAlt = true; };
const leave = () => { if (inAlt) out.write('\x1b[?25h\x1b[?1049l'); inAlt = false; };
process.on('exit', leave);
const paint = (lines) => painter.paint(lines);
out.on('resize', () => painter.reset());

const keys = readline.createInterface({ input: process.stdin, escapeCodeTimeout: 40 });
readline.emitKeypressEvents(process.stdin, keys);
process.stdin.setRawMode(true);
let onKey = () => {};
process.stdin.on('keypress', (str, key) => onKey(str, key));
const NAMED = { up: 'up', down: 'down', left: 'left', right: 'right', space: 'space', return: 'enter', escape: 'escape', backspace: 'backspace', tab: 'tab' };
function keyName(str, key) {
  if (key?.ctrl && key.name === 'c') return 'abort';
  if (key?.ctrl && key.name === 'u') return 'ctrl-u';
  if (key?.name && NAMED[key.name]) return NAMED[key.name];
  if (str && str.length === 1 && str > ' ' && !key?.ctrl && !key?.meta) return `char:${str}`;
  return null;
}
// One full-screen state machine: paint, feed keys to the reducer, resolve when it is over.
const screen = (init, reduce, paintFn, isOver) => new Promise((resolve) => {
  let state = init;
  paintFn(state);
  onKey = (str, key) => {
    const name = keyName(str, key);
    if (!name) return;
    state = reduce(state, name);
    if (isOver(state)) {
      onKey = () => {};
      resolve(state);
    } else paintFn(state);
  };
});

// ---- screen 1: the form -----------------------------------------------------------------------
function paintForm(f) {
  const w = width();
  const plain = (t) => t;
  const lines = [fitSegments([['Set up a Merchant Center Custom Application', boldCyan]], w), fitSegments([['─'.repeat(w), both(st.cyan, st.dim)]], w)];
  FIELDS.forEach((field, i) => {
    const focused = i === f.focus;
    const value = f.values[field.id];
    lines.push(fitSegments([
      [focused ? '▸ ' : '  ', boldCyan], [field.label.padEnd(14), focused ? st.bold : plain],
      [field.kind === 'choice' ? `< ${value} >` : value, field.kind === 'choice' ? st.cyan : st.bold],
      ...(focused && field.kind === 'text' ? [[' ', st.inverse]] : []),
    ], w));
    if (f.errors[field.id]) lines.push(fitSegments([['                ', plain], [f.errors[field.id], both(st.bold, st.red)]], w));
    else if (focused) lines.push(fitSegments([['                ', plain], [field.hint, st.dim]], w));
  });
  lines.push('', fitSegments([['─'.repeat(w), both(st.cyan, st.dim)]], w));
  if (f.message) lines.push(fitSegments([['  ! ', both(st.bold, st.red)], [f.message, both(st.bold, st.red)]], w));
  lines.push(fitSegments(hintSegments(FORM_HINTS, st, { width: w }), w));
  paint(lines);
}
enter();
let answers = fixture?.form;
if (!answers) {
  // --yes presses Enter on the pre-filled form: a complete form is taken as is, an incomplete
  // one is shown with its errors marked, the same as if the user had pressed Enter.
  let form0 = initForm({ cwd: process.cwd(), defaults: prefill });
  if (a.yes) form0 = reduceForm(form0, 'enter');
  const form = form0.submitted ? form0 : await screen(form0, reduceForm, paintForm, (f) => f.quit || f.submitted);
  if (form.quit) {
    leave();
    die('Quit on the form. Nothing changed.', 130);
  }
  answers = formAnswers(form);
}
// For Connect the folder is a repository root and the app lives one level down; for every other
// host the folder is the app. A resume may name either level.
const layout = resolveLayout({ hosting: answers.hosting, folder: path.resolve(answers.appDir), appName: answers.appName, exists: (p) => fs.existsSync(p) });
const { appDir, repoDir } = layout;
const { region, entryPointUriPath: entryPoint } = answers;
mcApiUrl = mcApiUrlForRegion(region);

// ---- the running session: one machine, run in two phases ---------------------------------------
// Phase 1 (tool checks, sign-in) runs right after the form, so a wait for the browser login stays
// on screen with a quit key. The rest runs after the review screen. ctx is filled in as it goes.
const ctx = {
  appDir, repoDir, region, entryPoint, hosting: answers.hosting,
  appName: answers.appName, menuLabel: answers.menuLabel, template: answers.template, projectKey: answers.projectKey,
  contactEmail: answers.contactEmail, productionUrl: a['production-url'],
};
const steps = buildSteps(ctx, deps);
process.on('exit', () => { if (ctx.login?.running?.()) ctx.login.kill(); });
let state = initSession([]);
let frame = 0;
let nextCheckIn;
let input = null;
const draw = () => paint(sessionLines(state, { width: width(), frame, st, appName: answers.appName, logPath: machine.getLogPath(), nextCheckIn, input, logLines: Math.max(3, (out.rows ?? 24) - 18), rows: out.rows }));

const pollMs = Number(a.poll ?? 10) * 1000;
async function wake(step, reason, result) {
  // A step that found the session expired asks for a login: start it, then wait like any other wait.
  if (result?.input === 'login') {
    const login = steps.find((s) => s.id === 'session');
    await login.run(ctx, (line) => { state = reduceSession(state, { type: 'log', id: step.id, line }); draw(); });
  }
  // A step may ask for one value: { ctx, label, secret, options } names the ctx field it fills,
  // typed or picked from a list. 'url' is the production URL. A failed step never re-checks by
  // itself; only a plain wait counts down.
  const spec = result?.input === 'url' ? { ctx: 'productionUrl', label: 'Production URL' } : typeof result?.input === 'object' ? result.input : null;
  const countdown = !spec && result?.status !== 'fail';
  return new Promise((resolve) => {
    const deadline = Date.now() + (result?.pollMs ?? pollMs);
    input = spec ? initInput(spec) : null;
    const timer = setInterval(() => {
      if (!countdown) return;
      nextCheckIn = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (Date.now() >= deadline) finish('retry');
    }, 250);
    function finish(answer) {
      clearInterval(timer);
      input = null;
      nextCheckIn = undefined;
      onKey = () => {};
      resolve(answer);
    }
    onKey = (str, key) => {
      const name = keyName(str, key);
      if (name === 'abort' || name === 'escape' || (!spec && name === 'char:q')) return finish('quit');
      if (spec) {
        const r = reduceInput(input, name, str);
        input = r.input;
        if (r.done) {
          // An empty answer means "just try again" (for instance after a login elsewhere).
          if (r.value) ctx[spec.ctx] = r.value;
          return finish('retry');
        }
      } else if (name === 'char:r' || name === 'enter') finish('retry');
    };
  });
}

async function runPhase(ids) {
  const phase = steps.filter((s) => ids.includes(s.id));
  state = initSession(phase);
  enter();
  const ticker = setInterval(() => { frame += 1; draw(); }, 100);
  draw();
  const result = await runSession({ steps: phase, ctx, report: (e) => { state = reduceSession(state, e); draw(); }, wake });
  clearInterval(ticker);
  draw();
  return result;
}

// Leaves the screen and prints the one JSON object the caller reads. Exit 0 done, 3 quit, 1 failed.
async function finishWith(result, okBody = {}) {
  await new Promise((r) => setTimeout(r, result.ok ? 1200 : 0));
  process.stdin.setRawMode(false);
  keys.close();
  process.stdin.pause();
  leave();
  if (result.ok) {
    console.log(JSON.stringify({ ok: true, ...okBody, log: machine.getLogPath() }, null, 2));
    process.exit(0);
  }
  // Quit on a wait: exit 3, rerun to resume. Quit on a failure: exit 1 with the error, also resumable.
  const body = result.failedAt
    ? { failedAt: result.failedAt, error: result.error, quit: result.quit === true }
    : result.quit ? { quit: true, at: result.at } : { at: result.at, error: 'timed out waiting' };
  console.log(JSON.stringify({ ok: false, ...body, log: machine.getLogPath() }, null, 2));
  process.exit(result.failedAt ? 1 : 3);
}

process.on('SIGINT', () => { machine.killActive(); });
const ready = await runPhase(['preflight', 'session']);
if (!ready.ok) await finishWith(ready);

// ---- screen 2: where to install -----------------------------------------------------------------
// The app folder may not exist yet, so a plan made now lives beside it and moves in after scaffolding.
// "Beside" means beside the top-level folder the user named (the repository root for Connect),
// which is the one whose parent is known to exist.
const appExists = fs.existsSync(path.join(appDir, 'custom-application-config.mjs'));
const topDir = repoDir ?? appDir;
const beside = (suffix) => path.join(path.dirname(topDir), `.${path.basename(topDir)}.${suffix}`);
const installPlan = a['install-plan']
  ? path.resolve(a['install-plan'])
  : appExists ? path.join(appDir, 'install-plan.json') : beside('install-plan.json');
// The picker is its own full-screen program on the same terminal: give it cooked input, take raw back.
function runPicker() {
  fs.mkdirSync(path.dirname(installPlan), { recursive: true });
  leave();
  process.stdin.setRawMode(false);
  process.stdin.pause();
  const pickerArgs = fixture?.pickerFixture ? ['--fixture', fixture.pickerFixture] : ['--region', region];
  const r = spawnSync('node', [path.join(skillDir, 'scripts/install-plan.mjs'), ...pickerArgs, '--out', installPlan], { stdio: 'inherit' });
  process.stdin.setRawMode(true);
  process.stdin.resume();
  if (r.status !== 0) die('The Organization picker did not finish, so there is no install plan.', r.status ?? 130);
}
const readPlan = () => fixture?.plan ?? JSON.parse(fs.readFileSync(installPlan, 'utf8'));
if (!fs.existsSync(installPlan) && !fixture?.plan) runPicker();
let owners = fixture?.owners;
if (!owners) {
  try {
    const session = readSession({ mcApiUrl, home: os.homedir(), env: process.env });
    owners = (await createSettingsClient({ mcApiUrl, token: session.token }).organizations()).myOrganizations.results;
  } catch (e) {
    die(`Could not list your Organizations: ${e.message}`);
  }
}

// ---- screen 3: review, the consent gate ---------------------------------------------------------
// Same look as the form: labeled sections, label and value pairs, fields in angle brackets with
// the focused one marked and explained, and the shared hint bar at the bottom.
function paintReview(r) {
  const w = width();
  const plain = (t) => t;
  const label = (text, focused) => [text.padEnd(16), focused ? st.bold : plain];
  const rule = (text) => {
    const head = text ? `── ${text} ` : '';
    return both(st.cyan, st.dim)(head + '─'.repeat(Math.max(0, w - head.length)));
  };
  paint(reviewLines(r).map((l) => {
    if (l.kind === 'rule') return rule(l.text);
    if (l.kind === 'hints') return fitSegments(hintSegments(l.items, st, { width: w }), w);
    if (l.kind === 'info') return fitSegments([['  ', plain], label(l.label), [l.value, st.bold], ...(l.note ? [[`   ${l.note}`, st.dim]] : [])], w);
    if (l.kind === 'field') {
      const value = l.id === 'deploy' ? (l.value === 'ON' ? both(st.bold, st.green) : both(st.bold, st.yellow)) : both(st.bold, st.cyan);
      return fitSegments([[l.focused ? '▸ ' : '  ', boldCyan], label(l.label, l.focused), ['< ', st.cyan], [l.value, value], [' >', st.cyan]], w);
    }
    const style = { title: boldCyan, target: st.green, detail: st.dim, fieldHint: st.dim, footer: st.dim, message: both(st.bold, st.red) }[l.kind] ?? plain;
    return fitSegments([[l.text, style]], w);
  }));
}
// `b` on the review reopens the picker over the same plan file, so a plan confirmed by mistake
// (or kept from an earlier run) can be redone without deleting anything by hand.
let plan;
let review;
for (;;) {
  plan = readPlan();
  enter();
  const review0 = initReview({
    app: { name: answers.appName, entryPoint, region, appDir, exists: appExists, template: answers.template, projectKey: answers.projectKey, menuLabel: answers.menuLabel },
    owners, plan, contactEmail: answers.contactEmail, hosting: answers.hosting, home: os.homedir(),
    deployHelp: a['deploy-help'] ? a['deploy-help'] === 'on' : undefined,
  });
  if (a['org-id']) review0.ownerIndex = owners.findIndex((o) => o.id === a['org-id']);
  review = await screen(review0, reduceReview, paintReview, (r) => r.quit || r.confirmed || r.back);
  if (!review.back) break;
  runPicker();
}
if (review.quit) {
  leave();
  die(`Quit on the review screen. Nothing was changed in the Merchant Center. The install plan was kept at ${installPlan} for next time.`, 130);
}
const choice = review.result;

// create-mc-app refuses an existing folder, so until the app exists the log lives beside it.
if (appExists) fs.mkdirSync(path.join(appDir, '.mc-onboarding'), { recursive: true });
machine.setLogPath(appExists ? path.join(appDir, '.mc-onboarding', 'session.log') : beside('session.log'));
fs.writeFileSync(machine.getLogPath(), `# session started ${new Date().toISOString()}\n`);

// ---- phase 2: the work, now that everything is chosen -------------------------------------------
Object.assign(ctx, {
  installPlan, logPath: machine.getLogPath(), orgId: choice.orgId, deployHelp: choice.deployHelp,
  openProjectKey: plan.find((t) => !t.allProjects)?.projectKeys[0] ?? answers.projectKey,
});
const result = await runPhase(['scaffold', 'git-init', 'build', 'register', 'deploy', 'check', 'finish', 'open']);
await finishWith(result, { productionUrl: ctx.productionUrl, opened: ctx.openUrl, owner: choice.orgId });
