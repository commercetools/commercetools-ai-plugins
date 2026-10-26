// Rewrites env.production.applicationId / url in a custom-application-config.mjs.
// Scoped to the `production: { ... }` block so menu-link urls and the like are never touched.
// Throws when it cannot find what it expects: a silent no-op here would ship a build
// with the wrong applicationId, which fails far from the cause (infinite reload loop in the MC).
// A url of the form ${env:NAME} is an environment reference that the build resolves (Connect
// injects APPLICATION_URL that way). It is accepted as a url value, and this names the variable
// so a caller can set it for a build or a config sync, or null when the url is a literal.
const ENV_REF = /^\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/;

export function envPlaceholder(source) {
  const m = String(source ?? '').match(/production:\s*\{[^}]*\burl:\s*(['"])([^'"]*)\1/);
  return m?.[2].match(ENV_REF)?.[1] ?? null;
}

export function patchConfig(source, { applicationId, url }) {
  if (url !== undefined && !/^https:\/\//.test(url) && !ENV_REF.test(url)) {
    throw new Error(`Production url must start with https:// or be an environment reference like \${env:APPLICATION_URL} (got "${url}").`);
  }
  const block = /(production:\s*\{)([^}]*)(\})/;
  const m = source.match(block);
  if (!m) throw new Error('Could not find an env.production block in the config file.');
  let body = m[2];
  const setKey = (key, value) => {
    const re = new RegExp(`(${key}:\\s*)(['"])[^'"]*\\2`);
    if (!re.test(body)) throw new Error(`Could not find env.production.${key} in the config file.`);
    body = body.replace(re, `$1'${value}'`);
  };
  if (applicationId !== undefined) setKey('applicationId', applicationId);
  if (url !== undefined) setKey('url', url);
  return source.replace(block, `$1${body}$3`);
}
