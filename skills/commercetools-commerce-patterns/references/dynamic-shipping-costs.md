# Handling Dynamic Shipping Costs

## Overview

Consider a scenario where the shipping cost is computed by a 3rd party logistics provider, therefore at the time of cart creation the precise shipping cost is unknown.

There are two methods to handle this:

1. **Method 1:** Using cart freeze & the `SetCustomShippingMethod` API call
2. **Method 2:** Using Order Edits

---

## Method 1: Using cart freeze & the SetCustomShippingMethod API call

One approach is to create a cart with some line items, a shipping address, a **$0 shipping method** and **freezing the cart**. After the cart is frozen, you would call the 3rd party logistic provider with cart details and obtain the precise shipping cost.

The initial $0 shipping method is associated using the **setShippingMethod** API call (a regular shipping method). Once the precise shipping cost is known, you would associate it to the frozen cart using the **setCustomShippingMethod** API call and then place your order.

### Structure of the $0 shipping method (predicates may be used as required)

```javascript
{
            "id": "d07b163f-f76d-41c9-8aa3-b9de2d4529ec",
            "version": 1,
            "versionModifiedAt": "2024-12-08T19:16:38.773Z",
            "createdAt": "2024-12-08T19:16:38.773Z",
            "lastModifiedAt": "2024-12-08T19:16:38.773Z",
            "lastModifiedBy": {
                "isPlatformClient": true,
                "user": {
                    "typeId": "user",
                    "id": "{user-id}"
                }
            },
            "createdBy": {
                "isPlatformClient": true,
                "user": {
                    "typeId": "user",
                    "id": "{user-id}"
                }
            },
            "name": "Example Dynamic Delivery",
            "localizedName": {
                "en-US": "Example Dynamic Delivery"
            },
            "localizedDescription": {
                "en-US": "Example Dynamic Delivery"
            },
            "taxCategory": {
                "typeId": "tax-category",
                "id": "193570d0-555f-4be2-a172-6ff5639952e6"
            },
            "zoneRates": [
                {
                    "zone": {
                        "typeId": "zone",
                        "id": "a77a57f0-01bb-4e6e-99af-08c0e6d0b5a6"
                    },
                    "shippingRates": [
                        {
                            "price": {
                                "type": "centPrecision",
                                "currencyCode": "USD",
                                "centAmount": 0,
                                "fractionDigits": 2
                            },
                            "tiers": []
                        }
                    ]
                }
            ],
            "active": true,
            "isDefault": false,
            "predicate": "1 = 1",
            "key": "example-dynamic-delivery",
            "references": []
        }
```

### Cart Creation

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{your-project-key}/carts' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "key": "example-cart-key-1",
  "currency": "USD",
  "country": "US",
  "shippingMode": "Single",
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
'
```

### Setting the shipping address on the cart

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{your-project-key}/carts/{cart-id}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
    "version": 5,
    "actions": [
        {
            "action" : "setShippingAddress",
            "address" : {
              "key" : "example-address-key",
              "title" : "My Address",
              "salutation" : "Mr.",
              "firstName" : "Jane",
              "lastName" : "Smith",
              "streetName" : "Main",
              "streetNumber" : "123",
              "postalCode" : "10001",
              "city" : "New York",
              "state" : "NY",
              "country" : "US"
            }
          }
    ]
}'
```

### Associating the $0 shipping method to the cart (since the exact shipping cost is unknown)

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{your-project-key}/carts/{cart-id}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
    "version": 8,
    "actions": [
        {
            "action" : "setShippingMethod",
            "shippingMethod" : {
              "id" : "d07b163f-f76d-41c9-8aa3-b9de2d4529ec",
              "typeId" : "shipping-method"
            }
          }
    ]
}'
```

### Freezing the cart

The freeze must use the `SoftFreeze` strategy, because the subsequent dynamic-rate update (`setCustomShippingMethod`) is a shipping method update. Under the `HardFreeze` strategy, shipping method updates are blocked, so this method would silently break.

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{your-project-key}/carts/{cart-id}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
    "version": 10,
    "actions": [
        {
            "action" : "freezeCart"
          }
    ]
}'
```

