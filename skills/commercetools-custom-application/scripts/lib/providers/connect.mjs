// commercetools Connect: the deploy step's body when the app is hosted by Connect itself.
// Connect builds the app from a Git tag of a GitHub repository, so this provider owns the
// repository (git and gh), a private Connector (ConnectorStaged, published without
// certification), and a sandbox Deployment whose application URL is the production URL.
// The step is re-entered while Connect publishes and deploys; every phase re-reads real state
// (the repository, the Connector, the Deployment), and the few facts that only this run knows
// (the tag it made, that it already asked for a publish or a deploy) live in ctx.
//
// Docs: https://docs.commercetools.com/merchant-center-customizations/deployment/commercetools-connect.md
import path from 'node:path';
import { connectHostFor, createConnectClient } from '../connect-api.mjs';
import { isCaError } from '../host-fetch.mjs';

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const POLL_MS = 15000;
const wait = (reason) => ({ status: 'wait', reason, polling: true, pollMs: POLL_MS });

// A publishing or deployment report, flattened to the messages a user can act on.
export function reportText(report) {
  const entries = report?.entries ?? report?.messages ?? (Array.isArray(report) ? report : null);
  if (entries?.length) return entries.map((e) => (typeof e === 'string' ? e : e.message ?? e.title ?? JSON.stringify(e))).join('; ');
  return report ? JSON.stringify(report) : 'no report';
}

export const connectYaml = ({ name, region }) => `deployAs:
  - name: ${name}
    applicationType: merchant-center-custom-application
    configuration:
      standardConfiguration:
        - key: CUSTOM_APPLICATION_ID
          description: The Custom Application ID
          required: true
        - key: ENTRY_POINT_URI_PATH
          description: The Application entry point URI path
          required: true
        - key: CLOUD_IDENTIFIER
          description: The cloud identifier
          default: '${region}'
`;

export const GITIGNORE = ['node_modules/', 'public/', '.mc-onboarding/', 'install-plan.json', '.env', '.env.local', '.env.*.local', '.vercel/', '.netlify/', ''].join('\n');

