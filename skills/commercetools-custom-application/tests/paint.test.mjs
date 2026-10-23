import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPainter, frameText } from '../scripts/lib/paint.mjs';

// Repainting ten times a second must not fill the terminal's scrollback: no clear-screen (which
// some terminals save as history), only overwrite each line and blank the rest, and nothing at
// all when the frame has not changed.

test('a frame overwrites from the top, erases each line before writing it, and never clears the screen', () => {
  const t = frameText(['one', 'two'], 5);
  assert.ok(t.startsWith('\x1b[H'), 'starts at the home position');
  assert.doesNotMatch(t, /\x1b\[2J/, 'no clear-screen');
  assert.match(t, /\x1b\[Kone\n\x1b\[Ktwo/, 'each line is erased before it is written');
});

test('the rows below the frame are blanked one by one, without moving past the last row', () => {
  const t = frameText(['one', 'two'], 5);
  assert.equal((t.match(/\n/g) ?? []).length, 4, 'four line feeds reach row 5 and no further');
  assert.ok(t.endsWith('\x1b[K'), 'the last row is erased, not written');
  const full = frameText(['a', 'b', 'c'], 3);
  assert.equal((full.match(/\n/g) ?? []).length, 2, 'a frame that fills the screen adds no line feed');
  const unknown = frameText(['a'], undefined);
  assert.match(unknown, /\x1b\[J$/, 'with the height unknown the rest of the screen is erased in one go');
});

test('the painter writes only when the frame changes, and again after a reset', () => {
  const writes = [];
  const p = createPainter((s) => writes.push(s), () => 10);
  p.paint(['same']);
  p.paint(['same']);
  assert.equal(writes.length, 1);
  p.paint(['other']);
  assert.equal(writes.length, 2);
  p.reset();
  p.paint(['other']);
  assert.equal(writes.length, 3, 'after leaving and re-entering the screen the frame is drawn again');
});
