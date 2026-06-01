# Price Channel Selection — Mechanics and Fallback Strategy

**Source:** 2024 Revised Channels and Stores (Expert Services / CSE Americas)

---

## How Price Selection Works

When the platform selects a price for a variant (in a product projection search, a cart line item add, or an order), it evaluates all prices against a set of criteria. The criteria are applied together — the platform picks the most specific matching price.

### Price Selection Criteria (all optional, applied together)

| Criterion | Where Set | API Parameter / Field |
|-----------|-----------|----------------------|
| Currency | CartDraft or query param | `priceCurrency` |
| Country | CartDraft or query param | `priceCountry` |
| Customer Group | CartDraft or query param | `priceCustomerGroup` |
| Distribution Channel | LineItemDraft or query param | `priceChannel` |
| Valid date range | Price itself | `validFrom` / `validUntil` |

The platform returns the **single best-matching price** for each variant. If multiple prices match the same criteria, the most specific one wins.

---

## Fallback Pricing — Always Required

Channel-specific prices are returned only when that channel is explicitly requested. If no channel is requested, prices with a `channel` reference are filtered out in standard projection mode.

**A pricing model without fallback (channel-less) prices will produce variants with no price** when requests are made without a `priceChannel` parameter — for example, in admin tooling, order management UIs, or any integration that queries products without channel context.

**Best practice:** Every variant that has channel-specific prices should also have at least one price with:
- The correct currency
- No channel reference
- No customer group reference

This ensures a price is always returned regardless of the query context.

---

## Price Selection in Product Projection Search

Full example with all criteria specified:

```
GET .../in-store/key=store-0002/product-projections/search?
  filter.query=variants.sku:"test-sku"
  &priceCurrency=USD
  &priceCountry=US
  &priceChannel=2539c5f0-0f4d-4a48-b95e-b5f2b92073e3
  &priceCustomerGroup=d102c6e4-66fc-4534-a694-00d58569b262
```

The response embeds the selected price in the variant's `price` field. The example below shows a price that matched on channel, customer group, country, and validity period:

```json
"price": {
  "validUntil": "2021-05-16T00:00:00.000Z",
  "validFrom": "2021-05-11T00:00:00.000Z",
  "channel": {
    "typeId": "channel",
    "id": "2539c5f0-0f4d-4a48-b95e-b5f2b92073e3"
  },
  "customerGroup": {
    "typeId": "customer-group",
    "id": "d102c6e4-66fc-4534-a694-00d58569b262"
  },
  "country": "US",
  "value": {
    "type": "centPrecision",
    "currencyCode": "USD",
    "centAmount": 3000,
    "fractionDigits": 2
  }
}
```

---

## Price Selection at Cart Line Item Level

When a line item is added to a cart, price selection runs automatically using the cart-level criteria (`currency`, `country`, `customerGroup`) combined with the line item's `distributionChannel`:

```json
{
  "action": "addLineItem",
  "quantity": 1,
  "sku": "my-sku",
  "distributionChannel": {
    "type": "channel",
    "id": "2539c5f0-0f4d-4a48-b95e-b5f2b92073e3"
  }
}
```

The platform resolves and **snapshots** the selected price onto the line item. Subsequent changes to the product's prices do not update the cart. Use the `recalculate` cart update action to refresh prices before checkout if price freshness is required.

---

## Store Projection and Price Filtering

When using the in-store API or the `storeProjection` query parameter:

- If the store has distribution channels, **only prices whose channel is in the store's distribution channels are included** — plus prices with no channel
- The `priceChannel` query parameter still narrows which of those filtered prices becomes the selected (embedded) `price` field on each variant

This two-stage filtering is important to understand:
1. **Store filters the price list** — removes prices from other channels
2. **`priceChannel` selects one price** — picks the best match from the filtered list

---

## Common Anti-Patterns

- **Setting a channel-specific price only, with no fallback price.** Any code path that queries without `priceChannel` will get no price on the variant.
- **Overloading the distribution channel concept for non-pricing segmentation.** Channels are intended for price and inventory segmentation. For customer segmentation (different UX, not different prices), use customer groups or stores instead.
- **Using the same channel ID for both `ProductDistribution` and `InventorySupply`.** These roles can be on the same channel, but conflating them makes it harder to change the inventory model independently from the pricing model. Prefer separate channels per role for clean separation.
