---
name: data-loading
description: B2B extensions to shared data-loading patterns covering as-associate chain, BU-scoped SWR keys, and B2B-specific mappers.
when_to_use:
  - "Fetching B2B data with the as-associate API chain"
  - "Designing BU-scoped SWR cache keys"
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

See the shared [reference](../core/data-loading.md) for the Server vs SWR decision, commercetools type boundary, BFF route shape, version conflict retry, and caching patterns. This file covers B2B-specific additions only.
See the shared [reference](../core/data-loading.md) for the Server vs SWR decision, commercetools type boundary, BFF route shape, version conflict retry, and caching patterns. This file covers B2B-specific additions only.

---

## as-associate Chain in lib/ct/

Every function in `lib/ct/` that reads or writes a cart, order, or quote must go through the as-associate chain — not the project-level `apiRoot`. This applies to the version conflict logic in Pattern 4 as well: the re-fetch (version) logic use `asAssociateInStore(associateId, businessUnitKey)`. See [reference](./cart.md) for the helper.

---

## BU-Scoped SWR Keys

Data that belongs to a business unit must use a `[KEY, buKey]` tuple as the SWR key. Passing `null` as the key suspends the fetch until `businessUnitKey` is available in the session.

```typescript
return useSWR<Order[]>(
  buKey ? [KEY_ORDERS, buKey] : null,
  ordersFetcher,
  { revalidateOnFocus: false }
);
```

Never use a plain string key for BU-scoped data — two users in different BUs on the same client would share the cache.

---

## Additional Mapper Files

Extend the shared mapper table with these B2B-specific files:

| File | Maps |
|---|---|
| `lib/mappers/business-unit.ts` | commercetools `BusinessUnit` → app `BusinessUnit` |
| `lib/mappers/quote.ts` | commercetools `Quote` / `QuoteRequest` → app types |
| `lib/mappers/approval-flow.ts` | commercetools `ApprovalFlow` → app `ApprovalFlow` |
| `lib/mappers/associate-role.ts` | commercetools `AssociateRole` → app `AssociateRole` |

---

## Checklist

- [ ] Extends shared data-loading patterns
- [ ] All `lib/ct/` functions use the as-associate chain — including inside version conflict logic
- [ ] BU-scoped SWR hooks use `[KEY, buKey]` tuple; `null` key when BU not yet resolved
- [ ] B2B mapper files present for `business-unit`, `quote`, `approval-flow`, `associate-role`
- [ ] `unstable_cache` never used for per-BU data
