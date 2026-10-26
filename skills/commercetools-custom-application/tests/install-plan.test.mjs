import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupProjectsByOrg, buildPlan, initList, reduceList } from '../scripts/lib/install-plan.mjs';

const orgs = [{ id: 'o1', name: 'Alpha' }, { id: 'o2', name: 'Beta' }];
const projects = [
  { key: 'a1', name: 'A One', owner: { id: 'o1' } }, { key: 'a2', name: 'A Two', owner: { id: 'o1' } },
  { key: 'b1', name: 'B One', owner: { id: 'o2' } }, { key: 'x1', name: 'Stranger', owner: { id: 'zz' } },
];

test('projects are grouped by owning org, sorted by key; unknown owners are dropped', () => {
  const g = groupProjectsByOrg(orgs, [...projects].reverse());
  assert.deepEqual(g.o1.map((p) => p.key), ['a1', 'a2']);
  assert.deepEqual(g.o2.map((p) => p.key), ['b1']);
  assert.equal(g.zz, undefined);
});

test('all-projects choice yields an empty allowlist and allProjects true (the default)', () => {
  const r = buildPlan([{ org: orgs[0], mode: 'all' }], { o1: [] });
  assert.deepEqual(r, { ok: true, plan: [{ orgId: 'o1', orgName: 'Alpha', allProjects: true, projectKeys: [] }] });
});

test('allowlist choice keeps only that org\'s chosen keys, sorted and deduplicated', () => {
  const g = groupProjectsByOrg(orgs, projects);
  const r = buildPlan([{ org: orgs[0], mode: 'list', projectKeys: ['a2', 'a1', 'a2'] }], g);
  assert.deepEqual(r.plan[0].projectKeys, ['a1', 'a2']);
  assert.equal(r.plan[0].allProjects, false);
});

test('an empty allowlist is an error, never widened to all projects', () => {
  const r = buildPlan([{ org: orgs[0], mode: 'list', projectKeys: [] }], groupProjectsByOrg(orgs, projects));
  assert.equal(r.ok, false);
  assert.match(r.error, /Alpha/);
});

test('a key that does not belong to the org is an error', () => {
  const r = buildPlan([{ org: orgs[0], mode: 'list', projectKeys: ['b1'] }], groupProjectsByOrg(orgs, projects));
  assert.equal(r.ok, false);
  assert.match(r.error, /b1/);
});

test('no orgs chosen is an error', () => {
  assert.equal(buildPlan([], {}).ok, false);
});

test('the same org twice is an error', () => {
  const r = buildPlan([{ org: orgs[0], mode: 'all' }, { org: orgs[0], mode: 'all' }], {});
  assert.equal(r.ok, false);
});

const items = ['a', 'b', 'c'];

test('list: down/up move the cursor and clamp at the ends', () => {
  let s = initList(items);
  s = reduceList(s, 'up');
  assert.equal(s.cursor, 0);
  s = reduceList(reduceList(reduceList(s, 'down'), 'down'), 'down');
  assert.equal(s.cursor, 2);
});

test('multi: space toggles the item under the cursor, enter submits the chosen indexes in order', () => {
  let s = initList(items, { multi: true });
  s = reduceList(reduceList(s, 'space'), 'down');
  s = reduceList(reduceList(s, 'down'), 'space');
  s = reduceList(reduceList(s, 'up'), 'space'); // cursor back on b, which checks it
  const done = reduceList(s, 'enter');
  assert.equal(done.done, true);
  assert.deepEqual(done.result, [0, 1, 2]);
});

test('multi: space twice unchecks; "a" toggles all on then off', () => {
  let s = initList(items, { multi: true });
  s = reduceList(reduceList(s, 'space'), 'space');
  assert.deepEqual(reduceList(s, 'enter').result, []);
  s = reduceList(s, 'a');
  assert.deepEqual(reduceList(s, 'enter').result, [0, 1, 2]);
  s = reduceList(s, 'a');
  assert.deepEqual(reduceList(s, 'enter').result, []);
});

