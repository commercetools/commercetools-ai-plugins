#!/usr/bin/env node

/**
 * Fetch GraphQL schema for the agent
 *
 * Fetches a partial commercetools GraphQL SDL for a single resource as grounding
 * context for the agent, with instrumentation headers. Use this to inspect a
 * resource's fields and available operations before writing queries or mutations.
 * Results are written to stdout for consumption by AI agents.
 *
 * Usage:
 *   node scripts/graphql-schemata.mjs --resource-name "Cart" --app-name <name> --model <model>
 *
 * Required:
 *   --resource-name <string>  commercetools resource name (e.g., Cart, Product, Order)
 *
 * Optional (telemetry — never gates the fetch):
 *   --app-name <string>       Host app: claude-code, claude-desktop, cursor, codex, copilot.
 *                             Must match the hook vocabulary or the two layers
 *                             cannot be grouped together.
 *   --model <string>          Model name (e.g., claude-sonnet-4.5, gpt-4)
 *   --skill-name <string>     Overrides the skill name derived from this file's path
 *
 * Opt out of telemetry with COMMERCETOOLS_AI_PLUGIN_TELEMETRY=0.
 */

import { parseArgs } from 'util';
// --- inlined from .internal/skill-scripts/instrumentation.mjs — do not edit here ---
/**
 * Shared instrumentation helpers for the commercetools skill scripts.
 *
 * Installed into every skill's scripts/ dir by the build; edit the canonical
 * copy at .internal/skill-scripts/instrumentation.mjs.
 *
 * What is sent: skill name, host app, model, plugin version, and an opaque
 * random invocation id. No queries, no file contents, no paths, no user or
 * project identifiers. Set COMMERCETOOLS_AI_PLUGIN_TELEMETRY=0 to disable.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Substituted at install time from .internal/config.json. The one field in the
// payload that is verified rather than self-reported by the model.
const PLUGIN_VERSION = '0.34.0';

/** The single opt-out switch. */
const telemetryDisabled = () =>
  process.env.COMMERCETOOLS_AI_PLUGIN_TELEMETRY === '0' ||
  process.env.COMMERCETOOLS_AI_PLUGIN_TELEMETRY === 'off';

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
 * both layers in one correlation space. Without hooks (Codex, Copilot) the first
 * script call mints one.
 *
 * The path is fixed rather than derived from the working directory, because the
 * agent runs these scripts from the INSTALLED SKILL directory — identical for
 * every project on the machine — so a cwd-derived key correlated nothing and
 * silently merged unrelated projects.
 *
 * Every failure mode (read-only tmp, sandboxed fs, concurrent writers) resolves
 * to `undefined`, which omits the parameter. Correlation is a nice to have,
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

const invocationId = (appName) => {
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
    const next = state
      ? { id: state.id, ts: now, seq: (state.seq || 1) + 1, src: state.src || 'local' }
      : { id: crypto.randomBytes(16).toString('hex'), ts: now, seq: 1, src: 'local' };

    try {
      fs.writeFileSync(file, JSON.stringify(next));
    } catch {
      // Unwritable tmp: still return the id we have for this single call.
    }

    return { id: next.id, seq: next.seq, src: next.src };
  } catch {
    return undefined;
  }
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

/**
 * The four instrumentation headers, unchanged across every endpoint. Empty when
 * telemetry is off — the grounding request itself still runs, it just carries no
 * identifying metadata.
 */
const instrumentationHeaders = ({ appName, model, skillName }) => {
  const headers = {};
  if (telemetryDisabled()) return headers;
  if (appName || model) headers['User-Agent'] = `${appName || 'unknown'}/1.0 (${model || 'unknown'})`;
  if (model) headers['X-Model'] = model;
  if (appName) headers['X-Client-Type'] = appName;
  if (skillName) headers['X-Skill-Name'] = skillName;
  return headers;
};

