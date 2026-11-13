// commercetools AI plugin: usage reporting hook. What it sends is listed in
// PRIVACY.md. Generated from .internal/hook-scripts/telemetry.mjs; edit there.
//
// Usage: node hooks/telemetry.mjs <client-type> <mode> [trigger]
//   client-type  claude-code, cursor or codex
//   mode         activation  the payload names the skill (Claude Code's Skill tool)
//                prompt      the user typed `$commercetools-…` (Codex)
//                resource    every matching path is a file read, SKILL.md too
//                auto        a SKILL.md read is an activation, any other a read
//   trigger      user-invoked or model-invoked, for activations
//
// Reads the hook payload (JSON) on stdin and sends one GET request per event to
// docs.commercetools.com, and nothing else. Never prints, always exits 0.
// Claude Code runs it directly, with `async: true`; Cursor and Codex run
// hooks/telemetry.sh, which hands the payload over in the background.
//
// The installation ID, the session and the email domain are the same state
// the skill scripts keep (see instrumentation.mjs, inlined below).
//
// Off when COMMERCETOOLS_AI_PLUGIN_TELEMETRY is 0 or off, or when the plugin's
// "Share usage data" setting is off.
//
// Debugging: run it by hand with COMMERCETOOLS_AI_PLUGIN_TELEMETRY_DEBUG=1 and a
// payload on stdin. It prints every decision to stderr and writes no log file.

// --- inlined from .internal/skill-scripts/instrumentation.mjs — do not edit here ---
/**
 * Shared instrumentation helpers for the commercetools skill scripts.
 *
 * Installed into every skill's scripts/ dir by the build; edit the canonical
 * copy at .internal/skill-scripts/instrumentation.mjs.
 *
 * What is sent: skill name, host app, model, plugin version, random installation
 * and invocation ids, the commercetools project key and region when the agent
 * already knows them, and the domain of the developer's email address. Never
 * file contents, paths, or the part of an email address before the @. Off when
 * COMMERCETOOLS_AI_PLUGIN_TELEMETRY=0, or when the user turned off the plugin's
 * "Share usage data" setting in Claude Code.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Substituted at install time from .internal/config.json. The one field in the
// payload that is verified rather than self-reported by the model.
const PLUGIN_VERSION = '0.77.0';

// The plugin's "Share usage data" setting in Claude Code. Hooks get it as
// CLAUDE_PLUGIN_OPTION_TELEMETRY; commands the agent runs don't, so read it
// where Claude Code saves it: pluginConfigs in the user settings, keyed
// "<plugin>@<marketplace>", as { "options": { "telemetry": false } } (the docs
// omit the "options" level, so both are read). Any marketplace counts.
// No settings file means not set. A file that exists but can't be read (a
// sandbox denying the home folder) counts as off: the choice is unknown.
const claudeSettingOff = () => {
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  let text;
  try {
    text = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8');
  } catch (err) {
    return err?.code !== 'ENOENT' && err?.code !== 'ENOTDIR';
  }
  try {
    const configs = JSON.parse(text).pluginConfigs;
    return Object.entries(configs || {}).some(([id, values]) => {
      if (!/^commercetools(-labs)?@/.test(id)) return false;
      const value = values?.options?.telemetry ?? values?.telemetry;
      return value === false || value === 'false';
    });
  } catch {
    return false;
  }
};

/** The opt-out switches: the environment variable, or the Claude Code setting. */
const telemetryDisabled = () =>
  process.env.COMMERCETOOLS_AI_PLUGIN_TELEMETRY === '0' ||
  process.env.COMMERCETOOLS_AI_PLUGIN_TELEMETRY === 'off' ||
  // How Claude Code hands the setting to a hook.
  process.env.CLAUDE_PLUGIN_OPTION_TELEMETRY === 'false' ||
  claudeSettingOff();

/**
 * Resolve the skill name from the script's own location rather than asking the
 * model for it: scripts live at <...>/skills/<skill-name>/scripts/<file>.mjs in
 * every runtime, including the Codex build-time copy. An explicit --skill-name
 * still wins, so existing invocations keep working.
 */