### Associating the new shipping cost to the cart using the SetCustomShippingMethod API call

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{your-project-key}/carts/{cart-id}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
    "version": 13,
    "actions": [
        {
            "action" : "setCustomShippingMethod",
            "shippingMethodName" : "myCustomShippingMethod",
            "shippingRate" : {
              "price" : {
                "currencyCode" : "USD",
                "centAmount" : 990
              }
            },
            "taxCategory" : {
              "id" : "193570d0-555f-4be2-a172-6ff5639952e6",
              "typeId" : "tax-category"
            }
          }
    ]
}'
```

### Converting the frozen cart to an order

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{your-project-key}/orders' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "cart" : {
    "id" : "{cart-id}",
    "typeId" : "cart"
  },
  "version" : 13
}'

{
    "type": "Order",
    "id": "{order-id}",
   ///
    "shippingInfo": {
        "shippingMethodName": "myCustomShippingMethod",
        "price": {
            "type": "centPrecision",
            "currencyCode": "USD",
            "centAmount": 990,
            "fractionDigits": 2
        },
        "shippingRate": {
            "price": {
                "type": "centPrecision",
                "currencyCode": "USD",
                "centAmount": 990,
                "fractionDigits": 2
            },
            "tiers": []
        }///
        "shippingMethodState": "MatchesCart"
    },
    "shippingAddress": {
        "title": "My Address",
        "salutation": "Mr.",
        "firstName": "Jane",
        "lastName": "Smith",
        "streetName": "Main",
        "streetNumber": "123",
        "postalCode": "10001",
        "city": "New York",
        "state": "NY",
        "country": "US",
        "key": "example-address-key"
    },
    "shipping": [],
    "lineItems": [///],
    "customLineItems": [],
    "transactionFee": true,
    "discountCodes": [],
    "directDiscounts": [],
    "cart": {
        "typeId": "cart",
        "id": "{cart-id}"
    },
    "itemShippingAddresses": [],
    "refusedGifts": []
}
```

---

## Method 2: Using Order Edits

Another approach is to create an order out of the cart after associating it with a $0 shipping method, and then using the **OrderEdit** functionality to update the shipping costs once they are known.

### Cart creation

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{your-project-key}/carts' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "key": "example-cart-key-2",
  "currency": "USD",
  "country": "US",
  "shippingMode": "Single",
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
'
```

### Setting the shipping address on the cart

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{your-project-key}/carts/{cart-id-2}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
    "version": 5,
    "actions": [
        {
            "action" : "setShippingAddress",
            "address" : {
              "key" : "example-address-key",
              "title" : "My Address",
              "salutation" : "Mr.",
              "firstName" : "Jane",
              "lastName" : "Smith",
              "streetName" : "Main",
              "streetNumber" : "123",
              "postalCode" : "10001",
              "city" : "New York",
              "state" : "NY",
              "country" : "US"
            }
          }
    ]
}'
```

### Associating the $0 shipping method to the cart (since the exact shipping cost is unknown)

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{your-project-key}/carts/{cart-id-2}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer {access_token}' \
--data '{
    "version": 8,
    "actions": [
        {
            "action" : "setShippingMethod",
            "shippingMethod" : {
              "id" : "d07b163f-f76d-41c9-8aa3-b9de2d4529ec",
              "typeId" : "shipping-method"
            }
          }
    ]
}'
```

### Convert the cart to an order

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{your-project-key}/orders' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer {access_token}' \
--data '{
  "cart" : {
    "id" : "{cart-id-2}",
    "typeId" : "cart"
  },
  "version" : 8
}'
```

### Create an OrderEdit draft and set the appropriate CustomShippingMethod in it

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{your-project-key}/orders/edits' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer {access_token}' \
--data '{
  "key" : "example-order-edit-key",
  "resource" : {
    "typeId" : "order",
    "id" : "{order-id}"
  },
  "stagedActions" : [ {
  "action": "setCustomShippingMethod",
  "shippingMethodName": "example-dynamic-shipping-update",
  "shippingRate": {
    "price": {
      "currencyCode": "USD",
      "centAmount": 990
    }
  },
  "taxCategory": {
    "typeId": "tax-category",
    "id": "193570d0-555f-4be2-a172-6ff5639952e6"
  }
} ],
  "comment" : "updated shipping costs"
}'
```

### Following this, apply the order edit.

Accept the order edit preview and proceed with completing the order edit.
