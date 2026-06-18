# HighPrecisionMoney

Documentation: https://docs.commercetools.com/api/types#highprecisionmoney

## When to use (and when not to)

HighPrecision Money provides greater decimal precision than the BaseMoney type. Allowing for non-traditional currencies (for example, Crypto Currencies) as well as product pricing (for example, Gasoline).

Usage documentation: https://docs.commercetools.com/api/types#usage

Introducing HighPrecisionMoney into a project can add risk and complexity. The business value of supporting HighPrecisionMoney should be evaluated against this risk and complexity, including:

- Added application logic to differentiate between BaseMoney and HighPrecisionMoney types
- Potential for rounding conflicts within the cart and upstream/downstream systems
- Not all resources/features which support Money support HighPrecisionMoney (for example absolute discount values)

## Considerations

- commercetools APIs (and therefore Merchant Center) will convert HighPrecisionMoney amounts with precision less than or equal to the currency's default precision to BaseMoney.

  - For example, if a product price is created with a HighPrecisionMoney type with a `fractionDigits` value of 3 and `preciseAmount` of 123.450, the result will be a BaseAmount with `centAmount` of 123.45.

  - This means that even if all products will only have HighPrecisionMoney prices, storefront applications will need to support BaseMoney prices in case of rounded prices.

- Absolute discount values (Product Discounts & Cart Discounts) don't yet support HighPrecisionMoney

## Implementation

**HighPrecisionMoney and BaseMoney prices can coincide within a Variant's price array:**

```javascript
"prices": [
    {
        "id": "497a7774-fb4f-4a77-977b-a1f5a3d23904",
        "value": {
            "type": "centPrecision",
            "currencyCode": "USD",
            "centAmount": 350,
            "fractionDigits": 2
        }
    },
    {
        "id": "6b183aa7-7b46-4c65-b360-ef7f30bd8d73",
        "value": {
            "type": "highPrecision",
            "currencyCode": "USD",
            "preciseAmount": 123456,
            "fractionDigits": 7
        },
        "key": "high-precision",
        "country": "US"
    }
],
```

Price dimension differentiation requirements still apply — note the "country" dimension on the `highPrecision` price above.

**Price Selection Response**

```json
// BaseMoney
"price": {
    "id": "497a7774-fb4f-4a77-977b-a1f5a3d23904",
    "value": {
        "type": "centPrecision",
        "currencyCode": "USD",
        "centAmount": 350,
        "fractionDigits": 2
    }
}
```

```json
// HighPrecisionMoney
"price": {
    "id": "6b183aa7-7b46-4c65-b360-ef7f30bd8d73",
    "value": {
        "type": "highPrecision",
        "currencyCode": "USD",
        "preciseAmount": 123456,
        "fractionDigits": 7
    },
    "key": "high-precision",
    "country": "US"
}
```

Notice in both cases the selected price is returned in the `price.value` block. The difference is the presence of `preciseAmount` and `fractionDigits` attributes in the case of HighPrecisionMoney.

**GraphQL Solution**

Since GraphQL requires results to match expected Types, an implementation can include fragments mapping both BaseMoney and HighPrecisionMoney types.

```graphql
# In result definition where price is used, 
# include fragment definitions for both Money types
price(currency: $currency) {
  value {
    ...money
    ...preciseMoney
    __typename
  }
}

# Create fragments for each BaseMoney and HighPrecision types
fragment money on BaseMoney {
  type
  currencyCode
  centAmount
  fractionDigits
}

fragment preciseMoney on HighPrecisionMoney {
  type
  currencyCode
  centAmount
  fractionDigits
  preciseAmount
}
```

## Price Rounding Mode

commercetools supports configurable price rounding at the cart and project level via `priceRoundingMode`. This directly affects ERP reconciliation when CT totals must match external systems exactly.

**Configuration locations:**
- `CartDraft.priceRoundingMode` — per-cart override at creation time
- Project Settings — default for all carts in the project
- Also applies to: `Order`, `OrderImportDraft`, `Quote`, `QuoteRequest`

**Available modes:**
| Mode | Behavior |
|------|----------|
| `HalfEven` (banker's rounding) | Rounds 0.5 to the nearest even digit; minimizes cumulative rounding error over many transactions |
| `HalfUp` | Standard rounding — 0.5 always rounds up |
| `HalfDown` | 0.5 always rounds down |

**When to use:** Choose `HalfEven` when ERP or financial systems use banker's rounding (common in European finance). Choose `HalfUp` for standard retail rounding. Mismatched rounding modes between CT and downstream/ERP systems cause reconciliation discrepancies — agree on the mode before go-live.
