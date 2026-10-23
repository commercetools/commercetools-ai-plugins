#!/usr/bin/env node
// Full-screen picker for where to install the app. Run it in a real terminal.
//   node install-plan.mjs --region gcp-eu --out install-plan.json
//     A tree: Organizations, each expandable to its projects. Tick an Organization for all
//     projects (the default), or expand it and tick projects for an exact allowlist.
//     Up/down move, left/right collapse/expand, space ticks, enter opens an Organization or ticks
//     a project, tab confirms, ctrl-c aborts.
//     Typing filters by Organization or project name, key or id. Commas separate terms and any
//     term may match, like Nimbus ComboBox. Backspace edits, esc or ctrl-u clears.
//   node install-plan.mjs --region gcp-eu --list     Prints Organizations and projects as JSON, no prompts.
//   --vim             Modal keys like vim: normal mode first (hjkl, x ticks, gg/G, ctrl-d/u, / filters,
//                     esc leaves or clears the filter, enter in insert mode applies it). Tab confirms.
//   --fixture <file>  Use { orgs, projects } from a file instead of the API (tests and demos).
// The output file feeds `register.mjs --install-plan`. Prints one JSON object on stdout.
import fs from 'node:fs';
import os from 'node:os';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { renderHelp, toParseArgsOptions } from './lib/cli-help.mjs';
import { readSession } from './lib/credentials.mjs';
import { createSettingsClient } from './lib/settings-api.mjs';
import { mcApiUrlForRegion } from './lib/validate.mjs';
import { buildPlan, groupProjectsByOrg, validatePlanFile } from './lib/install-plan.mjs';
import { checkOf, choicesOf, hiddenChosen, initTree, reduceTree, rowsOf, selectionCounts, summaryOf } from './lib/install-tree.mjs';
import { colorEnabled, createStyle, fitSegments, stripAnsi } from './lib/style.mjs';
import { INSERT_HINT, PLACEHOLDER, inputStyle, placeholderStyle } from './lib/picker-text.mjs';
import { hintSegments } from './lib/hints.mjs';
import { createPainter } from './lib/paint.mjs';
import { fitWindow } from './lib/install-plan.mjs';

const DOC = {
  name: 'install-plan.mjs',
  summary: 'choose which Organizations and projects the Custom Application is installed in',
  synopsis: [
    'install-plan.mjs --region <id> --out <file> [--vim]',
    'install-plan.mjs --region <id> --list',
  ],
  description: `Full-screen terminal picker. Organizations are nodes in a tree that starts fully open, so every Organization shows its projects. Tick an Organization on its own to install in all of its projects (the default). Tick projects under it to install only in those (an allowlist). An empty allowlist is refused. The title shows how many Organizations and projects are selected, and the filter input is docked at the bottom of the screen.

Keys: up/down move, left/right collapse and expand, page up/down and home/end scroll, space ticks, enter opens or closes the Organization under the cursor and ticks a project (it never leaves the picker), tab confirms, ctrl-c quits. Typing filters the tree by Organization or project name, key or id; separate several searches with commas and a row shows if it matches any of them (the same rule as the Nimbus ComboBox multi-term filter). An empty filter shows the placeholder, in gray italics, so typed text is always the stronger of the two. Backspace edits the filter, esc or ctrl-u clears it. Ticks survive filtering and are still counted when the filter hides them. Output is colored; set NO_COLOR=1 to turn colors off.

The result is written to --out as JSON, one entry per Organization: orgId, orgName, allProjects, projectKeys. Pass that file to register.mjs --install-plan. The picker only reads your Organizations and projects; it changes nothing in the Merchant Center. It needs the session from "mc-scripts login" and a real terminal. Without a terminal, use --list and write the plan file by hand.`,
  options: {
    region: { type: 'string', arg: 'id', description: 'Cloud identifier of the Merchant Center API to query: gcp-eu, gcp-us, gcp-au, aws-eu or aws-us. Required unless --fixture is given.' },
    out: { type: 'string', arg: 'file', description: 'Where to write the install plan JSON. Required unless --list is given.' },
    list: { type: 'boolean', default: false, description: 'Print your Organizations and their projects as JSON and exit. No prompts, no terminal needed.' },
    vim: { type: 'boolean', default: false, description: 'Modal keys like vim. Starts in normal mode: j k h l move, x ticks, gg and G jump, ctrl-d and ctrl-u move half a screen, / or i starts filtering. In the filter, esc or enter returns to normal mode and keeps it; esc in normal mode clears it. Enter in normal mode opens or closes the Organization under the cursor, or ticks a project. Tab confirms in either mode.' },
    fixture: { type: 'string', arg: 'file', description: 'Read { orgs, projects } from a JSON file instead of the API. For tests and demos.' },
    help: { type: 'boolean', default: false, description: 'Print this page and exit.' },
  },
  exit: { 0: 'The plan was written (or --list printed).', 1: 'Error: no session, API failure, invalid plan.', 2: 'Not an interactive terminal.', 130: 'Quit with ctrl-c.' },
  examples: [
    ['Pick interactively', 'install-plan.mjs --region gcp-eu --out install-plan.json'],
    ['Pick with vim keys', 'install-plan.mjs --region gcp-eu --out install-plan.json --vim'],
    ['See what is available without prompts', 'install-plan.mjs --region gcp-eu --list'],
  ],
};

