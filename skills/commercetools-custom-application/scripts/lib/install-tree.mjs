// Model of the full-screen install picker: Organizations as expandable nodes, projects as
// children. An Organization ticked on its own means all projects (the default); ticking
// projects under it makes an exact allowlist. Pure state and key reducer, no terminal I/O.
import { fitWindow } from './install-plan.mjs';

// Keys: up/down move, left/right fold, space ticks, enter folds an Organization or ticks a project,
// tab confirms. `vim: true` makes the picker modal like vim: it starts in normal mode (hjkl, x,
// gg, G, / to filter) and Esc leaves the filter. Without it the picker is always in insert mode,
// so typing filters straight away.
// The tree starts fully open (every Organization that has projects) so allowlists can be ticked
// straight away; `expanded: false` starts it collapsed.
export function initTree(orgs, byOrg, { size, vim = false, expanded = true } = {}) {
  return {
    orgs, byOrg, expanded: expanded ? orgs.filter((o) => (byOrg[o.id] ?? []).length).map((o) => o.id) : [],
    sel: {}, filter: '', cursor: 0, offset: 0, size,
    vim, mode: vim ? 'normal' : 'insert', done: false, aborted: false,
  };
}

const NORMAL_KEYS = { j: 'down', k: 'up', h: 'left', l: 'right', x: 'space', G: 'end' };

// The filter follows Nimbus ComboBox: case-insensitive substring match on any property
// (createMultiPropertyFilter), and several terms match if ANY term matches
// (createMultiTermFilter). Terms are separated by commas or whitespace, empty terms are ignored.
// Space ticks a row here, so commas are the separator you can actually type.
export const filterTerms = (filter) => (filter ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean);

// With a filter, an Organization shows when its name or id matches, or when any of its projects
// (key or name) match. A project match opens its Organization to just the matching projects.
// An Organization that matches by name keeps its normal expansion and shows all its projects.
export function rowsOf(s) {
  const terms = filterTerms(s.filter);
  const f = terms.length > 0;
  const has = (...texts) => texts.some((t) => terms.some((term) => t.toLowerCase().includes(term)));
  const rows = [];
  for (const org of s.orgs) {
    const all = s.byOrg[org.id] ?? [];
    let children = s.expanded.includes(org.id) ? all : [];
    if (f) {
      const orgMatch = has(org.name, org.id);
      const matches = all.filter((p) => has(p.key, p.name));
      if (!orgMatch && !matches.length) continue;
      children = s.expanded.includes(org.id) ? (orgMatch ? all : matches) : (orgMatch ? [] : matches);
    }
    rows.push({ type: 'org', org });
    for (const project of children) rows.push({ type: 'project', orgId: org.id, project });
  }
  return rows;
}

// Chosen Organizations that the current filter is hiding, so the screen can say so.
export function hiddenChosen(s) {
  const visible = new Set(rowsOf(s).filter((r) => r.type === 'org').map((r) => r.org.id));
  return choicesOf(s).filter((c) => !visible.has(c.org.id)).length;
}

// 'none' | 'all' (every project, now and later) | 'some' (an allowlist)
export function checkOf(s, orgId) {
  const v = s.sel[orgId];
  return v === undefined ? 'none' : v === 'all' ? 'all' : 'some';
}

// The picks in `buildPlan` form, in Organization order.
export function choicesOf(s) {
  const out = [];
  for (const org of s.orgs) {
    const v = s.sel[org.id];
    if (v === undefined) continue;
    if (v === 'all') out.push({ org, mode: 'all' });
    else out.push({ org, mode: 'list', projectKeys: (s.byOrg[org.id] ?? []).map((p) => p.key).filter((k) => v.includes(k)) });
  }
  return out;
}

