#!/usr/bin/env node
// Install, remove, or inspect the commercetools spec-driven-development overlay
// in a GitHub Spec Kit, OpenSpec, or BMad Method project. Invoked by this skill's
// SKILL.md; also runnable directly. Zero npm deps (Node core only), Node >= 18.
//
// Two overlay modes, because the target frameworks contract different things:
//
//   mode 'patch'  Spec Kit, OpenSpec. Those frameworks hand the project template
//                 files it is expected to edit, so the overlay does marker-
//                 delimited text surgery on them and creates no files. Idempotent
//                 (re-applying replaces the block in place), reversible (remove
//                 restores the original bytes).
//
//   mode 'write'  BMad Method. BMad regenerates every installed file — skill dirs
//                 are removed and re-copied on each install, `_bmad/render/` is
//                 hash-verified — so patching them is destructive, not just
//                 fragile. Instead BMad contracts a sparse-override directory,
//                 `_bmad/custom/`, that its installer never touches. So the
//                 overlay writes whole files it owns there. Idempotent (replace
//                 in place when the file carries our marker), reversible (remove
//                 deletes them), and it never overwrites a file it did not write.
//
// Usage:
//   node setup.mjs [init|remove|status] [--framework speckit|openspec|bmad]
//                  [--dry-run] [--cwd <dir>]
//     init    apply the overlay to every detected framework (default)
//     remove  strip previously applied blocks / delete written files
//     status  report what is currently applied
// Exit codes: 0 ok · 2 bad arguments · 4 no SDD framework detected in <cwd>
//             5 framework detected but its variant is unsupported
//             6 a written override failed BMad's resolver; all writes rolled back

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PATCHES = path.join(path.dirname(fileURLToPath(import.meta.url)), "patches");

const read = (rel) => fs.readFileSync(path.join(PATCHES, rel), "utf8");

const MARKER = "commercetools-spec-extension";

// The ONLY files this installer will ever touch.
//
// mode 'patch' entries: `anchorBefore` inserts the block immediately before that
// heading when present, otherwise the block is appended at end-of-file with a
// logged warning. `null` means always append at EOF.
//
// mode 'write' entries: `target` is created if absent, replaced if it already
// carries our file marker, and left alone otherwise.
const FRAMEWORKS = {
  speckit: {
    label: "GitHub Spec Kit",
    mode: "patch",
    // presence of this dir means spec-kit is initialized in the project
    detectDir: ".specify",
    patches: [
      {
        id: "platform-skills-constitution",
        target: ".specify/memory/constitution.md",
        anchorBefore: null, // append
        content: () => read("spec-kit/constitution.patch.md"),
      },
      {
        id: "platform-skills-resolution",
        target: ".specify/templates/plan-template.md",
        anchorBefore: "## Project Structure",
        content: () => read("spec-kit/plan-template.patch.md"),
      },
      {
        id: "task-skill-annotation",
        target: ".specify/templates/tasks-template.md",
        anchorBefore: "## Path Conventions",
        content: () => read("spec-kit/tasks-template.patch.md"),
      },
    ],
  },
  openspec: {
    label: "OpenSpec",
    mode: "patch",
    detectDir: "openspec",
    patches: [
      {
        id: "platform-skills-conventions",
        target: "openspec/config.yaml",
        anchorBefore: null, // append real YAML keys at EOF
        content: () => read("openspec/config.patch.yaml"),
      },
    ],
  },
  bmad: {
    label: "BMad Method",
    mode: "write",
    detectDir: "_bmad",
    preflight: bmadPreflight,
    // Every payload sets string arrays only (persistent_facts, principles,
    // external_sources, finalize_reviewers). BMad's merge appends those and its
    // renderer type-checks each value against the shipped default, so appending
    // strings to string arrays cannot fail a type check, and no shipped scalar
    // is replaced. Adding a scalar override here means owning BMad's recipe for
    // that field forever — do not, without a reason worth the maintenance.
    files: [
      {
        id: "spec-extension-rules",
        target: "_bmad/custom/commercetools-spec-extension-rules.md",
        content: () => read("bmad/commercetools-spec-extension-rules.md"),
      },
      ...[
        ["agent-dev", "bmad-agent-dev"],
        ["agent-pm", "bmad-agent-pm"],
        ["agent-architect", "bmad-agent-architect"],
        ["prd", "bmad-prd"],
        ["architecture", "bmad-architecture"],
        ["spec", "bmad-spec"],
        ["epics-and-stories", "bmad-create-epics-and-stories"],
        ["build", "bmad-build"],
      ].map(([id, skill]) => ({
        id,
        skill,
        target: `_bmad/custom/${skill}.toml`,
        content: () => read(`bmad/${skill}.toml`),
      })),
    ],
  },
};

