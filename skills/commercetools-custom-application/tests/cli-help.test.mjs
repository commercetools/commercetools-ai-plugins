import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderHelp, toParseArgsOptions } from '../scripts/lib/cli-help.mjs';

const OPTIONS = {
  region: { type: 'string', arg: 'id', description: 'Cloud identifier of the Project.' },
  list: { type: 'boolean', default: false, description: 'Print and exit.' },
};
const doc = {
  name: 'demo.mjs',
  summary: 'Does a demo.',
  description: 'Longer text about the demo.',
  synopsis: ['demo.mjs --region <id> [--list]'],
  options: OPTIONS,
  exit: { 0: 'Fine.', 1: 'Not fine.' },
  examples: [['Run it', 'demo.mjs --region gcp-eu']],
};

test('toParseArgsOptions keeps only what util.parseArgs understands, including multiple', () => {
  assert.deepEqual(toParseArgsOptions(OPTIONS), {
    region: { type: 'string' },
    list: { type: 'boolean', default: false },
  });
  assert.deepEqual(toParseArgsOptions({ set: { type: 'string', multiple: true, arg: 'k=v', description: 'Repeatable.' } }), { set: { type: 'string', multiple: true } });
});

test('help has the man page sections in order', () => {
  const text = renderHelp(doc);
  const at = ['NAME', 'SYNOPSIS', 'DESCRIPTION', 'OPTIONS', 'EXIT STATUS', 'EXAMPLES'].map((h) => text.indexOf(`\n${h}\n`));
  assert.ok(at.every((i) => i >= 0), `missing section: ${at}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test('help documents every option with its argument name and description', () => {
  const text = renderHelp(doc);
  assert.match(text, /--region <id>/);
  assert.match(text, /Cloud identifier of the Project\./);
  assert.match(text, /--list\b/);
  assert.match(text, /Print and exit\./);
});

test('help shows the name line, exit codes and examples', () => {
  const text = renderHelp(doc);
  assert.match(text, /demo\.mjs - Does a demo\./);
  assert.match(text, /0\s+Fine\./);
  assert.match(text, /1\s+Not fine\./);
  assert.match(text, /Run it/);
  assert.match(text, /demo\.mjs --region gcp-eu/);
});

// The scripts must document exactly what they parse: every option, in --help, exit 0, no side effects.
const script = (n) => fileURLToPath(new URL(`../scripts/${n}`, import.meta.url));
for (const [file, flags] of [
  ['install-plan.mjs', ['--region', '--out', '--list', '--fixture', '--vim', '--help']],
  ['onboard.mjs', ['--app-name', '--app-dir', '--contact-email', '--project-key', '--menu-label', '--template', '--install-plan', '--hosting', '--deploy-help', '--production-url', '--region', '--entry-point', '--org-id', '--poll', '--yes', '--fixture', '--help']],
  ['register.mjs', ['--app-dir', '--project-key', '--install-plan', '--contact-email', '--production-url', '--org-id', '--org-name', '--region', '--entry-point', '--dry-run', '--help']],
  ['headless.mjs', ['--app-name', '--region', '--project-key', '--entry-point', '--menu-label', '--contact-email', '--app-dir', '--template', '--hosting', '--install-plan', '--org-id', '--deploy-help', '--production-url', '--set', '--confirmed', '--poll', '--poll-limit', '--fixture', '--help']],
]) {
  test(`${file} --help exits 0 and documents every option`, () => {
    const r = spawnSync('node', [script(file), '--help'], { encoding: 'utf8', timeout: 10000 });
    assert.equal(r.status, 0, r.stderr);
    for (const f of flags) assert.ok(r.stdout.includes(f), `${file} --help does not mention ${f}`);
  });
}
