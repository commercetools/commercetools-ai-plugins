import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initSession, reduceSession, progressOf, runSession } from '../scripts/lib/session.mjs';

const step = (id, run, extra = {}) => ({ id, title: id.toUpperCase(), run, ...extra });
const ok = (detail = '') => async () => ({ status: 'done', detail });
const collect = () => {
  const events = [];
  return { events, report: (e) => events.push(e) };
};
const instant = { sleep: async () => {}, wake: async () => 'retry' };

test('a fresh session lists every step as pending', () => {
  const s = initSession([step('a', ok()), step('b', ok())]);
  assert.deepEqual(s.steps.map((x) => [x.id, x.status]), [['a', 'pending'], ['b', 'pending']]);
  assert.deepEqual(progressOf(s), { done: 0, total: 2, fraction: 0 });
});

test('events move a step through running, waiting and done, and keep a log tail', () => {
  let s = initSession([step('a', ok())]);
  s = reduceSession(s, { type: 'start', id: 'a' });
  assert.equal(s.steps[0].status, 'running');
  s = reduceSession(s, { type: 'log', id: 'a', line: 'hello' });
  assert.deepEqual(s.steps[0].log, ['hello']);
  s = reduceSession(s, { type: 'wait', id: 'a', reason: 'click the link' });
  assert.equal(s.steps[0].status, 'waiting');
  assert.equal(s.steps[0].detail, 'click the link');
  assert.equal(s.steps[0].polling, false, 'a plain wait needs the user');
  s = reduceSession(s, { type: 'wait', id: 'a', reason: 'host not ready', polling: true });
  assert.equal(s.steps[0].polling, true, 'a polling wait is the step working on its own');
  s = reduceSession(s, { type: 'start', id: 'a' });
  assert.equal(s.steps[0].polling, false, 'a new run clears it');
  s = reduceSession(s, { type: 'done', id: 'a', detail: 'fine' });
  assert.equal(s.steps[0].status, 'done');
  assert.deepEqual(progressOf(s), { done: 1, total: 1, fraction: 1 });
});

test('the log keeps only the most recent lines', () => {
  let s = initSession([step('a', ok())]);
  for (let i = 0; i < 40; i += 1) s = reduceSession(s, { type: 'log', id: 'a', line: `l${i}` });
  assert.equal(s.steps[0].log.length, 20);
  assert.equal(s.steps[0].log.at(-1), 'l39');
});

test('a failed step records the error and does not count as done', () => {
  let s = initSession([step('a', ok()), step('b', ok())]);
  s = reduceSession(s, { type: 'fail', id: 'a', error: 'boom' });
  assert.equal(s.steps[0].status, 'failed');
  assert.equal(s.steps[0].detail, 'boom');
  assert.equal(progressOf(s).done, 0);
});

test('skipped steps (already satisfied on resume) count as done', () => {
  let s = initSession([step('a', ok())]);
  s = reduceSession(s, { type: 'skip', id: 'a', detail: 'already done' });
  assert.equal(s.steps[0].status, 'done');
  assert.equal(progressOf(s).fraction, 1);
});

test('runSession runs the steps in order and reports each', async () => {
  const order = [];
  const steps = ['a', 'b', 'c'].map((id) => step(id, async () => (order.push(id), { status: 'done' })));
  const { events, report } = collect();
  const r = await runSession({ steps, ctx: {}, report, ...instant });
  assert.equal(r.ok, true);
  assert.deepEqual(order, ['a', 'b', 'c']);
  assert.deepEqual(events.filter((e) => e.type === 'done').map((e) => e.id), ['a', 'b', 'c']);
});

test('a waiting step is retried until it is done, reporting each wait', async () => {
  let n = 0;
  const steps = [step('mail', async () => (++n < 3 ? { status: 'wait', reason: `try ${n}` } : { status: 'done' })), step('next', ok())];
  const { events, report } = collect();
  const r = await runSession({ steps, ctx: {}, report, ...instant });
  assert.equal(r.ok, true);
  assert.equal(n, 3);
  assert.equal(events.filter((e) => e.type === 'wait').length, 2);
});