const FRAMEWORK_NAMES = Object.keys(FRAMEWORKS);
const COMMANDS = ["init", "remove", "status"];

const USAGE = `setup.mjs — wire commercetools skills into Spec Kit / OpenSpec / BMad

Usage:
  setup.mjs init    [--framework speckit|openspec|bmad] [--dry-run] [--cwd <dir>]
  setup.mjs remove  [--framework speckit|openspec|bmad] [--dry-run] [--cwd <dir>]
  setup.mjs status  [--framework speckit|openspec|bmad] [--cwd <dir>]

Options:
  --framework <f>  Act only on the named framework (default: all detected)
  --dry-run        Print what would change; write nothing
  --cwd <dir>      Operate in <dir> instead of the current directory
  -h, --help       Show this help

Detection: '.specify/' -> speckit, 'openspec/' -> openspec, '_bmad/' -> bmad.`;

// ---- Marker-block patch engine (mode 'patch') ------------------------------
// MARKER is part of the on-disk format: renaming it orphans blocks written by an
// earlier version, so `remove` can no longer clean them up. The `v=` inside a
// marker is declared by the patch file itself — this script never writes a
// marker, it only matches one and swaps the body. Comment syntax follows the
// target file's extension: `#` for YAML and TOML, HTML comments for everything else.

const hashComments = (targetPath) => /\.(ya?ml|toml)$/i.test(targetPath);

/** Matches one whole marker block in `targetPath`, capturing its id. */
const blockReFor = (targetPath) =>
  hashComments(targetPath)
    ? new RegExp(
        String.raw`^# ${MARKER}:begin[^\n]*?id=(?<id>[\w-]+)[^\n]*$[\s\S]*?^# ${MARKER}:end id=\k<id>[ \t]*$`,
        "gm",
      )
    : new RegExp(
        String.raw`^<!-- ${MARKER}:begin[^\n]*?id=(?<id>[\w-]+)[^\n]*?-->[\s\S]*?^<!-- ${MARKER}:end id=\k<id> -->[ \t]*$`,
        "gm",
      );

/** Extract the block id declared inside a patch's own begin marker. */
const blockIdOf = (patchText) => {
  const m = patchText.match(new RegExp(String.raw`${MARKER}:begin[^\n]*?id=([\w-]+)`));
  if (!m) throw new Error(`patch content has no ${MARKER}:begin marker with an id`);
  return m[1];
};

/** List ids of overlay blocks currently present in `text`. */
const installedIds = (targetPath, text) => {
  const ids = [];
  for (const m of text.matchAll(blockReFor(targetPath))) ids.push(m.groups.id);
  return ids;
};

/**
 * Apply a patch to file text (pure string transform).
 * @returns { text, action } where action is one of
 *   'replaced' | 'inserted' | 'appended' | 'appended-no-anchor'
 */