const resolveSkillName = (importMetaUrl, override) => {
  if (override) return override;
  try {
    const parts = path.dirname(fileURLToPath(importMetaUrl)).split(path.sep);
    // .../<skill-name>/scripts  ->  second-to-last segment
    const name = parts[parts.length - 2];
    return name && name !== '' ? name : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Whether this skill is running as part of the plugin or was installed on its
 * own (`npx skills install`). Worth knowing, because the two have different
 * telemetry coverage — a standalone skill registers no hooks, so its passive
 * reference reads are invisible — and because standalone copies do not
 * auto-update, which makes their version distribution a different question.
 *
 * Detected by looking for a plugin manifest above the skill, covering both the
 * shared root layout and the nested Codex one. Never reports a path.
 */
const installKind = (importMetaUrl) => {
  try {
    const scriptsDir = path.dirname(fileURLToPath(importMetaUrl));
    const pluginRoot = path.resolve(scriptsDir, "..", "..", "..");
    const manifests = [
      "plugin.json",
      path.join(".claude-plugin", "plugin.json"),
      path.join(".cursor-plugin", "plugin.json"),
      path.join(".codex-plugin", "plugin.json"),
    ];
    return manifests.some((m) => fs.existsSync(path.join(pluginRoot, m)))
      ? 'plugin'
      : 'standalone';
  } catch {
    return undefined;
  }
};

/**
 * A random id for this installation, stable across sessions and reboots. It is
 * what answers "the same person came back", which no per-session id can.
 *
 * Deliberately NOT removed when telemetry is switched off. The switch is an
 * environment variable, so it is naturally per-shell and per-directory; a
 * session that happens to have it set should not destroy state belonging to
 * sessions that do not. Opting out stops us sending, which is what it says.
 * Nothing is written while telemetry is off either, so a machine that has never
 * had it on never gets the file.
 *
 * Contains nothing derived from the user or the machine — it is random bytes.
 */
const INSTALL_DIR = '.commercetools';
const INSTALL_FILE = 'ai-plugin-install-id';

// Home first, then the temp dir. A sandbox commonly denies $HOME while allowing
// temp writes (nono's default profile does exactly that), and such a sandbox is
// often kept for a whole task rather than rebuilt per command — so a temp-scoped
// id still identifies something real, just something shorter-lived than an
// install. Reported as installIdSource so the two are never confused:
//
//   home  durable — survives reboots, the real "did this install come back"
//   temp  lives as long as the temp dir does; a rebuilt sandbox is a new id
//
// Written 0600 so a shared /tmp on a multi-user host does not hand one id to
// two people.
const installLocations = () => [
  { source: 'home', file: path.join(os.homedir(), INSTALL_DIR, INSTALL_FILE) },
  { source: 'temp', file: path.join(os.tmpdir(), `ct-${INSTALL_FILE}`) },
];

const installId = () => {
  const locations = (() => {
    try {
      return installLocations();
    } catch {
      return [];
    }
  })();

  // Read pass first: prefer an id that already exists, in precedence order, so
  // a machine that once wrote a home id keeps using it.
  for (const { source, file } of locations) {
    try {
      const existing = fs.readFileSync(file, 'utf8').trim();
      if (/^[a-f0-9]{32}$/.test(existing)) return { id: existing, source };
    } catch {
      // Not readable here — try the next location.
    }
  }

  // Write pass: create in the most durable location that accepts it. An id we
  // cannot persist is a new id on every call, so it is never returned.
  for (const { source, file } of locations) {
    try {
      const fresh = crypto.randomBytes(16).toString('hex');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, fresh + '\n', { mode: 0o600 });
      if (fs.readFileSync(file, 'utf8').trim() === fresh) return { id: fresh, source };
    } catch {
      // Unwritable here — try the next location.
    }
  }

  return undefined;
};

/**
 * Best-effort invocation id, so an activation and the calls that follow it can be
 * stitched together in our server logs without the model carrying any state.
 *
 * Shared with the editor hooks through one file at a fixed path. That matters:
 * the hooks know the real session id and the scripts do not, so whenever hooks
 * are present they seed this file and the scripts adopt the same id, putting
 * both layers in one correlation space. Without hooks (Copilot, or Codex before its
 * hooks are trusted) the first script call mints one.
 *
 * The path is fixed rather than derived from the working directory, because the
 * agent runs these scripts from the INSTALLED SKILL directory — identical for
 * every project on the machine — so a cwd-derived key correlated nothing and
 * silently merged unrelated projects.
 *
 * Every failure mode (read-only tmp, sandboxed fs, concurrent writers) resolves
 * to `undefined`, which sends the parameter empty. Correlation is a nice to have,
 * never a reason to fail or complain.
 *
 * Known limitation: two agent sessions running concurrently on one machine share
 * the file and therefore the id. Analysis should treat it as "one working
 * session, probably", not as an identity.
 */
const INVOCATION_TTL_MS = 30 * 60 * 1000;

// One file PER CLIENT FAMILY, not one shared file. A single shared file let a
// Claude Code hook's session leak into Codex and Copilot runs minutes later on
// the same machine: they adopted its id and its `host` marker, so three
// unrelated sessions in three different tools reported as one authoritative
// session. Scoping by family keeps each tool's correlation to itself.
//
// Home first, like the install id: the hook writes only to ~/.commercetools/
// (a hook that runs curl must name its write targets literally), so that is
// where its host session id is. A sandbox that denies home leaves temp, which
// the hook reads too. Reading takes the newer of the two.
const invocationFiles = (appName) => {
  const family = clientFamily(appName) || 'unknown';
  return [
    path.join(os.homedir(), INSTALL_DIR, `ai-plugin-invocation-${family}.json`),
    path.join(os.tmpdir(), `ct-ai-plugin-invocation-${family}.json`),
  ];
};

/** The newer of the two session files, if it is still fresh; otherwise null. */
const readInvocation = (appName) => {
  const now = Date.now();
  let state = null;
  for (const file of invocationFiles(appName)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed.id === 'string' && now - parsed.ts < INVOCATION_TTL_MS &&
          (!state || parsed.ts > state.ts)) {
        state = parsed;
      }
    } catch {
      // No usable state here — try the other location.
    }
  }
  return state;
};

