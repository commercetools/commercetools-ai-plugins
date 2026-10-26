import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initReview, reduceReview, reviewLines, defaultOwnerIndex, deployPlanLines } from '../scripts/lib/review.mjs';

const owners = [{ id: 'o1', name: 'First Contact' }, { id: 'o2', name: 'Other Org' }, { id: 'o3', name: 'Third' }];
const plan = [{ orgId: 'o1', orgName: 'First Contact', allProjects: false, projectKeys: ['fct-development-project'] }];
const base = {
  app: { name: 'THIS_IS_A_TEST', entryPoint: 'this-is-a-test', region: 'gcp-eu', appDir: '/work/this-is-a-test', template: 'starter-typescript', projectKey: 'fct-development-project', menuLabel: 'THIS_IS_A_TEST' },
  owners, plan, contactEmail: 'a@b.co', hosting: 'vercel',
};
const review = (over) => initReview({ ...base, ...over });
const press = (s, ...keys) => keys.reduce(reduceReview, s);
const text = (s) => reviewLines(s).map((l) => l.text).join('\n');

test('the owner defaults to the single Organization in the plan, otherwise to nothing chosen', () => {
  assert.equal(defaultOwnerIndex(owners, plan), 0);
  assert.equal(defaultOwnerIndex(owners, [...plan, { orgId: 'o2', orgName: 'Other Org', allProjects: true, projectKeys: [] }]), -1);
  assert.equal(defaultOwnerIndex(owners, []), -1);
});

test('the screen states what will be created and that nothing has changed yet', () => {
  const t = text(review());
  assert.match(t, /THIS_IS_A_TEST/);
  assert.match(t, /this-is-a-test/);
  assert.match(t, /gcp-eu/);
  assert.match(t, /Nothing has changed yet/i);
});

// ---- layout: sections, labeled values, fields like the form ------------------------------------
const kinds = (s) => reviewLines(s).map((l) => l.kind);
const lineOf = (s, kind, re) => reviewLines(s).find((l) => l.kind === kind && (!re || re.test(l.text)));

test('the screen is split into labeled sections: the app, where it installs, the choices', () => {
  const rules = reviewLines(review()).filter((l) => l.kind === 'rule').map((l) => l.text);
  assert.deepEqual(rules.slice(0, 3), ['The app', 'Install in', 'Your choices']);
});

test('facts are label and value pairs, one per line, in the order of the form', () => {
  const labels = reviewLines(review()).filter((l) => l.kind === 'info').map((l) => l.label);
  assert.deepEqual(labels, ['Name', 'Entry path', 'Region', 'Folder', 'Menu label', 'Dev project', 'Contact email', 'Hosting']);
  assert.equal(lineOf(review(), 'info', /THIS_IS_A_TEST/).label, 'Name');
});

test('the folder shows under the home shorthand when it is inside the home folder', () => {
  const folder = (s) => reviewLines(s).find((l) => l.kind === 'info' && l.label === 'Folder').value;
  assert.equal(folder(initReview({ ...base, home: '/work', app: { ...base.app, appDir: '/work/this-is-a-test' } })), '~/this-is-a-test');
  assert.equal(folder(initReview({ ...base, home: '/elsewhere' })), '/work/this-is-a-test');
});

test('the two choices render as fields with a label, a bracketed value, and a hint under the focused one only', () => {
  const s = review();
  const fields = reviewLines(s).filter((l) => l.kind === 'field');
  assert.deepEqual(fields.map((f) => [f.label, f.value, f.focused]), [['Owner', 'First Contact', true], ['Deployment help', 'ON', false]]);
  const after = kinds(s);
  const ownerAt = after.indexOf('field');
  assert.equal(after[ownerAt + 1], 'fieldHint', 'the focused field explains itself on the next line');
  assert.equal(after[after.lastIndexOf('field') + 1] !== 'fieldHint', true, 'the unfocused field has no hint');
  const moved = press(s, 'down');
  const k = kinds(moved);
  assert.equal(k[k.lastIndexOf('field') + 1], 'fieldHint');
});

test('an owner that is not chosen yet shows as a field that asks for one', () => {
  const s = review({ plan: [...plan, { orgId: 'o2', orgName: 'Other Org', allProjects: true, projectKeys: [] }] });
  const owner = reviewLines(s).find((l) => l.kind === 'field' && l.label === 'Owner');
  assert.match(owner.value, /choose/i);
});

test('the screen ends with one hint bar listing the keys, and no key hints inside the text', () => {
  const lines = reviewLines(review());
  const last = lines[lines.length - 1];
  assert.equal(last.kind, 'hints');
  assert.ok(last.items.some(([k]) => k === 'enter'));
  for (const l of lines) if (l.kind === 'info' || l.kind === 'field') assert.doesNotMatch(l.text ?? '', /space|left\/right|press/i);
});

test('tab moves the focus like down, and left, right and space all change the focused field', () => {
  let s = press(review(), 'tab');
  assert.equal(s.focus, 'deploy');
  assert.equal(press(s, 'left').deployHelp, false);
  assert.equal(press(s, 'right').deployHelp, false);
  assert.equal(press(press(s, 'space'), 'space').deployHelp, true);
  s = press(s, 'up');
  assert.equal(s.focus, 'owner');
  assert.equal(press(s, 'space').ownerIndex, 1);
});

