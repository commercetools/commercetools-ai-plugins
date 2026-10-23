import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portCheck, parseLsof } from '../scripts/lib/port.mjs';

test('free port passes', () => {
  const c = portCheck(3001, () => null);
  assert.equal(c.ok, true);
  assert.equal(c.required, true);
  assert.match(c.name, /3001/);
});

test('busy port fails and tells the user what to stop before login', () => {
  const c = portCheck(3001, () => 'node (pid 4242)');
  assert.equal(c.ok, false);
  assert.match(c.detail, /node \(pid 4242\)/);
  assert.match(c.detail, /stop/i);
  assert.match(c.detail, /login/i);
});

test('parseLsof extracts command and pid from lsof output, null when empty', () => {
  const out = 'COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nnode    4242 me   23u  IPv6 0x1      0t0  TCP *:3001 (LISTEN)\n';
  assert.equal(parseLsof(out), 'node (pid 4242)');
  assert.equal(parseLsof(''), null);
  assert.equal(parseLsof(null), null);
});
