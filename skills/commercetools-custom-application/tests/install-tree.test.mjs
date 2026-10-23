import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initTree, reduceTree, rowsOf, checkOf, choicesOf } from '../scripts/lib/install-tree.mjs';
import { buildPlan, groupProjectsByOrg } from '../scripts/lib/install-plan.mjs';

const orgs = [{ id: 'o1', name: 'Alpha' }, { id: 'o2', name: 'Beta' }, { id: 'o3', name: 'Empty' }];
const projects = [
  { key: 'a1', name: 'A One', owner: { id: 'o1' } }, { key: 'a2', name: 'A Two', owner: { id: 'o1' } },
  { key: 'a3', name: 'A Three', owner: { id: 'o1' } }, { key: 'b1', name: 'B One', owner: { id: 'o2' } },
];
const byOrg = groupProjectsByOrg(orgs, projects);
const tree = (opts) => initTree(orgs, byOrg, { expanded: false, ...opts });
const press = (s, ...keys) => keys.reduce(reduceTree, s);
const labels = (s) => rowsOf(s).map((r) => (r.type === 'org' ? r.org.id : `${r.orgId}/${r.project.key}`));

test('starts collapsed: one row per org, nothing selected', () => {
  const s = tree();
  assert.deepEqual(labels(s), ['o1', 'o2', 'o3']);
  assert.deepEqual(choicesOf(s), []);
});

test('right expands the org under the cursor, left collapses it', () => {
  let s = press(tree(), 'right');
  assert.deepEqual(labels(s), ['o1', 'o1/a1', 'o1/a2', 'o1/a3', 'o2', 'o3']);
  s = press(s, 'left');
  assert.deepEqual(labels(s), ['o1', 'o2', 'o3']);
});

test('an org without projects does not expand', () => {
  const s = press(tree(), 'down', 'down', 'right');
  assert.deepEqual(labels(s), ['o1', 'o2', 'o3']);
});

test('left on a project jumps to its org and collapses it', () => {
  const s = press(tree(), 'right', 'down', 'down', 'left');
  assert.equal(rowsOf(s)[s.cursor].org.id, 'o1');
  assert.deepEqual(labels(s), ['o1', 'o2', 'o3']);
});

test('space on an org cycles none -> all projects -> none', () => {
  let s = press(tree(), 'space');
  assert.equal(checkOf(s, 'o1'), 'all');
  assert.deepEqual(choicesOf(s).map((c) => [c.org.id, c.mode]), [['o1', 'all']]);
  s = press(s, 'space');
  assert.equal(checkOf(s, 'o1'), 'none');
});

test('space on a project makes an allowlist of just that project', () => {
  let s = press(tree(), 'right', 'down', 'space');
  assert.equal(checkOf(s, 'o1'), 'some');
  assert.deepEqual(choicesOf(s), [{ org: orgs[0], mode: 'list', projectKeys: ['a1'] }]);
  s = press(s, 'down', 'space');
  assert.deepEqual(choicesOf(s)[0].projectKeys, ['a1', 'a2']);
});

test('toggling a project in an all-projects org narrows it to that project, never silently keeps all', () => {
  const s = press(tree(), 'space', 'right', 'down', 'down', 'space');
  assert.deepEqual(choicesOf(s), [{ org: orgs[0], mode: 'list', projectKeys: ['a2'] }]);
});

test('unchecking the last project of an allowlist deselects the org', () => {
  const s = press(tree(), 'right', 'down', 'space', 'space');
  assert.equal(checkOf(s, 'o1'), 'none');
  assert.deepEqual(choicesOf(s), []);
});

test('space on an allowlist org promotes it to all projects', () => {
  const s = press(tree(), 'right', 'down', 'space', 'up', 'space');
  assert.equal(checkOf(s, 'o1'), 'all');
});

