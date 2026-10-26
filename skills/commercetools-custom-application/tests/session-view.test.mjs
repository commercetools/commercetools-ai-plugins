import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionLines, progressBar, SPINNER } from '../scripts/lib/session-view.mjs';
import { initSession, reduceSession } from '../scripts/lib/session.mjs';
import { createStyle, stripAnsi } from '../scripts/lib/style.mjs';

const off = createStyle({ color: false });
const on = createStyle({ color: true });
const steps = ['one', 'two', 'three', 'four'].map((id) => ({ id, title: id.toUpperCase(), run: async () => ({ status: 'done' }) }));
const apply = (s, ...events) => events.reduce(reduceSession, s);
const view = (state, over = {}) => sessionLines(state, { width: 80, frame: 0, st: off, appName: 'APP', logPath: '/app/.mc-onboarding/session.log', ...over });

test('the progress bar fills in proportion and always has the same width', () => {
  assert.equal(progressBar(0, 10), '░░░░░░░░░░');
  assert.equal(progressBar(0.5, 10), '█████░░░░░');
  assert.equal(progressBar(1, 10), '██████████');
  for (const f of [0, 0.01, 0.33, 0.99, 1]) assert.equal(progressBar(f, 10).length, 10);
});

test('the title shows the app and how many steps are done', () => {
  let s = apply(initSession(steps), { type: 'done', id: 'one' }, { type: 'skip', id: 'two' });
  const title = view(s)[0];
  assert.match(title, /APP/);
  assert.match(title, /2\/4/);
});

test('each status has its own icon, and the running step animates with the frame', () => {
  const s = apply(initSession(steps), { type: 'done', id: 'one' }, { type: 'start', id: 'two' }, { type: 'wait', id: 'two', reason: 'r' });
  const text = (frame) => view(apply(initSession(steps), { type: 'done', id: 'one' }, { type: 'start', id: 'two' }), { frame }).join('\n');
  const l = view(s).join('\n');
  assert.match(l, /✓ ONE/);
  assert.match(l, /! TWO/);
  assert.match(l, /○ THREE/);
  assert.notEqual(text(0), text(1));
  assert.ok(SPINNER.some((f) => text(0).includes(`${f} TWO`)));
});

test('a failed step shows ✗, its error, where the full log is, and the retry and quit keys', () => {
  const s = apply(initSession(steps), { type: 'fail', id: 'one', error: 'vercel build failed (exit 1): boom' });
  const l = view(s).join('\n');
  assert.match(l, /✗ ONE/);
  assert.match(l, /vercel build failed \(exit 1\): boom/);
  assert.match(l, /\/app\/\.mc-onboarding\/session\.log/);
  assert.match(l, /r retry/);
  assert.match(l, /q quit/);
});

test('a failed step that needs an answer shows the input box instead of the retry key', () => {
  const s = apply(initSession(steps), { type: 'fail', id: 'one', error: 'Your Vercel account has several teams.' });
  const l = view(s, { input: { label: 'Vercel team id', value: 'acme' } }).join('\n');
  assert.match(l, /Vercel team id/);
  assert.match(l, /> acme/);
  assert.match(l, /enter/);
  assert.match(l, /esc quit/);
  assert.doesNotMatch(l, /r retry/);
});

test('a long error or reason wraps onto more lines instead of being cut off, so every word is readable', () => {
  const error = 'The Vercel CLI is not signed in. Run `vercel login` in another terminal and then press enter here, or paste a token from vercel.com/account/tokens.';
  const s = apply(initSession(steps), { type: 'fail', id: 'one', error });
  const lines = view(s, { width: 80, input: { label: 'Vercel token (leave empty to retry after vercel login)', value: '' } });
  for (const l of lines) assert.ok(l.length <= 80, `${l.length} > 80: ${l}`);
  const text = lines.join('\n');
  for (const word of ['vercel.com/account/tokens', 'press enter here', 'leave empty to retry']) assert.ok(text.includes(word), `missing: ${word}`);
  assert.doesNotMatch(text, /~$/m);
  const waiting = apply(initSession(steps), { type: 'wait', id: 'two', reason: 'word '.repeat(40).trim() });
  assert.ok(view(waiting, { width: 60 }).filter((l) => /^\s+word/.test(l)).length >= 3);
});

