# Fixed Price Combo Discount

## Part 1: Fixed Price Combo Discount

### Scenario

The customer wants to provide fixed price discounts when specific items are added to the cart. The net effect would be to provide discounted price for each item in a combo or bundle. The customer does not want to create static bundles for each combination of items.

Create a promotion scheme capable of discounting multiple products by a set amount when added to the cart. In this example fixed price discounts and a discount code will be used.

Two products will be created with different published prices. The discounts will reduce the variant prices to $5 so that the combined price for the two products is $10.

### Custom Type

Create a lineItem custom type containing two attributes. The two attributes will be set during the add item calls to the cart API and will also be used in the cart discount predicate. These attributes also can aid in item cleanup.

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{{project-key}}/types' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer fYRdQ-868g-*****' \
--data '{
  "key" : "lineItemComboType",
  "name" : {
    "en" : "lineItemComboType"
  },
  "description" : {
    "en" : "LineItem Combo type"
  },
  "resourceTypeIds" : [ "line-item" ],
  "fieldDefinitions" : [ 
      {
        "name" : "isPartOfCombo",
        "label" : {
        "en" : "isPartOfCombo"
        },
        "required" : true,
        "type" : {
        "name" : "Boolean"
        }
    },
    {
        "name" : "comboId",
        "label" : {
        "en" : "comboId"
        },
        "required" : false,
        "type" : {
        "name" : "String"
        }
    }
  ]
}'
```

### Cart Discount

Build a cart discount containing a fixed price discount which reduces the price of the target skus to $5. The discount code required option is selected.

The promotion rule predicate is created to include the custom line item type attributes and the skus for the items (skus could be replaced by categories).

The predicate syntax is:
```
(custom.isPartOfCombo = true and custom.comboId is defined) and (sku = "simple-sandwich" or sku = "simple-soup")
```

The cart qualifier is set to apply to all shopping carts without exclusion. This could be set to target specific carts if needed.

### Discount Code

The setup for the discount code is straightforward — associate it with the cart discount created above.

### Cart Interactions

Items are added to the cart using the custom type defined above. The first combo item is added with the isCombo set to false and the comboId with no value.

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{{project-key}}/carts/{{}cart-id}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer fYRdQ-868g-H4l3-asi***' \
--data '{
    "version": {{version}},
    "actions": [
        {
            "action" : "addLineItem",
            "sku": "simple-soup",
            "quantity" : 1,
            "externalTaxAmount" : {
              "name" : "StandardExternalTaxRate",
              "amount" : 0.19,
              "country" : "US"
            },
            "custom" : {
                "type" : {
                    "key" : "lineItemComboType",
                    "typeId" : "type"
                    },
                "fields" : {
                "isPartOfCombo" : false,
                "comboId" : ""
                }
            }
            
          }
    ]
}'
```

When the second combo item is added to the cart, the item is added with the isCombo flag set to true and the comboId set to some value (GUID). The request also includes update commands on the first lineItem to set the isCombo attribute to true and the comboID to the new value.

```javascript
curl --location 'https://api.us-central1.gcp.commercetools.com/{{project-key}}/carts/{{cart-id}}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer fYRdQ-868g-H4******' \
--data '{
    "version": 26,
    "actions": [
        {
            "action" : "setLineItemCustomField",
            "lineItemId" : "{{line-item-id}}",
            "name" : "isPartOfCombo",
            "value" : true
        },
        {
            "action" : "setLineItemCustomField",
            "lineItemId" : "{{line-item-id}}",
            "name" : "comboId",
            "value" : "soup-combo-2"
        },
        {
            "action" : "addLineItem",
            "sku": "simple-sandwich",
            "quantity" : 1,
            "externalTaxAmount" : {
              "name" : "StandardExternalTaxRate",
              "amount" : 0.19,
              "country" : "US"
            },
            "custom": {
                "type" : {
                    "key" : "lineItemComboType",
                    "typeId" : "type"
                    },
                    "fields" : {
                    "isPartOfCombo" : true,
                    "comboId" : "soup-combo-2"
                    }
            }
            
          }
    ]
}'
```

The comboId would be unique for each pair of combo items. When line items are added with unique custom attribute values they are added as new line items — as opposed to incrementing the quantity of an existing line item. The comboId could also aid in cleanup of items as customers add and remove items from the cart.