const { values: a } = parseArgs({ options: toParseArgsOptions(DOC.options) });
if (a.help) {
  process.stdout.write(renderHelp(DOC));
  process.exit(0);
}
const fail = (error, code = 1) => {
  console.log(JSON.stringify({ ok: false, error }));
  process.exit(code);
};

let orgs;
let projects;
if (a.fixture) {
  ({ orgs, projects } = JSON.parse(fs.readFileSync(a.fixture, 'utf8')));
} else {
  const mcApiUrl = a.region ? mcApiUrlForRegion(a.region) : null;
  if (!mcApiUrl) fail('--region must be a known cloud identifier (gcp-eu, gcp-us, gcp-au, aws-eu, aws-us).');
  const session = readSession({ mcApiUrl, home: os.homedir(), env: process.env });
  if (!session.valid) fail(session.reason);
  const client = createSettingsClient({ mcApiUrl, token: session.token });
  try {
    orgs = (await client.organizations()).myOrganizations.results;
    projects = (await client.projects()).myProjects.results;
  } catch (e) {
    fail(e.message);
  }
}
const byOrg = groupProjectsByOrg(orgs, projects);

if (a.list) {
  console.log(JSON.stringify({ ok: true, organizations: orgs.map((o) => ({ ...o, projects: byOrg[o.id] })) }, null, 2));
  process.exit(0);
}
if (!a.out) fail('--out <file> is required.');
if (!orgs.length) fail('No Organizations found for this account.');
if (!process.stdin.isTTY || !process.stderr.isTTY) {
  fail('The picker needs an interactive terminal. Run it with the `!` prefix, or use --list and write the plan file by hand (see register.mjs --install-plan).', 2);
}

// ---- terminal rendering: the only code here not covered by unit tests -------------------------
// Draws on stderr so stdout stays clean for the final JSON. Uses the alternate screen, which
// is always restored on exit, abort or crash.
const out = process.stderr;
// No clear-screen per repaint: some terminals keep every cleared frame as scrollback history.
const painter = createPainter((text) => out.write(text), () => out.rows);
out.on('resize', () => painter.reset());
const ALT_ON = '\x1b[?1049h\x1b[?25l';
const ALT_OFF = '\x1b[?25h\x1b[?1049l';
let inAlt = false;
const leave = () => {
  if (inAlt) out.write(ALT_OFF);
  inAlt = false;
};
process.on('exit', leave);

const HEADER = 2; // title with the selection count, rule
const FOOTER = 5; // status, rule, input, rule, hint
const viewSize = () => Math.max(3, (out.rows ?? 24) - HEADER - FOOTER);

