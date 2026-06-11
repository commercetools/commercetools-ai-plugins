---
name: data-loading
description: B2B extensions to shared data-loading patterns covering as-associate chain, BU-scoped client state-manager/cache keys, and B2B-specific mappers.
when_to_use:
  - "Fetching B2B data with the as-associate API chain"
  - "Designing BU-scoped client state-manager/cache keys"
  - "Mapping B2B resources to application types"
  - "Implementing version conflict logic for B2B operations"
metadata:
  contentType: REFERENCE
  area:
    - b2b
    - session
    - permissions
---

# Data Loading — B2B Extensions

> See the shared [reference](../core/data-loading.md) and stack's `data-loading.md` for the server-load vs client-state decision, commercetools type boundary, BFF route shape, version conflict retry, and caching patterns. This file covers B2B-specific additions only.

---

## as-associate Chain in <server>/ct/

Every function in `<server>/ct/` that reads or writes a cart, order, or quote must go through the as-associate chain — not the project-level `apiRoot`. This applies to the version conflict logic in Pattern 4 as well: the re-fetch (version) logic use `asAssociateInStore(associateId, businessUnitKey)`. See [reference](./cart.md) for the helper.

---

## BU-Scoped client state-manager/cache Keys

Data that belongs to a business unit must use a `[KEY, buKey]` tuple as the client state-manager/cache key. Passing an empty/null key suspends the fetch until `businessUnitKey` is available in the session. The client state-manager/cache re-fetches automatically when the key changes (BU switch).


> Find the stack's `concept-mapping.md` for concrete client-state and cache implementation.

Never use a plain string key for BU-scoped data — two users in different BUs on the same client would share the cache.

---

## Additional Mapper Files

Extend the shared mapper table with these B2B-specific files:

| File | Maps |
|---|---|
| `<server>/mappers/business-unit` | commercetools `BusinessUnit` → app `BusinessUnit` |
| `<server>/mappers/quote` | commercetools `Quote` / `QuoteRequest` → app types |
| `<server>/mappers/approval-flow` | commercetools `ApprovalFlow` → app `ApprovalFlow` |
| `<server>/mappers/associate-role` | commercetools `AssociateRole` → app `AssociateRole` |

---

## Checklist

- [ ] Extends shared data-loading patterns
- [ ] All `<server>/ct/` functions use the as-associate chain — including inside version conflict logic
- [ ] BU-scoped client-state hooks use `[KEY, buKey]` tuple; empty/null key when BU not yet resolved
- [ ] B2B mapper files present for `business-unit`, `quote`, `approval-flow`, `associate-role`
- [ ] the framework's server-side cache-with-TTL (Next.js: `unstable_cache`) never used for per-BU data
