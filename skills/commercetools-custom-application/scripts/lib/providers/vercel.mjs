// Vercel: the deploy step's body when deployment help is on. Pure in the same sense as the steps:
// every effect goes through `tools` ({ exec, must, log, deps, script, tail }), so the sequence and
// the failure messages are unit tested with a fake machine.
import { VERCEL_JSON, parseDeployUrl, parseMissingScope, parseVercelTeams, productionUrlFor } from '../vercel.mjs';

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const vercel = {
  id: 'vercel',
  label: 'Vercel',
  cli: { name: 'vercel', install: 'npm i -g vercel', login: { args: ['whoami'], hint: 'run `vercel login`' } },
  planLines: () => [
    'vercel link --yes                      create or link the project, learn the production URL',
    'write vercel.json                      single-page rewrite, build output in public/',
    'vercel pull, then vercel build --prod  build locally',
    'vercel deploy --prebuilt --prod        upload that build',
    'check that the host answers the way the Merchant Center proxy expects',
  ],
  // A 401 or 403 from the production domain is Deployment Protection, which no retry fixes.
  protectedPattern: /returned 40[13]\b/,
  protectedHint: (why) => `${why} A 401 or 403 from the host means Vercel Deployment Protection covers this domain. Turn it off for the project at vercel.com (project Settings, Deployment Protection), then press r.`,

  async deploy(ctx, { exec, must, log, deps, script, tail }) {
    await must(ctx, log, 'allow-builds', 'node', [script('allow-builds.mjs'), '--app-dir', ctx.appDir]);
    // The CLI will not pick a team without a terminal and may not be signed in. Both are
    // answered on the screen (team id, or a token) and carried on every Vercel command.
    const cmd = (args) => ['vercel', [...args, ...(ctx.vercelTeam ? ['--scope', ctx.vercelTeam] : []), ...(ctx.vercelToken ? ['--token', ctx.vercelToken] : [])]];
    const link = await exec(...cmd(['link', '--yes']), { cwd: ctx.appDir, onLine: log });
    if (link.code !== 0) {
      const text = `${link.stdout}\n${link.stderr}`;
      const team = { ctx: 'vercelTeam', label: 'Vercel team id' };
      const token = { ctx: 'vercelToken', label: 'Vercel token (leave empty to retry after vercel login)', secret: true };
      // CLI 63 lists the teams in a missing_scope payload; older CLIs say "Multiple teams found".
      const scoped = parseMissingScope(text);
      if (scoped?.length) return { status: 'fail', error: 'Your Vercel account has several teams. Pick the one to deploy to.', input: { ...team, label: 'Vercel team', options: scoped } };
      if (scoped || /Multiple teams found/i.test(text)) {
        // The team table becomes a list to pick from; if it cannot be read, it is shown as is
        // and the id is typed instead.
        const ls = await exec(...cmd(['teams', 'ls']), { cwd: ctx.appDir });
        const options = parseVercelTeams(`${ls.stdout}\n${ls.stderr}`);
        if (options.length) return { status: 'fail', error: 'Your Vercel account has several teams. Pick the one to deploy to.', input: { ...team, label: 'Vercel team', options } };
        for (const l of `${ls.stdout}\n${ls.stderr}`.split('\n').filter(Boolean)) log(l);
        return { status: 'fail', error: 'Your Vercel account has several teams. Type the id of the team to deploy to, from the list below.', input: team };
      }
      if (/scope does not exist/i.test(text)) {
        const wrong = ctx.vercelTeam;
        ctx.vercelTeam = undefined;
        return { status: 'fail', error: `Vercel has no team "${wrong}". Type the team id again.`, input: team };
      }
      if (/No existing credentials|token .* not valid|provide a valid token/i.test(text)) {
        ctx.vercelToken = undefined;
        return { status: 'fail', error: 'The Vercel CLI is not signed in. Run `vercel login` in another terminal and then press enter here, or paste a token from vercel.com/account/tokens.', input: token };
      }
      throw new Error(`vercel link failed (exit ${link.code}): ${tail(link.stderr || link.stdout)}`);
    }
    let project = null;
    try {
      project = parseJson(await deps.readFile(`${ctx.appDir}/.vercel/project.json`));
    } catch {
      project = null;
    }
    const planned = productionUrlFor(project);
    if (!planned) return { status: 'fail', error: 'Vercel linked the project but .vercel/project.json has no project name, so the production URL is unknown.' };
    await deps.writeFile(`${ctx.appDir}/vercel.json`, `${JSON.stringify(VERCEL_JSON, null, 2)}\n`);
    const build = async (url) => {
      await must(ctx, log, 'patch-config', 'node', [script('patch-config.mjs'), '--app-dir', ctx.appDir, '--url', url]);
      await must(ctx, log, 'vercel pull', ...cmd(['pull', '--yes', '--environment', 'production']));
      await must(ctx, log, 'vercel build', ...cmd(['build', '--prod']));
      const r = await must(ctx, log, 'vercel deploy', ...cmd(['deploy', '--prebuilt', '--prod']));
      const found = parseDeployUrl(`${r.stdout}\n${r.stderr}`);
      if (!found) throw new Error(`Could not find the production URL in the deploy output: ${tail(`${r.stdout}\n${r.stderr}`)}`);
      return found;
    };
    let url = await build(planned);
    if (url !== planned) {
      log(`Vercel serves ${url}, not ${planned}. Rebuilding with the real URL.`);
      url = await build(url);
    }
    ctx.productionUrl = url;
    return { status: 'done', detail: url };
  },
};
