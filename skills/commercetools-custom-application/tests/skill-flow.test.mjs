import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// SKILL_FILE override lets a mutant copy prove these tests can fail.
const file = process.env.SKILL_FILE ?? fileURLToPath(new URL('../SKILL.md', import.meta.url));
const skillDir = fileURLToPath(new URL('..', import.meta.url));
const readOr = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
// SKILL.md is the router; the manual steps are a reference. The step tests read both, in order.
const md = readFileSync(file, 'utf8');
const manual = readOr(`${skillDir}/references/manual-steps.md`);
const notes = readOr(`${skillDir}/.notes.md`);
const all = `${md}\n${manual}`;
const sections = [...all.matchAll(/^## (Step (\d+):[^\n]*|[^\n]+)$/gm)].map((m) => ({
  title: m[1],
  step: m[2] === undefined ? null : Number(m[2]),
  start: m.index,
}));
const stepNumbers = sections.filter((s) => s.step !== null).map((s) => s.step);
const sectionBody = (n) => {
  const i = sections.findIndex((s) => s.step === n);
  return all.slice(sections[i].start, sections[i + 1]?.start ?? all.length);
};

// The split: SKILL.md routes, the reference holds the manual steps, and the notes file holds what
// only a maintainer needs. A dot-prefixed file is source-only in this repo, so it never ships.
test('SKILL.md is a router: it runs headless and points at references/manual-steps.md for Steps 1 to 7', () => {
  assert.match(md, /^## Step 0: run headless/m);
  assert.doesNotMatch(md, /^## Step [1-7]:/m);
  assert.match(md, /references\/manual-steps\.md/);
  for (const n of [1, 2, 3, 4, 5, 6, 7]) assert.match(manual, new RegExp(`^## Step ${n}:`, 'm'), `Step ${n} must live in the reference`);
  assert.match(manual, /^metadata:\n  contentType: REFERENCE$/m);
});

test('shipped files carry no authoring notes; the status and maintenance facts live in .notes.md', () => {
  for (const text of [md, manual]) {
    assert.doesNotMatch(text, /^## Status/m);
    assert.doesNotMatch(text, /^## Maintenance/m);
  }
  assert.match(notes, /onboard\.mjs/);
  assert.match(notes, /real Vercel team/);
  assert.match(notes, /finish/);
  assert.match(notes, /validate-queries\.mjs/);
});

test('Step 0 tells the agent what the session does and decides, not which keys the user presses', () => {
  const body = sectionBody(0);
  assert.doesNotMatch(body, /spinner|countdown|Up\/down|left\/right|repaints/i);
  assert.match(body, /Do not answer the form/);
});

test('there is no local-run checkpoint step', () => {
  assert.doesNotMatch(all, /^## Step \d+: local checkpoint/im);
  assert.doesNotMatch(all, /Wait for the user to confirm they see it/);
});

test('pnpm start appears only as something not to do', () => {
  for (const line of all.split('\n').filter((l) => l.includes('pnpm start'))) {
    assert.match(line, /Do not run `pnpm start`/);
  }
});

test('steps are numbered contiguously from 0', () => {
  assert.deepEqual(stepNumbers, stepNumbers.map((_, i) => i));
});

test('every "Step N" cross-reference points at an existing step', () => {
  for (const [, n] of all.matchAll(/\bStep (\d+)\b(?!:)/g)) {
    assert.ok(stepNumbers.includes(Number(n)), `Step ${n} does not exist`);
  }
});

test('cross-references land on the right step', () => {
  assert.match(sectionBody(4), /placeholder until Step 6/);
  assert.match(sectionBody(6), /URL/);
  assert.match(sectionBody(7), /same host check as in Step 5/);
  assert.match(sectionBody(5), /^## Step 5: deploy/);
});

test('the last step ends the workflow in the deployed project via openInBrowser', () => {
  const last = sectionBody(Math.max(...stepNumbers));
  assert.match(last, /verify in the deployed project/i);
  assert.match(last, /openInBrowser/);
  assert.match(last, /browser automation/i);
  assert.match(last, /menu item/i);
});

// The skill ships to several agents, so it names capabilities, never one vendor's tool or key.
test('the skill names no vendor-specific tool, key prefix, or browser driver', () => {
  assert.doesNotMatch(all, /AskUserQuestion/);
  assert.doesNotMatch(all, /`!` prefix/);
  assert.doesNotMatch(all, /browser_navigate/);
  assert.doesNotMatch(all, /Playwright/);
});

test('the last step has a fallback and forbids declaring success without seeing the nav', () => {
  const last = sectionBody(Math.max(...stepNumbers));
  assert.match(last, /not available/i);
  assert.match(last, /did not see the nav/);
  assert.match(last, /Do not report success from `done: true`/);
});

test('the failure table covers works-locally-but-not-in-nav', () => {
  assert.match(all, /\| Works on `localhost` but not in the nav \|/);
});

test('scaffold step builds instead of running the dev server', () => {
  assert.match(sectionBody(3), /pnpm build/);
});

test('the scaffold step runs allow-builds before the build, so pnpm 11 does not block it', () => {
  const body = sectionBody(3);
  const iAllow = body.indexOf('scripts/allow-builds.mjs');
  const iBuild = body.indexOf('pnpm build');
  assert.ok(iAllow !== -1, 'Step 3 must call scripts/allow-builds.mjs');
  assert.ok(iBuild !== -1 && iAllow < iBuild, 'allow-builds must come before pnpm build');
});

const description = md.match(/^description: (.+)$/m)?.[1] ?? '';

test('the frontmatter description covers multi-Organization install and the project allowlist', () => {
  assert.match(description, /Organizations?/);
  assert.match(description, /all projects/i);
  assert.match(description, /allowlist/i);
});

test('the description says what the skill accomplishes, and names no script or file', () => {
  assert.doesNotMatch(description, /\.mjs|\.json|scripts\//);
  for (const outcome of [/scaffold/i, /git repo/i, /deploys?/i, /registers?/i, /installs?/i, /main nav/i]) assert.match(description, outcome);
});

test('the description stays one line, and under 1024 characters so it loads reliably', () => {
  assert.ok(description.length > 0 && description.length <= 1024, `length ${description.length}`);
});

// An unquoted ': ' inside the description is a YAML mapping, and the skill never loads. The
// trigger wording and the boundary clause are what the plugin repo's lint and reviewer look for.
test('the frontmatter is a quoted description with a "Use when" trigger and a boundary clause', () => {
  assert.ok(description.startsWith('"') && description.endsWith('"'), 'description must be a double-quoted scalar');
  assert.match(description, /\bUse when\b/);
  assert.match(description, /commercetools-connect/);
  assert.match(md, /^name: commercetools-custom-application$/m);
  assert.match(md, /^when_to_use:\n(  - .+\n){2,}/m);
  assert.match(md, /^metadata:\n  contentType: SKILL$/m);
});

test('SKILL.md ends with a checklist', () => {
  const tail = md.slice(md.lastIndexOf('## '));
  assert.match(tail, /^## Checklist/);
  assert.ok((tail.match(/^- \[ \] /gm) ?? []).length >= 5);
});

test('Step 4 documents the picker flags, including --vim, --list and --help', () => {
  const body = sectionBody(4);
  for (const flag of ['--vim', '--list', '--help']) assert.ok(body.includes(flag), `Step 3 does not mention ${flag}`);
});

test('every script flag the skill relies on is described by that script\'s --help', () => {
  assert.match(all, /scripts\/install-plan\.mjs --help/);
  assert.match(all, /scripts\/register\.mjs --help/);
});

test('the description asks for details in chat, names a Vercel-style host, and says the app is opened', () => {
  assert.match(description, /in chat/i);
  assert.doesNotMatch(description, /terminal session/);
  assert.match(description, /Vercel/);
  assert.match(description, /opens? the app/i);
});

test('Step 0 is the whole flow from scratch: form, checks, picker, review, then the work', () => {
  const body = sectionBody(0);
  assert.ok(body.includes('scripts/headless.mjs'), 'Step 0 must name scripts/headless.mjs');
  assert.ok(body.includes('--deploy-help'), 'Step 0 must document --deploy-help');
  assert.match(body, /review/i);
  assert.match(body, /create-mc-app/);
  const order = ['form', 'sign-in', 'picker', 'review', 'create the app', 'open the browser'].map((k) => body.toLowerCase().indexOf(k));
  assert.ok(order.every((i) => i >= 0), order.join());
  assert.deepEqual([...order].sort((x, y) => x - y), order);
});

test('the manual steps come after Step 0 and are labelled as such', () => {
  assert.ok(all.indexOf('## Step 0: run headless') < all.indexOf('## Step 1: gather inputs'));
  assert.match(sectionBody(1).split('\n')[0], /manual/i);
});

// Headless is the only route. SKILL.md carries it in Step 0; the protocol lives in a reference.
const headless = readOr(`${skillDir}/references/headless.md`);
const routeBody = () => sectionBody(0);

test('headless is the only route: the interactive session is never offered, and the protocol lives in references/headless.md', () => {
  const body = routeBody();
  assert.doesNotMatch(md, /node <skill-dir>\/scripts\/onboard\.mjs/);
  assert.doesNotMatch(md, /^## Without a terminal/m);
  assert.doesNotMatch(md, /when the user has a terminal|the session when/i);
  assert.match(md, /always headless|only route/i);
  assert.match(body, /scripts\/headless\.mjs/);
  assert.match(body, /references\/headless\.md/);
  assert.match(body, /--confirmed/);
  assert.match(headless, /^metadata:\n  contentType: REFERENCE$/m);
  assert.ok(md.indexOf('## Step 0: run headless') < md.indexOf('## When to use the manual steps'));
});

test('Step 0 starts by asking the user for the form data, with intake.mjs, before anything runs', () => {
  const body = routeBody();
  const ask = body.indexOf('intake.mjs');
  assert.ok(ask >= 0, 'Step 0 must use intake.mjs');
  assert.ok(ask < body.indexOf('scripts/headless.mjs'), 'ask for the form before the first headless run');
  assert.match(body.slice(0, body.indexOf('scripts/headless.mjs')), /ask the user/i);
  assert.match(headless.slice(headless.indexOf('## The sequence'), headless.indexOf('## Exit codes')).split('\n').slice(0, 5).join('\n'), /Start by asking/);
});

test('git init in the custom app folder is part of the flow, in Step 0, the manual scaffold step, the reference and the checklist', () => {
  assert.match(routeBody(), /git init/);
  assert.match(sectionBody(3), /git init -b main/);
  assert.match(headless, /git init/);
  assert.match(md.slice(md.indexOf('## Checklist')), /git init|git repository/i);
});

test('the route gathers in chat, signs in, asks for the install targets, shows the review, gets one yes, then confirms', () => {
  const text = `${routeBody()}\n${headless}`;
  const order = ['intake.mjs', 'needs', 'installPlan', 'review', 'yes', '--confirmed'].map((k) => text.indexOf(k));
  assert.ok(order.every((i) => i >= 0), order.join());
  assert.deepEqual([...order].sort((x, y) => x - y), order);
  assert.match(text, /Do not pass `--confirmed`/);
  assert.match(text, /Do not (answer|choose)[^.]*for the user/);
});

test('the reference states the contract: exit codes, needs with --set, secrets from the environment, the plan file shape', () => {
  for (const code of ['0', '1', '2', '3', '4']) assert.match(headless, new RegExp(`^\\| ${code} \\|`, 'm'), `exit code ${code} row`);
  assert.match(headless, /--set <field>=<value>/);
  for (const env of ['VERCEL_TOKEN', 'NETLIFY_AUTH_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CTP_CLIENT_ID', 'CTP_CLIENT_SECRET']) assert.match(headless, new RegExp(env));
  assert.match(headless, /never (as|in) (a )?flag/i);
  for (const field of ['orgId', 'allProjects', 'projectKeys']) assert.match(headless, new RegExp(`\`${field}\``));
  for (const need of ['vercelTeam', 'netlifyTeam', 'cfAccount', 'ghVisibility', 'productionUrl']) assert.match(headless, new RegExp(`\`${need}\``), `needs field ${need}`);
  assert.match(headless, /session\.log/);
});

test('the manual steps and the notes know about the headless run', () => {
  assert.match(manual.slice(0, manual.indexOf('## Step 1')), /headless/);
  assert.match(notes, /headless\.mjs/);
});

test('the notes say what has run for real (a Vercel deploy and the host check) and what has not (finish, open)', () => {
  assert.doesNotMatch(notes, /never against a real (Organization|Vercel)/);
  assert.match(notes, /finish/);
  assert.match(notes, /open/);
});
