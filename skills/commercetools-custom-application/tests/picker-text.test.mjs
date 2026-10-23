import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACEHOLDER, placeholderStyle, inputStyle, INSERT_HINT } from '../scripts/lib/picker-text.mjs';
import { createStyle, stripAnsi } from '../scripts/lib/style.mjs';

const on = createStyle({ color: true });

test('placeholder is plain language: no jargon, says what to type and how to search for several', () => {
  assert.doesNotMatch(PLACEHOLDER, /any of|commas =|term|predicate|regex/i);
  assert.match(PLACEHOLDER, /Organization/);
  assert.match(PLACEHOLDER, /project/);
  assert.match(PLACEHOLDER, /comma/i);
});

test('placeholder is short enough to fit an 80 column screen beside the prompt', () => {
  assert.ok(PLACEHOLDER.length <= 60, `length ${PLACEHOLDER.length}`);
});

test('the placeholder is styled with less emphasis than what the user types', () => {
  const ph = placeholderStyle(on)('x');
  const typed = inputStyle(on)('x');
  assert.equal(ph.includes('\x1b[1m'), false, 'placeholder must not be bold');
  assert.equal(typed.includes('\x1b[1m'), true, 'typed text must be bold');
  assert.equal(ph.includes('\x1b[90m'), true, 'placeholder is gray');
  assert.equal(typed.includes('\x1b[90m'), false, 'typed text is not gray');
});

test('styles change only the look, never the characters', () => {
  assert.equal(stripAnsi(placeholderStyle(on)(PLACEHOLDER)), PLACEHOLDER);
  assert.equal(stripAnsi(inputStyle(on)('beta,gamma')), 'beta,gamma');
});

test('with color off both styles return the text unchanged', () => {
  const off = createStyle({ color: false });
  assert.equal(placeholderStyle(off)('x'), 'x');
  assert.equal(inputStyle(off)('x'), 'x');
});

test('the insert-mode hint uses plain words too', () => {
  const text = INSERT_HINT.map(([k, d]) => `${k} ${d}`).join(' ');
  assert.doesNotMatch(text, /any of|commas =/i);
});