test('a polling wait is reported as such, so the screen can show it as progress', async () => {
  let n = 0;
  const steps = [step('host', async () => (++n < 2 ? { status: 'wait', reason: 'not yet', polling: true } : { status: 'done' }))];
  const { events, report } = collect();
  await runSession({ steps, ctx: {}, report, ...instant });
  assert.deepEqual(events.filter((e) => e.type === 'wait'), [{ type: 'wait', id: 'host', reason: 'not yet', polling: true }]);
});

test('quitting while waiting stops the session and leaves later steps untouched', async () => {
  const ran = [];
  const steps = [
    step('mail', async () => (ran.push('mail'), { status: 'wait', reason: 'click' })),
    step('later', async () => (ran.push('later'), { status: 'done' })),
  ];
  const r = await runSession({ steps, ctx: {}, report: () => {}, sleep: async () => {}, wake: async () => 'quit' });
  assert.deepEqual(r, { ok: false, quit: true, at: 'mail' });
  assert.deepEqual(ran, ['mail']);
});

// A failure never ends the session by itself: the step stays on screen and the wake decides,
// retry or quit, the same as a wait. Quitting after a failure reports both.
test('a failing step stays until the wake says quit, then reports where and why', async () => {
  const ran = [];
  const woken = [];
  const steps = [
    step('a', async () => (ran.push('a'), { status: 'fail', error: 'bad' })),
    step('b', async () => (ran.push('b'), { status: 'done' })),
  ];
  const { events, report } = collect();
  const r = await runSession({ steps, ctx: {}, report, wake: async (s, reason, result) => { woken.push([s.id, reason, result.status]); return 'quit'; } });
  assert.deepEqual(r, { ok: false, failedAt: 'a', error: 'bad', quit: true });
  assert.deepEqual(ran, ['a']);
  assert.deepEqual(woken, [['a', 'bad', 'fail']]);
  assert.ok(events.some((e) => e.type === 'fail' && e.id === 'a'));
});

test('a failed step is run again when the wake says retry, and the session carries on once it passes', async () => {
  let n = 0;
  const ran = [];
  const steps = [
    step('a', async () => (ran.push('a'), ++n < 3 ? { status: 'fail', error: `bad ${n}` } : { status: 'done' })),
    step('b', async () => (ran.push('b'), { status: 'done' })),
  ];
  const { events, report } = collect();
  const r = await runSession({ steps, ctx: {}, report, wake: async () => 'retry', maxWaits: 1 });
  assert.equal(r.ok, true, 'failures are not counted as waits');
  assert.deepEqual(ran, ['a', 'a', 'a', 'b']);
  assert.equal(events.filter((e) => e.type === 'fail').length, 2);
  assert.equal(events.filter((e) => e.type === 'start' && e.id === 'a').length, 3);
});

test('a step that throws becomes a failure, not a crash', async () => {
  const r = await runSession({ steps: [step('a', async () => { throw new Error('kaboom'); })], ctx: {}, report: () => {}, wake: async () => 'quit' });
  assert.deepEqual(r, { ok: false, failedAt: 'a', error: 'kaboom', quit: true });
});

test('steps whose state is already satisfied are skipped, so a rerun resumes', async () => {
  const ran = [];
  const steps = [
    step('a', async () => (ran.push('a'), { status: 'done' }), { isDone: async () => true }),
    step('b', async () => (ran.push('b'), { status: 'done' }), { isDone: async () => false }),
  ];
  const { events, report } = collect();
  await runSession({ steps, ctx: {}, report, ...instant });
  assert.deepEqual(ran, ['b']);
  assert.ok(events.some((e) => e.type === 'skip' && e.id === 'a'));
});

test('steps share a context and can log through the callback', async () => {
  const ctx = {};
  const steps = [
    step('a', async (c, log) => { c.url = 'https://x'; log('line'); return { status: 'done' }; }),
    step('b', async (c) => ({ status: c.url === 'https://x' ? 'done' : 'fail', error: 'no url' })),
  ];
  const { events, report } = collect();
  const r = await runSession({ steps, ctx, report, ...instant });
  assert.equal(r.ok, true);
  assert.ok(events.some((e) => e.type === 'log' && e.line === 'line'));
});

test('too many waits gives up instead of looping forever', async () => {
  const steps = [step('mail', async () => ({ status: 'wait', reason: 'still waiting' }))];
  const r = await runSession({ steps, ctx: {}, report: () => {}, ...instant, maxWaits: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.at, 'mail');
  assert.equal(r.timedOut, true);
});
