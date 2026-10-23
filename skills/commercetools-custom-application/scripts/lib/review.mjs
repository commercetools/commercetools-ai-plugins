// The review screen shown before anything changes: what will be created, where it installs, who
// owns it, and one toggle for optional deployment help. It reads like the form: facts as label
// and value pairs, the two choices as fields moved between with up/down/tab and changed with
// left/right/space, a hint under the focused field, and one hint bar at the bottom.
// Pure state and key reducer, no terminal I/O.
import { REVIEW_HINTS } from './hints.mjs';
import { providerFor } from './providers/index.mjs';

// With exactly one Organization in the plan the owner is obvious; otherwise the user must choose.
export function defaultOwnerIndex(owners, plan) {
  const ids = [...new Set(plan.map((t) => t.orgId))];
  return ids.length === 1 ? owners.findIndex((o) => o.id === ids[0]) : -1;
}

export function deployPlanLines(hosting, on) {
  const provider = providerFor(hosting);
  if (on && provider) return provider.planLines();
  return [
    'You deploy the app yourself (see references/hosting/other.md).',
    'The session pauses and asks for the production URL (https), then carries on.',
  ];
}

const FIELDS = ['owner', 'deploy'];

export function initReview({ app, owners, plan, contactEmail, hosting, deployHelp, home }) {
  return {
    app, owners, plan, contactEmail, hosting, home,
    ownerIndex: defaultOwnerIndex(owners, plan),
    deployHelp: deployHelp ?? providerFor(hosting) !== null,
    detailsOpen: false, focus: 'owner', confirmed: false, quit: false, back: false,
  };
}

export function reduceReview(state, key) {
  const s = { ...state };
  delete s.message;
  const cycle = (by) => {
    const n = s.owners.length;
    if (!n) return;
    s.ownerIndex = s.ownerIndex < 0 ? (by > 0 ? 0 : n - 1) : (s.ownerIndex + by + n) % n;
  };
  if (key === 'abort' || key === 'escape') return { ...s, quit: true };
  // A plan confirmed by mistake in the picker must be fixable here, not by deleting a file.
  if (key === 'b' || key === 'char:b') return { ...s, back: true };
  const at = FIELDS.indexOf(s.focus);
  if (key === 'up') s.focus = FIELDS[Math.max(0, at - 1)];
  if (key === 'down' || key === 'tab') s.focus = FIELDS[Math.min(FIELDS.length - 1, at + 1)];
  // Left, right and space all change the focused field, as on the form's choice fields.
  if (key === 'left' || key === 'right' || key === 'space') {
    if (s.focus === 'owner') cycle(key === 'left' ? -1 : 1);
    else if (providerFor(s.hosting)) s.deployHelp = !s.deployHelp;
    else s.message = `No deployment help for ${s.hosting}. You deploy, and the session asks for the URL.`;
  }
  if (key === 'e' || key === 'char:e') s.detailsOpen = !s.detailsOpen;
  if (key === 'enter') {
    if (s.ownerIndex < 0) {
      s.message = 'Choose the owner Organization first.';
      s.focus = 'owner';
    } else {
      s.confirmed = true;
      s.result = { orgId: s.owners[s.ownerIndex].id, deployHelp: s.deployHelp };
    }
  }
  return s;
}

const describeTarget = (t) => {
  if (t.allProjects) return `${t.orgName}: all projects`;
  const n = t.projectKeys.length;
  const shown = t.projectKeys.slice(0, 5).join(', ');
  return `${t.orgName}: ${n} project${n === 1 ? '' : 's'}: ${shown}${n > 5 ? ` and ${n - 5} more` : ''}`;
};

const LABEL = 16;
const shortPath = (p, home) => (home && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p);

// Lines for the renderer, tagged by kind so it can colour them. Every line has `text`, the plain
// rendering; info and field lines also carry label and value, the hints line carries its items.
export function reviewLines(s) {
  const lines = [];
  const add = (kind, text, extra = {}) => lines.push({ kind, text, ...extra });
  const info = (label, value, note) => add('info', `  ${label.padEnd(LABEL)}${value}${note ? `   ${note}` : ''}`, { label, value, note });
  const field = (id, label, value, hint) => {
    const focused = s.focus === id;
    add('field', `${focused ? '▸ ' : '  '}${label.padEnd(LABEL)}< ${value} >`, { id, label, value, focused });
    if (focused) add('fieldHint', `  ${''.padEnd(LABEL)}${hint}`);
  };

  add('title', 'Review before anything changes');
  add('rule', 'The app');
  info('Name', s.app.name);
  info('Entry path', s.app.entryPoint);
  info('Region', s.app.region);
  info('Folder', shortPath(s.app.appDir, s.home), s.app.exists ? 'already exists, will be reused' : `will be created, ${s.app.template}`);
  info('Menu label', s.app.menuLabel);
  info('Dev project', s.app.projectKey);
  info('Contact email', s.contactEmail);
  info('Hosting', s.hosting);

  add('rule', 'Install in');
  for (const t of s.plan) add('target', `  ✓ ${describeTarget(t)}`);

  add('rule', 'Your choices');
  const owner = s.ownerIndex >= 0 ? s.owners[s.ownerIndex].name : null;
  field('owner', 'Owner', owner ?? 'choose one', 'The Organization the app is registered in. It must be one you administer.');
  const provider = providerFor(s.hosting);
  field('deploy', 'Deployment help', s.deployHelp ? 'ON' : 'OFF',
    provider
      ? (s.deployHelp ? `The session builds and deploys to ${provider.label} for you.` : 'You deploy, and the session asks for the production URL.')
      : `No deployment help for ${s.hosting}. You deploy, and the session asks for the production URL.`);
  if (s.detailsOpen) for (const l of deployPlanLines(s.hosting, s.deployHelp)) add('detail', `  ${''.padEnd(LABEL)}${l}`);

  add('rule', '');
  add('footer', 'Nothing has changed yet. Enter starts the work; the steps then run with live progress.');
  if (s.message) add('message', `  ! ${s.message}`);
  const items = REVIEW_HINTS.map(([k, what]) => (k === 'e' ? [k, s.detailsOpen ? 'hide details' : 'show details'] : [k, what]));
  add('hints', items.map(([k, what]) => `${k} ${what}`).join('  ·  '), { items });
  return lines;
}