// Colour is off for NO_COLOR, TERM=dumb and non-terminals; the layout is identical either way.
const st = createStyle({ color: colorEnabled(process.env, out.isTTY) });
const both = (...fns) => (t) => fns.reduceRight((x, f) => f(x), t);
const boldCyan = both(st.bold, st.cyan);
const boldGreen = both(st.bold, st.green);
const boldYellow = both(st.bold, st.yellow);
const boldRed = both(st.bold, st.red);
const plain = (t) => t;
const ruleLine = (width, label) => {
  const head = label ? `── ${label} ` : '';
  return st.cyan(st.dim(head + '─'.repeat(Math.max(0, width - head.length))));
};
const HINTS = {
  plain: [['↑↓', 'move'], ['enter', 'open/tick'], ['space', 'tick'], ['tab', 'continue'], ['esc', 'clear filter'], ['ctrl-c', 'quit']],
  normal: [['j/k/h/l', 'move'], ['x', 'tick'], ['gg/G', 'top/bottom'], ['/', 'filter'], ['esc', 'clear filter'], ['tab', 'continue']],
  insert: INSERT_HINT,
};

function checkbox(kind) {
  if (kind === 'all') return ['[✓]', boldGreen];
  if (kind === 'some') return ['[-]', boldYellow];
  if (kind === 'via') return ['[*]', st.blue];
  return ['[ ]', st.dim];
}

// Layout: title with the selection count, the tree filling the screen, and the filter input
// docked at the bottom like a prompt box.
function render(state) {
  const width = out.columns ?? 80;
  const rows = rowsOf(state);
  const view = rows.slice(state.offset, state.offset + state.size);
  const editing = state.mode === 'insert';
  const { orgs: nOrgs } = selectionCounts(state);
  const lines = [];

  lines.push(fitSegments([['Install the app ', boldCyan], ['· ', st.dim], [summaryOf(state), nOrgs ? boldGreen : st.yellow]], width));
  lines.push(ruleLine(width, 'Organizations and projects'));

  if (!rows.length) lines.push(fitSegments([[`  No matches for "${state.filter}". Backspace or esc clears the filter.`, st.yellow]], width));
  view.forEach((row, i) => {
    const index = state.offset + i;
    const current = index === state.cursor;
    const segs = [[current ? '▸ ' : '  ', boldCyan]];
    if (row.type === 'org') {
      const o = row.org;
      const kind = checkOf(state, o.id);
      const total = state.byOrg[o.id].length;
      const fold = !total ? ' ' : state.expanded.includes(o.id) ? '▾' : '▸';
      const plural = (n) => `${n} project${n === 1 ? '' : 's'}`;
      const note = kind === 'all' ? 'all projects' : kind === 'some' ? `${state.sel[o.id].length} of ${plural(total)}` : plural(total);
      const [box, boxStyle] = checkbox(kind);
      const nameStyle = kind === 'all' ? boldGreen : kind === 'some' ? boldYellow : st.bold;
      segs.push([`${fold} `, st.cyan], [box, boxStyle], [` ${o.name}`, nameStyle], [`  ${note}`, st.dim]);
    } else {
      const kind = checkOf(state, row.orgId);
      const ticked = Array.isArray(state.sel[row.orgId]) && state.sel[row.orgId].includes(row.project.key);
      const [box, boxStyle] = checkbox(kind === 'all' ? 'via' : ticked ? 'all' : 'none');
      const next = rows[index + 1];
      const branch = next && next.type === 'project' ? '├─' : '└─';
      segs.push(['    ', plain], [`${branch} `, st.dim], [box, boxStyle], [` ${row.project.key}`, ticked ? boldGreen : st.cyan], [` ${row.project.name}`, st.dim]);
    }
    let line = fitSegments(segs, width);
    if (current) line = st.bg(line + ' '.repeat(Math.max(0, width - stripAnsi(line).length)));
    lines.push(line);
  });
  while (lines.length < HEADER + state.size) lines.push('');

  const hidden = hiddenChosen(state);
  const last = Math.min(rows.length, state.offset + state.size);
  const where = rows.length ? `row ${state.offset + 1}-${last} of ${rows.length}${state.offset > 0 ? ' ↑ more' : ''}${last < rows.length ? ' ↓ more' : ''}` : 'no rows';
  lines.push(
    state.message
      ? fitSegments([[`  ! ${state.message}`, boldRed]], width)
      : fitSegments([
          ['  ', plain], [where, st.dim],
          ...(hidden ? [['   ', plain], [`${hidden} chosen Organization${hidden === 1 ? ' is' : 's are'} hidden by the filter`, st.yellow]] : []),
          ['   ', plain], ['[✓]', boldGreen], [' all  ', st.dim], ['[-]', boldYellow], [' some  ', st.dim], ['[*]', st.blue], [' via Organization', st.dim],
        ], width),
  );

  lines.push(ruleLine(width, 'Filter'));
  const tag = state.vim ? (editing ? [' INSERT ', boldGreen] : [' NORMAL ', both(st.bold, st.blue)]) : [' ', plain];
  const room = Math.max(5, width - 14);
  const shown = state.filter.length > room ? `~${state.filter.slice(-(room - 1))}` : state.filter;
  const input = [tag, ['> ', both(st.bold, st.magenta)], [shown, inputStyle(st)]];
  if (editing) input.push([' ', st.inverse]);
  if (!state.filter && editing) input.push([` ${PLACEHOLDER}`, placeholderStyle(st)]);
  lines.push(fitSegments(input, width));
  lines.push(ruleLine(width));
  const hintSet = !state.vim ? HINTS.plain : editing ? HINTS.insert : HINTS.normal;
  lines.push(fitSegments(hintSegments(hintSet, st, { width }), width));
  painter.paint(lines);
}

