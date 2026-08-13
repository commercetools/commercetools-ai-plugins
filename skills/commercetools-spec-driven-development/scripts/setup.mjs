#!/usr/bin/env node
// Install, remove, or inspect the commercetools spec-driven-development overlay
// in a GitHub Spec Kit or OpenSpec project. Invoked by this skill's SKILL.md; also
// runnable directly. Zero npm deps (Node core only), Node >= 18.
//
// The overlay creates no files. It performs marker-delimited text surgery on the
// files listed in FRAMEWORKS, so it is idempotent (re-applying replaces the block
// in place) and reversible (remove restores the original bytes).
//
// Usage:
//   node setup.mjs [init|remove|status] [--framework speckit|openspec] [--dry-run] [--cwd <dir>]
//     init    apply the overlay to every detected framework (default)
//     remove  strip previously applied blocks
//     status  report which blocks are currently applied
// Exit codes: 0 ok · 2 bad arguments · 4 no SDD framework detected in <cwd>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCHES = path.join(path.dirname(fileURLToPath(import.meta.url)), "patches");

const read = (rel) => fs.readFileSync(path.join(PATCHES, rel), "utf8");

// The ONLY files this installer will ever touch. `anchorBefore` inserts the block
// immediately before that heading when present, otherwise the block is appended at
// end-of-file with a logged warning. `null` means always append at EOF.
const FRAMEWORKS = {
  speckit: {
    label: "GitHub Spec Kit",
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
};

const FRAMEWORK_NAMES = Object.keys(FRAMEWORKS);
const COMMANDS = ["init", "remove", "status"];

const USAGE = `setup.mjs — wire commercetools skills into Spec Kit / OpenSpec

Usage:
  setup.mjs init    [--framework speckit|openspec] [--dry-run] [--cwd <dir>]
  setup.mjs remove  [--framework speckit|openspec] [--dry-run] [--cwd <dir>]
  setup.mjs status  [--framework speckit|openspec] [--cwd <dir>]

Options:
  --framework <f>  Act only on the named framework (default: all detected)
  --dry-run        Print what would change; write nothing
  --cwd <dir>      Operate in <dir> instead of the current directory
  -h, --help       Show this help

Detection: '.specify/' -> spec-kit, 'openspec/' -> openspec.`;

// ---- Marker-block patch engine --------------------------------------------
// MARKER is part of the on-disk format: renaming it orphans blocks written by an
// earlier version, so `remove` can no longer clean them up. The `v=` inside a
// marker is declared by the patch file itself — this script never writes a
// marker, it only matches one and swaps the body. Comment syntax follows the
// target file's extension: `#` for YAML, HTML comments for everything else.

const MARKER = "commercetools-spec-extension";

/** Matches one whole marker block in `targetPath`, capturing its id. */
const blockReFor = (targetPath) =>
  /\.ya?ml$/i.test(targetPath)
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

// ---- Framework detection ---------------------------------------------------

const detect = (cwd) =>
  FRAMEWORK_NAMES.filter((name) => {
    const dir = path.join(cwd, FRAMEWORKS[name].detectDir);
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  });

/** Resolve which frameworks to act on, honoring an explicit --framework. */
const resolveFrameworks = (cwd, explicit) => {
  const detected = detect(cwd);
  if (explicit) {
    if (!FRAMEWORK_NAMES.includes(explicit)) {
      throw new Error(`unknown framework '${explicit}'. Valid: ${FRAMEWORK_NAMES.join(", ")}`);
    }
    return { frameworks: detected.includes(explicit) ? [explicit] : [], detected };
  }
  return { frameworks: detected, detected };
};

// ---- Commands --------------------------------------------------------------

const out = (m) => process.stdout.write(m + "\n");
const warn = (m) => process.stderr.write("! " + m + "\n");

function doInit(cwd, frameworks, dryRun) {
  out(`Applying the commercetools overlay${dryRun ? " (dry-run)" : ""}`);
  let changed = 0;
  let missing = 0;
  for (const fw of frameworks) {
    out(`\n${FRAMEWORKS[fw].label}:`);
    for (const p of FRAMEWORKS[fw].patches) {
      const target = path.join(cwd, p.target);
      if (!fs.existsSync(target)) {
        warn(`  skip ${p.target} — file not found (framework not fully initialized?)`);
        missing++;
        continue;
      }
      const before = fs.readFileSync(target, "utf8");
      const { text, action } = applyToText(target, before, p.content(), p.anchorBefore);
      if (action === "appended-no-anchor") {
        warn(`  anchor '${p.anchorBefore}' not found in ${p.target}; appended at end of file instead`);
      }
      if (text !== before) {
        if (!dryRun) fs.writeFileSync(target, text);
        changed++;
        out(`  ${dryRun ? "would " : ""}${action}: ${p.target} [${p.id}]`);
      } else {
        out(`  unchanged: ${p.target} [${p.id}]`);
      }
    }
  }
  out(
    `\n${dryRun ? "Would apply" : "Applied"} ${changed} block(s)` +
      (missing ? `, ${missing} target(s) skipped (missing)` : ""),
  );
  return 0;
}

function doRemove(cwd, frameworks, dryRun) {
  out(`Removing the commercetools overlay${dryRun ? " (dry-run)" : ""}`);
  let removed = 0;
  for (const fw of frameworks) {
    out(`\n${FRAMEWORKS[fw].label}:`);
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
  out(`\n${dryRun ? "Would remove" : "Removed"} ${removed} block(s)`);
  return 0;
}

function doStatus(cwd, frameworks) {
  out(`commercetools overlay status\ndetected: ${detect(cwd).join(", ") || "none"}`);
  for (const fw of frameworks) {
    out(`\n${FRAMEWORKS[fw].label}:`);
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
  const { frameworks, detected } = resolved;

  if (detected.length === 0) {
    warn("No SDD framework detected here (looked for '.specify/' and 'openspec/').");
    warn("Run 'specify init' or 'openspec init' first, then re-run this command.");
    return 4;
  }
  if (frameworks.length === 0) {
    warn(
      `--framework ${args.flags.framework} not detected here (detected: ${detected.join(", ") || "none"}).`,
    );
    return 4;
  }

  if (cmd === "status") return doStatus(cwd, frameworks);
  if (cmd === "init") return doInit(cwd, frameworks, args.flags.dryRun);
  return doRemove(cwd, frameworks, args.flags.dryRun);
}

process.exit(run(process.argv.slice(2)));
