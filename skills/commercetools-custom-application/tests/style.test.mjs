import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStyle, stripAnsi, fitSegments, colorEnabled } from '../scripts/lib/style.mjs';

test('with color off every style returns the text unchanged', () => {
  const st = createStyle({ color: false });
  for (const f of ['bold', 'dim', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'inverse']) {
    assert.equal(st[f]('hi'), 'hi', f);
  }
  assert.equal(st.bg('hi'), 'hi');
});

test('with color on each style wraps the text and closes only its own attribute', () => {
  const st = createStyle({ color: true });
  assert.equal(st.green('x'), '\x1b[32mx\x1b[39m');
  assert.equal(st.bold('x'), '\x1b[1mx\x1b[22m');
  assert.equal(st.dim('x'), '\x1b[2mx\x1b[22m');
  assert.equal(st.inverse('x'), '\x1b[7mx\x1b[27m');
});

test('nested styles keep the outer background alive: nothing emits a full reset', () => {
  const st = createStyle({ color: true });
  const line = st.bg(`a${st.green('b')}c${st.bold(st.cyan('d'))}`);
  assert.equal(line.includes('\x1b[0m'), false);
  assert.ok(line.startsWith('\x1b[48;5;236m') && line.endsWith('\x1b[49m'));
});

test('stripAnsi removes the codes and nothing else', () => {
  const st = createStyle({ color: true });
  assert.equal(stripAnsi(st.bold(st.cyan('Hello')) + ' world'), 'Hello world');
});

test('fitSegments keeps short lines whole', () => {
  const st = createStyle({ color: false });
  assert.equal(fitSegments([['ab', st.bold], ['cd', st.dim]], 10), 'abcd');
});

test('fitSegments truncates by visible width, not by escape codes, and marks the cut', () => {
  const st = createStyle({ color: true });
  const out = fitSegments([['abcdef', st.green], ['ghij', st.dim]], 8);
  assert.equal(stripAnsi(out), 'abcdefg~');
  assert.equal(stripAnsi(out).length, 8);
});

test('fitSegments cuts inside a segment and drops the rest', () => {
  const st = createStyle({ color: false });
  assert.equal(fitSegments([['hello', st.bold], ['world', st.bold]], 3), 'he~');
});

test('colorEnabled respects NO_COLOR, TERM=dumb and a non-tty', () => {
  assert.equal(colorEnabled({ NO_COLOR: '1' }, true), false);
  assert.equal(colorEnabled({ TERM: 'dumb' }, true), false);
  assert.equal(colorEnabled({ TERM: 'xterm-256color' }, false), false);
  assert.equal(colorEnabled({ TERM: 'xterm-256color' }, true), true);
  assert.equal(colorEnabled({ NO_COLOR: '', TERM: 'xterm' }, true), true);
});
