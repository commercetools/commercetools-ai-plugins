# Dynamic Shipping Rate Calculation using Functions

## Overview

While you can build an external calculation and set it on the cart, it is possible to dynamically calculate shipping rates using tiered rates, cart score and functions.

## Documentation

- https://docs.commercetools.com/tutorials/shipping-rate#enabling-tiered-shipping-rates
- https://docs.commercetools.com/tutorials/shipping-rate#defining-the-tiers-and-their-shipping-rates
- https://docs.commercetools.com/api/projects/carts#scoreshippingrateinputdraft

## Shipping Rate Control Setup

In Merchant Center set the shipping rate control to **Cart Score**.

Configure shipping rate tiers and use **Function** as opposed to Fixed Amount. Functions represent an equation that takes an input `x` (cart score) and computes a rate which is applied to the cart. In this example, the cart score passed to the function represents the cart total.

A set of rate tiers representing a function that calculates a reduced shipping rate as the cart score (cart total) increases. The function can be as simple or as complex as required for the use case.

## Setting the Shipping Rate Score

To set the shipping rate score, call `setShippingRateInput`, passing the score (cart total) as an integer. When set, commercetools will apply the function and set the shipping rate on the cart.

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/<project-key/carts/<cart-id>' \
--header 'Content-Type: application/json' \--header 'Authorization: Bearer Wf4TEkyHCHn1JZTknFfNm_*****' \
--data '{"version": 42,"actions": [
	{"action" : "setShippingRateInput","shippingRateInput" : 
		{"type" : "Score","score" : 10000}
	}
]
}'
```

## Example Response: Shipping Rate Applied by Function

After running the function, the corresponding shipping rate is set on the cart. Notice that the rate is set to 1000 USD (pennies) based on the function calculation.

```javascript
...
"shippingInfo": {
        "shippingMethodName": "fdafdafddaf",
        "price": {
            "type": "centPrecision",
            "currencyCode": "USD",
            "centAmount": 1000,
            "fractionDigits": 2
        },
        "shippingRate": {
            "price": {
                "type": "centPrecision",
                "currencyCode": "USD",
                "centAmount": 800,
                "fractionDigits": 2
            },
            "tiers": [
                {
                    "type": "CartScore",
                    "score": 19,
                    "priceFunction": {
                        "function": "(x / 30)",
                        "currencyCode": "USD"
                    }
                },
                {
                    "type": "CartScore",
                    "score": 49,
                    "priceFunction": {
                        "function": "(x / 20)",
                        "currencyCode": "USD"
                    }
                },
                {
                    "type": "CartScore",
                    "score": 99,
                    "priceFunction": {
                        "function": "(x / 10)",
                        "currencyCode": "USD"
                    }
                }
            ]
        },
        "deliveries": [],
        "shippingMethod": {
            "typeId": "shipping-method",
            "id": "ec937cdc-5fe2-4ccc-a4bb-ace26fb9a44d"
        },
        "shippingMethodState": "MatchesCart"
    },
...
```

## How the Tiers Work

In this example:

| Score Range | Function | Effect |
|-------------|----------|--------|
| 0–19        | `x / 30` | Higher shipping rate relative to cart value |
| 20–49       | `x / 20` | Moderate shipping rate |
| 50–99       | `x / 10` | Lower shipping rate (rewarding larger carts) |

The score of `10000` (representing $100.00 cart total) falls in the 50–99 tier, applying `(10000 / 10) = 1000` centAmount = $10.00 shipping. The `price.centAmount` of `1000` in the response confirms this.
