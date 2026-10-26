// The session without a terminal. An agent gathers every input in chat, runs this with the
// answers as flags, shows the review it returns, gets one explicit yes, and runs it again with
// `confirmed`. The step engine and the providers are the same as the screen session's; only the
// `wake` differs: a wait that needs a value is not a prompt but a result (`needs`) the agent
// reads, answers, and reruns with. Polling waits poll by themselves, up to a limit.
import { buildSteps, deployHelpOn } from './onboard-steps.mjs';
import { runSession } from './session.mjs';

// Secrets never travel as flags. A need for one of these names the environment variable to set.
export const SECRET_ENV = {
  vercelToken: 'VERCEL_TOKEN',
  netlifyToken: 'NETLIFY_AUTH_TOKEN',
  cfToken: 'CLOUDFLARE_API_TOKEN',
  ctClientSecret: 'CTP_CLIENT_SECRET',
};

const PHASE_ONE = ['preflight', 'session'];

// The Organizations and projects as the agent presents them for the install plan: one entry per
// Organization, its projects sorted by key.
export const targetOptions = (owners, projects) => owners.map((o) => ({
  id: o.id,
  name: o.name,
  projects: projects.filter((p) => p.owner?.id === o.id).map((p) => ({ key: p.key, name: p.name })).sort((a, b) => a.key.localeCompare(b.key)),
}));

// `owners` (the Organizations the user administers) and `targets` (their projects) may be
// functions: they are read after the sign-in, so a run that starts signed out still gets them.
export async function runHeadless({ ctx, deps, plan, owners, targets = async () => [], confirmed = false, pollLimit = 60, pollMs = 10000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onEvent = () => {} }) {
  const steps = buildSteps(ctx, deps);
  let needs = null;
  let polls = 0;
  const wake = async (step, reason, result) => {
    // An expired session asks for a login: start it (it opens the browser), then poll the file.
    if (result?.input === 'login') await steps.find((s) => s.id === 'session').run(ctx, (line) => onEvent({ type: 'log', id: step.id, line }));
    const spec = result?.input === 'url' ? { ctx: 'productionUrl', label: 'Production URL' } : typeof result?.input === 'object' && result.input !== null ? result.input : null;
    if (spec) {
      needs = { ...spec, ...(spec.secret && SECRET_ENV[spec.ctx] ? { env: SECRET_ENV[spec.ctx] } : {}) };
      return 'quit';
    }
    if (result?.status === 'fail') return 'quit';
    if (polls >= pollLimit) return 'quit';
    polls += 1;
    await sleep(result?.pollMs ?? pollMs);
    return 'retry';
  };
  // A login this run started runs detached and holds port 3001; leaving it behind would fail the
  // rerun's preflight on the port instead of letting it resume.
  const outcome = (r) => {
    ctx.login?.kill();
    ctx.login = null;
    if (r.ok) return r;
    if (needs) return { ok: false, needs, at: r.at ?? r.failedAt, ...(r.error ? { error: r.error } : {}) };
    if (r.failedAt) return { ok: false, failedAt: r.failedAt, error: r.error };
    return { ok: false, at: r.at, error: r.timedOut ? 'the session gave up waiting' : 'the step is still waiting after the poll limit' };
  };

  const one = await runSession({ steps: steps.filter((s) => PHASE_ONE.includes(s.id)), ctx, report: onEvent, wake });
  if (!one.ok) return outcome(one);

  const ownerList = typeof owners === 'function' ? await owners() : owners;
  // No plan yet: the agent could not list the Organizations before the sign-in, so this run hands
  // them over, with their projects, and stops. The user chooses; the agent writes the plan file.
  if (!plan) {
    const options = targetOptions(ownerList, await targets());
    return {
      ok: false,
      at: 'review',
      error: 'Say which Organizations the app is installed in, and all projects or an allowlist of project keys for each.',
      needs: { ctx: 'installPlan', label: 'Install targets', hint: 'Write the choices as a JSON array of { orgId, orgName, allProjects, projectKeys } and rerun with --install-plan <file>.', options },
    };
  }

  // The owner Organization: given, or the only one the plan names. Never guessed among several.
  const planOrgs = [...new Set(plan.map((t) => t.orgId))];
  const owner = ctx.orgId ? ownerList.find((o) => o.id === ctx.orgId) : planOrgs.length === 1 ? ownerList.find((o) => o.id === planOrgs[0]) : null;
  if (!owner) {
    const options = ownerList.map((o) => ({ id: o.id, name: o.name, plan: '', current: false }));
    const error = ctx.orgId ? `No Organization with the id ${ctx.orgId} among the ones you administer.` : 'The plan names several Organizations; say which one owns the app.';
    return { ok: false, at: 'review', error, needs: { ctx: 'orgId', label: 'Owner Organization', options } };
  }
  const deployHelp = deployHelpOn(ctx);
  const review = {
    app: { name: ctx.appName, entryPoint: ctx.entryPoint, region: ctx.region, appDir: ctx.appDir, repoDir: ctx.repoDir ?? null, exists: Boolean(deps.exists(`${ctx.appDir}/custom-application-config.mjs`)), template: ctx.template, projectKey: ctx.projectKey, menuLabel: ctx.menuLabel },
    contactEmail: ctx.contactEmail,
    hosting: ctx.hosting,
    plan,
    owner: { id: owner.id, name: owner.name },
    deployHelp,
  };
  if (!confirmed) return { ok: true, stage: 'review', review };

  Object.assign(ctx, { orgId: owner.id, deployHelp, openProjectKey: plan.find((t) => !t.allProjects)?.projectKeys?.[0] ?? ctx.projectKey });
  const two = await runSession({ steps: steps.filter((s) => !PHASE_ONE.includes(s.id)), ctx, report: onEvent, wake });
  if (!two.ok) return outcome(two);
  return { ok: true, productionUrl: ctx.productionUrl, opened: ctx.openUrl, owner: owner.id };
}