/** Stores the session state in home, or in temp where home isn't writable. */
const writeInvocation = (appName, state) => {
  for (const file of invocationFiles(appName)) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
      return true;
    } catch {
      // Unwritable here: try temp.
    }
  }
  return false;
};

const invocationId = (appName, project = {}) => {
  try {
    const now = Date.now();
    const state = readInvocation(appName);

    // `src` records where the id came from, because the two cases mean
    // different things: `host` is a real session boundary reported by an editor
    // hook, `local` is this file's time window standing in for one. Without it
    // the same column silently mixes both.
    // Fields this script does not own (the hook's lastSkill) are carried over,
    // since both layers rewrite the same file.
    const next = state
      ? { ...state, ts: now, seq: (state.seq || 1) + 1, src: state.src || 'local' }
      : { id: crypto.randomBytes(16).toString('hex'), ts: now, seq: 1, src: 'local' };

    // The commercetools project rides along with the session: the agent passes
    // it once, when it happens to know it, and every later call — including
    // the schema scripts, whose instructions never mention it, and the hook
    // events — reports it from here. Scoped to the session rather than the
    // installation on purpose: developers switch repositories and partners
    // switch customers. The latest value the agent passed wins.
    const passed = Boolean(project.key || project.region);
    next.ctProjectKey = project.key || state?.ctProjectKey;
    next.ctRegion = project.region || state?.ctRegion;
    // `model` unless the caller knows better, e.g. a key read from an MCP server URL.
    next.ctProjectSource = passed ? project.source || 'model' : state?.ctProjectSource;

    // Failing both locations, the id still counts for this call.
    writeInvocation(appName, next);
    return next;
  } catch {
    return undefined;
  }
};

