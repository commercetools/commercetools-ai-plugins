# BOPIS Pattern Using Multiple Shipping Methods

## Overview

Consider a scenario where you want to allow customers to pick up certain products in-store while shipping others to their home or a designated delivery address. While the process for managing this use case is documented at https://docs.commercetools.com/tutorials/multiple-shipping-addresses-methods#using-multiple-shipping-methods, this article provides additional context and insights.

## High Level Flow

1. Set the `shippingMode` on the Cart to `Multiple`
2. Add item shipping addresses (store pickup address + customer delivery address)
3. Query shipping methods and evaluate predicates to determine eligibles
4. Add selected shipping methods to the cart
5. Set `lineItemShippingDetails` on each line item
6. Create the order

---

## Step 1: Set the shippingMode on the Cart

Composable Commerce supports two `shippingMode` values for carts: `Single` (the default) and `Multiple`. You must set the `shippingMode` in the initial `cartDraft` request, as it **cannot be modified later**.

Since customers may not initially know whether they'll need multiple fulfillment methods, we recommend creating the cart with `shippingMode` set to `Single`.

If a customer later decides to use multiple fulfillment methods in the cart's life cycle, you can:

- Create a new cart with `shippingMode` set to `Multiple`.
- Copy over the line items and discount codes from the original cart to the new one using the `addLineItem` & `addDiscountCode` Update Cart actions.
  - This will be your cart going forward.
  - The redundant cart with `shippingMode` `Single` may be abandoned and would get deleted based on the `lastModifiedAt` `datetime` value, or you may choose to delete this yourself using the Delete Cart by ID operation.

Example `CartDraft` request:

```javascript
{
    "key": "kmb-test-1734109909694",
    "currency": "USD",
    "country": "US",
    "ShippingMode": "Multiple",
    "lineItems": [
      {
        "sku": "SCM-02",
        "quantity": 1
      },
      {
        "sku": "MCP-01",
        "quantity": 1
      }
    ]
  }
```

---

## Step 2: Add the itemShippingAddress

Add the pick up store's address and the customer's delivery location to the cart using the `addItemShippingAddress` update cart action as shown below:

```javascript
{
    "version": {{cart-version}},
    "actions": [
        {
            "action" : "addItemShippingAddress",
            "address" : {
              "key" : "pickup-store-address",
              "firstName" : "My Store",
              "lastName" : "Store 140",
              "streetName" : "Southpoint St",
              "streetNumber" : "1701",
              "postalCode" : "27713",
              "city" : "Durham",
              "state" : "NC",
              "country" : "US"
            }
        },
        {
            "action" : "addItemShippingAddress",
            "address" : {
              "key" : "customer-shipping-address",
              "firstName" : "Jane",
              "lastName" : "Do2",
              "streetName" : "Kings Grant Ct",
              "streetNumber" : "7",
              "postalCode" : "27703",
              "city" : "Durham",
              "state" : "NC",
              "country" : "US"
            }
          }
    ]
}
```

This action creates an `itemShippingAddresses` array on the cart. Use logical key values for addresses, as these keys will be referenced in subsequent steps.

---

## Step 3: Query shippingMethods to determine eligibles

Once item shipping addresses are added, determine the eligible shipping methods for the cart.

> **Important:** The `shipping-methods/matching-cart` API does **not** support carts with `shippingMode` set to `Multiple`.

Instead, use the `Query shipping-methods` endpoint or a GraphQL query to fetch all shipping method IDs and their predicates. Example:

```graphql
query {
  shippingMethods {
    results {
      id
      predicate
    }
  }
}

{
  "data": {
    "shippingMethods": {
      "results": [
        {
          "id": "17fa25a7-6d70-4c98-8610-1cd04ad87450",
          "predicate": "shippingAddress.additionalAddressInfo = \"STANDARD\" and shippingAddress.state != \"HI\" and shippingAddress.state != \"AK\" and shippingAddress.state != \"AS\" and shippingAddress.state != \"DC\" and shippingAddress.state != \"FM\" and shippingAddress.state != \"GU\" and shippingAddress.state != \"MH\" and shippingAddress.state != \"MP\" and shippingAddress.state != \"PR\" and shippingAddress.state != \"PW\" and shippingAddress.state != \"UM\" and shippingAddress.state != \"VI\""
        },
        {
          "id": "b47f7f2d-a0e3-48d3-88df-4da3b99e34b9",
          "predicate": "shippingAddress.additionalAddressInfo=\"STANDARD\" and shippingAddress.state != \"HI\" and shippingAddress.state != \"AK\"  and shippingAddress.state != \"AS\" and shippingAddress.state != \"DC\" and shippingAddress.state != \"FM\" and shippingAddress.state != \"GU\"  and shippingAddress.state != \"MH\" and shippingAddress.state != \"MP\"  and shippingAddress.state != \"PR\" and shippingAddress.state != \"PW\" and shippingAddress.state != \"UM\"  and shippingAddress.state != \"VI\""
        }
      ]
    }
  }
}
```

Evaluate the predicates against the state values in the `itemShippingAddresses` array to determine applicable shipping methods. Present these options to the customer for selection.

---

## Step 4: Add the selected shippingMethod to the cart

Add the selected shipping methods using the `addShippingMethod` update action. When using the `Multiple` `shippingMode`, a `shippingAddress` must be provided for each shipping method.

Example payload:

```json
{
    "version": {{cart-version}},
    "actions": [
        {
            "action" : "addShippingMethod",
            "shippingKey" : "in-store-pickup",
            "shippingMethod" : {
              "id" : "{{shipping-method-id}}",
              "typeId" : "shipping-method"
            },
            "shippingAddress" : {
              "key" : "pickup-store-address",
              "streetName" : "Southpoint St",
              "streetNumber" : "1701",
              "postalCode" : "27713",
              "city" : "Durham",
              "state" : "NC",
              "country" : "US"
            }
          },
          {
            "action" : "addShippingMethod",
            "shippingKey" : "customer-delivery",
            "shippingMethod" : {
              "id" : "{{shipping-method-id}}",
              "typeId" : "shipping-method"
            },
            "shippingAddress" : {
              "key" : "customer-delivery-address",
              "streetName" : "Kings Grant Ct",
              "streetNumber" : "7",
              "postalCode" : "27703",
              "city" : "Durham",
              "state" : "NC",
              "country" : "US"
            }
          }
    ]
}
```

---

## Step 5: Setting the lineItemShippingDetails on each line item

Use the `setLineItemShippingDetails` action to associate each line item with its corresponding shipping method and address. Example:

```json
{
    "version": {{cart-version}},
    "actions": [
        {
            "action" : "setLineItemShippingDetails",
            "lineItemId" : "{{lineItemId}}",
            "shippingDetails" : {
              "targets" : [ {
                "addressKey" : "my-store-address",
                "shippingMethodKey": "in-store-pickup",
                "quantity" : 1
              } ]
            }
          }
    ]
}
```

---

## Conclusion

Once all line items are associated with shipping details, you can proceed to create an order from the cart.

## Key Rules and Gotchas

- `shippingMode` must be set at cart creation time — it **cannot be changed** later.
- The `shipping-methods/matching-cart` API does **not** work for `Multiple` shippingMode carts. Use the generic `Query shipping-methods` endpoint and evaluate predicates client-side.
- Each `addShippingMethod` action in Multiple mode requires its own `shippingAddress`.
- Use meaningful `key` values for both `itemShippingAddresses` and shipping methods (`shippingKey`) since these keys link addresses to line items.
- If starting with a `Single` mode cart and needing to switch: create a new `Multiple` mode cart and copy over `lineItems` and `discountCodes`; abandon the old cart.