const applicationIdIn = (source) => String(source ?? '').match(/applicationId:\s*(['"])([^'"]+)\1/)?.[2] ?? null;

export const connect = {
  id: 'connect',
  label: 'commercetools Connect',
  // No CLI of its own: the Connect API is called directly. GitHub is the part with a CLI.
  cli: { name: 'gh', install: 'brew install gh', login: { args: ['auth', 'status'], hint: 'run `gh auth login`' } },
  packageManager: 'npm',
  planLines: () => [
    'git init, commit, gh repo create, tag     the app in a GitHub repository, at a tag Connect can fetch',
    'ConnectorStaged (private), publish        Connect validates and builds it; a few minutes',
    'Deployment (sandbox)                      Connect hosts the app; up to 15 minutes',
    'read the application URL back             that is the production URL',
    'check that the host answers the way the Merchant Center proxy expects',
  ],
  protectedPattern: /returned 40[13]\b/,
  protectedHint: (why) => `${why} A 401 or 403 from a Connect-hosted app usually means the Deployment is not serving yet or was undeployed. Check the Deployment in the Merchant Center (Connect, Installations), then press r.`,
  buildEnv: () => ({ APPLICATION_URL: 'https://your_app_hostname.com' }),

  async afterScaffold(ctx, { must, log, deps, script }) {
    const repoDir = ctx.repoDir ?? path.dirname(ctx.appDir);
    await deps.writeFile(`${repoDir}/connect.yaml`, connectYaml({ name: path.basename(ctx.appDir), region: ctx.region }));
    await deps.writeFile(`${repoDir}/.gitignore`, GITIGNORE);
    // Connect injects APPLICATION_URL at build time, so the config references it instead of a literal.
    await must(ctx, log, 'patch-config', 'node', [script('patch-config.mjs'), '--app-dir', ctx.appDir, '--url', '${env:APPLICATION_URL}']);
  },

  async deploy(ctx, { exec, must, log, deps, tail }) {
    const repoDir = ctx.repoDir ?? path.dirname(ctx.appDir);
    const slug = path.basename(ctx.appDir);
    const host = connectHostFor(ctx.region);
    if (!host) return { status: 'fail', error: `No Connect host is known for the cloud identifier ${ctx.region}.` };

    // 1. An API client for the Connect API, with the two scopes it needs for this Project.
    if (!ctx.ctClientId) {
      return { status: 'fail', error: `Connect needs an API client for the Project ${ctx.projectKey} with the scopes manage_connectors and manage_connectors_deployments (Merchant Center, Developer settings, API clients). Paste its client ID.`, input: { ctx: 'ctClientId', label: 'API client ID' } };
    }
    if (!ctx.ctClientSecret) return { status: 'fail', error: 'Now the secret of that API client. It is kept in memory for this session only.', input: { ctx: 'ctClientSecret', label: 'API client secret', secret: true } };
    const client = createConnectClient({ region: ctx.region, projectKey: ctx.projectKey, clientId: ctx.ctClientId, clientSecret: ctx.ctClientSecret, fetchImpl: deps.fetch });
    const api = async (what, fn) => {
      try {
        return await fn();
      } catch (e) {
        if (isCaError(e)) throw new Error(`${what}: Node could not verify the Connect API certificate (${e.cause?.code ?? e.code}). Set NODE_EXTRA_CA_CERTS to the trusted CA bundle and press r.`);
        throw e;
      }
    };
    try {
      await api('token', () => client.token());
    } catch (e) {
      if (e.status === 401 || e.status === 400) {
        ctx.ctClientSecret = undefined;
        return { status: 'fail', error: `Connect rejected the API client: ${e.message}. Paste the secret again, or create a new API client with the two scopes.`, input: { ctx: 'ctClientSecret', label: 'API client secret', secret: true } };
      }
      throw e;
    }

    // 2. The repository and the tag Connect will fetch. Done once per run; a later run tags again.
    if (!ctx.connectTag) {
      const git = (args) => exec('git', args, { cwd: repoDir, onLine: log });
      if ((await git(['rev-parse', '--is-inside-work-tree'])).code !== 0) await must(ctx, log, 'git init', 'git', ['init', '-b', 'main'], { cwd: repoDir });
      await must(ctx, log, 'git add', 'git', ['add', '-A'], { cwd: repoDir });
      if ((await git(['diff', '--cached', '--quiet'])).code !== 0) await must(ctx, log, 'git commit', 'git', ['commit', '-m', `Custom Application ${ctx.appName}`], { cwd: repoDir });
      if ((await exec('gh', ['auth', 'status'], { cwd: repoDir })).code !== 0) {
        return { status: 'fail', error: 'The GitHub CLI is not signed in, and Connect reads the app from GitHub. Run `gh auth login` in another terminal, then press r.' };
      }
      if ((await git(['remote', 'get-url', 'origin'])).code !== 0) {
        if (!ctx.ghVisibility) {
          return {
            status: 'fail',
            error: 'The repository has no GitHub remote yet. Pick its visibility: Connect reads a public repository over HTTPS; a private one needs the SSH URL and read access for the connect-mu machine user, which the session grants.',
            input: { ctx: 'ghVisibility', label: 'GitHub repository visibility', options: [{ id: 'public', name: 'public', plan: 'HTTPS url', current: false }, { id: 'private', name: 'private', plan: 'SSH url, connect-mu reads it', current: false }] },
          };
        }
        await must(ctx, log, 'gh repo create', 'gh', ['repo', 'create', slug, `--${ctx.ghVisibility}`, '--source', repoDir, '--remote', 'origin', '--push'], { cwd: repoDir });
      }
      const view = parseJson((await must(ctx, log, 'gh repo view', 'gh', ['repo', 'view', '--json', 'url,sshUrl,nameWithOwner,visibility'], { cwd: repoDir })).stdout);
      if (!view?.url) throw new Error('gh repo view printed no repository url.');
      const isPrivate = String(view.visibility ?? '').toUpperCase() === 'PRIVATE';
      if (isPrivate) await must(ctx, log, 'gh api collaborators', 'gh', ['api', '-X', 'PUT', `repos/${view.nameWithOwner}/collaborators/connect-mu`, '-f', 'permission=pull'], { cwd: repoDir });
      ctx.connectRepoUrl = isPrivate ? view.sshUrl : `${view.url}.git`;
      const tags = (await git(['tag', '--list', 'v0.1.*'])).stdout.split('\n').map((t) => Number(t.trim().match(/^v0\.1\.(\d+)$/)?.[1] ?? 0));
      const tag = `v0.1.${Math.max(0, ...tags) + 1}`;
      await must(ctx, log, 'git tag', 'git', ['tag', tag], { cwd: repoDir });
      await must(ctx, log, 'git push', 'git', ['push', 'origin', 'main', tag], { cwd: repoDir });
      ctx.connectTag = tag;
    }

    // 3. The Connector, as a draft pointing at this tag.
    const key = slug;
    const repository = { url: ctx.connectRepoUrl, tag: ctx.connectTag };
    let staged = await api('get connector', () => client.getStaged(key));
    if (!staged) {
      staged = await api('create connector', () => client.createStaged({
        key,
        name: ctx.appName,
        description: `Merchant Center Custom Application ${ctx.appName}`,
        creator: { email: ctx.contactEmail },
        repository,
        supportedRegions: [host],
        privateProjects: [`${host}:${ctx.projectKey}`],
      }));
      log(`Created the Connector draft ${key} (version ${staged.version}).`);
    } else if (staged.repository?.tag !== repository.tag || staged.repository?.url !== repository.url) {
      staged = await api('set repository', () => client.updateStaged(key, staged.version, [{ action: 'setRepository', repository }]));
      log(`Pointed the Connector draft ${key} at ${repository.tag}.`);
    }

    // 4. Publish for private use. Connect validates, scans and builds; that takes minutes.
    if (!ctx.connectPublished) {
      if (staged.status === 'Published' && !staged.hasChanges) {
        ctx.connectPublished = true;
      } else {
        staged = await api('publish', () => client.updateStaged(key, staged.version, [{ action: 'publish', certification: false }]));
        ctx.connectPublished = true;
        return wait(`Connect is validating and publishing the Connector ${key} at ${repository.tag}. This takes a few minutes.`);
      }
    }
    if (staged.status === 'Failed') return { status: 'fail', error: `Connect could not publish the Connector ${key}: ${reportText(staged.publishingReport)}. Fix the code, then press r to tag and publish again.` };
    if (staged.status !== 'Published' || staged.hasChanges) return wait(`Connect is still publishing the Connector ${key} (status ${staged.status}).`);

    // 5. The sandbox Deployment of that Connector in the Project, with the app's identity.
    const depKey = `${key}-sandbox`;
    const applicationId = applicationIdIn(await deps.readFile(`${ctx.appDir}/custom-application-config.mjs`));
    if (!applicationId || applicationId === 'TODO') return { status: 'fail', error: 'The config has no applicationId yet. Registration (the step before) must run first.' };
    const configurations = [{
      applicationName: slug,
      standardConfiguration: [
        { key: 'CUSTOM_APPLICATION_ID', value: applicationId },
        { key: 'ENTRY_POINT_URI_PATH', value: ctx.entryPoint },
        { key: 'CLOUD_IDENTIFIER', value: ctx.region },
      ],
    }];
    let dep = await api('get deployment', () => client.getDeployment(depKey));
    if (!dep) {
      dep = await api('create deployment', () => client.createDeployment({ key: depKey, connector: { key, version: staged.version, staged: false }, region: host, type: 'sandbox', configurations }));
      ctx.connectDeployed = true;
      return wait(`Connect is deploying ${depKey} (status ${dep.status}). A first deployment can take up to 15 minutes.`);
    }
    if (!ctx.connectDeployed) {
      dep = await api('redeploy', () => client.updateDeployment(depKey, dep.version, [{ action: 'redeploy', updateConnector: true }]));
      ctx.connectDeployed = true;
      return wait(`Connect is redeploying ${depKey} with the new Connector version (status ${dep.status}).`);
    }
    if (dep.status === 'Failed') return { status: 'fail', error: `Connect could not deploy ${depKey}: ${reportText(dep.details?.report ?? dep.details)}. Fix the cause, then press r to redeploy.` };
    if (dep.status !== 'Deployed') return wait(`Connect is still deploying ${depKey} (status ${dep.status}).`);
    const url = dep.applications?.find((a) => a.url)?.url;
    if (!url) return { status: 'fail', error: `The Deployment ${depKey} is Deployed but reports no application url: ${tail(JSON.stringify(dep.applications ?? []))}` };
    ctx.productionUrl = url;
    return { status: 'done', detail: url };
  },
};
