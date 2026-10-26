// Fetching a page from the host, with a way through corporate TLS inspection. On a managed
// machine the proxy's CA lives in the system keychain, which Node does not read, so fetch fails
// with a certificate-authority error while curl (which reads the keychain) gets through. A CA
// error therefore falls back to curl; every other error is the caller's. Redirects are never
// followed: the Merchant Center proxy would not follow them either, and the check must see them.
const CA_CODES = new Set([
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'CERT_UNTRUSTED',
]);

export const errorCode = (e) => e?.cause?.code ?? e?.code ?? null;
export const isCaError = (e) => CA_CODES.has(errorCode(e));

// fetchImpl: the global fetch. curl(args) -> { code, stdout, stderr }.
export async function fetchPage(url, { fetchImpl, curl }) {
  try {
    const res = await fetchImpl(url, { redirect: 'manual' });
    return { status: res.status, body: res.status === 200 ? await res.text() : '', via: 'fetch' };
  } catch (e) {
    if (!isCaError(e)) throw e;
    const r = await curl(['-sS', '--max-time', '30', '-w', '\n%{http_code}', url]);
    const out = String(r.stdout ?? '');
    const cut = out.lastIndexOf('\n');
    const status = Number(out.slice(cut + 1).trim());
    if (r.code !== 0 || !Number.isInteger(status) || status < 100) {
      throw new Error(`${errorCode(e)}; ${String(r.stderr ?? '').trim() || `curl exited with ${r.code}`}. Node could not verify the host's certificate and neither could curl. Set NODE_EXTRA_CA_CERTS to the trusted CA bundle.`);
    }
    return { status, body: status === 200 ? out.slice(0, cut) : '', via: 'curl' };
  }
}
