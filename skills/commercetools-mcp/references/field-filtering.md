# Field filtering & output formatting (both variants)

Tool responses are the biggest hidden context cost: a single product read returns variants, prices,
attributes, and audit metadata the agent never uses. **The primary goal is token cost — drop what the
task doesn't need.** Both variants use the same `@commercetools/processors` engine; only the config
surface differs.

## Drop vs redact vs keep

- **Keep** any field the task actually uses — don't strip PII a customer-service or fulfilment agent
  needs (email, address, line items). Filtering is not a substitute for the right tools and
  least-privilege scopes ([select-tools.md](./select-tools.md)); that's where access is controlled.
- **Drop** (remove the field and everything nested under it) everything the task doesn't read, including
  sensitive fields it doesn't need. Biggest token saver and the one you'll reach for most: audit
  metadata, unused nested structures, large arrays.
- **Redact** (keep the key, replace the value) only where the agent must *know a field exists* — or
  downstream code keys off its shape — but must not see the value. The API already returns true secrets
  masked (a Customer `password` comes back as a hash), so redaction is mostly redundant for secrets on
  the current tool surface. Its realistic use is governance: keeping identifiable data out of the model's
  context or out of logs when the agent runs in a shared or third-party runtime.

## Managed: `jsonOutputFiltering`

```jsonc
"jsonOutputFiltering": {
  "redact": {                              // replace value, keep key
    "fieldNames": ["password"],            // exact field name at any depth (case-sensitive)
    "fieldNameContains": ["secret"]        // substring of a field name at any depth (case-INsensitive)
  },
  "drop": {                                // remove key + nested value
    "fieldNames": ["vatId"],
    "fieldPaths": ["addresses.phone"]      // exact dotted path (case-sensitive)
  },
  "fieldPathsToKeep": ["custom.fields.loyaltyTier"],  // exempt paths from redact/drop
  "redactedWith": "[REDACTED]"             // placeholder; defaults to "[REDACTED]" if omitted
}
```

Matcher semantics (each matcher — `redact` and `drop` — supports all three):
- `fieldPaths` — exact dotted path from the root, **case-sensitive**.
- `fieldNames` — exact field name at **any depth**, **case-sensitive**.
- `fieldNameContains` — **substring** of a field name at any depth, **case-insensitive** (widest net;
  the safer bias for redaction).
- `fieldPathsToKeep` — exact paths that survive even if they would otherwise match a `redact`/`drop` rule.

## Self-hosted: `--fieldFiltering`

Pass a stringified `FieldFilteringManagerConfig`. Same engine, flatter shape — rules carry their own
`type` (`filter` = drop, `redact` = mask):

```json
{
  "jsonRedactionText": "[REDACTED]",
  "paths":      [{ "value": "addresses.phone", "type": "filter", "caseSensitive": true }],
  "properties": [{ "value": "vatId",           "type": "filter", "caseSensitive": true },
                 { "value": "password",         "type": "redact", "caseSensitive": true }],
  "includes":   [{ "value": "secret",           "type": "redact", "caseSensitive": false }],
  "whitelistPaths": [{ "value": "custom.fields.loyaltyTier", "caseSensitive": false }]
}
```

| Managed `jsonOutputFiltering` | Self-hosted `FieldFilteringManagerConfig` |
|---|---|
| `drop` | rules with `type: "filter"` |
| `redact` | rules with `type: "redact"` |
| `fieldPaths` | `paths` |
| `fieldNames` | `properties` |
| `fieldNameContains` | `includes` |
| `fieldPathsToKeep` | `whitelistPaths` |
| `redactedWith` | `jsonRedactionText` (URLs: `urlRedactionText`) |

Managed defaults `fieldPaths`/`fieldNames` to case-sensitive and `fieldNameContains` to case-insensitive;
self-hosted sets `caseSensitive` explicitly per rule.

## Worked filter (a customer read)

An analytics agent segments customers by loyalty tier and country — no use for contact details or tax id,
so drop them and keep that PII out of the model's context entirely:

```jsonc
// Managed
"jsonOutputFiltering": {
  "drop": { "fieldNames": ["email", "vatId"], "fieldPaths": ["addresses.phone"] }
}
```

## Discover what to filter

Don't guess field names — read the real shape ([inspect-project-data.md](./inspect-project-data.md)):
call the tool once and inspect the payload, or fetch the resource schema with `openApi-schemata.mjs` /
`graphql-schemata.mjs`.

**Be careful with `custom.fields.*` and custom objects.** Project-defined and opaque in the generic
schema, they may hold business-critical data or pure integration noise. Never blanket-drop `custom`
without reading real values first; use `fieldPathsToKeep` to spare the important ones from a broader rule.

Confirm the filter with the user, especially custom fields and anything borderline-sensitive — they know
which fields carry business meaning and whether the task needs a given piece of PII.

## Output formatting

For list-heavy tools, compact further — Managed: `"toolOutputFormatting": "JsonToTabular"`; self-hosted:
`--toolOutputFormat=tabular`. This renders array results as a table instead of repeated JSON objects.
Trim fields first, then format.
