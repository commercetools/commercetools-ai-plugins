#!/usr/bin/env node

/**
 * Connect a repository to a managed commercetools MCP Server
 *
 * Merges the connection into the repository's .mcp.json, the portable file
 * that Claude Code, VS Code and GitHub Copilot CLI all read, then prints the
 * next step for the user's agent. Not interactive: sign-in needs the user's
 * browser, and the tools only load when the conversation is reopened in a new
 * process, so it prints that step instead of running it. Reopening continues
 * the same conversation, so the agent keeps the setup's context.
 *
 * Usage:
 *   node scripts/connect-repository-mcp.mjs --url <MCP server URL> --project <projectKey> --dir <repository root> [--agent <agent>] [--model <model>]
 *
 * Required:
 *   --url <string>      The MCP server URL copied from the Merchant Center
 *   --project <string>  The project key the user asked to connect
 *   --dir <string>      The repository root. Required because this script runs
 *                       from the skill's own directory.
 *
 * Optional:
 *   --agent <string>    claude-code, vscode or copilot-cli. claude-code covers
 *                       desktop-hosted sessions too: the script detects them.
 *                       Without it, the next step is printed for every agent.
 *   --model <string>    Model name, for telemetry only
 *
 * Exits 1 without touching the file if the URL is malformed, belongs to another
 * project, or the name is already used for a different URL.
 *
 * Reports one `repository-mcp-connection` event per run with its outcome, and
 * the project key and region taken from the MCP server URL. Never the URL
 * itself, the directory, or the file. Opt out with
 * COMMERCETOOLS_AI_PLUGIN_TELEMETRY=0.
 */

import { parseArgs } from 'util';
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
const PLUGIN_VERSION = '0.64.0';

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
const invocationFile = (appName) => {
  const family = clientFamily(appName) || 'unknown';
  return path.join(os.tmpdir(), `ct-ai-plugin-invocation-${family}.json`);
};

const invocationId = (appName, project = {}) => {
  try {
    const file = invocationFile(appName);
    const now = Date.now();

    let state = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed.id === 'string' && now - parsed.ts < INVOCATION_TTL_MS) {
        state = parsed;
      }
    } catch {
      // No usable cache — fall through and mint a fresh one.
    }

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

    try {
      fs.writeFileSync(file, JSON.stringify(next));
    } catch {
      // Unwritable tmp: still return the id we have for this single call.
    }

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

const emailDomain = () => {
  const locations = (() => {
    try {
      return emailDomainLocations();
    } catch {
      return [];
    }
  })();

  for (const file of locations) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      const domain = domainOf(`@${stored.domain}`);
      if (domain) return { domain, source: stored.source || 'git' };
    } catch {
      // Nothing usable here — try the next location.
    }
  }

  const domain = gitEmailDomain();
  if (!domain) return undefined;

  for (const file of locations) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ domain, source: 'git' }) + '\n', { mode: 0o600 });
      break;
    } catch {
      // Unwritable here — try the next location.
    }
  }
  // Sent even when it could not be stored: unlike the installation id it is
  // not random, so the next call reads the same value again.
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

const RESUME_PROMPT =
  'Signed in. Continue the commercetools MCP setup: verify the new connection, then ask whether to connect another project';
const AGENTS = ['claude-code', 'vscode', 'copilot-cli'];
// A local receiver for testing is the only other place it may send to.
const TELEMETRY_ENDPOINT = /^http:\/\/(localhost|127\.0\.0\.1):\d+(\/|$)/.test(
  process.env.COMMERCETOOLS_AI_PLUGIN_TELEMETRY_ENDPOINT || '',
)
  ? process.env.COMMERCETOOLS_AI_PLUGIN_TELEMETRY_ENDPOINT
  : 'https://docs.commercetools.com/apis/rest/tools/ai-plugin-telemetry';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    project: { type: 'string' },
    dir: { type: 'string' },
    agent: { type: 'string' },
    model: { type: 'string' },
  },
});

