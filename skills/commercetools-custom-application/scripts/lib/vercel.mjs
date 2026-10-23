// Vercel specifics for the deploy stage, as pure functions over CLI output and files.

// The deploy prints several URLs. Trust, in order: the Aliased line (the stable domain), the
// Production line, then a lone *.vercel.app URL (what CLI 63 prints on stdout: the deployment
// URL, which changes with every deploy). An Inspect link or anything else is never a result.
// CLI 63 writes the table without colons, with a ▲ before Aliased and cursor escapes in between.
export function parseDeployUrl(output) {
  const text = String(output ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const url = '(https:\\/\\/[a-z0-9.-]+)';
  const line = (label) => text.match(new RegExp(`^[^a-z0-9\\n]*${label}:?\\s+${url}(?:[\\s\\[/]|$)`, 'im'))?.[1];
  const aliased = line('Aliased');
  if (aliased) return aliased;
  const production = line('Production');
  if (production) return production;
  return text.match(/^\s*(https:\/\/[a-z0-9.-]+\.vercel\.app)\s*$/m)?.[1] ?? null;
}

// The table from `vercel teams ls`: an optional ✔ on the current team, then id, team name and
// plan in columns two or more spaces apart (a name may contain single spaces). Chatter lines
// ("Fetching teams") have one column and are skipped, as is the header.
export function parseVercelTeams(text) {
  const rows = [];
  for (const raw of String(text ?? '').split('\n')) {
    const current = /^\s*✔/.test(raw);
    const cells = raw.replace(/^\s*✔?\s*/, '').trim().split(/\s{2,}/);
    if (cells.length < 2 || cells[0].toLowerCase() === 'id') continue;
    rows.push({ id: cells[0], name: cells[1], plan: cells[2] ?? '', current });
  }
  return rows;
}

// CLI 63 without a terminal does not print "Multiple teams found". It prints a JSON payload,
// `{ status: 'action_required', reason: 'missing_scope', choices: [{ id, name }] }`, after a
// line or two of chatter. Returns the teams in the shape parseVercelTeams uses ([] when the
// payload names none), or null when the text is not that payload.
export function parseMissingScope(text) {
  const s = String(text ?? '');
  const from = s.indexOf('{');
  const to = s.lastIndexOf('}');
  if (from < 0 || to < from) return null;
  let payload;
  try {
    payload = JSON.parse(s.slice(from, to + 1));
  } catch {
    return null;
  }
  if (payload?.reason !== 'missing_scope') return null;
  return (Array.isArray(payload.choices) ? payload.choices : [])
    .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string')
    .map((c) => ({ id: c.id, name: c.name, plan: '', current: false }));
}

// The stable production domain of a linked project, from .vercel/project.json.
export function productionUrlFor(project) {
  return project?.projectName ? `https://${project.projectName}.vercel.app` : null;
}

// Project settings as code, so a local `vercel build` needs no dashboard state. A custom app is a
// single-page app and the Merchant Center proxy needs index.html for every path, with status 200.
export const VERCEL_JSON = {
  framework: null,
  buildCommand: 'pnpm build',
  outputDirectory: 'public',
  rewrites: [{ source: '/(.*)', destination: '/index.html' }],
};
