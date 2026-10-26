// The real machine behind the steps: subprocesses, files, the browser login, the network. Shared
// by the screen session (onboard.mjs) and the headless runner (headless.mjs). A fixture swaps the
// subprocesses and the network for scripted answers, so a whole run can be driven without touching
// an account; the files stay real unless the fixture fakes them.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { redactCommand } from './redact.mjs';

export function createDeps({ fixture = null, skillDir, sessionValid, platform = process.platform }) {
  let logPath = null;
  let activeChild = null;
  const logAppend = (text) => { if (logPath) fs.appendFileSync(logPath, text); };

  // `env` adds to the process environment for one command: that is how tokens reach a CLI without
  // landing in the command line, which goes to the log (with secret flag values masked anyway).
  function realExec(cmd, args, { cwd, onLine, env } = {}) {
    return new Promise((resolve) => {
      logAppend(`\n$ ${redactCommand(cmd, args)}\n`);
      const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env, FORCE_COLOR: '0', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
      activeChild = child;
      let stdout = '';
      let stderr = '';
      const pump = (stream, sink) => {
        let buf = '';
        stream.on('data', (d) => {
          sink(d.toString());
          buf += d.toString();
          const parts = buf.split('\n');
          buf = parts.pop();
          for (const l of parts) if (l.trim()) onLine?.(l);
        });
      };
      pump(child.stdout, (t) => { stdout += t; logAppend(t); });
      pump(child.stderr, (t) => { stderr += t; logAppend(t); });
      child.on('error', (e) => resolve({ code: 127, stdout, stderr: `${stderr}${e.message}` }));
      child.on('close', (code) => { activeChild = null; resolve({ code: code ?? 1, stdout, stderr }); });
    });
  }

  const fakeFiles = fixture?.files ?? {};
  function fakeExec(cmd, args, opts = {}) {
    const line = [cmd, ...args].join(' ');
    // `real` lists command patterns the fixture does not script, so a demo can scaffold and build for real.
    if ((fixture.real ?? []).some((pattern) => line.includes(pattern))) return realExec(cmd, args, opts);
    const { onLine } = opts;
    logAppend(`\n$ ${redactCommand(cmd, args)}\n`);
    const hit = (fixture.answers ?? []).find(([pattern]) => line.includes(pattern));
    let reply = hit?.[1] ?? {};
    if (reply.seq) {
      hit.used = (hit.used ?? 0) + 1;
      reply = reply.seq[Math.min(hit.used, reply.seq.length) - 1];
    }
    return new Promise((resolve) => setTimeout(() => {
      for (const l of String(reply.stdout ?? '').split('\n').filter(Boolean)) onLine?.(l);
      // A scripted create-mc-app still has to leave an app behind for the next steps to find.
      if (reply.createsApp) {
        const dir = args[1];
        fakeFiles[`${dir}/package.json`] = '{}';
        fakeFiles[`${dir}/custom-application-config.mjs`] = "const config = { mainMenuLink: { defaultLabel: 'Template starter' } };";
      }
      resolve({ code: 0, stdout: '', stderr: '', ...reply });
    }, fixture.delayMs ?? 300));
  }

  // The Connect provider calls the Connect API directly. A fixture answers from `http`, keyed by
  // "METHOD /path" (a value, or an array answered in sequence), and never reaches the network.
  const httpUsed = {};
  async function fakeFetch(url, init = {}) {
    const method = init.method ?? 'GET';
    const key = `${method} ${new URL(url).pathname}`;
    logAppend(`\n> ${key}\n`);
    let reply = fixture.http?.[key];
    if (Array.isArray(reply)) {
      httpUsed[key] = (httpUsed[key] ?? 0) + 1;
      reply = reply[Math.min(httpUsed[key], reply.length) - 1];
    }
    const status = reply?.status ?? (reply ? 200 : 404);
    const body = JSON.stringify(reply?.body ?? {});
    await new Promise((r) => setTimeout(r, fixture.delayMs ?? 300));
    return { ok: status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
  }

  const deps = {
    exec: fixture ? fakeExec : realExec,
    readFile: async (p) => (p in fakeFiles ? fakeFiles[p] : fs.readFileSync(p, 'utf8')),
    // Fixture writes stay fake unless the file is real on disk (a scaffold that actually ran).
    writeFile: async (p, c) => { if (fixture && !fs.existsSync(p)) fakeFiles[p] = c; else fs.writeFileSync(p, c); },
    exists: (p) => p in fakeFiles || fs.existsSync(p),
    // A fixture may have faked the app folder, so a move into it stays fake too.
    rename: async (from, to) => {
      if (fixture && (from in fakeFiles || !fs.existsSync(path.dirname(to)))) {
        fakeFiles[to] = from in fakeFiles ? fakeFiles[from] : fs.readFileSync(from, 'utf8');
        return;
      }
      fs.renameSync(from, to);
    },
    relocateLog: (to) => {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(logPath, to);
      logPath = to;
    },
    platform,
    sessionValid,
    skillDir,
    fetch: fixture ? fakeFetch : (url, init) => fetch(url, init),
    // The login runs in its own process group so that quitting kills the callback server on port
    // 3001 as well, not only the npx wrapper.
    startLogin: ({ mcApiUrl: url, onLine }) => {
      if (fixture) {
        onLine?.('  https://mc-api.example/login/authorize?state=fixture');
        return { running: () => true, kill: () => {} };
      }
      logAppend(`\n$ npx @commercetools-frontend/mc-scripts login --mc-api-url ${url}\n`);
      const child = spawn('npx', ['@commercetools-frontend/mc-scripts', 'login', '--mc-api-url', url], {
        detached: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let alive = true;
      const pumpLines = (stream) => {
        let buf = '';
        stream.on('data', (d) => {
          logAppend(d.toString());
          buf += d.toString();
          const parts = buf.split('\n');
          buf = parts.pop();
          for (const l of parts) if (l.trim()) onLine?.(l);
        });
      };
      pumpLines(child.stdout);
      pumpLines(child.stderr);
      child.on('exit', () => { alive = false; });
      child.on('error', () => { alive = false; });
      return {
        running: () => alive,
        kill: () => { if (alive) { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); } } },
      };
    },
  };

  return {
    deps,
    logAppend,
    getLogPath: () => logPath,
    setLogPath: (p) => { logPath = p; },
    killActive: () => activeChild?.kill(),
  };
}