/**
 * Mirror the header values onto the query string, using the same names on every
 * endpoint so one log filter covers all of them. Only sets what it actually has.
 */
const applyInstrumentationParams = (url, { appName, model, skillName, source, importMetaUrl }) => {
  if (telemetryDisabled()) return;
  if (skillName) url.searchParams.set('skillName', skillName);
  if (appName) url.searchParams.set('clientType', appName);
  const family = clientFamily(appName);
  if (family) url.searchParams.set('clientFamily', family);
  if (model) url.searchParams.set('model', model);
  url.searchParams.set('pluginVersion', PLUGIN_VERSION);
  url.searchParams.set('source', source || 'script');
  const install = importMetaUrl ? installKind(importMetaUrl) : undefined;
  if (install) url.searchParams.set('install', install);
  const identity = installId();
  if (identity) {
    url.searchParams.set('installId', identity.id);
    url.searchParams.set('installIdSource', identity.source);
  }
  const invocation = invocationId(appName);
  if (invocation) {
    url.searchParams.set('invocation', invocation.id);
    url.searchParams.set('invocationSource', invocation.src);
    url.searchParams.set('seq', String(invocation.seq));
  }
};
// --- end instrumentation.mjs ---

const SCHEMA_URL = 'https://docs.commercetools.com/apis/rest/tools/graphql-schemata';

// Parse command line arguments
const { values } = parseArgs({
  options: {
    'resource-name': { type: 'string' },
    'app-name': { type: 'string' },
    model: { type: 'string' },
    'skill-name': { type: 'string' },
  },
});

// Validate the one parameter the request actually needs. Telemetry arguments are
// never gating: a missing --app-name or --model costs us a log column, it must
// not cost the user their answer.
if (!values['resource-name']) {
  console.error('Error: Missing required parameter: --resource-name');
  console.error('Usage: node scripts/graphql-schemata.mjs --resource-name "Cart"');
  process.exit(1);
}

// Telemetry metadata. The skill name comes from this script's own path, so the
// agent never has to restate it; --skill-name still overrides it.
const meta = {
  importMetaUrl: import.meta.url,
  appName: values['app-name'],
  model: values.model,
  skillName: resolveSkillName(import.meta.url, values['skill-name']),
};

// Build request URL with query parameters
const url = new URL(SCHEMA_URL);
url.searchParams.set('resourceName', values['resource-name']);
applyInstrumentationParams(url, meta);

// Fetch the partial GraphQL SDL and print it (fail soft: exit 0 on any error)
try {
  const res = await fetch(url, {
    method: 'GET',
    headers: instrumentationHeaders(meta),
    signal: AbortSignal.timeout(60000),
  });

  const response = await res.json();

  // Surface API errors (e.g. an invalid resourceName returns HTTP 400)
  if (response.error) {
    const details = response.error.details;
    const validValues = Array.isArray(details)
      ? details.find((d) => Array.isArray(d.values))?.values
      : undefined;

    process.stdout.write(`No schema found for resource "${values['resource-name']}". Check the resource name spelling.\n`);
    if (validValues?.length) {
      process.stdout.write(`\nValid resource names:\n${validValues.join(', ')}\n`);
    }
    process.exit(0);
  }

  if (!res.ok) process.exit(0);

  // The result is a GraphQL SDL string for the requested resource
  if (typeof response.result === 'string' && response.result.length > 0) {
    process.stdout.write(`# GraphQL Schema for resource: ${values['resource-name']}\n\n`);
    process.stdout.write('```graphql\n');
    process.stdout.write(response.result.endsWith('\n') ? response.result : `${response.result}\n`);
    process.stdout.write('```\n');
  } else if (response.result) {
    // Fallback: output structured result as-is
    process.stdout.write(`${JSON.stringify(response.result, null, 2)}\n`);
  } else {
    process.stdout.write(`No schema found for resource "${values['resource-name']}". Check the resource name spelling.\n`);
  }
} catch (err) {
  process.exit(0);
}
