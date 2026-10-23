import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, providerFor } from '../scripts/lib/providers/index.mjs';

// Every provider the session can deploy to exposes the same seam: a label for the step title, a
// CLI for preflight, plan lines for the review screen, and the deploy itself.
test('each provider has the shape the session and the screens rely on', () => {
  for (const [id, p] of Object.entries(PROVIDERS)) {
    assert.equal(p.id, id);
    assert.equal(typeof p.label, 'string');
    assert.equal(typeof p.cli.name, 'string');
    assert.equal(typeof p.cli.install, 'string');
    assert.ok(Array.isArray(p.cli.login.args));
    assert.equal(typeof p.cli.login.hint, 'string');
    assert.ok(p.planLines().length >= 2, `${id} must say what deployment help does`);
    assert.equal(typeof p.deploy, 'function');
    assert.equal(typeof p.protectedHint, 'function');
  }
});

test('vercel is a provider, and unknown or manual hosts are not', () => {
  assert.equal(PROVIDERS.vercel.label, 'Vercel');
  assert.equal(providerFor('vercel'), PROVIDERS.vercel);
  assert.equal(providerFor('other'), null);
  assert.equal(providerFor('surge'), null);
  assert.equal(providerFor(undefined), null);
});
