// Pure rendering of the running session: lines of text (optionally coloured) for a given state,
// width and animation frame. No terminal I/O, so layout rules are unit tested.
import { fitSegments } from './style.mjs';
import { progressOf } from './session.mjs';

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function progressBar(fraction, width) {
  const filled = Math.min(width, Math.max(0, Math.round(fraction * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

const both = (...fns) => (t) => fns.reduceRight((x, f) => f(x), t);

// Word-wraps text to `width` columns. A word longer than the width is cut rather than lost.
// Wraps a path at its slashes, so every line is a copyable run of segments. The first line may
// be shorter because a label sits in front of it.
export function wrapPath(text, firstWidth, width) {
  const lines = [];
  let line = '';
  let limit = firstWidth;
  for (let part of String(text ?? '').split(/(?=\/)/)) {
    if (line && line.length + part.length > limit) {
      lines.push(line);
      line = '';
      limit = width;
    }
    while (part.length > limit) {
      if (line) { lines.push(line); line = ''; limit = width; }
      lines.push(part.slice(0, limit));
      part = part.slice(limit);
    }
    line += part;
  }
  if (line) lines.push(line);
  return lines;
}

export function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = '';
    }
    let w = word;
    while (w.length > width) {
      if (line) { lines.push(line); line = ''; }
      lines.push(w.slice(0, width));
      w = w.slice(width);
    }
    line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines;
}

// `rows` is the terminal height: the frame never exceeds it. The log tail gives way first, then
// the top of the step list, so the controls under the active step stay on screen.
export function sessionLines(state, { width, frame = 0, st, appName, logPath, nextCheckIn, input, logLines = 6, rows }) {
  const plain = (t) => t;
  const bold = both(st.bold);
  const lines = [];
  const add = (...segs) => lines.push(fitSegments(segs, width));
  const { done, total, fraction } = progressOf(state);

  add([appName, both(st.bold, st.cyan)], [`  ${done}/${total} steps  `, st.dim], [progressBar(fraction, 20), done === total ? both(st.bold, st.green) : st.cyan]);
  add(['─'.repeat(width), both(st.cyan, st.dim)]);

  for (const s of state.steps) {
    // A polling wait (the step re-checks by itself) looks like running: the spinner keeps turning
    // and nothing is yellow. The warning mark is for waits that need the user.
    const icon = {
      done: ['✓', both(st.bold, st.green)],
      running: [SPINNER[frame % SPINNER.length], both(st.bold, st.cyan)],
      waiting: s.polling ? [SPINNER[frame % SPINNER.length], both(st.bold, st.cyan)] : ['!', both(st.bold, st.yellow)],
      failed: ['✗', both(st.bold, st.red)],
      pending: ['○', st.dim],
    }[s.status];
    const titleStyle = s.status === 'pending' ? st.dim : s.status === 'failed' ? both(st.bold, st.red) : s.status === 'done' ? plain : bold;
    add([` ${icon[0]} `, icon[1]], [s.title, titleStyle], ...(s.status === 'done' && s.detail ? [[`  ${s.detail}`, st.dim]] : []));
    // A waiting or failed step is where the user acts: answer the question in the box, or press
    // a key. Failures never leave the screen on their own; r runs the step again.
    const key = (k, what) => [[k, both(st.bold, st.cyan)], [` ${what}`, st.dim]];
    // Reasons, errors and prompts are what the user has to read, so they wrap, never truncate.
    const para = (text, style) => { for (const l of wrap(text, Math.max(10, width - 5))) add(['     ', plain], [l, style]); };
    const controls = (retryWord) => {
      if (input?.options) {
        // A list to pick from: ids and names in columns, the cursor row marked, the team the CLI
        // would have used marked as current but not chosen.
        para(`${input.label}:`, st.dim);
        const idWidth = Math.max(...input.options.map((o) => o.id.length));
        const nameWidth = Math.max(...input.options.map((o) => o.name.length));
        input.options.forEach((o, i) => {
          const here = i === input.cursor;
          add(['     ', plain], [here ? '▸ ' : '  ', both(st.bold, st.magenta)], [o.id.padEnd(idWidth), here ? bold : plain],
            [`   ${o.name.padEnd(nameWidth)}   ${o.plan}`, here ? plain : st.dim], ...(o.current ? [['   current', st.dim]] : []));
        });
        add(['     ', plain], ...key('↑↓', 'choose'), ['   ', plain], ...key('enter', 'use it'), ['   ', plain], ...key('esc', 'quit'));
      } else if (input) {
        para(`${input.label}:`, st.dim);
        add(['     ', plain], ['> ', both(st.bold, st.magenta)], [input.secret ? '•'.repeat(input.value.length) : input.value, bold], [' ', st.inverse]);
        add(['     ', plain], ...key('enter', 'use it'), ['   ', plain], ...key('esc', 'quit'));
      } else {
        add(['     ', plain], ...key('r', retryWord), ['   ', plain], ...key('q', 'quit'),
          ...(nextCheckIn !== undefined ? [[`   next check in ${nextCheckIn}s`, st.dim]] : []));
      }
    };
    if (s.status === 'waiting') {
      para(s.detail, s.polling ? st.dim : st.yellow);
      controls('check now');
    }
    if (s.status === 'failed') {
      para(s.detail, st.red);
      if (logPath) {
        const label = 'Full log: ';
        const [first, ...rest] = wrapPath(logPath, Math.max(10, width - 5 - label.length), Math.max(10, width - 5));
        add(['     ', plain], [label, st.dim], [first, st.dim]);
        for (const l of rest) add(['     ', plain], [l, st.dim]);
      }
      controls('retry');
    }
  }

  const active = state.steps.find((s) => s.status === 'running') ?? state.steps.find((s) => s.status === 'waiting') ?? state.steps.find((s) => s.status === 'failed');
  const tail = Math.min(logLines, rows ? rows - lines.length - 2 : Infinity);
  if (active && active.log.length && tail >= 1) {
    lines.push('');
    add([`── ${active.title} output `, both(st.cyan, st.dim)], ['─'.repeat(Math.max(0, width - active.title.length - 12)), both(st.cyan, st.dim)]);
    for (const l of active.log.slice(-tail)) add(['  │ ', st.dim], [l, st.dim]);
  }
  return rows && lines.length > rows ? lines.slice(-rows) : lines;
}
