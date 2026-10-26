import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planNextStep } from '../scripts/lib/plan.mjs';

const verified = { email: 'a@b.co', verifiedEmail: 'a@b.co' };
const draft = (over = {}) => ({ id: 'app1', status: 'DRAFT', url: 'https://test.com', ...over });
const base = { productionUrl: 'https://x.vercel.app' };
const target = (over = {}) => ({ orgId: 'o1', orgName: 'Org One', allProjects: true, projectKeys: [], actual: null, ...over });

test('no contact: set it, automatable', () => {
  const p = planNextStep({ ...base, contact: null, app: null, installTargets: [target()] });
  assert.equal(p.step, 'SET_CONTACT');
  assert.equal(p.automatable, true);
});

test('unverified contact: VERIFY_EMAIL is a human step', () => {
  const p = planNextStep({ ...base, contact: { email: 'a@b.co', verifiedEmail: null }, app: null, installTargets: [target()] });
  assert.equal(p.step, 'VERIFY_EMAIL');
  assert.equal(p.automatable, false);
});

test('verified contact, no app: CREATE_APP', () => {
  const p = planNextStep({ ...base, contact: verified, app: null, installTargets: [target()] });
  assert.equal(p.step, 'CREATE_APP');
  assert.equal(p.automatable, true);
});

test('app exists but nothing deployed: DEPLOY is not automatable by the register script', () => {
  const p = planNextStep({ ...base, productionUrl: null, contact: verified, app: draft(), installTargets: [target()] });
  assert.equal(p.step, 'DEPLOY');
  assert.equal(p.automatable, false);
});

test('registered url differs from production url: SYNC_URL', () => {
  const p = planNextStep({ ...base, contact: verified, app: draft(), installTargets: [target()] });
  assert.equal(p.step, 'SYNC_URL');
  assert.equal(p.automatable, true);
});

test('url matches but still DRAFT: SET_READY', () => {
  const p = planNextStep({ ...base, contact: verified, app: draft({ url: base.productionUrl }), installTargets: [target()] });
  assert.equal(p.step, 'SET_READY');
});

const ready = draft({ url: base.productionUrl, status: 'PRIVATE_USAGE' });
const planFor = (installTargets) => planNextStep({ ...base, contact: verified, app: ready, installTargets });

test('no install targets chosen: stop, a person must choose', () => {
  const p = planFor([]);
  assert.equal(p.step, 'CHOOSE_TARGETS');
  assert.equal(p.automatable, false);
});

test('ready, target not installed: INSTALL names the target', () => {
  const p = planFor([target()]);
  assert.equal(p.step, 'INSTALL');
  assert.equal(p.target.orgId, 'o1');
});

test('all-projects wanted and installed in all projects: DONE', () => {
  const actual = { installInAllProjects: true, projectKeys: [] };
  assert.equal(planFor([target({ actual })]).step, 'DONE');
});

test('allowlist wanted and exactly that set installed: DONE', () => {
  const actual = { installInAllProjects: false, projectKeys: ['b', 'a'] };
  assert.equal(planFor([target({ allProjects: false, projectKeys: ['a', 'b'], actual })]).step, 'DONE');
});

test('allowlist differs from installed set (missing or extra key): UPDATE_INSTALL', () => {
  for (const have of [['a'], ['a', 'b', 'c']]) {
    const actual = { installInAllProjects: false, projectKeys: have };
    const p = planFor([target({ allProjects: false, projectKeys: ['a', 'b'], actual })]);
    assert.equal(p.step, 'UPDATE_INSTALL', have.join());
    assert.equal(p.automatable, true);
  }
});

test('mode change all -> allowlist or allowlist -> all is not automatic', () => {
  const all = { installInAllProjects: true, projectKeys: [] };
  const some = { installInAllProjects: false, projectKeys: ['a'] };
  const toList = planFor([target({ allProjects: false, projectKeys: ['a'], actual: all })]);
  const toAll = planFor([target({ allProjects: true, actual: some })]);
  for (const p of [toList, toAll]) {
    assert.equal(p.step, 'INSTALL_MISMATCH');
    assert.equal(p.automatable, false);
  }
});

test('first unsatisfied target wins, satisfied ones are skipped', () => {
  const done = target({ orgId: 'o1', actual: { installInAllProjects: true, projectKeys: [] } });
  const todo = target({ orgId: 'o2', orgName: 'Two' });
  const p = planFor([done, todo]);
  assert.equal(p.step, 'INSTALL');
  assert.equal(p.target.orgId, 'o2');
});

test('DONE only when every target is satisfied', () => {
  const ok = (orgId) => target({ orgId, actual: { installInAllProjects: true, projectKeys: [] } });
  assert.equal(planFor([ok('o1'), ok('o2')]).step, 'DONE');
});

// --project-key shorthand: "ensure installed on this project", never remove anything.
const ensure = (over = {}) => target({ allProjects: false, projectKeys: ['k'], ensure: true, ...over });

test('ensure: installed on the key plus others is DONE, others are left alone', () => {
  const actual = { installInAllProjects: false, projectKeys: ['k', 'other'] };
  assert.equal(planFor([ensure({ actual })]).step, 'DONE');
});

test('ensure: installed in all projects is DONE, not a mismatch', () => {
  const actual = { installInAllProjects: true, projectKeys: [] };
  assert.equal(planFor([ensure({ actual })]).step, 'DONE');
});

test('ensure: installed on other projects only adds the key and keeps the others', () => {
  const actual = { installInAllProjects: false, projectKeys: ['other'] };
  const p = planFor([ensure({ actual })]);
  assert.equal(p.step, 'UPDATE_INSTALL');
  assert.deepEqual(p.target.projectKeys.sort(), ['k', 'other']);
});

test('ensure: not installed at all installs just the key', () => {
  const p = planFor([ensure()]);
  assert.equal(p.step, 'INSTALL');
  assert.deepEqual(p.target.projectKeys, ['k']);
});
