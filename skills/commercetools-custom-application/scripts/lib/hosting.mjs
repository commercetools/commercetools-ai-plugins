// Provider-specific tooling checks. The skill itself is provider agnostic: it needs a stable
// https URL, an SPA rewrite and the public/ output (see references/hosting/other.md).
// This table only exists so preflight can catch a missing or logged-out CLI early for the
// providers that have one. A provider absent from the table is fine, it just gets no CLI checks.
// Hosts with deployment help contribute their CLI from scripts/lib/providers/; the rest are
// hosts the user deploys to by hand but whose CLI is still worth checking.
import { PROVIDERS as DEPLOYERS } from './providers/index.mjs';

export const PROVIDERS = {
  ...Object.fromEntries(Object.values(DEPLOYERS).map((p) => [p.id, p.cli])),
  surge: { name: 'surge', install: 'npm i -g surge', login: { args: ['whoami'], hint: 'run `surge login`' } },
};

// `run(cmd, args)` returns trimmed stdout, or null when the command is missing or fails.
export function hostingChecks(provider, run) {
  if (!provider) return [];
  const p = PROVIDERS[provider];
  if (!p) {
    return [{
      name: `hosting: ${provider}`,
      ok: true,
      required: false,
      detail: `No CLI checks for ${provider}. Follow references/hosting/other.md.`,
    }];
  }
  const version = run(p.name, ['--version']);
  const checks = [{
    name: `${p.name} CLI installed`,
    ok: version !== null,
    required: true,
    detail: version ?? `not found (${p.install})`,
  }];
  if (version !== null) {
    const who = run(p.name, p.login.args);
    checks.push({
      name: `${p.name} CLI logged in`,
      ok: who !== null,
      required: !['vercel', 'netlify', 'cloudflare'].includes(provider),
      detail: who ?? p.login.hint,
    });
  }
  return checks;
}
