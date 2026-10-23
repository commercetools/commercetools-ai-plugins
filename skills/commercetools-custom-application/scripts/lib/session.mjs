// The onboarding session as data: a list of steps, a pure reducer for what the screen shows, and
// an engine that runs the steps in order. No terminal and no subprocesses in here, so the whole
// flow (waits, failures, resume) is unit tested with fake steps.
//
// A step is { id, title, run(ctx, log) -> { status: 'done' | 'wait' | 'fail', detail?, reason?, error?, polling? },
//             isDone?(ctx) -> bool }. `isDone` lets a rerun skip work that is already satisfied.
// `polling: true` on a wait means the step is re-checking by itself and needs nothing from the user.

const LOG_LINES = 20;

export function initSession(steps) {
  return { steps: steps.map((s) => ({ id: s.id, title: s.title, status: 'pending', detail: '', log: [], attempts: 0, polling: false })) };
}

export function reduceSession(state, event) {
  const steps = state.steps.map((s) => {
    if (s.id !== event.id) return s;
    switch (event.type) {
      case 'start': return { ...s, status: 'running', attempts: s.attempts + 1, polling: false };
      case 'log': return { ...s, log: [...s.log, event.line].slice(-LOG_LINES) };
      // A polling wait is the step re-checking on its own (a deploy propagating); a plain wait
      // needs the user (a link to click, a value to type).
      case 'wait': return { ...s, status: 'waiting', detail: event.reason, polling: Boolean(event.polling) };
      case 'done': return { ...s, status: 'done', detail: event.detail ?? '' };
      case 'skip': return { ...s, status: 'done', detail: event.detail ?? 'already done' };
      case 'fail': return { ...s, status: 'failed', detail: event.error };
      default: return s;
    }
  });
  return { ...state, steps };
}

export function progressOf(state) {
  const total = state.steps.length;
  const done = state.steps.filter((s) => s.status === 'done').length;
  return { done, total, fraction: total ? done / total : 0 };
}

// wake(step, reason, result) resolves 'retry' after its own delay (or a key press) or 'quit'.
// A failure is handled the same way: the step stays on screen with its error until the wake says
// retry (after the user fixed or answered something) or quit. Only waits count toward maxWaits.
export async function runSession({ steps, ctx, report, wake, maxWaits = 360 }) {
  for (const step of steps) {
    if (step.isDone && (await step.isDone(ctx))) {
      report({ type: 'skip', id: step.id });
      continue;
    }
    let waits = 0;
    for (;;) {
      report({ type: 'start', id: step.id });
      let result;
      try {
        result = await step.run(ctx, (line) => report({ type: 'log', id: step.id, line }));
      } catch (e) {
        result = { status: 'fail', error: e.message };
      }
      if (result.status === 'done') {
        report({ type: 'done', id: step.id, detail: result.detail });
        break;
      }
      if (result.status === 'fail') {
        report({ type: 'fail', id: step.id, error: result.error });
        if ((await wake(step, result.error, result)) === 'quit') return { ok: false, failedAt: step.id, error: result.error, quit: true };
        continue;
      }
      report({ type: 'wait', id: step.id, reason: result.reason, ...(result.polling ? { polling: true } : {}) });
      waits += 1;
      if (waits > maxWaits) return { ok: false, timedOut: true, at: step.id };
      if ((await wake(step, result.reason, result)) === 'quit') return { ok: false, quit: true, at: step.id };
    }
  }
  return { ok: true };
}