// Enter acts on the row like in any tree; it never ends the screen. Tab is the only way out.
test('enter on an Organization opens it, enter again closes it, and the picker stays open', () => {
  let s = press(tree(), 'enter');
  assert.equal(s.done, false);
  assert.equal(s.message, undefined);
  assert.deepEqual(labels(s), ['o1', 'o1/a1', 'o1/a2', 'o1/a3', 'o2', 'o3']);
  s = press(s, 'enter');
  assert.deepEqual(labels(s), ['o1', 'o2', 'o3']);
  assert.equal(s.done, false);
});

test('enter on an Organization without projects does nothing and does not finish', () => {
  const s = press(tree(), 'space', 'down', 'down', 'enter');
  assert.equal(s.done, false);
  assert.deepEqual(labels(s), ['o1', 'o2', 'o3']);
});

test('enter on a project ticks it, like space', () => {
  let s = press(tree(), 'right', 'down', 'enter');
  assert.equal(s.done, false);
  assert.deepEqual(choicesOf(s), [{ org: orgs[0], mode: 'list', projectKeys: ['a1'] }]);
  s = press(s, 'enter');
  assert.deepEqual(choicesOf(s), []);
});

test('tab with nothing selected shows a message and does not finish', () => {
  const s = press(tree(), 'tab');
  assert.equal(s.done, false);
  assert.match(s.message, /at least one/i);
});

test('tab with a selection finishes, and the result builds a valid plan', () => {
  const s = press(tree(), 'space', 'down', 'right', 'down', 'space', 'tab');
  assert.equal(s.done, true);
  const r = buildPlan(choicesOf(s), byOrg);
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan.map((p) => [p.orgId, p.allProjects, p.projectKeys]), [['o1', true, []], ['o2', false, ['b1']]]);
});

test('the message clears on the next key', () => {
  const s = press(tree(), 'tab', 'down');
  assert.equal(s.message, undefined);
});

test('the cursor stays on a valid row after collapsing shrinks the list', () => {
  const s = press(tree(), 'right', 'pagedown', 'end', 'home', 'down', 'down', 'left');
  assert.ok(s.cursor >= 0 && s.cursor < rowsOf(s).length);
});

test('end and home jump to the last and first row', () => {
  const s = press(tree(), 'end');
  assert.equal(s.cursor, 2);
  assert.equal(press(s, 'home').cursor, 0);
});

test('a window smaller than the tree scrolls with the cursor across org and project rows', () => {
  let s = press(tree({ size: 3 }), 'right');
  s = press(s, 'down', 'down', 'down', 'down');
  assert.equal(s.cursor, 4);
  assert.equal(s.offset, 2);
});

test('ctrl-c aborts', () => {
  assert.equal(press(tree(), 'abort').aborted, true);
});

// ---- type to filter -------------------------------------------------------------------------
import { hiddenChosen } from '../scripts/lib/install-tree.mjs';
const type = (s, text) => [...text].reduce((acc, c) => reduceTree(acc, `char:${c}`), s);

test('typing filters Organizations by name, case-insensitively', () => {
  assert.deepEqual(labels(type(tree(), 'ALP')), ['o1']);
  assert.deepEqual(labels(type(tree(), 'beta')), ['o2']);
});

test('typing matches the Organization id too', () => {
  assert.deepEqual(labels(type(tree(), 'o3')), ['o3']);
});

test('a project match shows its Organization with only the matching projects, even when collapsed', () => {
  assert.deepEqual(labels(type(tree(), 'b1')), ['o2', 'o2/b1']);
  assert.deepEqual(labels(type(tree(), 'a-')), []);
  assert.deepEqual(labels(type(tree(), 'three')), ['o1', 'o1/a3']);
});

test('an Organization that matches by name keeps its normal expansion and shows all its projects when expanded', () => {
  const s = type(press(tree(), 'right'), 'alpha');
  assert.deepEqual(labels(s), ['o1', 'o1/a1', 'o1/a2', 'o1/a3']);
  assert.deepEqual(labels(type(tree(), 'alpha')), ['o1']);
});