const applyToText = (targetPath, text, patchText, anchor) => {
  const blockRe = blockReFor(targetPath);
  const id = blockIdOf(patchText);
  const block = patchText.replace(/\n+$/, "") + "\n";

  // replace-in-place if this id already exists
  let replaced = null;
  const newText = text.replace(blockRe, (match, ...args) => {
    const groups = args[args.length - 1];
    if (groups.id === id && replaced === null) {
      replaced = true;
      return block.replace(/\n$/, "");
    }
    return match;
  });
  if (replaced) return { text: newText, action: "replaced" };

  // anchor insertion
  if (anchor && text.includes(anchor)) {
    const idx = text.indexOf(anchor);
    return {
      text: text.slice(0, idx) + block + "\n" + text.slice(idx),
      action: "inserted",
    };
  }

  // append at EOF (single blank-line separator, single trailing newline)
  const base = text.replace(/\n+$/, "");
  return {
    text: base + "\n\n" + block,
    action: anchor ? "appended-no-anchor" : "appended",
  };
};

/**
 * Remove all overlay blocks from file text (pure string transform).
 * Collapses blank runs left inline and normalizes EOF to a single newline,
 * so an apply->remove round-trip restores the original bytes.
 */
const removeFromText = (targetPath, text) => {
  let out = text.replace(blockReFor(targetPath), "");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/\n+$/, "") + "\n";
  return out;
};

// ---- Whole-file engine (mode 'write') --------------------------------------
// A payload declares ownership on its first line with a `:file` marker instead
// of a `:begin`/`:end` pair, because these targets are wholly ours. Ownership is
// what makes the write safe: a target that exists without our marker was written
// by the user or by BMad, and we never touch it.

/** The `:file` marker a write payload declares on its first line. */
const fileMarkerRe = (id = String.raw`([\w-]+)`) =>
  new RegExp(String.raw`^\s*(?:#|<!--).*${MARKER}:file.*id=${id}(?![\w-])`);

/** First line, minus a BOM. Ownership is only ever claimed there. */
const firstLine = (text) => text.replace(/^\uFEFF/, "").split("\n", 1)[0];

/** Extract the file id declared in a write payload's own marker. */
const fileIdOf = (payload) => {
  const m = firstLine(payload).match(fileMarkerRe());
  if (!m) throw new Error(`write payload has no leading ${MARKER}:file marker with an id`);
  return m[1];
};

/**
 * True when `text` was written by this overlay under `id`. Anchored to the first
 * line: a marker further down a file is text someone quoted, not a claim, and
 * reading it as ownership would license overwriting or deleting their work.
 */
const isOwnedFile = (text, id) => fileMarkerRe(id).test(firstLine(text));

/**
 * The payload minus its own marker/comment preamble, for printing to the user.
 * Comment syntax is taken from the payload's first line, so `#` opens a comment
 * in the TOML payloads but stays a heading in the Markdown one.
 */
const payloadBody = (payload) => {
  const lines = payload.split("\n");
  const commentRe = /^\s*<!--/.test(lines[0] ?? "") ? /^\s*<!--/ : /^\s*#/;
  let i = 0;
  while (i < lines.length && (commentRe.test(lines[i]) || lines[i].trim() === "")) i++;
  return lines.slice(i).join("\n").replace(/\n+$/, "");
};

// ---- BMad capability gate ---------------------------------------------------
// Detect by capability, not by version string. BMad restructured twice inside v6
// and its manifest schema moved with it, so the presence of the resolver script
// is a more reliable signal than any version we could parse: it is the thing our
// overrides actually depend on.

const BMAD_RESOLVER = path.join("_bmad", "scripts", "resolve_customization.py");

