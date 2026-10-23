import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initInput, reduceInput } from '../scripts/lib/input-box.mjs';

// The box under a failed or waiting step: either typed text or a list to pick from. The keys are
// the same names the screens use; the result says when an answer is ready and what it is.
const teams = [{ id: 'acme-projects', name: 'acme projects', plan: 'hobby', current: true }, { id: 'commercetools', name: 'commercetools', plan: 'pro' }];

test('a text input collects typed characters, backspace and ctrl-u, and enter hands over the trimmed value', () => {
  let b = initInput({ ctx: 'vercelToken', label: 'Vercel token', secret: true });
  assert.equal(b.value, '');
  assert.equal(b.secret, true);
  for (const c of ' ab') ({ input: b } = reduceInput(b, `char:${c}`, c));
  ({ input: b } = reduceInput(b, 'space', ' '));
  assert.equal(b.value, ' ab ');
  ({ input: b } = reduceInput(b, 'backspace'));
  assert.equal(b.value, ' ab');
  const r = reduceInput(b, 'enter');
  assert.deepEqual({ done: r.done, value: r.value }, { done: true, value: 'ab' });
  ({ input: b } = reduceInput(b, 'ctrl-u'));
  assert.equal(b.value, '');
  assert.equal(reduceInput(b, 'enter').value, '', 'an empty answer is handed over as empty, meaning "just retry"');
});

test('a list input moves a cursor with the arrows, ignores typing, and enter hands over the id under the cursor', () => {
  let b = initInput({ ctx: 'vercelTeam', label: 'Vercel team', options: teams });
  assert.equal(b.cursor, 0, 'the cursor starts on the first row, not on the team Vercel marks as current');
  ({ input: b } = reduceInput(b, 'up'));
  assert.equal(b.cursor, 0);
  ({ input: b } = reduceInput(b, 'char:x', 'x'));
  assert.equal(b.value, undefined);
  ({ input: b } = reduceInput(b, 'down'));
  ({ input: b } = reduceInput(b, 'down'));
  assert.equal(b.cursor, 1, 'the cursor stops at the last row');
  const r = reduceInput(b, 'enter');
  assert.deepEqual({ done: r.done, value: r.value }, { done: true, value: 'commercetools' });
  assert.equal(reduceInput(b, 'down').done, undefined);
});
