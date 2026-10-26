import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, buildForm, validateAnswers } from '../scripts/lib/intake.mjs';
import { validateEntryPointUriPath } from '../scripts/lib/validate.mjs';

test('slugify turns an app name into a valid entryPointUriPath', () => {
  assert.equal(slugify('THIS_IS_A_TEST'), 'this-is-a-test');
  assert.equal(slugify('  My Cool App!! '), 'my-cool-app');
  assert.equal(validateEntryPointUriPath(slugify('THIS_IS_A_TEST')).ok, true);
});

test('slugify never returns a reserved or too-short path', () => {
  assert.equal(validateEntryPointUriPath(slugify('Products')).ok, true);
  assert.equal(validateEntryPointUriPath(slugify('A')).ok, true);
  assert.equal(validateEntryPointUriPath(slugify('***')).ok, true);
});

const ids = (form) => form.flatMap((b) => b.questions.map((q) => q.id));

test('form asks every input in order, skipping the ones already known', () => {
  const full = buildForm({ appName: 'Foo' });
  assert.deepEqual(ids(full), [
    'region', 'projectKey', 'entryPointUriPath', 'menuLabel',
    'contactEmail', 'appDir', 'template', 'hosting',
  ]);
  const partial = buildForm({ appName: 'Foo', hosting: 'vercel' });
  assert.equal(ids(partial).includes('hosting'), false);
});

test('form respects AskUserQuestion limits: <=4 questions per batch, 2-4 options each', () => {
  for (const b of buildForm({ appName: 'Foo' })) {
    assert.ok(b.questions.length >= 1 && b.questions.length <= 4);
    for (const q of b.questions) {
      assert.ok(q.options.length >= 2 && q.options.length <= 4, q.id);
      assert.ok(q.header.length <= 12, q.id);
    }
  }
});

test('form pre-fills suggestions from the app name and email default, recommended first', () => {
  const q = Object.fromEntries(
    buildForm({ appName: 'THIS_IS_A_TEST', defaults: { email: 'a@b.co' } })
      .flatMap((b) => b.questions).map((x) => [x.id, x]),
  );
  assert.equal(q.entryPointUriPath.options[0].label, 'this-is-a-test (Recommended)');
  assert.equal(q.menuLabel.options[0].label, 'THIS_IS_A_TEST (Recommended)');
  assert.equal(q.contactEmail.options[0].label, 'a@b.co (Recommended)');
  assert.equal(q.appDir.options[0].label, './THIS_IS_A_TEST (Recommended)');
});

const good = {
  region: 'gcp-eu', projectKey: 'my-proj', entryPointUriPath: 'this-is-a-test',
  menuLabel: 'Test', contactEmail: 'a@b.co', appDir: './x', template: 'starter-typescript',
  hosting: 'vercel',
};

test('validateAnswers accepts good answers and strips the (Recommended) suffix', () => {
  const r = validateAnswers({ ...good, menuLabel: 'Test (Recommended)' });
  assert.equal(r.ok, true);
  assert.equal(r.inputs.menuLabel, 'Test');
});

test('validateAnswers reports every bad field, not just the first', () => {
  const r = validateAnswers({ ...good, region: 'mars', entryPointUriPath: 'products', contactEmail: 'nope', projectKey: 'Bad Key' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['contactEmail', 'entryPointUriPath', 'projectKey', 'region']);
});

test('validateAnswers flags missing fields and unknown template', () => {
  const r = validateAnswers({ region: 'gcp-eu', template: 'vue' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.projectKey && r.errors.template && r.errors.hosting);
});