When the discount code is added to the cart the discount is applied only to the items with the matching skus, isCombo=true and a comboId value.

### Representative Cart Examples

```javascript
# one set of combo items 
{
  "data": {
    "carts": {
      "results": [
        {
          "id": "c259a5ad-9ad2-40a0-87cc-03e6c23c56e2",
          "lineItems": [
            {
              "id": "1fb0b0a6-94f5-4cd8-be44-6459d77f588a",
              "custom": {
                "customFieldsRaw": [
                  {
                    "name": "isPartOfCombo",
                    "value": true
                  },
                  {
                    "name": "comboId",
                    "value": "soup-combo-1"
                  }
                ]
              },
              "quantity": 1,
              "variant": {
                "sku": "simple-soup",
                "price": {
                  "country": "US",
                  "key": "simple-soup",
                  "value": {
                    "centAmount": 800,
                    "currencyCode": "USD",
                    "fractionDigits": 2
                  }
                }
              },
              "discountedPricePerQuantity": [
                {
                  "quantity": 1,
                  "discountedPrice": {
                    "value": {
                      "centAmount": 500,
                      "currencyCode": "USD",
                      "fractionDigits": 2
                    },
                    "includedDiscounts": [
                      {
                        "discount": {
                          "key": "soup-sandwidth-combo-sandwich-discount-dup",
                          "name": null
                        }
                      }
                    ]
                  }
                }
              ]
            },
            {
              "id": "04357fa1-204c-44a3-9670-e2c0efebd726",
              "custom": {
                "customFieldsRaw": [
                  {
                    "name": "isPartOfCombo",
                    "value": true
                  },
                  {
                    "name": "comboId",
                    "value": "soup-combo-1"
                  }
                ]
              },
              "quantity": 1,
              "variant": {
                "sku": "simple-sandwich",
                "price": {
                  "country": null,
                  "key": "default-price",
                  "value": {
                    "centAmount": 1000,
                    "currencyCode": "USD",
                    "fractionDigits": 2
                  }
                }
              },
              "discountedPricePerQuantity": [
                {
                  "quantity": 1,
                  "discountedPrice": {
                    "value": {
                      "centAmount": 500,
                      "currencyCode": "USD",
                      "fractionDigits": 2
                    },
                    "includedDiscounts": [
                      {
                        "discount": {
                          "key": "soup-sandwidth-combo-sandwich-discount-dup",
                          "name": null
                        }
                      }
                    ]
                  }
                }
              ]
            }
          ],
          "totalPrice": {
            "centAmount": 1000,
            "currencyCode": "USD",
            "fractionDigits": 2
          },
          "discountCodes": [
            {
              "discountCode": {
                "id": "0788fbc9-d0d3-46b9-801e-826b18404636",
                "code": "10$-SOUP_AND_SANDWICH"
              }
            }
          ]
        }
      ]
    }
  }
}
```

