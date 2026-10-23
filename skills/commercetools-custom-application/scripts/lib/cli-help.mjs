// One option table drives both argument parsing and the --help man page, so the docs cannot
// drift from what the script accepts.

// Strips documentation fields, leaving what util.parseArgs understands.
export function toParseArgsOptions(options) {
  return Object.fromEntries(
    Object.entries(options).map(([name, o]) => [name, { type: o.type, ...(o.multiple ? { multiple: true } : {}), ...(o.default !== undefined ? { default: o.default } : {}) }]),
  );
}

const wrap = (text, width, indent) => {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join('\n');
};

// doc: { name, summary, description, synopsis[], options, exit{code: text}, examples[[title, command]] }
export function renderHelp(doc) {
  const out = [];
  const section = (title, body) => out.push(`\n${title}\n${body}`);
  section('NAME', `    ${doc.name} - ${doc.summary}`);
  section('SYNOPSIS', doc.synopsis.map((s) => `    ${s}`).join('\n'));
  section('DESCRIPTION', doc.description.split('\n\n').map((p) => wrap(p, 76, '    ')).join('\n\n'));
  const opts = Object.entries(doc.options).map(([name, o]) => {
    const flag = `--${name}${o.type === 'string' ? ` <${o.arg ?? 'value'}>` : ''}`;
    return `    ${flag}\n${wrap(o.description, 70, '        ')}`;
  });
  section('OPTIONS', opts.join('\n\n'));
  section('EXIT STATUS', Object.entries(doc.exit).map(([code, text]) => `    ${code}   ${text}`).join('\n'));
  section('EXAMPLES', doc.examples.map(([title, cmd]) => `    ${title}\n        ${cmd}`).join('\n\n'));
  return `${out.join('\n')}\n`;
}
