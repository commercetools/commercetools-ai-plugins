---
name: payment-connector-test-harness
description: Scaffold a minimal standalone frontend harness wired to a deployed commercetools payment connector to prove the full session→enabler→submit→Payment flow before touching production code.
when_to_use:
  - "Building a throwaway test harness against a deployed connector"
  - "Proving a connector works end to end before integrating into a real storefront"
metadata:
  contentType: REFERENCE
  area:
    - checkout
    - payments
    - psp
    - connect
---

# Test harness

A small standalone app is the fastest way to prove a deployed connector works end to end. Build the harness, take one test payment, confirm the Payment object (→ [verification.md](./verification.md)), then port the proven flow into the real storefront. Keep it disposable — it holds secrets and uses shortcuts (client-side token, throwaway cart) that must never ship.

## Shape

Any minimal stack works (Vite + React, or a single HTML file). It needs to do the 8 steps from [connector-contract.md](./connector-contract.md): get a token, make a non-zero cart, create a session, warm the processor, load the enabler, mount the drop-in, gate Pay on `ready`, submit.

> Security note: a real app does steps 1–3 (token, cart, session) **server-side** so client credentials and `manage_sessions` never reach the browser. A local harness may do them client-side for speed, but say so and never deploy it.

## Config the harness needs

```
CT_AUTH_URL, CT_API_URL            # region hosts
CT_SESSION_HOST                    # https://session.{region}.commercetools.com
CT_PROJECT_KEY
CT_CLIENT_ID, CT_CLIENT_SECRET     # client with manage_sessions (+ cart/payment read for verify)
PROCESSOR_URL                      # deployed connector processor URL
ENABLER_URL                        # deployed connector enabler URL (serves connector-enabler.umd.js)
CHECKOUT_APPLICATION_KEY           # or PROCESSOR_URL again, per what the connector's session metadata expects
```

**Reading config in a Vite harness:** if you store config in a plain file (e.g. `connector-env`) without a `.env` extension, Vite's `loadEnv()` won't pick it up — it only reads files whose names start with `.env`. Use `fs.readFileSync` + a custom parser in `vite.config.js` instead:

```js
import fs from 'fs';
function parseEnvFile(filePath) {
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
  );
}
const env = parseEnvFile('../connector-env');
export default { define: { __PROCESSOR_URL__: JSON.stringify(env.PROCESSOR_URL), /* … */ } };
```

## The flow (pseudocode)

```js
// 1) token (client_credentials)
const token = await oauth(CT_AUTH_URL, CT_CLIENT_ID, CT_CLIENT_SECRET, 'manage_sessions:'+CT_PROJECT_KEY);

// 2) non-zero cart (ExternalAmount avoids needing a tax category — see contract pitfall 3)
const cart = await post(`${CT_API_URL}/${CT_PROJECT_KEY}/carts`, token, {
  currency: 'EUR', taxMode: 'ExternalAmount',
  customLineItems: [{ name:{en:'Test item'}, slug:'test-item', quantity:1,
    money:{currencyCode:'EUR',centAmount:1999},
    externalTaxRate:{name:'test',amount:0,country:'DE'} }],
});

// 3) session — cartRef + processor-matching metadata (contract pitfalls 1, 2)
const session = await post(`${CT_SESSION_HOST}/${CT_PROJECT_KEY}/sessions`, token, {
  cart: { cartRef: { id: cart.id } },
  metadata: { applicationKey: CHECKOUT_APPLICATION_KEY }, // or { processorUrl: PROCESSOR_URL }
});

// 4) warm the processor (contract pitfall 10)
await fetch(`${PROCESSOR_URL}/operations/status`).catch(()=>{});

// 5) load enabler UMD (contract pitfall 5) — inject a <script> and await its load
await loadScript(`${ENABLER_URL}/connector-enabler.umd.js`);
const { Enabler } = window.Connector;            // global is provider-specific

// 6) construct + build
const enabler = new Enabler({
  processorUrl: PROCESSOR_URL, sessionId: session.id, locale: 'en-US',
  onComplete: (r) => setStatus('paid: ' + JSON.stringify(r)),
  onError:   (e) => setStatus('error: ' + (e?.message ?? e?.code)),
});
const dropin = await (await enabler.createDropinBuilder('embedded')).build({ showPayButton: false });

// 7) mount + wait for ready (contract pitfall 7)
dropin.mount('#dropin-container');
container.addEventListener('ready', () => enablePayButton(), { once: true });
setTimeout(enablePayButton, 5000); // fallback if no ready event

// 8) on Pay click
payButton.onclick = () => dropin.submit();
```

## After it works
- Verify the Payment (→ [verification.md](./verification.md)).
- Move steps 1–3 server-side for the real integration, and add Order creation + post-purchase operations (→ [backend-integration.md](./backend-integration.md)); the browser only ever gets the `sessionId`, processor URL, and enabler URL.
- Delete the harness or scrub its secrets.

## Checklist
- [ ] harness reads processor/enabler URLs and CT creds from config, not hardcoded
- [ ] non-zero cart; session with `cartRef` + correct `metadata`
- [ ] enabler loaded from UMD bundle; `ready`-gated Pay button
- [ ] one test-card payment completed and verified as a CT Payment
- [ ] harness not deployed; secrets removed afterward