```javascript
# same cart build another combo. 1 discounted combo. 1 new item 
{
  "data": {
    "carts": {
      "results": [
        {
          "id": "c259a5ad-9ad2-40a0-87cc-03e6c23c56e2",
          "lineItems": [
            {
              "id": "1fb0b0a6-94f5-4cd8-be44-6459d77f588a",
              "custom": {
                "customFieldsRaw": [
                  {
                    "name": "isPartOfCombo",
                    "value": true
                  },
                  {
                    "name": "comboId",
                    "value": "soup-combo-1"
                  }
                ]
              },
              "quantity": 1,
              "variant": {
                "sku": "simple-soup",
                "price": {
                  "country": "US",
                  "key": "simple-soup",
                  "value": {
                    "centAmount": 800,
                    "currencyCode": "USD",
                    "fractionDigits": 2
                  }
                }
              },
              "discountedPricePerQuantity": [
                {
                  "quantity": 1,
                  "discountedPrice": {
                    "value": {
                      "centAmount": 500,
                      "currencyCode": "USD",
                      "fractionDigits": 2
                    },
                    "includedDiscounts": [
                      {
                        "discount": {
                          "key": "soup-sandwidth-combo-sandwich-discount-dup",
                          "name": null
                        }
                      }
                    ]
                  }
                }
              ]
            },
            {
              "id": "04357fa1-204c-44a3-9670-e2c0efebd726",
              "custom": {
                "customFieldsRaw": [
                  {
                    "name": "isPartOfCombo",
                    "value": true
                  },
                  {
                    "name": "comboId",
                    "value": "soup-combo-1"
                  }
                ]
              },
              "quantity": 1,
              "variant": {
                "sku": "simple-sandwich",
                "price": {
                  "country": null,
                  "key": "default-price",
                  "value": {
                    "centAmount": 1000,
                    "currencyCode": "USD",
                    "fractionDigits": 2
                  }
                }
              },
              "discountedPricePerQuantity": [
                {
                  "quantity": 1,
                  "discountedPrice": {
                    "value": {
                      "centAmount": 500,
                      "currencyCode": "USD",
                      "fractionDigits": 2
                    },
                    "includedDiscounts": [
                      {
                        "discount": {
                          "key": "soup-sandwidth-combo-sandwich-discount-dup",
                          "name": null
                        }
                      }
                    ]
                  }
                }
              ]
            },
            {
              "id": "47c96d63-5a19-4b36-a4a2-06231aa530c4",
              "custom": {
                "customFieldsRaw": [
                  {
                    "name": "isPartOfCombo",
                    "value": false
                  },
                  {
                    "name": "comboId",
                    "value": ""
                  }
                ]
              },
              "quantity": 1,
              "variant": {
                "sku": "simple-soup",
                "price": {
                  "country": "US",
                  "key": "simple-soup",
                  "value": {
                    "centAmount": 800,
                    "currencyCode": "USD",
                    "fractionDigits": 2
                  }
                }
              },
              "discountedPricePerQuantity": []
            }
          ],
          "totalPrice": {
            "centAmount": 1800,
            "currencyCode": "USD",
            "fractionDigits": 2
          },
          "discountCodes": [
            {
              "discountCode": {
                "id": "0788fbc9-d0d3-46b9-801e-826b18404636",
                "code": "10$-SOUP_AND_SANDWICH"
              }
            }
          ]
        }
      ]
    }
  }
}
```

