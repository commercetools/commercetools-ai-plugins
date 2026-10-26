// Provider-neutral proof that a host is wired the way the Merchant Center proxy needs.
// The proxy forwards /:projectKey/:entryPointUriPath/* to the app url and expects index.html
// back for every one of those paths. So: fetch the app path and a deeper path that cannot be a
// real file. If hosting rewrites correctly, both return the same app shell.
export function evaluateHost({ root, deep }) {
  const problems = [];
  const redirected = [root, deep].some((r) => r.status >= 300 && r.status < 400);
  if (redirected) {
    problems.push('Host answers with a redirect. The Merchant Center proxy does not follow it to the app; serve the app at this exact URL (check http to https and www to apex redirects).');
    return { ok: false, problems };
  }
  if (root.status !== 200 || !/<script/i.test(root.body)) {
    problems.push(`App path returned ${root.status} without an app shell. The host must serve the built index.html here.`);
  }
  if (deep.status !== 200 || deep.body !== root.body) {
    problems.push(`A deeper path returned ${deep.status}${deep.status === 200 ? ' with different content' : ''}. The host is missing the rewrite of every path to index.html.`);
  }
  return { ok: problems.length === 0, problems };
}