/**
 * The commercetools project key and region, as the agent passed them.
 *
 * Deliberately NOT validated against a notion of "real": a wrong value costs a
 * row that analysis drops, and telling a model not to guess does not work
 * anyway. The check only keeps out what could never be a key — placeholders
 * copied verbatim from the instructions, whitespace, anything long enough to be
 * a pasted secret. A region given as a host is reduced to the region part,
 * the form the SDKs use: `europe-west1.gcp`, `us-east-2.aws`.
 */
const PLAIN_VALUE = /^[A-Za-z0-9_.-]{1,64}$/;

const cleanProjectKey = (value) => {
  const key = plain(value);
  return PLAIN_VALUE.test(key) ? key : undefined;
};

const cleanRegion = (value) => {
  const region = plain(value)
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^(api|auth|mc|mc-api|mcp)\./, '')
    .replace(/\.commercetools\.com$/, '');
  return PLAIN_VALUE.test(region) ? region : undefined;
};

/**
 * The domain of the developer's email address — which company, or which
 * partner, the work is done by. Never the part before the @.
 *
 * Precedence: what the host states, then what we stored, then git.
 *
 *   host  An editor hook that is handed the signed-in user's email (Cursor)
 *         writes the domain to the file below on every event, so the host's
 *         answer always overwrites ours.
 *   file  Stored per installation, next to the installation id. Read first so
 *         git runs once per installation rather than once per call.
 *   git   `git config user.email`, only when nothing is stored. Run from the
 *         scripts, never from the hooks.
 *
 * Nothing is filtered: a personal or placeholder domain is worth seeing in the
 * data rather than hiding as a blank.
 */
const EMAIL_DOMAIN_FILE = 'ai-plugin-email-domain';

const emailDomainLocations = () => [
  path.join(os.homedir(), INSTALL_DIR, EMAIL_DOMAIN_FILE),
  path.join(os.tmpdir(), `ct-${EMAIL_DOMAIN_FILE}`),
];

const domainOf = (email) => {
  const value = String(email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at === -1) return undefined;
  const domain = value.slice(at + 1);
  return /^[a-z0-9.-]{1,253}$/.test(domain) ? domain : undefined;
};

// macOS ships /usr/bin/git on every machine as a placeholder that, without
// developer tools, opens an install dialog instead of running. A presence check
// cannot tell it apart, so git is not run when the git PATH would pick is that
// placeholder and the tools it forwards to are missing.
const firstGitIsMacPlaceholder = () => {
  if (process.platform !== 'darwin') return false;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, 'git');
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
    } catch {
      continue;
    }
    return (
      candidate === '/usr/bin/git' &&
      !['/var/db/xcode_select_link', '/Library/Developer/CommandLineTools/usr/bin/git'].some((p) =>
        fs.existsSync(p),
      )
    );
  }
  return false;
};

// The domain of `git config user.email`. Only the domain leaves this function:
// the address is reduced to the part after the @ right where git returns it,
// and never stored or sent.
const gitEmailDomain = () => {
  try {
    if (firstGitIsMacPlaceholder()) return undefined;
    return domainOf(
      execFileSync('git', ['config', '--get', 'user.email'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1500,
        windowsHide: true,
      }),
    );
  } catch {
    return undefined;
  }
};

const safeEmailDomainLocations = () => {
  try {
    return emailDomainLocations();
  } catch {
    return [];
  }
};

/** The stored domain and its source, without running git; undefined if none. */
const storedEmailDomain = () => {
  for (const file of safeEmailDomainLocations()) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      const domain = domainOf(`@${stored.domain}`);
      if (domain) return { domain, source: stored.source || 'git' };
    } catch {
      // Nothing usable here — try the next location.
    }
  }
  return undefined;
};

/** Stores a domain in home, or in temp where home isn't writable. */
const storeEmailDomain = ({ domain, source }) => {
  for (const file of safeEmailDomainLocations()) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ domain, source }) + '\n', { mode: 0o600 });
      return true;
    } catch {
      // Unwritable here — try the next location.
    }
  }
  return false;
};

const emailDomain = () => {
  const stored = storedEmailDomain();
  if (stored) return stored;
  const domain = gitEmailDomain();
  if (!domain) return undefined;
  // Sent even when it could not be stored: unlike the installation id it is
  // not random, so the next call reads the same value again.
  storeEmailDomain({ domain, source: 'git' });
  return { domain, source: 'git' };
};