/** Best-effort version, for the report only. Never gates anything. */
function bmadVersion(cwd) {
  for (const rel of [
    path.join("_bmad", "_config", "manifest.yaml"),
    path.join("_bmad", "_cfg", "manifest.yaml"),
  ]) {
    const p = path.join(cwd, rel);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, "utf8").match(/^\s*version:\s*["']?([\w.+-]+)/m);
    if (m) return m[1];
  }
  return null;
}

function bmadPreflight(cwd) {
  if (fs.existsSync(path.join(cwd, BMAD_RESOLVER))) {
    const v = bmadVersion(cwd);
    return { ok: true, note: v ? `version ${v}` : "version unknown" };
  }
  // v6.0/v6.1 shipped per-agent YAML customization with replace-not-merge
  // semantics, which this overlay's append-only payloads cannot target.
  if (fs.existsSync(path.join(cwd, "_bmad", "_config", "agents"))) {
    return {
      ok: false,
      message:
        "'_bmad/' is a v6.0/v6.1 install (per-agent '.customize.yaml'). This overlay " +
        "needs the TOML override surface. Run 'npx bmad-method install' to update, then re-run.",
    };
  }
  return {
    ok: false,
    message:
      `'_bmad/' exists but '${BMAD_RESOLVER}' does not, so this BMad predates the ` +
      "'_bmad/custom/*.toml' override contract. Run 'npx bmad-method install' to update, then re-run.",
  };
}

// Skill roots BMad installs into, per AI tool. `.agents/skills` is the cross-tool
// standard; the rest are tool-specific. Only used to locate a `customize.toml` so
// the resolver can be run against it — a miss downgrades validation, never fails it.
const SKILL_ROOTS = [
  ".agents/skills",
  ".claude/skills",
  ".cursor/skills",
  ".codex/skills",
  ".gemini/skills",
  ".github/skills",
  ".opencode/skills",
  ".windsurf/skills",
  ".kilocode/skills",
  ".crush/skills",
  ".augment/skills",
  ".kimi/skills",
  ".pi/skills",
  ".roo/skills",
  ".iflow/skills",
  ".qwen/skills",
  ".codebuddy/skills",
  ".cline/skills",
  ".trae/skills",
];

const findSkillDir = (cwd, skill) => {
  for (const root of SKILL_ROOTS) {
    const dir = path.join(cwd, root, skill);
    if (fs.existsSync(path.join(dir, "customize.toml"))) return dir;
  }
  return null;
};

const hasUv = () => {
  const r = spawnSync("uv", ["--version"], { stdio: "ignore" });
  return !r.error && r.status === 0;
};

/**
 * Ask BMad's own resolver to merge each override we just wrote. This is the
 * guard that matters: BMad fails closed — a malformed override makes the skill
 * HALT rather than ignore it — so an unusable file must never survive the run.
 *
 * `unlocated` is the compatibility signal, not a validation gap: BMad resolves
 * `_bmad/custom/<skill-name>.toml` only for a skill that exists, so an override
 * naming a skill this install does not have is silently inert. BMad renamed much
 * of its skill set across v6 releases, so that is exactly what an out-of-date
 * install looks like, and it must be reported rather than counted as success.
 * @returns { checked, failures: [{ skill, detail }], unlocated: string[], blocked: string }
 */
function validateBmadWrites(cwd, writtenSkills) {
  const base = { checked: 0, failures: [], unlocated: [], blocked: "" };
  if (writtenSkills.length === 0) return base;

  const unlocated = writtenSkills.filter((s) => !findSkillDir(cwd, s));
  const locatable = writtenSkills.filter((s) => findSkillDir(cwd, s));

  const resolver = path.join(cwd, BMAD_RESOLVER);
  if (!fs.existsSync(resolver)) return { ...base, unlocated, blocked: "resolver not found" };
  if (!hasUv()) return { ...base, unlocated, blocked: "'uv' not on PATH" };

  const failures = [];
  for (const skill of locatable) {
    const r = spawnSync("uv", ["run", resolver, "--skill", findSkillDir(cwd, skill), "--project-root", cwd], {
      encoding: "utf8",
    });
    if (r.error || r.status !== 0) {
      failures.push({
        skill,
        detail: (r.stderr || r.error?.message || `exit ${r.status}`).trim().split("\n")[0],
      });
    }
  }
  return { checked: locatable.length, failures, unlocated, blocked: "" };
}

// ---- Framework detection ---------------------------------------------------

const detect = (cwd) =>
  FRAMEWORK_NAMES.filter((name) => {
    const dir = path.join(cwd, FRAMEWORKS[name].detectDir);
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  });

/** Resolve which frameworks to act on, honoring an explicit --framework. */
const resolveFrameworks = (cwd, explicit) => {
  const detected = detect(cwd);
  if (explicit && !FRAMEWORK_NAMES.includes(explicit)) {
    throw new Error(`unknown framework '${explicit}'. Valid: ${FRAMEWORK_NAMES.join(", ")}`);
  }
  const wanted = explicit ? detected.filter((n) => n === explicit) : detected;

  const frameworks = [];
  const unsupported = [];
  const notes = {};
  for (const name of wanted) {
    const pre = FRAMEWORKS[name].preflight?.(cwd);
    if (pre && !pre.ok) unsupported.push({ name, message: pre.message });
    else {
      if (pre?.note) notes[name] = pre.note;
      frameworks.push(name);
    }
  }
  return { frameworks, detected, unsupported, notes };
};

// ---- Commands --------------------------------------------------------------

const out = (m) => process.stdout.write(m + "\n");
const warn = (m) => process.stderr.write("! " + m + "\n");
const label = (fw, notes) => FRAMEWORKS[fw].label + (notes[fw] ? ` (${notes[fw]})` : "");

function initPatchFramework(cwd, fw, dryRun, tally) {
  for (const p of FRAMEWORKS[fw].patches) {
    const target = path.join(cwd, p.target);
    if (!fs.existsSync(target)) {
      warn(`  skip ${p.target} — file not found (framework not fully initialized?)`);
      tally.missing++;
      continue;
    }
    const before = fs.readFileSync(target, "utf8");
    const { text, action } = applyToText(target, before, p.content(), p.anchorBefore);
    if (action === "appended-no-anchor") {
      warn(`  anchor '${p.anchorBefore}' not found in ${p.target}; appended at end of file instead`);
    }
    if (text !== before) {
      if (!dryRun) fs.writeFileSync(target, text);
      tally.changed++;
      out(`  ${dryRun ? "would " : ""}${action}: ${p.target} [${p.id}]`);
    } else {
      out(`  unchanged: ${p.target} [${p.id}]`);
    }
  }
}

function initWriteFramework(cwd, fw, dryRun, tally) {
  for (const f of FRAMEWORKS[fw].files) {
    const target = path.join(cwd, f.target);
    const payload = f.content();
    const id = fileIdOf(payload);
    const body = payload.replace(/\n+$/, "") + "\n";
    const exists = fs.existsSync(target);
    const before = exists ? fs.readFileSync(target, "utf8") : null;

    if (exists && !isOwnedFile(before, id)) {
      // Someone else owns this file. BMad overrides are a single table per file
      // and TOML forbids a duplicate table header, so there is no safe way to
      // append a second block — report and hand the user the keys instead.
      if (before.includes("commercetools-spec-extension-rules.md")) {
        out(`  already wired by hand: ${f.target} [${f.id}]`);
        tally.manual++;
      } else {
        warn(`  skip ${f.target} — exists and was not written by this overlay; merge the following into it:`);
        for (const line of payloadBody(payload).split("\n")) warn(`      ${line}`);
        tally.foreign++;
      }
      continue;
    }

    if (exists && before === body) {
      out(`  unchanged: ${f.target} [${f.id}]`);
      continue;
    }

    if (!dryRun) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
      tally.written.push({ target, prev: before });
      if (f.skill) tally.skills.push(f.skill);
    }
    tally.changed++;
    const verb = exists ? (dryRun ? "would replace" : "replaced") : dryRun ? "would create" : "created";
    out(`  ${verb}: ${f.target} [${f.id}]`);
  }
}