test('backspace removes the last character, clear removes all, and the full tree returns', () => {
  let s = type(tree(), 'be');
  assert.deepEqual(labels(s), ['o2']);
  s = press(s, 'backspace');
  assert.equal(s.filter, 'b');
  s = press(s, 'clear');
  assert.equal(s.filter, '');
  assert.deepEqual(labels(s), ['o1', 'o2', 'o3']);
  assert.equal(press(tree(), 'backspace').filter, '');
});

test('ticks survive filtering and confirming still installs the hidden choices', () => {
  let s = press(tree(), 'space');
  s = type(s, 'beta');
  assert.deepEqual(labels(s), ['o2']);
  assert.equal(checkOf(s, 'o1'), 'all');
  assert.equal(hiddenChosen(s), 1);
  s = press(s, 'tab');
  assert.equal(s.done, true);
  assert.deepEqual(choicesOf(s).map((c) => c.org.id), ['o1']);
});

test('hiddenChosen is 0 when every chosen Organization is visible', () => {
  assert.equal(hiddenChosen(press(tree(), 'space')), 0);
});

test('changing the filter puts the cursor back on the first row and scrolls to the top', () => {
  let s = press(tree({ size: 2 }), 'down', 'down');
  assert.equal(s.cursor, 2);
  s = type(s, 'a');
  assert.deepEqual([s.cursor, s.offset], [0, 0]);
});

test('space ticks the row under the cursor while a filter is active', () => {
  const s = press(type(tree(), 'beta'), 'space');
  assert.equal(checkOf(s, 'o2'), 'all');
  assert.equal(s.filter, 'beta');
});

test('typing a character that matches nothing leaves an empty view that keys survive', () => {
  let s = type(tree(), 'zzz');
  assert.deepEqual(labels(s), []);
  assert.equal(s.cursor, 0);
  s = press(s, 'down', 'up', 'left', 'right', 'space', 'enter', 'pagedown', 'end');
  assert.equal(s.cursor, 0);
  assert.equal(s.done, false);
  assert.equal(press(s, 'tab').message.length > 0, true);
});

test('project keys are filtered by ticking within the filtered view', () => {
  let s = type(tree(), 'a2');
  assert.deepEqual(labels(s), ['o1', 'o1/a2']);
  s = press(s, 'down', 'space');
  assert.deepEqual(choicesOf(s), [{ org: orgs[0], mode: 'list', projectKeys: ['a2'] }]);
});

// ---- multi-term filter, same semantics as Nimbus ComboBox createMultiTermFilter: ANY term matches ----
test('several terms separated by commas match any of them', () => {
  assert.deepEqual(labels(type(tree(), 'alpha,beta')), ['o1', 'o2']);
});

test('whitespace also separates terms, as in Nimbus', () => {
  assert.deepEqual(labels(type(tree(), 'alpha beta')), ['o1', 'o2']);
});

test('empty terms are ignored: a trailing comma never matches everything', () => {
  assert.deepEqual(labels(type(tree(), 'alpha,')), ['o1']);
  assert.deepEqual(labels(type(tree(), ',alpha,,')), ['o1']);
});

test('only separators means no filter at all, like an empty input', () => {
  assert.deepEqual(labels(type(tree(), ', ,')), ['o1', 'o2', 'o3']);
});

test('terms can match projects and Organizations together', () => {
  assert.deepEqual(labels(type(tree(), 'a1,b1')), ['o1', 'o1/a1', 'o2', 'o2/b1']);
});

test('an Organization chosen earlier stays chosen when a multi-term filter hides it', () => {
  const s = type(press(tree(), 'space'), 'beta,empty');
  assert.deepEqual(labels(s), ['o2', 'o3']);
  assert.equal(hiddenChosen(s), 1);
});

// ---- vim mode (opt-in): modal like vim, normal mode first ------------------------------------
const vim = (opts) => initTree(orgs, byOrg, { vim: true, expanded: false, ...opts });
const keys = (s, text) => [...text].reduce((acc, c) => reduceTree(acc, `char:${c}`), s);

test('vim mode starts in normal mode, and letters do not type into the filter', () => {
  const s = keys(vim(), 'abc');
  assert.equal(s.mode, 'normal');
  assert.equal(s.filter, '');
});