test('install targets are listed: allowlists name their projects, all-projects says so', () => {
  const t = text(review({ plan: [
    { orgId: 'o1', orgName: 'First Contact', allProjects: false, projectKeys: ['a', 'b'] },
    { orgId: 'o2', orgName: 'Other Org', allProjects: true, projectKeys: [] },
  ] }));
  assert.match(t, /First Contact.*2 projects.*a, b/);
  assert.match(t, /Other Org.*all projects/i);
});

test('the deployment help toggle is always visible but its details are hidden by default', () => {
  const t = text(review());
  assert.match(t, /Deployment help/i);
  assert.match(t, /\bON\b/);
  assert.doesNotMatch(t, /vercel link/);
  assert.doesNotMatch(t, /vercel deploy/);
});

test('e expands the details and e again hides them', () => {
  let s = press(review(), 'e');
  assert.match(text(s), /vercel link/);
  assert.match(text(s), /vercel deploy --prebuilt --prod/);
  s = press(s, 'e');
  assert.doesNotMatch(text(s), /vercel link/);
});

test('space on the toggle turns deployment help off, and the details then describe doing it yourself', () => {
  let s = press(review(), 'down', 'space');
  assert.equal(s.deployHelp, false);
  assert.match(text(s), /\bOFF\b/);
  s = press(s, 'e');
  assert.doesNotMatch(text(s), /vercel link/);
  assert.match(text(s), /production URL/i);
});

test('a host without a provider starts with help off and cannot turn it on', () => {
  let s = review({ hosting: 'render' });
  assert.equal(s.deployHelp, false);
  s = press(s, 'down', 'space');
  assert.equal(s.deployHelp, false);
  assert.match(text(s), /no deployment help for render/i);
});

test('left and right cycle the owner among the known Organizations and wrap around', () => {
  let s = review();
  assert.equal(s.ownerIndex, 0);
  s = press(s, 'right');
  assert.equal(s.ownerIndex, 1);
  s = press(s, 'right', 'right');
  assert.equal(s.ownerIndex, 0);
  s = press(s, 'left');
  assert.equal(s.ownerIndex, 2);
});

test('enter without an owner chosen is refused with a message', () => {
  const s = press(review({ plan: [...plan, { orgId: 'o2', orgName: 'Other Org', allProjects: true, projectKeys: [] }] }), 'enter');
  assert.equal(s.confirmed, false);
  assert.match(s.message, /owner/i);
});

test('enter with an owner confirms and reports the choices', () => {
  const s = press(review(), 'enter');
  assert.equal(s.confirmed, true);
  assert.deepEqual(s.result, { orgId: 'o1', deployHelp: true });
});

test('escape quits without confirming', () => {
  const s = press(review(), 'escape');
  assert.equal(s.quit, true);
  assert.equal(s.confirmed, false);
});

test('b goes back to the Organization picker without confirming or quitting, and the footer says so', () => {
  for (const key of ['b', 'char:b']) {
    const s = press(review(), key);
    assert.equal(s.back, true);
    assert.equal(s.confirmed, false);
    assert.equal(s.quit, false);
  }
  const bar = reviewLines(review()).find((l) => l.kind === 'hints');
  assert.ok(bar.items.some(([k, what]) => k === 'b' && /picker/i.test(what)));
});

test('focus moves between the owner and the toggle and stops at the ends', () => {
  let s = review();
  assert.equal(s.focus, 'owner');
  s = press(s, 'down', 'down');
  assert.equal(s.focus, 'deploy');
  s = press(s, 'up', 'up');
  assert.equal(s.focus, 'owner');
});

test('the deploy plan lists the real commands for Vercel and describes manual deployment otherwise', () => {
  assert.ok(deployPlanLines('vercel', true).some((l) => l.includes('vercel link')));
  assert.ok(deployPlanLines('vercel', true).some((l) => l.includes('vercel deploy --prebuilt --prod')));
  assert.ok(deployPlanLines('vercel', false).some((l) => /production URL/i.test(l)));
  assert.equal(deployPlanLines('vercel', false).some((l) => l.includes('vercel link')), false);
  assert.ok(deployPlanLines('render', true).some((l) => /production URL/i.test(l)), 'no provider: the manual lines, even with help on');
});

test('the screen also shows the folder, language, dev project and menu label, and says the folder will be created', () => {
  const t = text(review());
  assert.match(t, /\/work\/this-is-a-test/);
  assert.match(t, /starter-typescript/);
  assert.match(t, /fct-development-project/);
  assert.match(t, /Menu label\s+THIS_IS_A_TEST/);
  assert.match(t, /will be created/i);
});

test('when the folder already exists the screen says it will be reused, not created', () => {
  const t = text(review({ app: { ...base.app, exists: true } }));
  assert.match(t, /already exists/i);
  assert.doesNotMatch(t, /will be created/i);
});

test('a typed e (as the form-style char key) also toggles the details', () => {
  const s = press(review(), 'char:e');
  assert.match(text(s), /vercel link/);
  assert.doesNotMatch(text(press(s, 'char:e')), /vercel link/);
});
