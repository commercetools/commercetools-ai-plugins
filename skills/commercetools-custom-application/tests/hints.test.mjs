import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintSegments, REVIEW_HINTS, FORM_HINTS } from '../scripts/lib/hints.mjs';
import { createStyle, fitSegments, stripAnsi } from '../scripts/lib/style.mjs';

const st = createStyle({ color: true });

test('a hint bar is key then what it does, separated by dots, the keys bold', () => {
  const segs = hintSegments([['enter', 'start'], ['esc', 'quit']], st);
  const text = stripAnsi(fitSegments(segs, 80));
  assert.equal(text, '  enter start  ·  esc quit');
  const keySeg = segs.find(([t]) => t === 'enter');
  assert.ok(keySeg, 'key is its own segment');
  assert.equal(keySeg[1]('x').includes('\x1b[1m'), true, 'keys are bold');
});

test('when the bar would not fit the width, the gaps between pairs shrink before anything is cut', () => {
  const items = [['↑↓', 'move'], ['enter', 'open/tick'], ['space', 'tick'], ['tab', 'continue'], ['esc', 'clear filter'], ['ctrl-c', 'quit']];
  const wide = stripAnsi(fitSegments(hintSegments(items, st, { width: 120 }), 120));
  const tight = stripAnsi(fitSegments(hintSegments(items, st, { width: 90 }), 90));
  assert.match(wide, /move  ·  enter/);
  assert.match(tight, /move · enter/);
  assert.match(tight, /ctrl-c quit$/, 'nothing cut at 90 columns');
});

test('every screen bar fits in 100 columns with normal gaps and in 88 with tight ones', () => {
  for (const bar of [FORM_HINTS, REVIEW_HINTS]) {
    assert.ok(stripAnsi(fitSegments(hintSegments(bar, st, { width: 100 }), 100)).endsWith('quit'));
    assert.ok(stripAnsi(fitSegments(hintSegments(bar, st, { width: 88 }), 88)).endsWith('quit'));
  }
});

test('the form and review bars use the same keys for the same actions', () => {
  const keysOf = (bar) => Object.fromEntries(bar.map(([k, what]) => [what, k]));
  const form = keysOf(FORM_HINTS);
  const review = keysOf(REVIEW_HINTS);
  assert.equal(form.move, '↑↓/tab');
  assert.equal(review.move, '↑↓/tab');
  assert.equal(form.change, '←→');
  assert.equal(review.change, '←→');
  assert.equal(form.quit, 'esc');
  assert.equal(review.quit, 'esc');
});

test('the review bar names every review action in plain words', () => {
  const text = REVIEW_HINTS.map(([k, what]) => `${k} ${what}`).join(' ');
  assert.match(text, /enter start/);
  assert.match(text, /\bb\b.*picker/);
  assert.match(text, /\be\b.*details/);
  assert.doesNotMatch(text, /toggle|cycle/i);
});