test('without vim the mode is insert and typing filters as before', () => {
  assert.equal(tree().mode, 'insert');
  assert.equal(keys(tree(), 'al').filter, 'al');
});

test('normal mode: j and k move, l expands, h collapses', () => {
  let s = keys(vim(), 'j');
  assert.equal(s.cursor, 1);
  s = keys(s, 'k');
  assert.equal(s.cursor, 0);
  s = keys(s, 'l');
  assert.deepEqual(labels(s), ['o1', 'o1/a1', 'o1/a2', 'o1/a3', 'o2', 'o3']);
  s = keys(s, 'h');
  assert.deepEqual(labels(s), ['o1', 'o2', 'o3']);
});

test('normal mode: x ticks like space', () => {
  const s = keys(vim(), 'x');
  assert.equal(checkOf(s, 'o1'), 'all');
  assert.equal(checkOf(press(vim(), 'space'), 'o1'), 'all');
});

test('normal mode: G goes to the bottom, gg to the top, and an unknown g combo is ignored', () => {
  let s = keys(vim(), 'G');
  assert.equal(s.cursor, 2);
  s = keys(s, 'gg');
  assert.equal(s.cursor, 0);
  s = keys(keys(keys(vim(), 'G'), 'g'), 'j');
  assert.equal(s.cursor, 2);
  assert.equal(s.pending, undefined);
  assert.equal(keys(keys(keys(vim(), 'G'), 'g'), 'j').cursor, 2);
});

test('normal mode: ctrl-d and ctrl-u move half a window, ctrl-u clears the filter in insert mode', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, name: `Org${i}` }));
  const s0 = initTree(many, groupProjectsByOrg(many, []), { vim: true, size: 10 });
  const down = press(s0, 'ctrl-d');
  assert.equal(down.cursor, 5);
  assert.equal(press(down, 'ctrl-u').cursor, 0);
  const typed = press(keys(vim(), '/al'), 'ctrl-u');
  assert.equal(typed.filter, '');
  assert.equal(typed.mode, 'insert');
});

test('slash and i enter insert mode, where typing filters', () => {
  for (const enter of ['/', 'i']) {
    const s = keys(vim(), `${enter}beta`);
    assert.equal(s.mode, 'insert');
    assert.deepEqual(labels(s), ['o2']);
  }
});

test('escape in insert mode returns to normal and keeps the filter; escape again clears it', () => {
  let s = press(keys(vim(), '/beta'), 'escape');
  assert.equal(s.mode, 'normal');
  assert.equal(s.filter, 'beta');
  assert.deepEqual(labels(s), ['o2']);
  s = press(s, 'escape');
  assert.equal(s.filter, '');
  assert.deepEqual(labels(s), ['o1', 'o2', 'o3']);
});

test('enter in insert mode applies the filter and returns to normal without confirming', () => {
  const s = press(keys(vim(), '/beta'), 'enter');
  assert.equal(s.mode, 'normal');
  assert.equal(s.done, false);
  assert.equal(s.filter, 'beta');
});

test('enter in normal mode opens the Organization, and tab confirms or refuses with nothing ticked', () => {
  const opened = press(vim(), 'enter');
  assert.equal(opened.done, false);
  assert.deepEqual(labels(opened), ['o1', 'o1/a1', 'o1/a2', 'o1/a3', 'o2', 'o3']);
  assert.match(press(vim(), 'tab').message, /at least one/i);
  const s = press(keys(vim(), 'x'), 'tab');
  assert.equal(s.done, true);
});

test('tab confirms from insert mode too, so the filter never has to be left first', () => {
  const s = press(keys(press(vim(), 'space'), '/al'), 'tab');
  assert.equal(s.done, true);
});

test('normal mode navigates the filtered view and ticks within it', () => {
  const s = keys(press(keys(vim(), '/b'), 'escape'), 'x');
  assert.equal(s.filter, 'b');
  assert.equal(checkOf(s, 'o2'), 'all');
});

