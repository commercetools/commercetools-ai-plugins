#!/usr/bin/env node

/**
 * Search docs for the agent
 *
 * Gathers relevant commercetools documentation as grounding context for the agent, with instrumentation headers.
 * Results are written to stdout for consumption by AI agents. Usage: see USAGE
 * below, or run with --help.
 */

// --- inlined from .internal/skill-scripts/cli.mjs — do not edit here ---
// Command-line handling shared by the skill scripts: --help, usage errors, and
// the message an agent gets when the docs service cannot be used. INLINED into
// each script by sync-skill-scripts.mjs, never shipped as its own file.
//
// Why the messages matter: an agent that gets no output cannot tell "blocked"
// from "nothing found", and goes on to read the script's source to find out.
// So every failure says what happened and what to do next, on stderr. The
// script still never throws at the agent: a failure is a clear message and
// exit code 1, not a stack trace.

import { parseArgs } from 'node:util';

const DOCS_HOST = 'docs.commercetools.com';

// parseArgs with --help/-h and readable usage errors. `options` must stay the
// first key of the argument object: lint-skill-script-usage.mjs reads the
// allowed flags from that literal.
const parseArgsOrUsage = ({ options, usage }) => {
  let parsed;
  try {
    parsed = parseArgs({ options: { ...options, help: { type: 'boolean', short: 'h' } } });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n\n${usage}\n`);
    process.exit(1);
  }
  if (parsed.values.help) {
    process.stdout.write(`${usage}\n`);
    process.exit(0);
  }
  return parsed;
};

// The request did not produce a usable answer. `mcpTool` is the Knowledge MCP
// tool that does the same job: if the agent has it, that is the faster route
// than asking the user to grant network access.
const reportServiceFailure = ({ mcpTool, err, status }) => {
  const viaMcp =
    `If the commercetools Knowledge MCP tool "${mcpTool}" is available, use it instead.`;
  if (status !== undefined) {
    process.stderr.write(
      `Error: ${DOCS_HOST} returned HTTP ${status}. ${viaMcp} Otherwise retry later.\n`,
    );
  } else {
    const reason = err?.cause?.code || err?.name || 'unknown error';
    process.stderr.write(
      `Error: could not reach ${DOCS_HOST} (${reason}). ${viaMcp} ` +
        `Otherwise the environment may be blocking network access: ask for access to ` +
        `${DOCS_HOST} and run the command again.\n`,
    );
  }
  process.exit(1);
};
// --- end cli.mjs ---
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
const PLUGIN_VERSION = '0.65.0';

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

const CONTEXT_URL = 'https://docs.commercetools.com/apis/rest/tools/documentation-search';
const MCP_TOOL = 'commercetools-documentation-search';

const USAGE = `Search the commercetools documentation.

Usage:
  node scripts/docs-search.mjs --query "how to create payment" [options]

Required:
  --query <string>          Search query

Optional:
  --limit <number>          Number of results (default: 3, at most 20)
  --content-types <string>  Comma-separated content types

Optional (telemetry, never gates the search):
  --app-name <string>       Host app: claude-code, claude-desktop, cursor, codex, copilot
  --model <string>          Model name
  --skill-name <string>     Overrides the skill name derived from this file's path
  --commercetools-project-key <string>
                            The project the work targets, only if already known
  --commercetools-region <string>
                            Its region as in api.{region}.commercetools.com

  -h, --help                Show this help

Opt out of telemetry with COMMERCETOOLS_AI_PLUGIN_TELEMETRY=0.`;

// Parse command line arguments
const { values } = parseArgsOrUsage({
  options: {
    query: { type: 'string' },
    limit: { type: 'string', default: '3' },
    'app-name': { type: 'string' },
    model: { type: 'string' },
    'skill-name': { type: 'string' },
    'commercetools-project-key': { type: 'string' },
    'commercetools-region': { type: 'string' },
    'content-types': { type: 'string' },
  },
  usage: USAGE,
});

// Validate the one parameter the request actually needs. Telemetry arguments are
// never gating: a missing --app-name or --model costs us a log column, it must
// not cost the user their answer.
if (!values['query']) {
  process.stderr.write(`Error: Missing required parameter: --query\n\n${USAGE}\n`);
  process.exit(1);
}

// Telemetry metadata. The skill name comes from this script's own path, so the
// agent never has to restate it; --skill-name still overrides it.
const meta = {
  importMetaUrl: import.meta.url,
  appName: values['app-name'],
  model: values.model,
  skillName: resolveSkillName(import.meta.url, values['skill-name']),
  projectKey: values['commercetools-project-key'],
  region: values['commercetools-region'],
};

const normalizedLimit = Math.min(parseInt(values.limit, 10), 20)

// Build request URL with query parameters
const url = new URL(CONTEXT_URL);
url.searchParams.set('query', values.query);
url.searchParams.set('limit', String(normalizedLimit));
// Baked in per skill from metadata.docsSearch.products in its SKILL.md. The
// corpora a skill searches are a semantic choice its owner makes — "checkout"
// means something different in the Frontend docs than the Checkout product —
// so there is no shared default here to drift away from.
for (const p of ["Composable Commerce","Checkout","Connect","InStore","AI Hub"]) {
  url.searchParams.append('products', p);
}

// Add optional content types filter
if (values['content-types']) {
  for (const t of values['content-types'].split(',').map(t => t.trim())) {
    url.searchParams.append('contentTypes', t);
  }
}

// Exclude Skill content type to avoid self-referencing results
url.searchParams.append("excludeContentTypes", "Skill");
applyInstrumentationParams(url, meta);

async function main() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: instrumentationHeaders(meta),
      signal: controller.signal,
    });

    if (res.status !== 200) {
      reportServiceFailure({ mcpTool: MCP_TOOL, status: res.status });
    }

    let response;
    try {
      response = await res.json();
    } catch (err) {
      reportServiceFailure({ mcpTool: MCP_TOOL, status: `${res.status} with an unreadable body` });
    }

    if (response.error) {
      reportServiceFailure({ mcpTool: MCP_TOOL, status: `${res.status} with an error body` });
    }

    // Format results for AI agent consumption
    if (response.result && Array.isArray(response.result)) {
      const results = response.result;

      if (results.length === 0) {
        process.stdout.write('No results found. Try broadening your search query or adjusting filters.\n');
        process.exit(0);
      }

      // Write results in markdown format
      process.stdout.write(`# Documentation Search Results\n\n`);
      process.stdout.write(`Query: "${values.query}"\n`);
      process.stdout.write(`Found ${results.length} result(s)\n\n`);
      process.stdout.write('---\n\n');

      results.forEach((item, index) => {
        process.stdout.write(`## Result ${index + 1}\n\n`);

        if (item.metadata) {
          if (item.metadata.title) {
            process.stdout.write(`**Title:** ${item.metadata.title}\n\n`);
          }
          if (item.metadata.url) {
            const url = item.metadata.url.split('#')[0];
            process.stdout.write(`**URL:** ${url}\n\n`);
          }
          if (item.metadata.contentType) {
            process.stdout.write(`**Type:** ${item.metadata.contentType}\n\n`);
          }
        }

        if (item.content) {
          process.stdout.write(`**Content:**\n\n${item.content}\n\n`);
        }

        process.stdout.write('---\n\n');
      });
    } else {
      // Fallback: output raw response
      process.stdout.write(JSON.stringify(response, null, 2));
      process.stdout.write('\n');
    }
  } catch (err) {
    reportServiceFailure({ mcpTool: MCP_TOOL, err });
  } finally {
    clearTimeout(timeoutId);
  }
}

main();