function doInit(cwd, frameworks, notes, dryRun) {
  out(`Applying the commercetools overlay${dryRun ? " (dry-run)" : ""}`);
  const tally = { changed: 0, missing: 0, foreign: 0, manual: 0, written: [], skills: [] };
  for (const fw of frameworks) {
    out(`\n${label(fw, notes)}:`);
    if (FRAMEWORKS[fw].mode === "write") initWriteFramework(cwd, fw, dryRun, tally);
    else initPatchFramework(cwd, fw, dryRun, tally);
  }

  // BMad fails closed on a bad override, so verify with its own resolver before
  // leaving the project in a state where its workflows would HALT.
  if (!dryRun && frameworks.includes("bmad") && tally.skills.length) {
    const v = validateBmadWrites(cwd, tally.skills);
    out("");
    if (v.failures.length) {
      warn(`BMad's resolver rejected ${v.failures.length} override(s); rolling back the BMad writes:`);
      for (const f of v.failures) warn(`  ${f.skill}: ${f.detail}`);
      for (const w of tally.written) {
        if (w.prev === null) fs.rmSync(w.target, { force: true });
        else fs.writeFileSync(w.target, w.prev);
      }
      warn(
        "Rolled back — no BMad override was left applied. The named skill's own customize.toml " +
          "may be corrupt (repair the BMad install), or the overlay payload is wrong (report it).",
      );
      if (frameworks.length > 1) warn("Blocks applied to the other detected frameworks above are unaffected.");
      return 6;
    }
    if (v.blocked) {
      warn(
        `Could not validate the overrides (${v.blocked}). They were written but unverified — ` +
          "install 'uv' and re-run, then confirm BMad's skills still activate.",
      );
    } else {
      out(`Validated ${v.checked} override(s) with BMad's resolver`);
    }
    if (v.unlocated.length) {
      warn(
        `${v.unlocated.length} override(s) name a skill this BMad install does not have, so they are ` +
          `inert until it does: ${v.unlocated.join(", ")}`,
      );
      warn(
        "These payloads target the current BMad skill set; earlier v6 releases named these skills " +
          "differently. Run 'npx bmad-method install' to update BMad, then re-run this script.",
      );
    }
  }

  out(
    `\n${dryRun ? "Would apply" : "Applied"} ${tally.changed} block(s)/file(s)` +
      (tally.missing ? `, ${tally.missing} target(s) skipped (missing)` : "") +
      (tally.foreign ? `, ${tally.foreign} skipped (not ours)` : "") +
      (tally.manual ? `, ${tally.manual} already wired by hand` : ""),
  );
  return 0;
}