test('without vim, escape and ctrl-u still clear the filter and tab still confirms', () => {
  assert.equal(press(keys(tree(), 'al'), 'escape').filter, '');
  assert.equal(press(keys(tree(), 'al'), 'ctrl-u').filter, '');
  assert.equal(press(press(tree(), 'space'), 'tab').done, true);
});

// ---- the tree opens fully by default ----------------------------------------------------------
test('by default every Organization with projects starts expanded', () => {
  const s = initTree(orgs, byOrg);
  assert.deepEqual(labels(s), ['o1', 'o1/a1', 'o1/a2', 'o1/a3', 'o2', 'o2/b1', 'o3']);
  assert.equal(s.cursor, 0);
});

test('expanded: false starts collapsed', () => {
  assert.deepEqual(labels(initTree(orgs, byOrg, { expanded: false })), ['o1', 'o2', 'o3']);
});

test('an open tree still collapses with left and reopens with right', () => {
  let s = press(initTree(orgs, byOrg), 'left');
  assert.deepEqual(labels(s), ['o1', 'o2', 'o2/b1', 'o3']);
  s = press(s, 'right');
  assert.deepEqual(labels(s), ['o1', 'o1/a1', 'o1/a2', 'o1/a3', 'o2', 'o2/b1', 'o3']);
});

test('in an open tree an Organization that matches by name shows all its projects, a project match shows only that project', () => {
  assert.deepEqual(labels(type(initTree(orgs, byOrg), 'alpha')), ['o1', 'o1/a1', 'o1/a2', 'o1/a3']);
  assert.deepEqual(labels(type(initTree(orgs, byOrg), 'a2')), ['o1', 'o1/a2']);
});

test('ticking a project in an open tree makes an allowlist without any expanding first', () => {
  const s = press(initTree(orgs, byOrg), 'down', 'down', 'space');
  assert.deepEqual(choicesOf(s), [{ org: orgs[0], mode: 'list', projectKeys: ['a2'] }]);
});

// ---- selection summary shown at the top -------------------------------------------------------
import { selectionCounts, summaryOf } from '../scripts/lib/install-tree.mjs';
const open = () => initTree(orgs, byOrg);

test('nothing ticked counts zero and reads as nothing selected', () => {
  assert.deepEqual(selectionCounts(open()), { orgs: 0, projects: 0 });
  assert.equal(summaryOf(open()), 'Nothing selected yet');
});

test('an all-projects Organization counts every project it has', () => {
  const s = press(open(), 'space');
  assert.deepEqual(selectionCounts(s), { orgs: 1, projects: 3 });
  assert.equal(summaryOf(s), '1 Organization, 3 projects selected');
});

test('an allowlist counts only the ticked projects', () => {
  const s = press(open(), 'down', 'space', 'down', 'space');
  assert.deepEqual(selectionCounts(s), { orgs: 1, projects: 2 });
});

test('counts add up across Organizations, mixing all-projects and allowlists', () => {
  let s = press(open(), 'space');             // Alpha: all 3
  s = press(s, 'down', 'down', 'down', 'down', 'down'); // cursor on b1
  s = press(s, 'space');                      // Beta: allowlist of 1
  assert.deepEqual(selectionCounts(s), { orgs: 2, projects: 4 });
  assert.equal(summaryOf(s), '2 Organizations, 4 projects selected');
});

test('singular wording for one project', () => {
  const s = press(open(), 'down', 'space');
  assert.equal(summaryOf(s), '1 Organization, 1 project selected');
});

test('an all-projects Organization with no projects counts as an Organization with zero projects', () => {
  const s = press(open(), 'end', 'space');
  assert.deepEqual(selectionCounts(s), { orgs: 1, projects: 0 });
  assert.equal(summaryOf(s), '1 Organization, 0 projects selected');
});

test('the count ignores the filter: hidden selections are still counted', () => {
  const s = type(press(open(), 'space'), 'beta');
  assert.deepEqual(selectionCounts(s), { orgs: 1, projects: 3 });
});