// A Claude Code session hosted in the desktop app says so in its environment,
// which this script inherits, so the agent doesn't need to know.
const inDesktop = process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop';
const nextAgent = values.agent === 'claude-code' && inDesktop ? 'claude-desktop' : values.agent;
// Telemetry host names, chosen so clientFamily() groups them with the hooks'.
const APP_NAMES = {
  'claude-code': 'claude-code',
  'claude-desktop': 'claude-desktop',
  vscode: 'vscode-copilot',
  'copilot-cli': 'copilot-cli',
};

/**
 * One event per run, sent the way the editor hooks send theirs. The project
 * key and region come from the MCP server URL, so they are stored for the
 * session with ctProjectSource=mcp-url and attached to its later events too.
 * Fails silently: telemetry must never change what the user sees.
 */
async function report(outcome, project = {}) {
  if (telemetryDisabled()) return;
  try {
    const event = new URL(TELEMETRY_ENDPOINT);
    event.searchParams.set('event', 'repository-mcp-connection');
    event.searchParams.set('outcome', outcome);
    applyInstrumentationParams(event, {
      appName: APP_NAMES[nextAgent],
      model: values.model,
      skillName: resolveSkillName(import.meta.url),
      source: 'script',
      importMetaUrl: import.meta.url,
      projectKey: project.key,
      region: project.region,
      projectSource: 'mcp-url',
    });
    await fetch(event, { signal: AbortSignal.timeout(3000) });
  } catch {
    // Offline, blocked or slow: nothing to report, and nothing to show.
  }
}

async function fail(outcome, message) {
  await report(outcome);
  console.error(`Error: ${message}`);
  process.exit(1);
}

if (!values['url']) await fail('missing-argument', 'Missing required parameter: --url');
if (!values['project']) await fail('missing-argument', 'Missing required parameter: --project');
if (!values['dir']) await fail('missing-argument', 'Missing required parameter: --dir');
if (values.agent && !AGENTS.includes(values.agent)) {
  await fail('invalid-agent', `--agent must be one of ${AGENTS.join(', ')}. Other agents keep their own configuration.`);
}

// --- Check the URL: https://mcp.{region}.commercetools.com/projects/{projectKey}/{serverKey}

let url;
try {
  url = new URL(values.url.trim());
} catch {
  await fail('invalid-url', `Not a URL: ${values.url}`);
}
const host = url.hostname.match(/^mcp\.([a-z0-9-]+\.[a-z0-9-]+)\.commercetools\.com$/);
const route = url.pathname.match(/^\/projects\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/?$/);
if (url.protocol !== 'https:' || !host || !route || url.search || url.hash) {
  await fail(
    'invalid-url',
    `Not a managed MCP Server URL: ${values.url}\n` +
      'Expected https://mcp.{region}.commercetools.com/projects/{projectKey}/{serverKey}. ' +
      'Copy the MCP server URL from the server\'s detail page in the Merchant Center.',
  );
}
const [, projectKey, serverKey] = route;
if (projectKey !== values.project) {
  await fail(
    'project-mismatch',
    `This URL belongs to project "${projectKey}", not "${values.project}". Stop and check which ` +
      'server URL was copied; connecting it would point this connection at the wrong project.',
  );
}

const region = host[1];
const name = `ct-${projectKey}`;
const serverUrl = `https://${url.hostname}/projects/${projectKey}/${serverKey}`;

// --- Merge into .mcp.json

const dir = path.resolve(values.dir);
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  await fail('invalid-dir', `--dir is not a directory: ${dir}`);
}
const file = path.join(dir, '.mcp.json');

let config = {};
if (fs.existsSync(file)) {
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    await fail('invalid-file', `${file} is not valid JSON (${error.message}). Left it unchanged.`);
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    await fail('invalid-file', `${file} does not contain a JSON object. Left it unchanged.`);
  }
}
config.mcpServers ??= {};
if (typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
  await fail('invalid-file', `"mcpServers" in ${file} is not an object. Left it unchanged.`);
}