/**
 * The coarse vendor behind a clientType, sent alongside it.
 *
 * clientType is precise and therefore discontinuous: the same runtime has been
 * reported as "Codex" (the --client-name era), "claude" (short --app-name) and
 * now "claude-code" (the closed list that matches what the hooks send). Folding
 * belongs in the data, not in whatever query language happens to be reading the
 * logs, so it ships as its own field.
 *
 * Substring match rather than splitting on the first hyphen: "vscode-copilot"
 * is copilot, not vscode.
 */
const CLIENT_FAMILIES = ['claude', 'copilot', 'codex', 'cursor'];

const clientFamily = (appName) => {
  if (!appName) return undefined;
  const value = String(appName).toLowerCase();
  return (
    CLIENT_FAMILIES.find((f) => value.includes(f)) ||
    value.split(/[^a-z0-9]+/).filter(Boolean)[0]
  );
};

// A value as sent: an unknown value is an empty string, never "null" or
// "undefined". An empty parameter means "not known in this situation"; a
// parameter that is missing altogether means this client doesn't report it.
const plain = (value) => {
  const text = value == null ? '' : String(value).trim();
  return text === 'null' || text === 'undefined' ? '' : text;
};

/**
 * The User-Agent of the request. Nothing when telemetry is off: the request
 * itself still runs, it just carries no identifying metadata.
 */
const instrumentationHeaders = ({ appName, model }) =>
  telemetryDisabled() ? {} : { 'User-Agent': `${plain(appName) || 'unknown'}/1.0 (${plain(model) || 'unknown'})` };

/**
 * The usage fields, on the query string with the same names on every endpoint,
 * so one log filter covers all of them. Every field is set, empty when unknown.
 */
const applyInstrumentationParams = (
  url,
  { appName, model, skillName, source, importMetaUrl, projectKey, region, projectSource },
) => {
  if (telemetryDisabled()) return;
  const identity = installId();
  const invocation = invocationId(appName, {
    key: cleanProjectKey(projectKey),
    region: cleanRegion(region),
    source: projectSource,
  });
  const email = emailDomain();
  const fields = {
    skillName,
    clientType: appName,
    clientFamily: clientFamily(appName),
    model,
    pluginVersion: PLUGIN_VERSION,
    source: source || 'script',
    install: importMetaUrl ? installKind(importMetaUrl) : undefined,
    installId: identity?.id,
    installIdSource: identity?.source,
    invocation: invocation?.id,
    invocationSource: invocation?.src,
    seq: invocation?.seq,
    ctProjectKey: invocation?.ctProjectKey,
    ctRegion: invocation?.ctRegion,
    ctProjectSource: invocation?.ctProjectSource,
    emailDomain: email?.domain,
    emailDomainSource: email?.source,
  };
  for (const [name, value] of Object.entries(fields)) url.searchParams.set(name, plain(value));
};
// --- end instrumentation.mjs ---

const [hookClient = '', hookMode = '', hookTrigger = ''] = process.argv.slice(2);
// This file is <plugin>/hooks/telemetry.mjs, for every vendor.
const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url));

const DEFAULT_ENDPOINT = 'https://docs.commercetools.com/apis/rest/tools/ai-plugin-telemetry';
const MAX_EVENTS = 10;
const SKILL = '(commercetools-[a-z0-9-]+)';
const IN_SKILL = '(SKILL\\.md|references(?:/[A-Za-z0-9_./-]*)?)';

const dbg = (message) => {
  if (process.env.COMMERCETOOLS_AI_PLUGIN_TELEMETRY_DEBUG !== '1') return;
  const time = new Date().toISOString().slice(11, 19);
  process.stderr.write(`${time} ${hookClient.padEnd(11)} ${hookMode.padEnd(10)} ${message}\n`);
};

// A local receiver for testing is the only other place it may send to.
const hookEndpoint = () => {
  const custom = process.env.COMMERCETOOLS_AI_PLUGIN_TELEMETRY_ENDPOINT || '';
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+(\/|$)/.test(custom) ? custom : DEFAULT_ENDPOINT;
};

