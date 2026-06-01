# Handling Dynamic Shipping Costs

## Overview

Consider a scenario where the shipping cost is computed by a 3rd party logistics provider, therefore at the time of cart creation the precise shipping cost is unknown.

There are two methods to handle this:

1. **Method 1:** Using cart freeze & the `SetCustomShippingMethod` API call
2. **Method 2:** Using Order Edits

---

## Method 1: Using cart freeze & the SetCustomShippingMethod API call

One approach is to create a cart with some line items, a shipping address, a **$0 shipping method** and **freezing the cart**. After the cart is frozen, you would call the 3rd party logistic provider with cart details and obtain the precise shipping cost.

Once the shipping cost is known, you would associate it to the frozen cart using the **SetCustomShippingMethod** API call and then place your order.

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
                    "id": "a78f94b6-832d-45bb-9973-991300cf965c"
                }
            },
            "createdBy": {
                "isPlatformClient": true,
                "user": {
                    "typeId": "user",
                    "id": "a78f94b6-832d-45bb-9973-991300cf965c"
                }
            },
            "name": "DLH Dynamic Delivery",
            "localizedName": {
                "en-US": "DLH Dynamic Delivery"
            },
            "localizedDescription": {
                "en-US": "DLH Dynamic Delivery"
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
            "key": "dlh-dynamic-delivery",
            "references": []
        }
```

### Cart Creation

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/carts' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "key": "kmb-shigle-shipping-test-1",
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
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/carts/d99482da-e7bc-400e-b082-fceb24c063a4' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
    "version": 5,
    "actions": [
        {
            "action" : "setShippingAddress",
            "address" : {
              "key" : "kmb-shigle-shipping-test-address",
              "title" : "My Address",
              "salutation" : "Mr.",
              "firstName" : "Kapil",
              "lastName" : "Bathija",
              "streetName" : "Tarleton",
              "streetNumber" : "3332",
              "postalCode" : "27713",
              "city" : "Durham",
              "state" : "NC",
              "country" : "US"
            }
          }
    ]
}'
```

### Associating the $0 shipping method to the cart (since the exact shipping cost is unknown)

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/carts/d99482da-e7bc-400e-b082-fceb24c063a4' \
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

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/carts/d99482da-e7bc-400e-b082-fceb24c063a4' \
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
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/carts/d99482da-e7bc-400e-b082-fceb24c063a4' \
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
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/orders' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "cart" : {
    "id" : "d99482da-e7bc-400e-b082-fceb24c063a4",
    "typeId" : "cart"
  },
  "version" : 13
}'

{
    "type": "Order",
    "id": "24278735-fdcf-4437-bc95-0a028b799079",
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
        "firstName": "Kapil",
        "lastName": "Bathija",
        "streetName": "Tarleton",
        "streetNumber": "3332",
        "postalCode": "27713",
        "city": "Durham",
        "state": "NC",
        "country": "US",
        "key": "kmb-shigle-shipping-test-address"
    },
    "shipping": [],
    "lineItems": [///],
    "customLineItems": [],
    "transactionFee": true,
    "discountCodes": [],
    "directDiscounts": [],
    "cart": {
        "typeId": "cart",
        "id": "d99482da-e7bc-400e-b082-fceb24c063a4"
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
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/carts' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "key": "kmb-shigle-shipping-test-2",
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
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/carts/ad72d499-4822-48e0-8b38-b57288959d1c' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
    "version": 5,
    "actions": [
        {
            "action" : "setShippingAddress",
            "address" : {
              "key" : "kmb-shigle-shipping-test-address",
              "title" : "My Address",
              "salutation" : "Mr.",
              "firstName" : "Kapil",
              "lastName" : "Bathija",
              "streetName" : "Tarleton",
              "streetNumber" : "3332",
              "postalCode" : "27713",
              "city" : "Durham",
              "state" : "NC",
              "country" : "US"
            }
          }
    ]
}'
```

### Associating the $0 shipping method to the cart (since the exact shipping cost is unknown)

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/carts/ad72d499-4822-48e0-8b38-b57288959d1c' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer hF6FM-6w-5eJHbVjm6Qk7WpyrZfRXWcL' \
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
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/orders' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer hF6FM-6w-5eJHbVjm6Qk7WpyrZfRXWcL' \
--data '{
  "cart" : {
    "id" : "ad72d499-4822-48e0-8b38-b57288959d1c",
    "typeId" : "cart"
  },
  "version" : 8
}'
```

### Create an OrderEdit draft and set the appropriate CustomShippingMethod in it

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/orders/edits' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer hF6FM-6w-5eJHbVjm6Qk7WpyrZfRXWcL' \
--data '{
  "key" : "kmb-single-shipping-test-2",
  "resource" : {
    "typeId" : "order",
    "id" : "22743e91-5833-44ec-a831-74b16c12250c"
  },
  "stagedActions" : [ {
  "action": "setCustomShippingMethod",
  "shippingMethodName": "dlh-dynamic-shipping-update",
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
