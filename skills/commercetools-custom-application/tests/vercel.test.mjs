import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeployUrl, parseMissingScope, parseVercelTeams, productionUrlFor, VERCEL_JSON } from '../scripts/lib/vercel.mjs';
import { openCommand } from '../scripts/lib/open-browser.mjs';

test('deploy output: prefers the Aliased/Production URL over the deployment URL', () => {
  const out = `Vercel CLI 63.1.2
Inspect: https://vercel.com/team/proj/abc123 [2s]
Production: https://proj-abc123-team.vercel.app [18s]
Aliased: https://proj.vercel.app [18s]`;
  assert.equal(parseDeployUrl(out), 'https://proj.vercel.app');
});

// Vercel CLI 63 prints the table without colons, with a ▲ before Aliased and cursor-movement
// escapes, and the bare deployment URL on stdout. The Aliased line is the stable domain and wins.
test('deploy output of Vercel CLI 63: the Aliased line wins over the bare deployment URL on stdout', () => {
  const stdout = 'https://maybe-ill-see-this-bz1u2wkpg-commercetools.vercel.app\n';
  const stderr = [
    'Vercel CLI 63.1.2', 'Deploying maybe-ill-see-this-one', 'Uploading [====================] (97.2KB/97.2KB)',
    '  Inspect         https://vercel.com/commercetools/maybe-ill-see-this-one/FQi8mpo6ixZmpeRr5sWG3kGzPFpd',
    '  Production      https://maybe-ill-see-this-bz1u2wkpg-commercetools.vercel.app', 'Building…',
    '\x1b[2K\x1b[1A\x1b[2K\x1b[G  Production      https://maybe-ill-see-this-bz1u2wkpg-commercetools.vercel.app', 'Completing…',
    '▲ Aliased         https://maybe-ill-see-this-one-pi.vercel.app', '', '✓ Ready in 4s', '',
    '! Deployment Protection is on for this project (Vercel Authentication). Use `vercel curl` to access it.',
    'Next steps:', '- Check the production response:', '  vercel curl https://maybe-ill-see-this-one-pi.vercel.app --scope commercetools',
    '- View build logs:', '  vercel inspect maybe-ill-see-this-bz1u2wkpg-commercetools.vercel.app --logs --scope commercetools',
  ].join('\n');
  assert.equal(parseDeployUrl(`${stdout}\n${stderr}`), 'https://maybe-ill-see-this-one-pi.vercel.app');
  const noAlias = stderr.split('\n').filter((l) => !l.includes('Aliased')).join('\n');
  assert.equal(parseDeployUrl(`${stdout}\n${noAlias}`), 'https://maybe-ill-see-this-bz1u2wkpg-commercetools.vercel.app', 'without an alias the Production line is next');
});

test('deploy output: falls back to the Production line, then to a lone vercel.app URL on stdout', () => {
  assert.equal(parseDeployUrl('Production: https://proj-abc-team.vercel.app [3s]'), 'https://proj-abc-team.vercel.app');
  assert.equal(parseDeployUrl('https://proj.vercel.app\n'), 'https://proj.vercel.app');
});

test('deploy output: never returns an Inspect page, and returns null when there is nothing to trust', () => {
  assert.equal(parseDeployUrl('Inspect: https://vercel.com/team/proj/abc [2s]'), null);
  assert.equal(parseDeployUrl('Error: something broke'), null);
  assert.equal(parseDeployUrl(''), null);
});

test('the stable production URL comes from the linked project name', () => {
  assert.equal(productionUrlFor({ projectName: 'this-is-a-test' }), 'https://this-is-a-test.vercel.app');
  assert.equal(productionUrlFor({}), null);
  assert.equal(productionUrlFor(null), null);
});