const readStdin = () =>
  new Promise((resolve) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { text += chunk; });
    process.stdin.on('end', () => resolve(text));
    process.stdin.on('error', () => resolve(text));
  });

// ---------------------------------------------------------------------------
// The payload: which skills and which of their files it names.
// ---------------------------------------------------------------------------

// The first string value of `key`, depth first, in the order the host wrote it.
const firstString = (value, key) => {
  if (!value || typeof value !== 'object') return '';
  if (typeof value[key] === 'string') return value[key];
  for (const child of Object.values(value)) {
    const found = firstString(child, key);
    if (found) return found;
  }
  return '';
};

// `\` becomes `/`, so Windows paths match the same patterns.
const slashes = (text) => text.replace(/\\/g, '/');

// Splits a shell command or a list of paths into words.
const words = (text) => text.split(/[\s"'=;|&<>(),`]+/).filter(Boolean);

// Only skills this plugin ships count: other teams use our prefix too.
const isShipped = (name) => fs.existsSync(path.join(PLUGIN_ROOT, 'skills', name));

// "<skill> <file in the skill>" for every path that points into one of our
// skills: `…/commercetools-x/SKILL.md` or `…/commercetools-x/references/…`. A
// bare `references/…` is attributed to the skill folder the payload's cwd
// names, else to the skill this session last reported when that skill has the
// file (Codex reports no command cwd).
const skillPaths = (scan, lastSkill) => {
  const text = ['file_path', 'path', 'command'].map((key) => slashes(firstString(scan, key))).join(' ');
  const cwdSkill = slashes(firstString(scan, 'cwd')).match(new RegExp(`^(?:.*/)?${SKILL}/?$`))?.[1] || '';
  const found = [];
  for (const word of words(text)) {
    const full = word.match(new RegExp(`^(?:.*/)?${SKILL}/${IN_SKILL}$`));
    if (full) {
      found.push({ skill: full[1], file: full[2].replace(/\/$/, '') });
      continue;
    }
    const bare = word.match(new RegExp(`^(?:\\./)?${IN_SKILL}$`))?.[1]?.replace(/\/$/, '');
    if (!bare) continue;
    if (cwdSkill) found.push({ skill: cwdSkill, file: bare });
    else if (lastSkill && fs.existsSync(path.join(PLUGIN_ROOT, 'skills', lastSkill, bare))) {
      found.push({ skill: lastSkill, file: bare });
    }
  }
  return found;
};

// The skills the payload names. The namespaced form
// (`commercetools:commercetools-x`) first: it is the invoked skill.
const skillNames = (scan, scanText) => {
  if (hookMode === 'prompt') {
    return [...firstString(scan, 'prompt').matchAll(/\$(?:commercetools:)?(commercetools-[a-z0-9-]+)/g)].map((m) => m[1]);
  }
  return [
    ...[...scanText.matchAll(/commercetools:(commercetools-[a-z0-9-]+)/g)].map((m) => m[1]),
    ...[...scanText.matchAll(/commercetools-[a-z0-9-]+/g)].map((m) => m[0]),
  ];
};

const collectEvents = (scan, scanText, lastSkill) => {
  const events = [];
  if (hookMode === 'activation') {
    const name = skillNames(scan, scanText).find(isShipped);
    if (name) events.push({ event: 'activation', skill: name, file: '' });
  } else if (hookMode === 'prompt') {
    for (const name of skillNames(scan, scanText).filter(isShipped)) {
      events.push({ event: 'activation', skill: name, file: '' });
    }
  } else if (hookMode === 'resource' || hookMode === 'auto') {
    for (const { skill, file } of skillPaths(scan, lastSkill)) {
      if (!isShipped(skill)) continue;
      const event = hookMode === 'auto' && file === 'SKILL.md' ? 'activation' : 'resource';
      events.push({ event, skill, file });
    }
  }
  // At most ten events per call, so a command listing a whole tree can't fan out.
  const seen = new Set();
  return events
    .filter((e) => {
      const key = `${e.event} ${e.skill} ${e.file}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_EVENTS);
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const main = async () => {
  if (telemetryDisabled()) return;
  const input = await readStdin();

  // Most reads are the user's own files: leave before doing any work. A bare
  // `references/…` or `SKILL.md` passes, for reads made from inside a skill folder.
  if (!/commercetools-|references\/|SKILL\.md/.test(input)) return;

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    dbg('skip: payload is not JSON');
    return;
  }
  // The tool response holds the text that was read; a skill linking to another
  // skill would otherwise report a read of that one.
  const { tool_response: _response, ...scan } = payload;
  const scanText = JSON.stringify(scan);

  // Session: a hash of the host's session ID (Claude Code and Codex session_id,
  // Cursor conversation_id, Copilot sessionId), never the ID itself.
  const rawSession =
    firstString(scan, 'session_id') || firstString(scan, 'conversation_id') || firstString(scan, 'sessionId');
  const session = rawSession ? crypto.createHash('sha256').update(rawSession).digest('hex').slice(0, 32) : '';
  const fresh = session ? readInvocation(hookClient) : null;
  // Project key and region the skill scripts recorded, when they belong to this session.
  const previous = fresh?.id === session ? fresh : null;

  const events = collectEvents(scan, scanText, previous?.lastSkill || '');
  if (!events.length) {
    dbg('skip: no shipped skill in payload');
    return;
  }

  if (session) {
    writeInvocation(hookClient, {
      id: session,
      ts: Date.now(),
      seq: previous?.seq || 1,
      src: 'host',
      ...(previous?.ctProjectKey ? { ctProjectKey: previous.ctProjectKey } : {}),
      ...(previous?.ctRegion ? { ctRegion: previous.ctRegion } : {}),
      ...(previous?.ctProjectSource ? { ctProjectSource: previous.ctProjectSource } : {}),
      lastSkill: events[events.length - 1].skill,
    });
  }

  // Email domain: from the host when it states the signed-in user's email
  // (Cursor), stored for the scripts; else what the scripts stored from git.
  // The hook never runs git itself.
  const family = clientFamily(hookClient);
  const hostDomain = domainOf(firstString(scan, 'user_email') || process.env.CURSOR_USER_EMAIL);
  let email = storedEmailDomain();
  if (hostDomain) {
    if (email?.domain !== hostDomain || email?.source !== family) {
      storeEmailDomain({ domain: hostDomain, source: family });
    }
    email = { domain: hostDomain, source: family };
  }

  const identity = installId();
  const common = {
    source: 'hook',
    clientType: hookClient,
    clientFamily: family,
    // Cursor and Codex state the model in the payload; Claude Code doesn't.
    model: firstString(scan, 'model'),
    pluginVersion: PLUGIN_VERSION,
    installId: identity?.id,
    installIdSource: identity?.source,
    invocation: session,
    invocationSource: session ? 'host' : '',
    ctProjectKey: previous?.ctProjectKey,
    ctRegion: previous?.ctRegion,
    ctProjectSource: previous?.ctProjectSource,
    emailDomain: email?.domain,
    emailDomainSource: email?.source,
    // Which hook implementation sent this, and on which operating system:
    // which platforms to test on, and a marker for the switch from the shell hook.
    hookRuntime: 'node',
    platform: process.platform,
  };

  const target = hookEndpoint();
  for (const { event, skill, file } of events) {
    const url = new URL(target);
    const trigger = event === 'activation' ? hookTrigger : 'read';
    // Every field is sent, empty when unknown.
    const fields = { event, trigger, skillName: skill, resource: file, ...common };
    for (const [name, value] of Object.entries(fields)) url.searchParams.set(name, plain(value));
    let status = 'none';
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': `${hookClient}/1.0 (hook)` },
        signal: AbortSignal.timeout(2000),
      });
      status = String(res.status);
    } catch {
      // Offline, blocked or slow: nothing to report, and nothing to show.
    }
    dbg(`sent ${event} trigger=${trigger || 'none'} skill=${skill} resource=${file || 'none'} -> HTTP ${status} ${target}`);
  }
};

main().catch(() => {}).finally(() => process.exit(0));
