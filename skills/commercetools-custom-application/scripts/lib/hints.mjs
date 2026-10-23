// One hint bar for every screen: pairs of [key, what it does], rendered as
// "  key what  ·  key what". The same action uses the same key on every screen.

export const FORM_HINTS = [['↑↓/tab', 'move'], ['←→', 'change'], ['enter', 'continue'], ['esc', 'quit']];
export const REVIEW_HINTS = [['↑↓/tab', 'move'], ['←→', 'change'], ['e', 'show details'], ['enter', 'start'], ['b', 'back to picker'], ['esc', 'quit']];

// Segments for fitSegments: keys bold cyan, descriptions dim, dots between pairs. When the bar
// would not fit `width`, the gaps shrink first so the last keys are not cut off.
export function hintSegments(items, st, { width = Infinity } = {}) {
  const key = (t) => st.bold(st.cyan(t));
  const build = (gap) => {
    const segs = [['  ', (t) => t]];
    items.forEach(([k, what], n) => {
      if (n) segs.push([gap, st.dim]);
      segs.push([k, key], [` ${what}`, st.dim]);
    });
    return segs;
  };
  const length = (segs) => segs.reduce((n, [t]) => n + t.length, 0);
  const wide = build('  ·  ');
  return length(wide) <= width ? wide : build(' · ');
}