test('a long log path wraps too, so the whole path can be copied', () => {
  const logPath = '/private/tmp/claude-502/-Users-byronwall/08f0fb9b-194a-48f3-935c-b06a6e091b8c/scratchpad/teamapp/.mc-onboarding/session.log';
  const s = apply(initSession(steps), { type: 'fail', id: 'one', error: 'boom' });
  const lines = view(s, { width: 80, logPath });
  for (const l of lines) assert.ok(l.length <= 80, `${l.length} > 80: ${l}`);
  const text = lines.join('\n');
  assert.match(text, /Full log:/);
  assert.ok(text.includes('session.log'), 'the end of the path is shown');
  assert.doesNotMatch(text, /~$/m);
  // The path is split only at slashes, so every piece is a copyable path segment.
  const pathLines = lines.slice(lines.findIndex((l) => l.includes('Full log:'))).filter((l) => /^\s{5}\S/.test(l) && !/r retry/.test(l));
  assert.equal(pathLines.map((l) => l.trim().replace(/^Full log: /, '')).join(''), logPath);
});

test('the input box label wraps on a narrow terminal, with the prompt line under it', () => {
  const s = apply(initSession(steps), { type: 'fail', id: 'one', error: 'not signed in' });
  const lines = view(s, { width: 40, input: { label: 'Vercel token (leave empty to retry after vercel login)', value: 'x' } });
  for (const l of lines) assert.ok(l.length <= 40, `${l.length} > 40: ${l}`);
  const labelLines = lines.filter((l) => /Vercel token|leave empty|vercel login\)?:/.test(l));
  assert.ok(labelLines.length >= 2, `label did not wrap: ${JSON.stringify(labelLines)}`);
  assert.ok(labelLines.join(' ').includes('after vercel login):'), 'the whole label is there');
  const prompt = lines.findIndex((l) => /^\s+> x/.test(l));
  assert.ok(prompt > lines.indexOf(labelLines.at(-1)), 'the prompt follows the last label line');
});

test('a list input shows one row per option with the cursor marked, and the choose keys', () => {
  const s = apply(initSession(steps), { type: 'fail', id: 'one', error: 'Your Vercel account has several teams.' });
  const options = [{ id: 'acme-projects', name: 'acme projects', plan: 'hobby', current: true }, { id: 'commercetools', name: 'commercetools', plan: 'pro', current: false }];
  const lines = view(s, { input: { label: 'Vercel team', options, cursor: 1 } });
  const text = lines.join('\n');
  assert.match(text, /Vercel team:/);
  assert.match(text, /^\s+acme-projects\s+acme projects\s+hobby\s+current$/m, 'the current team is marked, but not chosen');
  assert.match(text, /^\s+▸ commercetools\s+commercetools\s+pro$/m, 'the cursor row is marked');
  assert.doesNotMatch(text, /▸ acme/);
  assert.match(text, /↑↓ choose\s+enter use it\s+esc quit/);
  assert.doesNotMatch(text, />/, 'no typing prompt in list mode');
  const rows = lines.filter((l) => /acme-projects|▸ commercetools/.test(l));
  assert.equal(rows[0].indexOf('acme-projects'), rows[1].indexOf('commercetools'), 'ids line up in a column');
});

test('given the terminal height, the frame never exceeds it: the log tail shrinks first, then disappears', () => {
  let s = apply(initSession(steps), { type: 'done', id: 'one' }, { type: 'start', id: 'two' });
  for (let i = 0; i < 30; i += 1) s = apply(s, { type: 'log', id: 'two', line: `line ${i}` });
  s = apply(s, { type: 'fail', id: 'two', error: 'x '.repeat(80) });
  const tall = view(s, { logLines: 20, rows: 40 });
  assert.ok(tall.length <= 40, `${tall.length} > 40`);
  assert.match(tall.join('\n'), /line 29/);
  const mid = view(s, { logLines: 20, rows: 20 });
  assert.ok(mid.length <= 20, `${mid.length} > 20`);
  assert.match(mid.join('\n'), /line 29/, 'the newest log line is kept while any log fits');
  assert.match(mid.join('\n'), /r retry/, 'the controls are always on screen');
  const small = view(s, { logLines: 20, rows: 12 });
  assert.ok(small.length <= 12, `${small.length} > 12`);
  assert.match(small.join('\n'), /r retry/);
  assert.doesNotMatch(small.join('\n'), /output/, 'no room for a log tail: the output box goes entirely');
  assert.ok(view(s, { logLines: 20 }).length > 20, 'without a height the log tail is capped by logLines only');
});

