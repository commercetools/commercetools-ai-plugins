// Observe -> plan -> act loop. Stops at DONE, at any step a person must do, or on error.
// Each pass re-observes real Merchant Center state, so a rerun after a crash or a human
// step resumes where things actually stand instead of where a script thinks they are.
export async function drive({ observe, actions, plan, maxSteps = 10 }) {
  const steps = [];
  let previous = null;
  const key = (n) => `${n.step}:${n.target?.orgId ?? ''}`;
  for (let i = 0; i <= maxSteps; i += 1) {
    const next = plan(await observe());
    if (next.step === 'DONE') return { done: true, steps, stoppedAt: null };
    if (!next.automatable) return { done: false, steps, stoppedAt: next };
    if (key(next) === previous) {
      throw new Error(`No progress: step ${next.step} ran but state did not change (${next.reason}).`);
    }
    if (i === maxSteps) throw new Error(`Exceeded maxSteps (${maxSteps}) before reaching DONE.`);
    const action = actions[next.step];
    if (!action) throw new Error(`No action registered for automatable step ${next.step}.`);
    await action(next);
    steps.push(next.step);
    previous = key(next);
  }
  throw new Error(`Exceeded maxSteps (${maxSteps}) before reaching DONE.`);
}
