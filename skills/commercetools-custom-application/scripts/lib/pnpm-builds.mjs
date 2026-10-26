// pnpm 10+ refuses to install when a dependency has an install script nobody has decided on
// (ERR_PNPM_IGNORED_BUILDS). The fix is an explicit `allowBuilds` map in pnpm-workspace.yaml.
// We deny every undecided package: starters build without running dependency scripts.
// An existing decision, including an explicit `true`, is never changed.

// Reads the package names out of the pnpm error text. Versions are dropped and duplicates merged.
export function parseIgnoredBuilds(output) {
  const m = String(output ?? '').match(/Ignored build scripts:\s*([^\n]+)/);
  if (!m) return [];
  const names = m[1].split(',').map((s) => s.trim().replace(/\.$/, '').replace(/(?<=.)@[^@\s]+$/, '')).filter(Boolean);
  return [...new Set(names)].sort();
}

const quote = (name) => (/^[A-Za-z0-9._-]+$/.test(name) ? name : `'${name}'`);
const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2');

export function mergeAllowBuilds(existing, names) {
  if (!names.length) return existing;
  const lines = existing.split('\n');
  const start = lines.findIndex((l) => /^allowBuilds:\s*$/.test(l));
  let end = start;
  const decided = new Set();
  if (start !== -1) {
    for (let i = start + 1; i < lines.length && /^\s+\S/.test(lines[i]); i += 1) {
      end = i;
      const m = lines[i].match(/^\s+(.+?):\s*\S+\s*$/);
      if (m) decided.add(unquote(m[1]));
    }
  }
  const added = [...new Set(names)].filter((n) => !decided.has(n)).sort().map((n) => `  ${quote(n)}: false`);
  if (!added.length) return existing;
  if (start !== -1) {
    lines.splice(end + 1, 0, ...added);
    return lines.join('\n');
  }
  const base = existing && !existing.endsWith('\n') ? `${existing}\n` : existing;
  return `${base}allowBuilds:\n${added.join('\n')}\n`;
}
