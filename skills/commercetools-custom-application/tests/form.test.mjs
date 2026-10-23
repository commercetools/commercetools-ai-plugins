import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, initForm, reduceForm, formAnswers } from '../scripts/lib/form.mjs';

const form = (defaults = {}) => initForm({ cwd: '/work', defaults });
const press = (s, ...keys) => keys.reduce(reduceForm, s);
const type = (s, text) => [...text].reduce((acc, c) => reduceForm(acc, `char:${c}`), s);
const focusOn = (s, id) => ({ ...s, focus: FIELDS.findIndex((f) => f.id === id) });

test('the form asks, in order: app, region, project, entry path, menu label, email, folder, language, hosting', () => {
  assert.deepEqual(FIELDS.map((f) => f.id), ['appName', 'region', 'projectKey', 'entryPointUriPath', 'menuLabel', 'contactEmail', 'appDir', 'template', 'hosting']);
});

test('the hosting choices are the four hosts with deployment help, then surge and other', () => {
  const hosting = FIELDS.find((f) => f.id === 'hosting');
  assert.deepEqual(hosting.options, ['vercel', 'netlify', 'cloudflare', 'connect', 'surge', 'other']);
  assert.match(hosting.hint, /deployment help/i);
  assert.doesNotMatch(hosting.hint, /Only Vercel/);
});

test('it starts empty on the app name, with sensible choice defaults', () => {
  const s = form();
  assert.equal(s.focus, 0);
  assert.equal(s.values.appName, '');
  assert.equal(s.values.region, 'gcp-eu');
  assert.equal(s.values.template, 'starter-typescript');
  assert.equal(s.values.hosting, 'vercel');
});

test('typing the app name fills the entry path, menu label and folder', () => {
  const s = type(form(), 'My Cool App');
  assert.equal(s.values.appName, 'My Cool App');
  assert.equal(s.values.entryPointUriPath, 'my-cool-app');
  assert.equal(s.values.menuLabel, 'My Cool App');
  assert.equal(s.values.appDir, '/work/my-cool-app');
});

test('space is typed into text fields', () => {
  const s = press(type(form(), 'a'), 'space');
  assert.equal(s.values.appName, 'a ');
});

test('editing a derived field stops it following the app name', () => {
  let s = type(form(), 'abc');
  s = type(focusOn(s, 'entryPointUriPath'), 'x');
  assert.equal(s.values.entryPointUriPath, 'abcx');
  s = type(focusOn(s, 'appName'), 'd');
  assert.equal(s.values.appName, 'abcd');
  assert.equal(s.values.entryPointUriPath, 'abcx');
  assert.equal(s.values.menuLabel, 'abcd');
});

test('values supplied up front are kept and never overwritten by derivation', () => {
  const s = type(form({ entryPointUriPath: 'fixed-path', contactEmail: 'a@b.co' }), 'Name');
  assert.equal(s.values.entryPointUriPath, 'fixed-path');
  assert.equal(s.values.contactEmail, 'a@b.co');
  assert.equal(s.values.menuLabel, 'Name');
});

test('backspace removes a character and ctrl-u clears the field', () => {
  let s = type(form(), 'abc');
  assert.equal(press(s, 'backspace').values.appName, 'ab');
  assert.equal(press(s, 'ctrl-u').values.appName, '');
});

test('up, down and tab move the focus and stop at the ends', () => {
  let s = form();
  s = press(s, 'up');
  assert.equal(s.focus, 0);
  s = press(s, 'down', 'down');
  assert.equal(s.focus, 2);
  s = press(s, 'tab');
  assert.equal(s.focus, 3);
  s = { ...s, focus: FIELDS.length - 1 };
  assert.equal(press(s, 'down').focus, FIELDS.length - 1);
});

test('left and right cycle a choice and wrap, and do nothing on a text field', () => {
  let s = focusOn(form(), 'region');
  s = press(s, 'right');
  assert.equal(s.values.region, 'gcp-us');
  s = press(s, 'left', 'left');
  assert.equal(s.values.region, 'aws-us');
  assert.equal(press(form(), 'right').values.appName, '');
});

test('space on a choice cycles it forward', () => {
  assert.equal(press(focusOn(form(), 'template'), 'space').values.template, 'starter');
});

test('enter on an incomplete form is refused, lists the errors and focuses the first bad field', () => {
  const s = press(form(), 'enter');
  assert.equal(s.submitted, false);
  assert.ok(s.errors.appName);
  assert.ok(s.errors.projectKey);
  assert.ok(s.errors.contactEmail);
  assert.match(s.message, /fix/i);
  assert.equal(s.focus, 0);
});

test('reserved or malformed values are refused with the validator\'s reason', () => {
  // slugify dodges reserved names on its own ('products' becomes 'products-app'), so type one directly.
  let s = type(form({ projectKey: 'p-1', contactEmail: 'a@b.co' }), 'Fine');
  s = type(press(focusOn(s, 'entryPointUriPath'), 'ctrl-u'), 'products');
  s = press(s, 'enter');
  assert.match(s.errors.entryPointUriPath, /reserved|already/i);
  assert.equal(FIELDS[s.focus].id, 'entryPointUriPath');
  s = press(type(form({ projectKey: 'Bad Key', contactEmail: 'nope' }), 'Fine'), 'enter');
  assert.ok(s.errors.projectKey);
  assert.ok(s.errors.contactEmail);
});

test('a complete valid form submits and returns the answers in the shape the validator uses', () => {
  let s = type(form({ projectKey: 'fct-development-project', contactEmail: 'me@example.com' }), 'Cool App');
  s = press(s, 'enter');
  assert.equal(s.submitted, true);
  assert.deepEqual(formAnswers(s), {
    appName: 'Cool App', region: 'gcp-eu', projectKey: 'fct-development-project', entryPointUriPath: 'cool-app',
    menuLabel: 'Cool App', contactEmail: 'me@example.com', appDir: '/work/cool-app', template: 'starter-typescript', hosting: 'vercel',
  });
});

test('a form filled entirely from flags submits on enter without any typing, which is what --yes relies on', () => {
  const given = { appName: 'Cool App', projectKey: 'fct-development-project', contactEmail: 'me@example.com' };
  assert.equal(press(form(given), 'enter').submitted, true);
  const short = press(form({ appName: 'Cool App', projectKey: 'fct-development-project' }), 'enter');
  assert.equal(short.submitted, false);
  assert.equal(FIELDS[short.focus].id, 'contactEmail');
});

test('errors clear for a field once it is edited', () => {
  let s = press(form(), 'enter');
  assert.ok(s.errors.appName);
  s = type(s, 'x');
  assert.equal(s.errors.appName, undefined);
});

test('escape and ctrl-c quit without submitting', () => {
  assert.equal(press(form(), 'escape').quit, true);
  assert.equal(press(form(), 'abort').quit, true);
  assert.equal(press(form(), 'escape').submitted, false);
});
