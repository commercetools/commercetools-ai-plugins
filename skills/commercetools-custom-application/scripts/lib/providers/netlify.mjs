// Netlify: the deploy step's body when deployment help is on. The CLI (netlify-cli 27) answers
// `--json` on the commands used here, so nothing is scraped from prose. A token, when the CLI is
// not signed in, travels as NETLIFY_AUTH_TOKEN in the environment, never on the command line.
import path from 'node:path';

// The CLI prints human lines before its JSON on some commands. The JSON is the last block that
// starts a line with { or [.
export function lastJson(text) {
  const lines = String(text ?? '').split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!/^\s*[[{]/.test(lines[i])) continue;
    try {
      return JSON.parse(lines.slice(i).join('\n'));
    } catch {
      // keep looking further up for the start of the block
    }
  }
  return null;
}

export const NETLIFY_TOML = `[build]
  command = "pnpm build"
  publish = "public"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;

const NOT_SIGNED_IN = /Not logged in|Authentication required|NETLIFY_AUTH_TOKEN|token is invalid|token .*expired|netlify login/i;

export const netlify = {
  id: 'netlify',
  label: 'Netlify',
  cli: { name: 'netlify', install: 'npm i -g netlify-cli', login: { args: ['status'], hint: 'run `netlify login`' } },
  planLines: () => [
    'netlify status, or sites:create          find the linked site, or create one and learn its URL',
    'write netlify.toml                       single-page rewrite, build output in public/',
    'pnpm build                               build locally',
    'netlify deploy --prod --no-build         upload that build',
    'check that the host answers the way the Merchant Center proxy expects',
  ],
  protectedPattern: /returned 40[13]\b/,
  protectedHint: (why) => `${why} A 401 or 403 from the host means Netlify site protection (a password or visitor access control) covers this site. Turn it off under Site configuration, Access & security, then press r.`,

  async deploy(ctx, { exec, must, log, deps, script, tail }) {
    await must(ctx, log, 'allow-builds', 'node', [script('allow-builds.mjs'), '--app-dir', ctx.appDir]);
    const env = ctx.netlifyToken ? { NETLIFY_AUTH_TOKEN: ctx.netlifyToken } : undefined;
    const opts = { cwd: ctx.appDir, onLine: log, env };
    const token = { ctx: 'netlifyToken', label: 'Netlify personal access token (leave empty to retry after netlify login)', secret: true };

    const status = await exec('netlify', ['status', '--json'], opts);
    const info = lastJson(status.stdout);
    if (!info) {
      const text = `${status.stdout}\n${status.stderr}`;
      if (status.code !== 0 || NOT_SIGNED_IN.test(text)) {
        ctx.netlifyToken = undefined;
        return { status: 'fail', error: 'The Netlify CLI is not signed in. Run `netlify login` in another terminal and then press enter here, or paste a personal access token from the Netlify user settings.', input: token };
      }
      throw new Error(`netlify status printed no JSON: ${tail(text)}`);
    }

    let siteName;
    let planned;
    if (info.linked && info.siteData) {
      siteName = info.siteData['site-name'];
      planned = info.siteData['site-url'];
    } else {
      // No site yet. The team is the user's choice when there are several; the CLI would pick
      // the default by itself, which is exactly what must not happen.
      const teams = lastJson((await exec('netlify', ['teams:list', '--json'], { cwd: ctx.appDir, env })).stdout) ?? [];
      const options = teams.map((t) => ({ id: t.slug, name: t.name, plan: t.type_name ?? '', current: Boolean(t.default) }));
      let team = ctx.netlifyTeam ?? (options.length === 1 ? options[0].id : null);
      if (!team) {
        if (options.length > 1) return { status: 'fail', error: 'Your Netlify account has several teams. Pick the one to create the site in.', input: { ctx: 'netlifyTeam', label: 'Netlify team', options } };
        team = undefined;
      }
      const name = path.basename(ctx.appDir);
      const create = await exec('netlify', ['sites:create', '--name', name, ...(team ? ['--account-slug', team] : []), '--json'], opts);
      const site = lastJson(create.stdout);
      if (create.code !== 0 || !site?.name) throw new Error(`netlify sites:create failed (exit ${create.code}): ${tail(`${create.stdout}\n${create.stderr}`)}`);
      siteName = site.name;
      planned = site.ssl_url || site.url;
    }
    if (!/^https:\/\//.test(planned ?? '')) return { status: 'fail', error: `Netlify reported no https URL for the site ${siteName}.` };

    await deps.writeFile(`${ctx.appDir}/netlify.toml`, NETLIFY_TOML);
    const build = async (url) => {
      await must(ctx, log, 'patch-config', 'node', [script('patch-config.mjs'), '--app-dir', ctx.appDir, '--url', url]);
      await must(ctx, log, 'pnpm build', 'pnpm', ['build']);
      const r = await must(ctx, log, 'netlify deploy', 'netlify', ['deploy', '--prod', '--no-build', '--dir', 'public', '--site', siteName, '--json'], opts);
      const out = lastJson(r.stdout);
      if (!out?.url) throw new Error(`Could not find the production URL in the deploy output: ${tail(`${r.stdout}\n${r.stderr}`)}`);
      return out.url;
    };
    let url = await build(planned);
    if (url !== planned) {
      log(`Netlify serves ${url}, not ${planned}. Rebuilding with the real URL.`);
      url = await build(url);
    }
    ctx.productionUrl = url;
    return { status: 'done', detail: url };
  },
};