```javascript
# same cart. 2 combos discounted
{
  "data": {
    "carts": {
      "results": [
        {
          "id": "c259a5ad-9ad2-40a0-87cc-03e6c23c56e2",
          "lineItems": [
            {
              "id": "1fb0b0a6-94f5-4cd8-be44-6459d77f588a",
              "custom": {
                "customFieldsRaw": [
                  {
                    "name": "isPartOfCombo",
                    "value": true
                  },
                  {
                    "name": "comboId",
                    "value": "soup-combo-1"
                  }
                ]
              },
              "quantity": 1,
              "variant": {
                "sku": "simple-soup",
                "price": {
                  "country": "US",
                  "key": "simple-soup",
                  "value": {
                    "centAmount": 800,
                    "currencyCode": "USD",
                    "fractionDigits": 2
                  }
                }
              },
              "discountedPricePerQuantity": [
                {
                  "quantity": 1,
                  "discountedPrice": {
                    "value": {
                      "centAmount": 500,
                      "currencyCode": "USD",
                      "fractionDigits": 2
                    },
                    "includedDiscounts": [
                      {
                        "discount": {
                          "key": "soup-sandwidth-combo-sandwich-discount-dup",
                          "name": null
                        }
                      }
                    ]
                  }
                }
              ]
            },
            {
              "id": "04357fa1-204c-44a3-9670-e2c0efebd726",
              "custom": {
                "customFieldsRaw": [
                  {
                    "name": "isPartOfCombo",
                    "value": true
                  },
                  {
                    "name": "comboId",
                    "value": "soup-combo-1"
                  }
                ]
              },
              "quantity": 1,
              "variant": {
                "sku": "simple-sandwich",
                "price": {
                  "country": null,
                  "key": "default-price",
                  "value": {
                    "centAmount": 1000,
                    "currencyCode": "USD",
                    "fractionDigits": 2
                  }
                }
              },
              "discountedPricePerQuantity": [
                {
                  "quantity": 1,
                  "discountedPrice": {
                    "value": {
                      "centAmount": 500,
                      "currencyCode": "USD",
                      "fractionDigits": 2
                    },
                    "includedDiscounts": [
                      {
                        "discount": {
                          "key": "soup-sandwidth-combo-sandwich-discount-dup",
                          "name": null
                        }
                      }
                    ]
                  }
                }
              ]
            },
            {
              "id": "47c96d63-5a19-4b36-a4a2-06231aa530c4",
              "custom": {
                "customFieldsRaw": [
                  {
                    "name": "isPartOfCombo",
                    "value": true
                  },
                  {
                    "name": "comboId",
                    "value": "soup-combo-2"
                  }
                ]
              },
              "quantity": 1,
              "variant": {
                "sku": "simple-soup",
                "price": {
                  "country": "US",
                  "key": "simple-soup",
                  "value": {
                    "centAmount": 800,
                    "currencyCode": "USD",
                    "fractionDigits": 2
                  }
                }
              },
              "discountedPricePerQuantity": [
                {
                  "quantity": 1,
                  "discountedPrice": {
                    "value": {
                      "centAmount": 500,
                      "currencyCode": "USD",
                      "fractionDigits": 2
                    },
                    "includedDiscounts": [
                      {
                        "discount": {
                          "key": "soup-sandwidth-combo-sandwich-discount-dup",
                          "name": null
                        }
                      }
                    ]
                  }
                }
              ]
            },
            {
              "id": "a4aace89-b68a-4aba-b601-4c2e7f19496c",
              "custom": {
                "customFieldsRaw": [
                  {
                    "name": "isPartOfCombo",
                    "value": true
                  },
                  {
                    "name": "comboId",
                    "value": "soup-combo-2"
                  }
                ]
              },
              "quantity": 1,
              "variant": {
                "sku": "simple-sandwich",
                "price": {
                  "country": null,
                  "key": "default-price",
                  "value": {
                    "centAmount": 1000,
                    "currencyCode": "USD",
                    "fractionDigits": 2
                  }
                }
              },
              "discountedPricePerQuantity": [
                {
                  "quantity": 1,
                  "discountedPrice": {
                    "value": {
                      "centAmount": 500,
                      "currencyCode": "USD",
                      "fractionDigits": 2
                    },
                    "includedDiscounts": [
                      {
                        "discount": {
                          "key": "soup-sandwidth-combo-sandwich-discount-dup",
                          "name": null
                        }
                      }
                    ]
                  }
                }
              ]
            }
          ],
          "totalPrice": {
            "centAmount": 2000,
            "currencyCode": "USD",
            "fractionDigits": 2
          },
          "discountCodes": [
            {
              "discountCode": {
                "id": "0788fbc9-d0d3-46b9-801e-826b18404636",
                "code": "10$-SOUP_AND_SANDWICH"
              }
            }
          ]
        }
      ]
    }
  }
}
```

---

## Part 2: Buy 2 or More of a Specific Product at a Fixed Discounted Price

This document explains how to set up discounts where customers can buy two or more `ProductVariants` of a specific `Product` at a **fixed discounted price each**, using the new **Buy/Get Cart Discount** functionality.

The discount will apply only when 2 or more `ProductVariants` of the same `Product` are present in a customer's cart. While the feature supports relative, absolute and fixed price discounts, this document focuses on fixed price discounts, i.e., selling eligible items at a fixed price.

### Key Requirements

- **Product Based Trigger**: Discount triggers only when 2 or more `ProductVariants` of the same `Product` are present in a customer's cart.
- **Product Based Target**: The discount applies to `ProductVariants` of the same `Product` present in the customer's cart.
- **Discount Type**: This is a **fixed price** discount, i.e., eligible `ProductVariants` are sold at a fixed price determined by the user, and it applies an unlimited number of times.

### Solution Overview

The Buy/Get Cart Discount feature allows for setting conditions and outcomes for discounts, making it ideal for implementing these scenarios.

#### Configure the Cart Discount for All Carts

Configure the discount to apply to all carts using the Merchant Center.

#### Define the Trigger

Specify the desired `Product` key required to trigger the discount. For example, if you want to trigger this discount only when two or more of the same `Product` are in the cart:

