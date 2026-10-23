// Every command the session runs is written to session.log as one line. Secrets passed as flag
// values must not be: this masks them, whether given as `--flag value` or `--flag=value`.
const SECRET_FLAGS = new Set(['--token', '--auth', '--client-secret', '--api-key', '--password', '--secret']);

export function redactCommand(cmd, args) {
  const out = [];
  let mask = false;
  for (const arg of args) {
    if (mask) {
      out.push('***');
      mask = false;
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq > 0 && SECRET_FLAGS.has(arg.slice(0, eq))) {
      out.push(`${arg.slice(0, eq)}=***`);
      continue;
    }
    if (SECRET_FLAGS.has(arg)) mask = true;
    out.push(arg);
  }
  return [cmd, ...out].join(' ');
}