function doRemove(cwd, frameworks, notes, dryRun) {
  out(`Removing the commercetools overlay${dryRun ? " (dry-run)" : ""}`);
  let removed = 0;
  for (const fw of frameworks) {
    out(`\n${label(fw, notes)}:`);
    if (FRAMEWORKS[fw].mode === "write") {
      for (const f of FRAMEWORKS[fw].files) {
        const target = path.join(cwd, f.target);
        if (!fs.existsSync(target)) {
          out(`  not present: ${f.target} [${f.id}]`);
          continue;
        }
        const text = fs.readFileSync(target, "utf8");
        if (!isOwnedFile(text, fileIdOf(f.content()))) {
          warn(`  keep ${f.target} — not written by this overlay`);
          continue;
        }
        if (!dryRun) fs.rmSync(target, { force: true });
        removed++;
        out(`  ${dryRun ? "would delete" : "deleted"}: ${f.target} [${f.id}]`);
      }
      continue;
    }
    for (const p of FRAMEWORKS[fw].patches) {
      const target = path.join(cwd, p.target);
      if (!fs.existsSync(target)) continue;
      const before = fs.readFileSync(target, "utf8");
      if (!installedIds(target, before).includes(p.id)) {
        out(`  not present: ${p.target} [${p.id}]`);
        continue;
      }
      const text = removeFromText(target, before);
      if (!dryRun) fs.writeFileSync(target, text);
      removed++;
      out(`  ${dryRun ? "would remove" : "removed"}: ${p.target} [${p.id}]`);
    }
  }
  out(`\n${dryRun ? "Would remove" : "Removed"} ${removed} block(s)/file(s)`);
  return 0;
}