```json
"triggerPattern": [
    {
        "type": "CountOnLineItemUnits",
        "predicate": "product.key = \"rye-whiskey-glass\"",
        "minCount": 2
    }
]
```

**Note:** While this example focuses on using the `Product` key as a predicate, you have a lot of flexibility in building the trigger pattern predicate. For a complete list, refer to the [LineItem field identifiers documentation](https://docs.commercetools.com/api/projects/predicates#lineitem-field-identifiers).

#### Set the Discount Target

Use the **targetPattern** to apply the discount to the qualifying Cart `lineItems`:

```json
"targetPattern": [
    {
        "type": "CountOnLineItemUnits",
        "predicate": "product.key = \"rye-whiskey-glass\"",
        "minCount": 1,
        "excludeCount": 0
    }
]
```

**Note:** While setting the **targetPattern**, you have the option of configuring the **excludeCount** setting.

The `excludeCount` feature ensures that items used to trigger a discount (e.g., "Buy 3 get 2 at a special price") are excluded from receiving the discount themselves. Once a discount iteration is applied to a cart, the excluded and discounted items from that iteration are locked in and won't be considered for subsequent iterations of the same discount. If there aren't enough items left to meet the trigger condition, the discount stops.

#### Set Discount Value and Distribution

Discount of this type may be absolute ($ off), relative (% off) or a fixed price, and you can decide if the discount should be:

- Distributed evenly across all eligible items
- Applied individually to each eligible item
- Distributed proportionately across all eligible items

**\*\*Discount Distribution is configurable only when Discount Type is either "Amount Off" or "Fixed Price". This setting does not apply to relative discounts (i.e., "Percentage Off").**

For the purpose of this use case, configure the discount as a fixed price with individual application:

```json
"value": {
    "type": "fixed",
    "money": [
        {
            "type": "centPrecision",
            "currencyCode": "EUR",
            "centAmount": 3500,
            "fractionDigits": 2
        },
        {
            "type": "centPrecision",
            "currencyCode": "GBP",
            "centAmount": 3500,
            "fractionDigits": 2
        },
        {
            "type": "centPrecision",
            "currencyCode": "USD",
            "centAmount": 3500,
            "fractionDigits": 2
        }
    ],
    "applicationMode": "IndividualApplication"
}
```

#### Complete Cart Discount JSON

```json
{
    "id": "d2440870-d22c-4af0-b8e9-027bfac1e064",
    "version": 4,
    "versionModifiedAt": "2025-01-21T14:41:34.491Z",
    "lastMessageSequenceNumber": 1,
    "createdAt": "2025-01-21T14:31:16.931Z",
    "lastModifiedAt": "2025-01-21T14:41:34.491Z",
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
    "value": {
        "type": "fixed",
        "money": [
            {
                "type": "centPrecision",
                "currencyCode": "EUR",
                "centAmount": 3500,
                "fractionDigits": 2
            },
            {
                "type": "centPrecision",
                "currencyCode": "GBP",
                "centAmount": 3500,
                "fractionDigits": 2
            },
            {
                "type": "centPrecision",
                "currencyCode": "USD",
                "centAmount": 3500,
                "fractionDigits": 2
            }
        ],
        "applicationMode": "IndividualApplication"
    },
    "cartPredicate": "1 = 1",
    "target": {
        "type": "pattern",
        "triggerPattern": [
            {
                "type": "CountOnLineItemUnits",
                "predicate": "product.key = \"rye-whiskey-glass\"",
                "minCount": 2
            }
        ],
        "targetPattern": [
            {
                "type": "CountOnLineItemUnits",
                "predicate": "product.key = \"rye-whiskey-glass\"",
                "minCount": 1,
                "excludeCount": 0
            }
        ],
        "selectionMode": "MostExpensive"
    },
    "name": {
        "en-US": "dxl-cart-discount",
        "en-GB": "",
        "de-DE": ""
    },
    "description": {
        "en-US": "dxl-cart-discount",
        "en-GB": "",
        "de-DE": ""
    },
    "stackingMode": "Stacking",
    "isActive": true,
    "requiresDiscountCode": false,
    "sortOrder": "0.99999999",
    "references": [],
    "stores": [],
    "key": "dxl-cart-discount"
}
```
