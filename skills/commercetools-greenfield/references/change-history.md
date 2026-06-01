# Audit / Change History API — Basic vs Premium

**Source:** Audit_Change history API_ Premium vs. Basic (Expert Services)

---

## Basic vs Premium Comparison

| Feature | Basic | Premium |
|---------|-------|---------|
| **Retention period** | 1 year | 3 years |
| **Change tracking scope** | MC-initiated changes only | MC + commercetools APIs + Import API |
| **Custom Objects** | Not tracked | Tracked |
| **API client changes visible** | No | Yes |
| **Import API changes visible** | No | Yes |

**Critical distinction:** If your team or batch jobs make changes via the API or Import API (not the Merchant Center), those changes are **invisible in the Basic plan**. Only Premium tracks the full change surface. This is a common gap discovered during compliance reviews.

---

## ChangeHistory API Payload Structure

Each change record contains:

```json
{
  "resource": {
    "id": "<resource-uuid>",
    "typeId": "product",
    "key": "product-key"
  },
  "label": { "type": "ProductLabel", "name": {...}, "slug": {...} },
  "previousLabel": { "type": "ProductLabel", "name": {...}, "slug": {...} },
  "version": 7,
  "previousVersion": 5,
  "modifiedAt": "2025-03-18T17:51:00.723Z",
  "modifiedBy": {
    "isPlatformClient": true,
    "id": "<user-uuid>",
    "type": "user"
  },
  "stores": [],
  "type": "ResourceUpdated",
  "withoutChanges": false,
  "changes": [
    {
      "catalogData": "staged",
      "variant": "MGD-01",
      "priceId": "<price-uuid>",
      "nextValue": { "id": "<price-uuid>", "value": { "currencyCode": "USD", "centAmount": 79900 }, "country": "US" },
      "previousValue": { "id": "<price-uuid>", "value": { "currencyCode": "USD", "centAmount": 179900 }, "country": "US" },
      "change": "changePrice",
      "type": "ChangePriceChange"
    }
  ]
}
```

### Key Fields

**`modifiedBy`** — identifies who made the change:
- `isPlatformClient: true` + `type: "user"` → change came from Merchant Center UI (a human user)
- `isPlatformClient: false` + `type: "user"` + `clientId: "<api-client-id>"` → change came from an API client (batch job, integration, Import API)

**`withoutChanges`** — `false` = a tracked change occurred; `true` = resource was updated but the change type is not tracked (e.g., metadata-only update). Records with `withoutChanges: true` still appear in history but carry no `changes` array content.

**`changes[]`** — array of individual field changes, each with:
- `change`: action name (e.g., `"changePrice"`, `"addProduct"`, `"setProductCount"`)
- `type`: change type discriminator (e.g., `"ChangePriceChange"`, `"AddProductChange"`)
- `nextValue` / `previousValue`: the new and old values for the changed field
- Resource-specific context fields (e.g., `catalogData`, `variant`, `priceId` for product price changes)

---

## Scenario Examples

### Scenario 1: MC User Changes an Embedded Price (Product Variant)

A Merchant Center user manually edits a product's embedded price.

- **Basic:** Visible in both MC UI change history and the ChangeHistory API. `modifiedBy.isPlatformClient: true`, `type: "user"`.
- **Premium:** Same visibility, but also visible for any API-initiated price change.

The `changes[]` entry shows:
```json
{
  "catalogData": "staged",
  "variant": "M0E20000000DWCM",
  "priceId": "<price-uuid>",
  "nextValue": { "value": { "currencyCode": "USD", "centAmount": 2750 }, "country": "US" },
  "previousValue": { "value": { "currencyCode": "USD", "centAmount": 28750 }, "country": "US" },
  "change": "changePrice",
  "type": "ChangePriceChange"
}
```

### Scenario 2: API Client Adds a Product to a Product Selection

A batch job or integration (API client) adds a product to a Product Selection via the REST API.

- **Basic:** **Change is invisible.** Neither the MC UI nor the ChangeHistory API returns any record of this change. Compliance audits cannot detect it.
- **Premium:** Fully visible. `modifiedBy.isPlatformClient: false`, `clientId: "<api-client-id>"`. The `changes[]` includes both `SetProductCountChange` and `AddProductChange` entries.

```json
"modifiedBy": {
  "isPlatformClient": false,
  "type": "user",
  "clientId": "4W4G78A9p0M62qdwQwfKViI8"
}
```

---

## Decision Guide: When to Use Premium

Upgrade to Premium if any of the following apply:

- Integrations (PIM, ERP, OMS, import jobs) write to CT via API or Import API
- Compliance or audit requirements mandate tracking all changes, regardless of origin
- You need 3-year retention for regulatory reasons
- Custom Object changes must be auditable (e.g., loyalty points, store configurations stored as CoCos)
- You want to attribute changes to specific API clients for debugging integration issues

Use Basic if changes happen exclusively through Merchant Center and 1-year retention is sufficient.

---

## Using `clientId` for Integration Debugging

In Premium, the `modifiedBy.clientId` field identifies which API client made a change. This is useful for:
- Tracking which integration caused an unexpected price change
- Verifying that an import job ran correctly (by confirming the expected `clientId` appears in history)
- Security audits — detecting unauthorized API client access to sensitive resources

Name your API clients clearly (e.g., `erpIntegration-prod`, `pimSync-staging`) so `clientId` values are interpretable in change history logs.