function doStatus(cwd, frameworks, notes) {
  out(`commercetools overlay status\ndetected: ${detect(cwd).join(", ") || "none"}`);
  for (const fw of frameworks) {
    out(`\n${label(fw, notes)}:`);
    if (FRAMEWORKS[fw].mode === "write") {
      for (const f of FRAMEWORKS[fw].files) {
        const target = path.join(cwd, f.target);
        if (!fs.existsSync(target)) {
          out(`  [ ] ${f.id}  (${f.target})`);
          continue;
        }
        const ours = isOwnedFile(fs.readFileSync(target, "utf8"), fileIdOf(f.content()));
        out(`  [${ours ? "x" : "~"}] ${f.id}  (${f.target})${ours ? "" : "  — exists, not ours"}`);
      }
      continue;
    }
    for (const p of FRAMEWORKS[fw].patches) {
      const target = path.join(cwd, p.target);
      if (!fs.existsSync(target)) {
        out(`  missing target: ${p.target}`);
        continue;
      }
      const present = installedIds(target, fs.readFileSync(target, "utf8")).includes(p.id);
      out(`  [${present ? "x" : " "}] ${p.id}  (${p.target})`);
    }
  }
  return 0;
}

// ---- Entry point -----------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.flags.help = true;
    else if (a === "--dry-run") args.flags.dryRun = true;
    else if (a === "--framework") args.flags.framework = argv[++i];
    else if (a === "--cwd") args.flags.cwd = argv[++i];
    else if (a.startsWith("--")) throw new Error(`unknown option '${a}'`);
    else args._.push(a);
  }
  return args;
}

function run(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    warn(e.message);
    out(USAGE);
    return 2;
  }

  if (args.flags.help) {
    out(USAGE);
    return 0;
  }

  // The slash command invokes this with no subcommand for the common case.
  const cmd = args._[0] || "init";
  if (!COMMANDS.includes(cmd)) {
    warn(`unknown command '${cmd}'`);
    out(USAGE);
    return 2;
  }

  const cwd = path.resolve(args.flags.cwd || process.cwd());

  let resolved;
  try {
    resolved = resolveFrameworks(cwd, args.flags.framework);
  } catch (e) {
    warn(e.message);
    return 2;
  }
  const { frameworks, detected, unsupported, notes } = resolved;

  for (const u of unsupported) warn(`${FRAMEWORKS[u.name].label}: ${u.message}`);

  if (detected.length === 0) {
    warn("No SDD framework detected here (looked for '.specify/', 'openspec/' and '_bmad/').");
    if (fs.existsSync(path.join(cwd, ".bmad-core")))
      warn("Found '.bmad-core/' — that is BMad v4, which has no override contract this overlay can use. Upgrade to BMad v6 ('npx bmad-method install').");
    warn("Run 'specify init', 'openspec init' or 'npx bmad-method install' first, then re-run this command.");
    return 4;
  }
  if (frameworks.length === 0) {
    if (unsupported.length) return 5;
    warn(
      `--framework ${args.flags.framework} not detected here (detected: ${detected.join(", ") || "none"}).`,
    );
    return 4;
  }

  if (cmd === "status") return doStatus(cwd, frameworks, notes);
  if (cmd === "init") return doInit(cwd, frameworks, notes, args.flags.dryRun);
  return doRemove(cwd, frameworks, notes, args.flags.dryRun);
}

process.exit(run(process.argv.slice(2)));
