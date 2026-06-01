# Channels — Concept, Roles, and Setup

**Source:** 2024 Revised Channels and Stores (Expert Services / CSE Americas)

---

## What Is a Channel?

A Channel is a grouping concept applied to product prices or inventory entries. It lets you represent a warehouse, a distribution hub, or a physical retail space as a named entity that other resources (prices, inventory) can reference.

Channels are used across commercetools APIs to connect entities (like inventory or price) to a specific source or destination:
- An inventory entry can be connected to a **supply channel** (the warehouse it lives in)
- A price can be connected to a **distribution channel** (the selling context it applies to)

Key defaults: each project is limited to **100 channels per channel role** and **100 channels per store** by default.

---

## Channel Roles

A channel must declare one or more roles that define how it is used.

| Role | Purpose |
|------|---------|
| `ProductDistribution` | Expose products to a specific channel and define channel-specific variant pricing |
| `InventorySupply` | Track inventory entries; model distribution centers or per-location inventory |
| `OrderExport` | Track order export activities |
| `OrderImport` | Track order import activities |
| `Primary` | Marks one channel as the main/primary channel among channels of the same type; can be combined with other roles |

---

## ProductDistribution Role

Used to attach a channel to a product **price**. When you create a price draft, you optionally reference a distribution channel. The channel is then one of the criteria the platform uses during **price selection** (alongside currency, country, customer group, and valid date).

**Key rules:**
- Prices with a `ProductDistribution` channel are only returned in product projections when that channel is explicitly requested via `priceChannel`
- Always include fallback prices (no channel) in the pricing model — if no channel-specific price matches, the platform falls back to the next best match
- When a store has distribution channels set, only prices whose channel is in the store's distribution channels (or prices with no channel) are included in store-scoped product projections

### Defining channel-based pricing

```json
{
  "actions": [
    {
      "action": "addPrice",
      "sku": "sku-test-4",
      "price": {
        "value": {
          "currencyCode": "USD",
          "centAmount": 4000
        },
        "channel": {
          "type": "channel",
          "id": "<channel-id>"
        }
      }
    }
  ]
}
```

---

## InventorySupply Role

Used to attach a channel to an **inventory entry**. Lets you track per-warehouse or per-store stock levels at the SKU level.

### Defining channel-based inventory

```json
{
  "sku": "sample-sku-11111",
  "quantityOnStock": 10,
  "availableQuantity": 10,
  "channel": {
    "type": "channel",
    "id": "df6ba4d5-fe3e-4687-a6cf-4027bb446611"
  }
}
```

### Querying inventory availability in product projection search

Channels with `InventorySupply` role can be used in product projections search to filter variant availability:

```
# Return only variants in-stock in a specific channel
variants.availability.channels.<channel-id>.isOnStock:true

# Search by available quantity range
variants.availability.channels.<channel-id>.availableQuantity:range (1 to *)
```

---

## Channels in the Shopping Cart

### distributionChannel — price selection

When creating a cart, `currency`, `country`, and `customerGroup` are set on the CartDraft. The **distributionChannel** is set at the **line item** level in the `addLineItem` action. The platform uses all of these together to select the correct matching price.

```json
{
  "version": 1,
  "actions": [
    {
      "action": "addLineItem",
      "quantity": 1,
      "sku": "my-sku",
      "distributionChannel": {
        "type": "channel",
        "id": "2539c5f0-0f4d-4a48-b95e-b5f2b92073e3"
      }
    }
  ]
}
```

### supplyChannel — inventory reservation

The `supplyChannel` on a line item identifies which inventory entries to reserve when the cart converts to an order.

**Critical constraint:** If the cart is bound to a store, the `supplyChannel` on each line item must match one of the store's supply channels.

```json
{
  "action": "addLineItem",
  "quantity": 1,
  "sku": "my-sku",
  "distributionChannel": {
    "type": "channel",
    "id": "2539c5f0-0f4d-4a48-b95e-b5f2b92073e3"
  },
  "supplyChannel": {
    "type": "channel",
    "id": "2539c5f0-0f4d-4a48-b95e-b5f2b92073e3"
  }
}
```

---

## Price Selection in Product Projections

To trigger channel-based price selection in a product projection search, pass the channel ID as `priceChannel`:

```
GET .../in-store/key=store-0002/product-projections/search?
  filter.query=variants.sku:"test-sku"
  &priceCurrency=USD
  &priceCountry=US
  &priceChannel=2539c5f0-0f4d-4a48-b95e-b5f2b92073e3
  &priceCustomerGroup=d102c6e4-66fc-4534-a694-00d58569b262
```

Example matched price in response:

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
