// A fake machine for provider and step tests: exec answers by matching the command line, and
// every call, its cwd and its env are recorded. Shared by the provider test files.
import { buildSteps } from '../scripts/lib/onboard-steps.mjs';

export function machine(answers, files = {}) {
  const calls = [];
  const cwds = [];
  const envs = [];
  const written = {};
  const exec = async (cmd, args, opts = {}) => {
    const line = [cmd, ...args].join(' ');
    calls.push(line);
    cwds.push(opts.cwd);
    envs.push(opts.env ?? {});
    for (const [pattern, reply] of answers) {
      if (line.includes(pattern)) {
        const r = typeof reply === 'function' ? reply(line, calls) : reply;
        for (const l of String(r.stdout ?? '').split('\n').filter(Boolean)) opts.onLine?.(l);
        return { code: 0, stdout: '', stderr: '', ...r };
      }
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const deps = {
    exec,
    readFile: async (p) => { if (p in files) return files[p]; if (p in written) return written[p]; throw new Error(`ENOENT ${p}`); },
    writeFile: async (p, c) => { written[p] = c; },
    exists: (p) => p in files || p in written,
    rename: async (from, to) => { written[to] = files[from] ?? written[from]; },
    relocateLog: () => {},
    platform: 'darwin',
    sessionValid: () => true,
    skillDir: '/skill',
  };
  return { calls, cwds, envs, written, files, deps };
}

export const ctxFor = (over = {}) => ({
  appDir: '/work/this-is-a-test', region: 'gcp-eu', entryPoint: 'this-is-a-test', hosting: 'vercel', appName: 'Test App',
  menuLabel: 'Test App', template: 'starter-typescript', projectKey: 'fct-dev',
  installPlan: '/work/this-is-a-test/install-plan.json', orgId: 'org1', contactEmail: 'a@b.co', openProjectKey: 'fct-dev', ...over,
});

export const find = (steps, id) => steps.find((s) => s.id === id);
export const run = (steps, id, ctx, log = () => {}) => find(steps, id).run(ctx, log);
// Runs one step for a ctx against a machine, returning the result.
export const deploy = (m, ctx, log) => run(buildSteps(ctx, m.deps), 'deploy', ctx, log);
export const json = (o) => JSON.stringify(o);