let status;
let outcome = 'added';
let changed = true;
const existing = config.mcpServers[name];
if (!existing) {
  // No `tools` key: the portable format has none, and Claude Code skips an
  // entry that has one.
  config.mcpServers[name] = { type: 'http', url: serverUrl };
  status = `Added ${name} to ${file}`;
} else if (existing.url !== serverUrl) {
  await fail(
    'name-conflict',
    `${name} in ${file} already points to ${existing.url}. Left it unchanged. ` +
      'Remove that entry first if it should be replaced.',
  );
} else if ('tools' in existing) {
  delete existing.tools;
  outcome = 'repaired';
  status = `Repaired ${name} in ${file}: removed the "tools" key, which Claude Code rejects`;
} else {
  outcome = 'unchanged';
  status = `${name} is already in ${file}. Unchanged.`;
  changed = false;
}
if (changed) fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
await report(outcome, { key: projectKey, region });

// --- Next step

// Commands start with a cd, so they can be pasted into any new terminal.
const win = process.platform === 'win32';
const cd = win ? `cd "${dir}"` : `cd '${dir.replaceAll("'", "'\\''")}'`;
const approval = JSON.stringify({ enabledMcpjsonServers: [name] });

// `mcp login` refuses servers from .mcp.json until they are approved. --settings
// approves this one for the sign-in only. On Windows it goes through a temp file,
// because inline-JSON quoting differs between PowerShell versions and cmd.
function login() {
  if (!win) return `claude --settings '${approval}' mcp login ${name}`;
  const settings = path.join(os.tmpdir(), `commercetools-mcp-${name}.json`);
  fs.writeFileSync(settings, approval);
  return `claude --settings "${settings}" mcp login ${name}`;
}

// Chains on macOS and Linux; separate lines on Windows, where && isn't
// available in older PowerShell.
const chain = (...commands) => (win ? commands : [commands.join(' && ')]);

const NEXT = {
  'claude-code': () => [
    'Exit this session, then run this in a terminal:',
    '',
    ...chain(cd, login(), `claude --continue "${RESUME_PROMPT}"`),
    '',
    `It signs you in through the browser and reopens this conversation, which asks once to approve ${name}: accept it.`,
  ],
  // Desktop-hosted sessions can't sign in, but load the server without the
  // approval step, so the user signs in from a terminal and comes back.
  'claude-desktop': () => [
    'Run this in a terminal, for example a new Terminal window:',
    '',
    ...chain(cd, login()),
    '',
    'It signs you in through the browser. Then come back to this conversation and say:',
    '',
    `"${RESUME_PROMPT}"`,
    '',
    'If the commercetools tools aren\'t available yet, start a new session for this folder and say the same.',
  ],
  vscode: () => [
    'Send any message in this chat. VS Code starts the connection and asks you to sign in. Then say:',
    '',
    `"${RESUME_PROMPT}"`,
    '',
    'If the tools don\'t appear, start a new chat and say the same.',
  ],
  'copilot-cli': () => [
    'Exit this session, then run this in a terminal:',
    '',
    ...chain(cd, 'copilot --continue'),
    '',
    `It reopens this conversation. Run /mcp auth ${name} there and sign in through the browser. Then say:`,
    '',
    `"${RESUME_PROMPT}"`,
  ],
};

const agents = nextAgent ? [nextAgent] : Object.keys(NEXT);

const out = [status, '', `"${name}": ${JSON.stringify(config.mcpServers[name])}`, ''];
for (const agent of agents) {
  out.push(`Tell the user (${agent}):`, '', ...NEXT[agent](), '');
}
out.push(`${path.basename(file)} is meant to be committed: teammates get the connection on clone and sign in as themselves.`);
console.log(out.join('\n'));
