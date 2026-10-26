import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drive } from '../scripts/lib/drive.mjs';

// A tiny fake world: each action advances `stage`; plan maps stage to a step.
function world(stages, { stuck = false } = {}) {
  let i = 0;
  const log = [];
  return {
    log,
    observe: async () => ({ stage: i }),
    plan: ({ stage }) => stages[stage],
    actions: Object.fromEntries(
      ['A', 'B'].map((s) => [s, async () => { log.push(s); if (!stuck) i += 1; }])
    ),
  };
}

const A = { step: 'A', automatable: true, reason: '' };
const B = { step: 'B', automatable: true, reason: '' };
const DONE = { step: 'DONE', automatable: false, reason: 'ok' };
const HUMAN = { step: 'VERIFY_EMAIL', automatable: false, reason: 'click the link' };

test('runs automatable steps in order until DONE', async () => {
  const w = world([A, B, DONE]);
  const r = await drive(w);
  assert.deepEqual(w.log, ['A', 'B']);
  assert.equal(r.done, true);
  assert.deepEqual(r.steps, ['A', 'B']);
});

test('stops at a human step and reports it', async () => {
  const w = world([A, HUMAN, B]);
  const r = await drive(w);
  assert.deepEqual(w.log, ['A']);
  assert.equal(r.done, false);
  assert.equal(r.stoppedAt.step, 'VERIFY_EMAIL');
});

test('an action that changes nothing is an error, not an infinite loop', async () => {
  const w = world([A, A, A, A], { stuck: true });
  await assert.rejects(() => drive(w), /no progress.*A/i);
  assert.equal(w.log.length, 1);
});

test('maxSteps bounds the loop', async () => {
  const w = world([A, B, A, B, A, B, DONE]);
  await assert.rejects(() => drive({ ...w, maxSteps: 2 }), /maxSteps/);
});

test('the same step on different targets is progress, not a loop', async () => {
  const forOrg = (orgId) => ({ step: 'A', automatable: true, reason: '', target: { orgId } });
  const w = world([forOrg('o1'), forOrg('o2'), DONE]);
  const r = await drive(w);
  assert.equal(r.done, true);
  assert.deepEqual(w.log, ['A', 'A']);
});

test('the same step on the same target twice is still "No progress"', async () => {
  const same = { step: 'A', automatable: true, reason: '', target: { orgId: 'o1' } };
  const w = world([same, same, DONE], { stuck: true });
  await assert.rejects(() => drive(w), /No progress/);
});
