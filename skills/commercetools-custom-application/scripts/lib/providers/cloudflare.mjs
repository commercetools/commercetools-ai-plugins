// Cloudflare Pages: the deploy step's body when deployment help is on. Wrangler (4.x) answers
// `--json` on whoami and project list; project create and deploy print prose, and only the
// create line is read (the deploy prints the hashed deployment URL, which is never used). A token
// and the account id travel as CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
import path from 'node:path';
import { lastJson } from './netlify.mjs';

// The stable domain of a Pages project is <name>.pages.dev; a project may also carry custom
// domains, which come first in the dashboard. The pages.dev one is what the session plans with.
export function pagesDomain(domains) {
  const list = String(domains ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  return list.find((d) => d.endsWith('.pages.dev')) ?? list[0] ?? null;
}

export const parseCreatedUrl = (text) => String(text ?? '').match(/available at (https:\/\/[^\s/]+)\/?/)?.[1] ?? null;

export const cloudflare = {
  id: 'cloudflare',
  label: 'Cloudflare Pages',
  cli: { name: 'wrangler', install: 'npm i -g wrangler', login: { args: ['whoami', '--json'], hint: 'run `wrangler login`' } },
  planLines: () => [
    'wrangler whoami, pages project list      find or create the Pages project, learn its domain',
    'pnpm build                               build locally (Pages serves index.html for unknown paths)',
    'wrangler pages deploy public             upload that build to the production branch',
    'check that the host answers the way the Merchant Center proxy expects',
  ],
  // Cloudflare Access answers with a redirect to its login page, or 401/403 for API clients.
  protectedPattern: /returned 40[13]\b|cloudflareaccess\.com/i,
  protectedHint: (why) => `${why} That is Cloudflare Access in front of the domain. Remove the Access application for it in Zero Trust (Access, Applications), then press r.`,

  async deploy(ctx, { exec, must, log, script, tail }) {
    await must(ctx, log, 'allow-builds', 'node', [script('allow-builds.mjs'), '--app-dir', ctx.appDir]);
    const token = { ctx: 'cfToken', label: 'Cloudflare API token (leave empty to retry after wrangler login)', secret: true };
    const baseEnv = ctx.cfToken ? { CLOUDFLARE_API_TOKEN: ctx.cfToken } : {};

    const who = await exec('wrangler', ['whoami', '--json'], { cwd: ctx.appDir, onLine: log, env: baseEnv });
    const me = lastJson(who.stdout);
    if (who.code !== 0 || !me) {
      ctx.cfToken = undefined;
      return { status: 'fail', error: 'Wrangler is not signed in. Run `wrangler login` in another terminal and then press enter here, or paste an API token with Pages edit rights from the Cloudflare dashboard.', input: token };
    }
    const accounts = (me.accounts ?? []).map((a) => ({ id: a.id, name: a.name, plan: '', current: false }));
    let account = ctx.cfAccount ?? (accounts.length === 1 ? accounts[0].id : null);
    if (!account && accounts.length > 1) return { status: 'fail', error: 'Your Cloudflare login has several accounts. Pick the one to deploy to.', input: { ctx: 'cfAccount', label: 'Cloudflare account', options: accounts } };
    const env = { ...baseEnv, ...(account ? { CLOUDFLARE_ACCOUNT_ID: account } : {}) };
    const opts = { cwd: ctx.appDir, onLine: log, env };

    const name = ctx.cfProject ?? path.basename(ctx.appDir);
    const list = lastJson((await exec('wrangler', ['pages', 'project', 'list', '--json'], opts)).stdout) ?? [];
    const existing = list.find((p) => p['Project Name'] === name);
    let planned;
    if (existing) {
      const domain = pagesDomain(existing['Project Domains']);
      if (!domain) return { status: 'fail', error: `The Pages project ${name} exists but lists no domain.` };
      planned = `https://${domain}`;
    } else {
      const create = await exec('wrangler', ['pages', 'project', 'create', name, '--production-branch', 'main'], opts);
      planned = parseCreatedUrl(create.stdout);
      if (create.code !== 0 || !planned) {
        return { status: 'fail', error: `Cloudflare did not create the Pages project ${name}: ${tail(`${create.stdout}\n${create.stderr}`)} Type another project name.`, input: { ctx: 'cfProject', label: 'Cloudflare Pages project name' } };
      }
    }

    // No rewrite file: without a 404.html, Pages serves the root for every unknown path, which
    // is exactly the single-page behaviour the Merchant Center proxy needs. The host check proves it.
    await must(ctx, log, 'patch-config', 'node', [script('patch-config.mjs'), '--app-dir', ctx.appDir, '--url', planned]);
    await must(ctx, log, 'pnpm build', 'pnpm', ['build']);
    await must(ctx, log, 'wrangler pages deploy', 'wrangler', ['pages', 'deploy', 'public', '--project-name', name, '--branch', 'main', '--commit-dirty=true'], opts);
    ctx.productionUrl = planned;
    return { status: 'done', detail: planned };
  },
};
