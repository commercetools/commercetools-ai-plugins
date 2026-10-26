// `mc-scripts login` and `pnpm start` both use localhost:3001. If a server already holds it,
// the login browser flow lands on that server instead of the Merchant Center and auth fails.

// `probe(port)` returns a description of the listener, or null when the port is free.
export function portCheck(port, probe) {
  const listener = probe(port);
  return {
    name: `port ${port} is free`,
    ok: listener === null,
    required: true,
    detail: listener === null
      ? 'free'
      : `${listener} is listening. Stop it before running \`mc-scripts login\`, or the login lands on that server and fails.`,
  };
}

// Reads `lsof -nP -iTCP:<port> -sTCP:LISTEN` output.
export function parseLsof(output) {
  const row = (output ?? '').split('\n').slice(1).find((l) => l.trim());
  if (!row) return null;
  const [command, pid] = row.trim().split(/\s+/);
  return `${command} (pid ${pid})`;
}