export function reduceTree(state, rawKey) {
  const s = { ...state, expanded: [...state.expanded], sel: { ...state.sel } };
  delete s.message;
  const pending = s.pending;
  delete s.pending;
  const normal = s.vim && s.mode === 'normal';
  let key = rawKey;

  // Modal layer: turn vim keys into the plain keys below, or consume them.
  if (key.startsWith('char:') && normal) {
    const c = key.slice(5);
    if (pending === 'g') key = c === 'g' ? 'home' : null;
    else if (c === 'g') {
      s.pending = 'g';
      key = null;
    } else if (c === '/' || c === 'i') {
      s.mode = 'insert';
      key = null;
    } else key = NORMAL_KEYS[c] ?? null;
  }
  if (key === 'backspace' && normal) key = null;
  if (key === 'escape') {
    if (s.vim && s.mode === 'insert') {
      s.mode = 'normal';
      key = null;
    } else key = 'clear';
  }
  if (key === 'enter' && s.vim && s.mode === 'insert') {
    s.mode = 'normal';
    key = null;
  }
  // Enter acts on the row like in any tree (fold an Organization, tick a project). It never ends
  // the screen: that is tab, which cannot be hit while moving around.
  if (key === 'enter') {
    const row = rowsOf(s)[s.cursor];
    key = row?.type === 'project' ? 'space' : row && s.expanded.includes(row.org.id) ? 'left' : 'right';
  }
  if (key === 'ctrl-u') key = normal ? 'halfup' : 'clear';
  if (key === 'ctrl-d') key = normal ? 'halfdown' : null;

  if (key === 'abort') return { ...s, aborted: true };
  const rows = rowsOf(s);
  const row = rows[s.cursor];
  const page = Math.max(1, s.size ?? rows.length);
  const half = Math.max(1, Math.floor(page / 2));

  if (key === 'up') s.cursor -= 1;
  if (key === 'down') s.cursor += 1;
  if (key === 'pageup') s.cursor -= page;
  if (key === 'pagedown') s.cursor += page;
  if (key === 'halfup') s.cursor -= half;
  if (key === 'halfdown') s.cursor += half;
  if (key === 'home') s.cursor = 0;
  if (key === 'end') s.cursor = rows.length - 1;

  if (key?.startsWith('char:')) {
    s.filter += key.slice(5);
    s.cursor = 0;
  }
  if (key === 'backspace') {
    s.filter = s.filter.slice(0, -1);
    s.cursor = 0;
  }
  if (key === 'clear') {
    s.filter = '';
    s.cursor = 0;
  }

  if (key === 'right' && row && row.type === 'org' && (s.byOrg[row.org.id] ?? []).length && !s.expanded.includes(row.org.id)) {
    s.expanded.push(row.org.id);
  }
  if (key === 'left' && row) {
    const orgId = row.type === 'org' ? row.org.id : row.orgId;
    s.expanded = s.expanded.filter((id) => id !== orgId);
    if (row.type === 'project') s.cursor = rowsOf(s).findIndex((r) => r.type === 'org' && r.org.id === orgId);
  }

  if (key === 'space' && row && row.type === 'org') {
    const id = row.org.id;
    if (s.sel[id] === 'all') delete s.sel[id];
    else s.sel[id] = 'all';
  }
  if (key === 'space' && row && row.type === 'project') {
    const cur = s.sel[row.orgId];
    const keys = Array.isArray(cur) ? cur : [];
    const k = row.project.key;
    const next = keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k];
    if (next.length) s.sel[row.orgId] = next;
    else delete s.sel[row.orgId];
  }

  if (key === 'tab') {
    if (!choicesOf(s).length) s.message = 'Tick at least one Organization (space) before continuing.';
    else s.done = true;
  }

  const count = rowsOf(s).length;
  s.cursor = Math.max(0, Math.min(s.cursor, count - 1));
  s.offset = fitWindow({ cursor: s.cursor, offset: s.offset, size: s.size, count });
  return s;
}

// Organizations and projects the plan would cover. An all-projects Organization counts every
// project it has today. The filter never changes the counts.
export function selectionCounts(s) {
  let orgs = 0;
  let projects = 0;
  for (const c of choicesOf(s)) {
    orgs += 1;
    projects += c.mode === 'all' ? (s.byOrg[c.org.id] ?? []).length : c.projectKeys.length;
  }
  return { orgs, projects };
}

export function summaryOf(s) {
  const { orgs, projects } = selectionCounts(s);
  if (!orgs) return 'Nothing selected yet';
  const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return `${n(orgs, 'Organization')}, ${n(projects, 'project')} selected`;
}