test('the project config rewrites every path to index.html and builds into public/ with no framework preset', () => {
  assert.deepEqual(VERCEL_JSON.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
  assert.equal(VERCEL_JSON.framework, null);
  assert.equal(VERCEL_JSON.outputDirectory, 'public');
  assert.equal(VERCEL_JSON.buildCommand, 'pnpm build');
});

test('the browser command is chosen per platform and never goes through a shell string', () => {
  assert.deepEqual(openCommand('darwin', 'https://x'), { cmd: 'open', args: ['https://x'] });
  assert.deepEqual(openCommand('linux', 'https://x'), { cmd: 'xdg-open', args: ['https://x'] });
  assert.deepEqual(openCommand('win32', 'https://x'), { cmd: 'cmd', args: ['/c', 'start', '', 'https://x'] });
});

// `vercel teams ls` prints a table: an optional ✔ on the current team, then id, name and plan in
// columns two or more spaces apart. The name may contain single spaces.
test('the team table from vercel teams ls becomes rows with id, name, plan and which one is current', () => {
  const real = [
    'Vercel CLI 63.1.2', 'Fetching teams', 'Fetching user information', '',
    '  id                           Team name                     Plan      ',
    "✔ byronwall-5402s-projects     byronwall-5402's projects     hobby     ",
    '  commercetools                commercetools                 pro       ', '',
  ].join('\n');
  assert.deepEqual(parseVercelTeams(real), [
    { id: 'byronwall-5402s-projects', name: "byronwall-5402's projects", plan: 'hobby', current: true },
    { id: 'commercetools', name: 'commercetools', plan: 'pro', current: false },
  ]);
  assert.deepEqual(parseVercelTeams('Error: something else\n'), []);
  assert.deepEqual(parseVercelTeams(''), []);
});

// Captured from Vercel CLI 63.1.2 `vercel link --yes` with several teams and no terminal. It
// prints this JSON instead of the older "Multiple teams found" sentence.
const MISSING_SCOPE = `Vercel CLI 63.1.2
Loading teams…
{
  "status": "action_required",
  "reason": "missing_scope",
  "message": "Provide --team or --scope explicitly. No default is applied in non-interactive mode.",
  "choices": [
    { "id": "team_3BDQ8EAHMqSSluXWnNTbzPsp", "name": "byronwall-5402s-projects" },
    { "id": "team_2p5rIhVqKRQrDrj1AEggz8vt", "name": "commercetools" }
  ],
  "next": [
    { "command": "vercel link --yes --scope byronwall-5402s-projects", "when": "Link first (then run any command without --scope)" }
  ],
  "hint": "Run one of the commands in next[] to complete without prompting."
}
`;

test('a missing_scope payload yields the teams to choose from, ids from the payload', () => {
  assert.deepEqual(parseMissingScope(MISSING_SCOPE), [
    { id: 'team_3BDQ8EAHMqSSluXWnNTbzPsp', name: 'byronwall-5402s-projects', plan: '', current: false },
    { id: 'team_2p5rIhVqKRQrDrj1AEggz8vt', name: 'commercetools', plan: '', current: false },
  ]);
});

test('missing_scope with no choices is still recognised, as an empty list', () => {
  assert.deepEqual(parseMissingScope('{"status":"action_required","reason":"missing_scope"}'), []);
});

test('other output is not a missing_scope payload', () => {
  assert.equal(parseMissingScope('Error: Multiple teams found.'), null);
  assert.equal(parseMissingScope('{"status":"action_required","reason":"something_else","choices":[{"id":"a","name":"b"}]}'), null);
  assert.equal(parseMissingScope('{"reason": "missing_scope", broken'), null);
  assert.equal(parseMissingScope(''), null);
});

test('only http(s) URLs may be opened', () => {
  assert.throws(() => openCommand('darwin', 'file:///etc/passwd'), /https?/);
  assert.throws(() => openCommand('darwin', 'javascript:alert(1)'), /https?/);
  assert.throws(() => openCommand('darwin', ''), /https?/);
});