test('single: enter returns the item under the cursor; initial cursor honours the default', () => {
  let s = initList(items, { defaultIndex: 1 });
  assert.equal(reduceList(s, 'enter').result, 1);
  s = reduceList(s, 'down');
  assert.equal(reduceList(s, 'enter').result, 2);
});

test('ctrl-c aborts', () => {
  assert.equal(reduceList(initList(items), 'abort').aborted, true);
});

import { validatePlanFile } from '../scripts/lib/install-plan.mjs';

const entry = (over = {}) => ({ orgId: 'o1', orgName: 'Alpha', allProjects: true, projectKeys: [], ...over });

test('a well formed plan file validates', () => {
  assert.deepEqual(validatePlanFile([entry(), entry({ orgId: 'o2', allProjects: false, projectKeys: ['k'] })]), { ok: true });
});

test('plan file must be a non-empty array', () => {
  assert.equal(validatePlanFile({}).ok, false);
  assert.equal(validatePlanFile([]).ok, false);
});

test('plan file rejects missing ids, an empty allowlist, keys on an all-projects entry, and duplicate orgs', () => {
  for (const bad of [
    [entry({ orgId: '' })],
    [entry({ allProjects: false, projectKeys: [] })],
    [entry({ allProjects: true, projectKeys: ['k'] })],
    [entry({ allProjects: 'yes' })],
    [entry(), entry()],
  ]) {
    assert.equal(validatePlanFile(bad).ok, false, JSON.stringify(bad));
  }
});

// Scrolling: a list taller than the terminal shows a window that follows the cursor.
const many = Array.from({ length: 12 }, (_, i) => `item${i}`);
const press = (s, ...keys) => keys.reduce(reduceList, s);

test('window starts at the top and shows only `size` rows', () => {
  const s = initList(many, { size: 5 });
  assert.equal(s.offset, 0);
  assert.equal(s.size, 5);
});

test('moving down past the window scrolls it, keeping the cursor visible', () => {
  let s = initList(many, { size: 5 });
  s = press(s, 'down', 'down', 'down', 'down');
  assert.deepEqual([s.cursor, s.offset], [4, 0]);
  s = press(s, 'down');
  assert.deepEqual([s.cursor, s.offset], [5, 1]);
  s = press(s, 'down', 'down', 'down', 'down', 'down', 'down', 'down');
  assert.deepEqual([s.cursor, s.offset], [11, 7]);
});

test('moving up scrolls back only when the cursor leaves the top of the window', () => {
  let s = initList(many, { size: 5, defaultIndex: 11 });
  assert.deepEqual([s.cursor, s.offset], [11, 7]);
  s = press(s, 'up', 'up', 'up', 'up');
  assert.deepEqual([s.cursor, s.offset], [7, 7]);
  s = press(s, 'up');
  assert.deepEqual([s.cursor, s.offset], [6, 6]);
});

test('page keys jump a window at a time and clamp at the ends', () => {
  let s = initList(many, { size: 5 });
  s = press(s, 'pagedown');
  assert.deepEqual([s.cursor, s.offset], [5, 1]);
  s = press(s, 'pagedown', 'pagedown', 'pagedown');
  assert.deepEqual([s.cursor, s.offset], [11, 7]);
  s = press(s, 'pageup', 'pageup', 'pageup', 'pageup');
  assert.deepEqual([s.cursor, s.offset], [0, 0]);
});

test('without a size everything is visible and offset stays 0', () => {
  const s = press(initList(many), 'down', 'down', 'pagedown');
  assert.equal(s.offset, 0);
});

test('selection survives scrolling: toggled items outside the window stay checked', () => {
  let s = initList(many, { size: 3, multi: true });
  s = press(s, 'space', 'down', 'down', 'down', 'down', 'space');
  assert.deepEqual(reduceList(s, 'enter').result, [0, 4]);
});