test('a secret input shows dots instead of what was typed', () => {
  const s = apply(initSession(steps), { type: 'fail', id: 'one', error: 'not signed in' });
  const l = view(s, { input: { label: 'Vercel token', value: 'abc123', secret: true } }).join('\n');
  assert.doesNotMatch(l, /abc123/);
  assert.match(l, /> ••••••/);
});

test('a waiting step shows what it waits for and how to continue, with a countdown when given', () => {
  const s = apply(initSession(steps), { type: 'wait', id: 'one', reason: 'Open the verification link sent to a@b.co.' });
  const l = view(s, { nextCheckIn: 7 }).join('\n');
  assert.match(l, /verification link/);
  assert.match(l, /7s/);
  assert.match(l, /r.*now/i);
});

test('a polling wait looks like work in progress: spinner, no warning colour, the countdown and the keys', () => {
  const s = apply(initSession(steps), { type: 'wait', id: 'one', reason: 'Checking the host, attempt 2 of 12. Last answer: App path returned 404.', polling: true });
  const plain = view(s, { nextCheckIn: 7 });
  const stepLine = plain.find((l) => /ONE/.test(l));
  assert.ok(SPINNER.some((f) => stepLine.includes(`${f} ONE`)), `spinner expected on: ${stepLine}`);
  assert.doesNotMatch(stepLine, /! ONE/);
  assert.notEqual(view(s, { nextCheckIn: 7, frame: 1 }).find((l) => /ONE/.test(l)), stepLine, 'it animates');
  const text = plain.join('\n');
  assert.match(text, /attempt 2 of 12/);
  assert.match(text, /next check in 7s/);
  assert.match(text, /r check now/);
  assert.match(text, /q quit/);
  const coloured = view(s, { nextCheckIn: 7, st: on }).join('\n');
  assert.doesNotMatch(coloured, /\x1b\[33m/, 'nothing in yellow: this is not a problem');
  const user = apply(initSession(steps), { type: 'wait', id: 'one', reason: 'Open the verification link sent to a@b.co.' });
  assert.match(view(user).join('\n'), /! ONE/, 'a wait that needs the user keeps the warning mark');
});

test('only the active step shows its log tail, and only the last lines fit', () => {
  let s = initSession(steps);
  s = apply(s, { type: 'start', id: 'two' });
  for (let i = 0; i < 12; i += 1) s = apply(s, { type: 'log', id: 'two', line: `line ${i}` });
  s = apply(s, { type: 'done', id: 'one', detail: '' });
  s.steps[0].log = ['OLD LOG LINE'];
  const l = view(s, { logLines: 4 }).join('\n');
  assert.match(l, /line 11/);
  assert.match(l, /line 8/);
  assert.doesNotMatch(l, /line 7\b/);
  assert.doesNotMatch(l, /OLD LOG LINE/);
});

test('a done step shows its detail dimmed beside it', () => {
  const s = apply(initSession(steps), { type: 'done', id: 'one', detail: 'https://x.vercel.app' });
  assert.match(view(s).join('\n'), /✓ ONE.*https:\/\/x\.vercel\.app/);
});

test('an input prompt shows under the waiting step with the typed text', () => {
  const s = apply(initSession(steps), { type: 'wait', id: 'one', reason: 'Enter the production URL.' });
  const l = view(s, { input: { label: 'Production URL', value: 'https://my' } }).join('\n');
  assert.match(l, /Production URL/);
  assert.match(l, /> https:\/\/my/);
});

test('no line is wider than the terminal, even with long details and logs', () => {
  let s = apply(initSession(steps), { type: 'start', id: 'one' }, { type: 'log', id: 'one', line: 'x'.repeat(300) }, { type: 'done', id: 'two', detail: 'y'.repeat(300) });
  for (const w of [40, 80]) {
    for (const line of view(s, { width: w, st: on })) assert.ok(stripAnsi(line).length <= w, `${stripAnsi(line).length} > ${w}`);
  }
});

test('with color off there are no escape codes at all', () => {
  const s = apply(initSession(steps), { type: 'done', id: 'one' }, { type: 'start', id: 'two' });
  assert.equal(view(s).join('\n').includes('\x1b['), false);
});
