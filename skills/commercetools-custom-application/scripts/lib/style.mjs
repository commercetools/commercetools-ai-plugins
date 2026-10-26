// Minimal ANSI styling for the picker. Each style closes only the attribute it opened, never a
// full reset, so a background colour set on a whole row survives the styled pieces inside it.
const PAIRS = {
  bold: [1, 22], dim: [2, 22], italic: [3, 23], inverse: [7, 27],
  red: [31, 39], green: [32, 39], yellow: [33, 39], blue: [34, 39], magenta: [35, 39], cyan: [36, 39], gray: [90, 39],
  bg: ['48;5;236', 49], // subtle highlight for the row under the cursor
};

export function createStyle({ color }) {
  return Object.fromEntries(
    Object.entries(PAIRS).map(([name, [open, close]]) => [name, color ? (t) => `\x1b[${open}m${t}\x1b[${close}m` : (t) => t]),
  );
}

// NO_COLOR (https://no-color.org) disables colour when set to a non-empty value.
export function colorEnabled(env, isTty) {
  if (env.NO_COLOR) return false;
  if (env.TERM === 'dumb') return false;
  return Boolean(isTty);
}

export const stripAnsi = (t) => t.replace(/\x1b\[[0-9;]*m/g, '');

// segments: [[text, styleFn], ...]. Cuts by visible width and marks the cut with `~`.
export function fitSegments(segments, width) {
  const total = segments.reduce((n, [t]) => n + t.length, 0);
  if (total <= width) return segments.map(([t, f]) => f(t)).join('');
  let room = Math.max(0, width - 1);
  const out = [];
  for (const [t, f] of segments) {
    if (room <= 0) break;
    out.push(f(t.slice(0, room)));
    room -= t.length;
  }
  return `${out.join('')}~`;
}
