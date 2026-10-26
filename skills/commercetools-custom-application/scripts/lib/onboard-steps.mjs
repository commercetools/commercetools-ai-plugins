// The steps of one onboarding session, from an empty folder to the app open in the browser.
// Every effect goes through injected `deps`
// ({ exec, readFile, writeFile, exists, rename, relocateLog, platform, sessionValid, skillDir }) so the sequence, the waits and
// the failure messages are unit tested with a fake machine. Registration is the existing
// register.mjs, run as a subprocess: it is idempotent, so re-running it is how waits resume.
import path from 'node:path';
import { mcApiUrlForRegion } from './validate.mjs';
import { openCommand } from './open-browser.mjs';
import { providerFor } from './providers/index.mjs';

const tail = (text, n = 600) => String(text ?? '').trim().slice(-n);
const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// Deployment help defaults on only where the session has a provider for the host.
export const deployHelpOn = (ctx) => ctx.deployHelp ?? providerFor(ctx.hosting) !== null;

export function buildSteps(ctx0, deps) {
  const script = (name) => `${deps.skillDir}/scripts/${name}`;
  const { exec } = deps;
  const provider = providerFor(ctx0.hosting);
  const packageManager = provider?.packageManager ?? 'pnpm';
  // Before the scaffold step the app folder does not exist, and a child spawned inside a missing
  // folder dies with a misleading "spawn node ENOENT". Until then, commands run in the nearest
  // folder that does exist: the repository root (Connect) if it is there, else its parent.
  const workDir = (ctx) => {
    if (deps.exists(ctx.appDir)) return ctx.appDir;
    const top = ctx.repoDir ?? ctx.appDir;
    return deps.exists(top) ? top : path.dirname(top);
  };

  // Runs a command, streams its lines to the log, and throws with its output when it fails.
  async function must(ctx, log, label, cmd, args, opts = {}) {
    const r = await exec(cmd, args, { cwd: ctx.appDir, onLine: log, ...opts });
    if (r.code !== 0) throw new Error(`${label} failed (exit ${r.code}): ${tail(r.stderr || r.stdout)}`);
    return r;
  }

  function registerArgs(ctx, withUrl) {
    return [
      script('register.mjs'), '--app-dir', ctx.appDir,
      ...(ctx.installPlan ? ['--install-plan', ctx.installPlan] : ['--project-key', ctx.openProjectKey]),
      ...(ctx.orgId ? ['--org-id', ctx.orgId] : []),
      ...(ctx.contactEmail ? ['--contact-email', ctx.contactEmail] : []),
      ...(withUrl ? ['--production-url', ctx.productionUrl] : []),
    ];
  }

  // Maps register.mjs output onto a step result. `allowDeploy` is true for the first pass only.
  function fromRegister(r, { allowDeploy }) {
    const out = parseJson(r.stdout);
    if (!out) return { status: 'fail', error: `register.mjs printed no JSON: ${tail(r.stderr || r.stdout)}` };
    if (out.ok === false && /session .*expired|no session for/i.test(out.error)) {
      return { status: 'wait', reason: 'Your Merchant Center session expired. Sign in again in the browser.', input: 'login' };
    }
    if (out.ok === false) return { status: 'fail', error: out.error };
    if (out.done) return { status: 'done', detail: (out.steps ?? []).join(', ') };
    const at = out.stoppedAt;
    if (at?.step === 'VERIFY_EMAIL') return { status: 'wait', reason: at.reason };
    if (allowDeploy && at?.step === 'DEPLOY') return { status: 'done', detail: 'registered in Draft, ready to deploy' };
    return { status: 'fail', error: `${at?.step ?? 'unknown'}: ${at?.reason ?? 'registration stopped'}` };
  }

  const ONBOARDING_IGNORE = '.mc-onboarding/';
  const ignoresOnboarding = async (file) => deps.exists(file) && /^\.mc-onboarding\/?$/m.test(await deps.readFile(file));

  const steps = [
    {
      id: 'preflight',
      title: 'Check tools and settings',
      async run(ctx) {
        if (deployHelpOn(ctx) && !providerFor(ctx.hosting)) {
          return { status: 'fail', error: `Deployment help has no provider for ${ctx.hosting}. Turn it off and deploy there yourself, following references/hosting/other.md.` };
        }
        const r = await exec('node', [script('preflight.mjs'), '--region', ctx.region, '--entry-point', ctx.entryPoint, '--hosting', ctx.hosting], { cwd: workDir(ctx) });
        const out = parseJson(r.stdout);
        if (!out) return { status: 'fail', error: `preflight printed no JSON: ${tail(r.stderr || r.stdout)}` };
        // The session step owns the login, so an expired session is not a preflight failure.
        const bad = out.checks.filter((c) => c.required && !c.ok && c.name !== 'Merchant Center session');
        return bad.length
          ? { status: 'fail', error: bad.map((c) => `${c.name}: ${c.detail}`).join('; ') }
          : { status: 'done' };
      },
    },
    {
      id: 'session',
      title: 'Merchant Center sign-in',
      isDone: async () => deps.sessionValid(),
      // `mc-scripts login` never exits on its own (its callback server stays up after "Login
      // successful"), so it runs in the background and the credentials file is the signal. Each
      // re-check comes back here; the session's wait screen gives the user the quit key meanwhile.
      async run(ctx, log) {
        if (deps.sessionValid()) {
          ctx.login?.kill();
          ctx.login = null;
          return { status: 'done' };
        }
        if (ctx.login && !ctx.login.running()) {
          ctx.login = null;
          return { status: 'fail', error: 'The login ended without a valid session. Run the session again to retry the login.' };
        }
        if (!ctx.login) {
          log('Finish the login in the browser. It should open by itself; if not, open this URL:');
          ctx.login = deps.startLogin({ mcApiUrl: mcApiUrlForRegion(ctx.region), cwd: workDir(ctx), onLine: log });
        }
        return { status: 'wait', reason: 'Waiting for you to finish the login in the browser.', pollMs: 2000 };
      },
    },
    {
      id: 'scaffold',
      title: 'Create the app',
      isDone: async (ctx) => deps.exists(`${ctx.appDir}/custom-application-config.mjs`),
      async run(ctx, log) {
        // Connect builds with npm or yarn only, so a Connect-hosted app is scaffolded with npm.
        const r = await exec('npx', [
          '@commercetools-frontend/create-mc-app@latest', ctx.appDir, '--template', ctx.template,
          '--entry-point-uri-path', ctx.entryPoint, '--initial-project-key', ctx.projectKey,
          '--cloud-identifier', ctx.region, '--package-manager', packageManager, '--yes',
        ], { onLine: log });
        const created = deps.exists(`${ctx.appDir}/package.json`);
        // create-mc-app exits non-zero on pnpm's ignored build scripts even though the app is complete;
        // the build step fixes that. Anything else without an app is a real failure.
        if (!created) return { status: 'fail', error: `create-mc-app failed (exit ${r.code}): ${tail(r.stderr || r.stdout)}` };
        if (r.code !== 0 && !/IGNORED_BUILDS/.test(`${r.stdout}${r.stderr}`)) {
          return { status: 'fail', error: `create-mc-app failed (exit ${r.code}): ${tail(r.stderr || r.stdout)}` };
        }
        const configPath = `${ctx.appDir}/custom-application-config.mjs`;
        const config = await deps.readFile(configPath);
        const label = ctx.menuLabel.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        await deps.writeFile(configPath, config.replace(/defaultLabel:\s*'[^']*'/, `defaultLabel: '${label}'`));
        // create-mc-app refuses an existing folder, so the plan and the log waited beside it. Move them in.
        const planInside = `${ctx.appDir}/install-plan.json`;
        if (ctx.installPlan && ctx.installPlan !== planInside && deps.exists(ctx.installPlan)) {
          await deps.rename(ctx.installPlan, planInside);
          ctx.installPlan = planInside;
        }
        const logInside = `${ctx.appDir}/.mc-onboarding/session.log`;
        if (ctx.logPath && ctx.logPath !== logInside && deps.relocateLog) {
          deps.relocateLog(logInside);
          ctx.logPath = logInside;
        }
        // A provider may need files around the app (Connect: connect.yaml and .gitignore at the
        // repository root, and the url as an environment reference).
        await provider?.afterScaffold?.(ctx, { exec, must, log, deps, script, tail });
        return { status: 'done', detail: ctx.appDir };
      },
    },
    {
      id: 'git-init',
      title: 'Initialise git',
      // The folder's own .git, not "inside a work tree": an app nested in another repository still
      // gets its own. Connect's repository root is where its provider already runs git. The
      // session log lives in .mc-onboarding/, so the repository ignores it.
      isDone: async (ctx) => {
        const dir = ctx.repoDir ?? ctx.appDir;
        return deps.exists(`${dir}/.git`) && (await ignoresOnboarding(`${dir}/.gitignore`));
      },
      async run(ctx, log) {
        const dir = ctx.repoDir ?? ctx.appDir;
        await must(ctx, log, 'git init', 'git', ['init', '-b', 'main'], { cwd: dir });
        const file = `${dir}/.gitignore`;
        if (!(await ignoresOnboarding(file))) {
          const current = deps.exists(file) ? await deps.readFile(file) : '';
          await deps.writeFile(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${ONBOARDING_IGNORE}\n`);
        }
        return { status: 'done', detail: dir };
      },
    },
    {
      id: 'build',
      title: 'Install dependencies and build',
      async run(ctx, log) {
        if (packageManager === 'pnpm') {
          await must(ctx, log, 'allow-builds', 'node', [script('allow-builds.mjs'), '--app-dir', ctx.appDir]);
          await must(ctx, log, 'pnpm build', 'pnpm', ['build']);
        } else {
          await must(ctx, log, `${packageManager} run build`, packageManager, ['run', 'build'], { env: provider?.buildEnv?.(ctx) });
        }
        return { status: 'done' };
      },
    },
    {
      id: 'register',
      title: 'Register the app (Draft)',
      async run(ctx, log) {
        return fromRegister(await exec('node', registerArgs(ctx, false), { cwd: ctx.appDir, onLine: log }), { allowDeploy: true });
      },
    },
    {
      id: 'deploy',
      title: provider ? `Deploy to ${provider.label}` : 'Deploy',
      async run(ctx, log) {
        if (!deployHelpOn(ctx)) {
          // Deployment help is off: the user deploys. We only need to learn where it lives.
          if (!ctx.productionUrl) return { status: 'wait', reason: 'Deploy the app yourself, then enter its production URL (https).', input: 'url' };
          if (!/^https:\/\/[^\s/]+\S*$/.test(ctx.productionUrl)) {
            const bad = ctx.productionUrl;
            ctx.productionUrl = undefined;
            return { status: 'wait', reason: `"${bad}" is not an https URL. Enter the production URL again.`, input: 'url' };
          }
          return { status: 'done', detail: `using ${ctx.productionUrl}` };
        }
        // The provider owns the rest: sign-in and account questions, the site, the build, the
        // deploy, and reading back the served URL into ctx.productionUrl.
        return provider.deploy(ctx, { exec, must, log, deps, script, tail });
      },
    },
    {
      id: 'check',
      title: 'Check the host serves the app',
      async run(ctx, log) {
        const r = await exec('node', [script('verify.mjs'), '--production-url', ctx.productionUrl, '--project-key', ctx.openProjectKey, '--entry-point', ctx.entryPoint, '--region', ctx.region], { cwd: ctx.appDir, onLine: log });
        const out = parseJson(r.stdout);
        if (out?.ok) {
          if (!out.openInBrowser) return { status: 'fail', error: 'The host check passed but gave no app URL to open in the browser.' };
          ctx.openUrl = out.openInBrowser;
          return { status: 'done', detail: ctx.productionUrl };
        }
        const why = out?.hostCheck?.problems?.join(' ') ?? out?.error ?? tail(r.stderr || r.stdout);
        // Two answers no amount of waiting fixes: a certificate this machine cannot verify (even
        // through curl), and the host's own access protection in front of the domain, which the
        // provider recognises and explains.
        if (/NODE_EXTRA_CA_CERTS|UNABLE_TO_GET_ISSUER|UNABLE_TO_VERIFY_LEAF|SELF_SIGNED|CERT_HAS_EXPIRED|CERT_UNTRUSTED/.test(why)) return { status: 'fail', error: why };
        const guard = provider ?? { protectedPattern: /returned 40[13]\b/, protectedHint: (w) => `${w} A 401 or 403 from the host means access protection covers this domain. Turn it off at the host, then press r.` };
        if (guard.protectedPattern.test(why)) return { status: 'fail', error: guard.protectedHint(why) };
        // Otherwise the deploy is still propagating: poll, and say so as progress, not as a problem.
        ctx.hostTries = (ctx.hostTries ?? 0) + 1;
        const max = ctx.hostAttempts ?? 12;
        if (ctx.hostTries >= max) {
          ctx.hostTries = 0; // r starts a fresh round, not a single check
          return { status: 'fail', error: `${why} The host still did not serve the app after ${max} checks.` };
        }
        return { status: 'wait', reason: `Waiting for the host to serve the app, attempt ${ctx.hostTries} of ${max}. Last answer: ${why}`, polling: true };
      },
    },
    {
      id: 'finish',
      title: 'Sync URL, make Ready, install',
      async run(ctx, log) {
        return fromRegister(await exec('node', registerArgs(ctx, true), { cwd: ctx.appDir, onLine: log }), { allowDeploy: false });
      },
    },
    {
      id: 'open',
      title: 'Open the app in the browser',
      async run(ctx) {
        if (!ctx.openUrl) return { status: 'fail', error: 'No app URL to open: the host check did not record one.' };
        const { cmd, args } = openCommand(deps.platform, ctx.openUrl);
        await exec(cmd, args, { cwd: ctx.appDir });
        return { status: 'done', detail: ctx.openUrl };
      },
    },
  ];

  // A thrown error (a failed command) is a failed step with the message, never a crash.
  return steps.map((step) => ({
    ...step,
    async run(ctx, log) {
      try {
        return await step.run(ctx, log);
      } catch (e) {
        return { status: 'fail', error: e.message };
      }
    },
  }));
}