// Without an interface Node waits 500 ms after a lone Esc in case it starts an arrow-key sequence.
// The interface exists only to shorten that wait; it has no output stream, so it never echoes.
const keys = readline.createInterface({ input: process.stdin, escapeCodeTimeout: 40 });
readline.emitKeypressEvents(process.stdin, keys);
process.stdin.setRawMode(true);
const KEYS = {
  up: 'up', down: 'down', pageup: 'pageup', pagedown: 'pagedown', home: 'home', end: 'end',
  left: 'left', right: 'right', space: 'space', return: 'enter', tab: 'tab', backspace: 'backspace', escape: 'escape',
};
// Named keys first, then ctrl-u, then any other printable character goes into the filter.
function keyName(str, key) {
  if (key?.ctrl && key.name === 'c') return 'abort';
  if (key?.ctrl && key.name === 'u') return 'ctrl-u';
  if (key?.ctrl && key.name === 'd') return 'ctrl-d';
  if (key?.name && KEYS[key.name]) return KEYS[key.name];
  if (str && str.length === 1 && str > ' ' && str !== '\x7f' && !key?.ctrl && !key?.meta) return `char:${str}`;
  return null;
}

out.write(ALT_ON);
inAlt = true;
let state = initTree(orgs, byOrg, { size: viewSize(), vim: a.vim });
render(state);

out.on('resize', () => {
  const size = viewSize();
  state = { ...state, size, offset: fitWindow({ cursor: state.cursor, offset: state.offset, size, count: rowsOf(state).length }) };
  render(state);
});

await new Promise((resolve) => {
  process.stdin.on('keypress', (str, key) => {
    const name = keyName(str, key);
    if (!name) return;
    state = reduceTree(state, name);
    if (state.aborted || state.done) resolve();
    else render(state);
  });
});
process.stdin.setRawMode(false);
keys.close();
process.stdin.pause();
leave();
if (state.aborted) fail('Aborted.', 130);

const built = buildPlan(choicesOf(state), byOrg);
if (!built.ok) fail(built.error);
const check = validatePlanFile(built.plan);
if (!check.ok) fail(check.error);
fs.writeFileSync(a.out, `${JSON.stringify(built.plan, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, out: a.out, plan: built.plan }, null, 2));
