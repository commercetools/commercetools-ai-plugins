// Full-screen painting without a clear-screen. Some terminals (iTerm2 with "save lines to
// scrollback when an app clears the screen") keep every cleared frame as history, so a 100 ms
// repaint fills the scrollback with copies of the screen. Instead: go home, erase each line
// before writing it, and blank the rows below the frame one by one, never moving past the last
// row (that would scroll). Identical frames are not written at all.
export function frameText(lines, rows) {
  const body = lines.map((l) => `\x1b[K${l}`).join('\n');
  if (!rows) return `\x1b[H${body}\n\x1b[J`;
  return `\x1b[H${body}${'\n\x1b[K'.repeat(Math.max(0, rows - lines.length))}`;
}

export function createPainter(write, rows) {
  let last = null;
  return {
    paint(lines) {
      const text = frameText(lines, rows());
      if (text === last) return;
      last = text;
      write(text);
    },
    reset() { last = null; },
  };
}
