// Pure logic behind the install-plan picker: which Organizations to install into and, per
// Organization, all projects (default) or an exact allowlist. No I/O here so it is testable.

export function groupProjectsByOrg(orgs, projects) {
  const grouped = Object.fromEntries(orgs.map((o) => [o.id, []]));
  for (const p of projects) grouped[p.owner?.id]?.push(p);
  for (const list of Object.values(grouped)) list.sort((a, b) => a.key.localeCompare(b.key));
  return grouped;
}

// choices: [{ org, mode: 'all' | 'list', projectKeys? }], projectsByOrg from groupProjectsByOrg.
export function buildPlan(choices, projectsByOrg) {
  if (!choices.length) return { ok: false, error: 'Choose at least one Organization.' };
  const seen = new Set();
  const plan = [];
  for (const { org, mode, projectKeys = [] } of choices) {
    if (seen.has(org.id)) return { ok: false, error: `Organization ${org.name} (${org.id}) was chosen twice.` };
    seen.add(org.id);
    if (mode === 'all') {
      plan.push({ orgId: org.id, orgName: org.name, allProjects: true, projectKeys: [] });
      continue;
    }
    const keys = [...new Set(projectKeys)].sort();
    if (!keys.length) {
      return { ok: false, error: `${org.name}: an allowlist needs at least one project. Choose all projects instead if that is what you want.` };
    }
    const own = new Set((projectsByOrg[org.id] ?? []).map((p) => p.key));
    const stray = keys.filter((k) => !own.has(k));
    if (stray.length) return { ok: false, error: `${org.name}: ${stray.join(', ')} is not a project of this Organization.` };
    plan.push({ orgId: org.id, orgName: org.name, allProjects: false, projectKeys: keys });
  }
  return { ok: true, plan };
}

// Scroll window shared by the list and tree prompts: returns the offset that keeps the cursor
// inside [offset, offset + size), moving as little as possible.
export function fitWindow({ cursor, offset, size, count }) {
  if (!size || size >= count) return 0;
  const max = count - size;
  if (cursor < offset) return Math.max(0, cursor);
  if (cursor >= offset + size) return Math.min(max, cursor - size + 1);
  return Math.min(offset, max);
}

// Keyboard state for a list prompt. Keys: up, down, pageup, pagedown, space, a, enter, abort.
// Single-select returns the cursor index; multi-select returns the checked indexes in order.
// `size` limits the visible rows; the window scrolls with the cursor.
export function initList(items, { multi = false, defaultIndex = 0, size } = {}) {
  const count = items.length;
  return {
    count, multi, size: size ?? count, cursor: defaultIndex, checked: [], done: false, aborted: false,
    offset: fitWindow({ cursor: defaultIndex, offset: 0, size, count }),
  };
}

export function reduceList(state, key) {
  const s = { ...state, checked: [...state.checked] };
  if (key === 'abort') return { ...s, aborted: true };
  const page = Math.max(1, s.size);
  if (key === 'up') s.cursor = Math.max(0, s.cursor - 1);
  if (key === 'down') s.cursor = Math.min(s.count - 1, s.cursor + 1);
  if (key === 'pageup') s.cursor = Math.max(0, s.cursor - page);
  if (key === 'pagedown') s.cursor = Math.min(s.count - 1, s.cursor + page);
  if (s.multi && key === 'space') {
    s.checked = s.checked.includes(s.cursor) ? s.checked.filter((i) => i !== s.cursor) : [...s.checked, s.cursor];
  }
  if (s.multi && key === 'a') {
    s.checked = s.checked.length === s.count ? [] : Array.from({ length: s.count }, (_, i) => i);
  }
  if (key === 'enter') {
    s.done = true;
    s.result = s.multi ? [...s.checked].sort((x, y) => x - y) : s.cursor;
  }
  s.offset = fitWindow({ cursor: s.cursor, offset: s.offset, size: s.size, count: s.count });
  return s;
}

// Shape check for the plan file that `register.mjs --install-plan` reads.
export function validatePlanFile(raw) {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: 'Plan must be a non-empty array.' };
  const seen = new Set();
  for (const [i, e] of raw.entries()) {
    const at = `Plan entry ${i}`;
    if (typeof e?.orgId !== 'string' || !e.orgId) return { ok: false, error: `${at}: orgId is required.` };
    if (seen.has(e.orgId)) return { ok: false, error: `${at}: Organization ${e.orgId} appears twice.` };
    seen.add(e.orgId);
    if (typeof e.allProjects !== 'boolean') return { ok: false, error: `${at}: allProjects must be true or false.` };
    if (!Array.isArray(e.projectKeys)) return { ok: false, error: `${at}: projectKeys must be an array.` };
    if (e.allProjects && e.projectKeys.length) return { ok: false, error: `${at}: projectKeys must be empty when allProjects is true.` };
    if (!e.allProjects && !e.projectKeys.length) return { ok: false, error: `${at}: an allowlist needs at least one project key.` };
  }
  return { ok: true };
}
