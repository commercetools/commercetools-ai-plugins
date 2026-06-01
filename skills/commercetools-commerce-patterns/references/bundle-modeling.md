# Bundle Modeling

---

## Part 1: Pattern for Static Bundle Pricing

Consider a scenario where you want to offer a static collection of products to your customers at a **fixed price**. This **bundle** allows your business to provide value by incentivizing purchases of complementary items.

This document explores the recommended method of **selling bundles at a fixed price** using the **commercetools** platform, examining the high-level implementation, benefits, and limitations.

## The Recommended Approach: Creating Bundles with Product Data Modeling & Line Item Customizations

### Solution Overview: Product Modeling

The online commercetools [documentation](https://docs.commercetools.com/tutorials/product-bundle-api) recommends defining a `ProductType` to represent bundles, where the bundle `ProductType` includes `Attributes` that reference the child `Products` contained within the bundle.

This approach works well for many use cases, such as offering a special bundle price for a "shirt and trousers bundle," where customers can choose specific variants (e.g., size and color) at the time of purchase. In such cases, the bundle references the product as a whole, allowing flexibility in variant selection.

However, some use cases may require directly associating `ProductVariants` (SKUs) with the bundle. For example, an iPhone and iPhone case bundle may involve predefined variants (e.g., a specific iPhone model with a matching case), where the pricing or compatibility depends on the exact variants included. This requires managing a list of SKUs for precise control rather than referencing the product in its entirety.

If your use case involves single-variant `Products` or `ProductVariants` with minimal differences in pricing or configuration, follow the [standard commercetools process](https://docs.commercetools.com/tutorials/product-bundle-api).

For scenarios requiring direct associations between `ProductVariants` and a bundle `ProductType`, the process involves creating a `ProductType` per bundle and defining `Attributes` that reference the included `ProductVariants`.

### Solution Overview: `LineItem` Flow

When a customer adds a bundle to their cart, your backend-for-frontend (BFF) service should handle the following:

- **Add the bundle product to the cart:** Include the bundle as the parent item.
- **Add associated child items to the cart:** Represent the bundle components as `lineItems`.
- **Link child items to the parent item:** Establish relationships between child and parent `lineItems` using custom fields.
- **Ensure a fixed bundle price:** Set the price of the child `lineItems` to $0 using `externalPrice`.

Additional constraints may include:

- **Prevent modifications to child items:** Restrict direct changes to child `lineItems` in the cart.
- **Propagate changes from parent to children:** Ensure updates to the bundle, such as quantity adjustments, are applied to the child `lineItems`.

### Defining the Bundle `ProductType`

To represent a bundle, create a `ProductType` (e.g., `my-store-bundle`) and define a `Set<Text>` `Attribute` called `bundleContents`. This approach avoids creating a separate `ProductType` for each specific bundle. Instead, you can use `bundleContents` attribute to differentiate between bundles, allowing for more flexibility and scale in bundle management.

```json
{
  "name" : "my-store-bundle",
  "description" : "my-store-bundle",
  "attributes" : [ {
    "type" : {
      "name" : "set",
       "elementType": {
                "name": "text"
            }
    },
    "isSearchable" : true,
    "name" : "bundleContents",
    "label" : {
      "en" : "bundleContents"
    },
    "isRequired" : true,
     "attributeConstraint": "Unique"
  }]
}
```

Alternatively, you may choose to define the `bundleContents` Attribute as a string to hold comma-separated SKUs instead of a set.

### Creating the Bundle `Product`

Once the `ProductType` is defined, create the bundle `Product`. Define its SKU, populate the `bundleContents` `Attribute` with the SKUs of the included products, and set a fixed price for the bundle:

```json
{
  "name": {
    "en": "holiday-dinner-bundle"
  },
  "productType": {
    "typeId": "product-type",
    "id": "affebe8c-db6a-4668-95a4-53fd73b42dd0"
  },
  "slug": {
    "en": "holiday-dinner-bundle"
  },
  "description": {
    "en": "Holiday Dinner Bundle - 2025"
  },
  "masterVariant": {
    "name": {
    "en": "ivory-dinner-bundle"
  },
    "sku": "IDIN-01",
    "attributes": [
      {
        "name": "bundleContents",
        "value": ["ISP-01", "SPOO-094", "SGB-01"]
      }
    ],
    "prices": [
                    {
                        "id": "8ae8a728-219e-41c8-9efa-0896d396a865",
                        "value": {
                            "type": "centPrecision",
                            "currencyCode": "USD",
                            "centAmount": 1999,
                            "fractionDigits": 2
                        }
                    }
                ]
  }
}
```

Alternatively, if the `ProductType` was defined to refer to Products via references, here is what the bundle `Product` would look like:

```json
{
  "name": {
    "en": "holiday-dinner-bundle"
  },
  "productType": {
    "typeId": "product-type",
    "id": "affebe8c-db6a-4668-95a4-53fd73b42dd0"
  },
  "slug": {
    "en": "holiday-dinner-bundle"
  },
  "description": {
    "en": "Holiday Dinner Bundle - 2025"
  },
  "masterVariant": {
    "name": {
    "en": "ivory-dinner-bundle"
  },
    "sku": "IDIN-01",
    "attributes": [
                    {
                        "name": "child-items",
                        "value": [
                            {
                                "typeId": "product",
                                "id": "c59b3df9-e47a-423b-8e62-b6cb8c1b9858"
                            },
                            {
                                "typeId": "product",
                                "id": "325ddc46-0fc2-48c9-b7d1-2365d621bd29"
                            }
                        ]
                    }
                ],
    "prices": [
                    {
                        "id": "8ae8a728-219e-41c8-9efa-0896d396a865",
                        "value": {
                            "type": "centPrecision",
                            "currencyCode": "USD",
                            "centAmount": 1999,
                            "fractionDigits": 2
                        }
                    }
                ]
  }
}
```

While these examples use `EmbeddedPrices`, you may alternatively use `StandalonePrices` or `ExternalPrices` based on your requirements. For bundles with multiple quantities of the same child item, consider a convention such as `attributes[].value: ["ISP-01||2, SPOO-094|1"]`, or a similar structure.

### Extending the `lineItem` Object for Bundle-Child Relationships

To establish relationships between bundle and child `lineItems`, extend the `lineItem` object with a custom field named `parentLineItemId`:

```json
{
  "key": "parent-lineitem-id",
  "name": {
    "en": "parentLineItemId"
  },
  "description": {
    "en": "Custom type for child lineitems that are part of a bundle"
  },
  "resourceTypeIds": [
    "line-item"
  ],
  "fieldDefinitions": [
    {
      "name": "parentLineItemId",
      "label": {
        "en": "LineItem ID of the parent, bundle item"
      },
      "required": false,
      "type": {
        "name": "String"
      }
    }
  ]
}
```

### Orchestration Logic for Adding Bundles to Carts

With the foundational setup complete, implement orchestration logic to automatically add child items when a bundle is added to the cart.

**Key Steps:**

1. **Detect if the item is a bundle product:** Check if the `ProductVariant` being added references a bundle-specific `ProductType`.
2. **Validate and extract bundle contents:** Perform validations (e.g., inventory checks) and retrieve `bundleContents` to get the child `ProductVariants`.
3. **Add the bundle item to the cart:** Use the `AddLineItem` action to add the bundle as a parent item.
4. **Add child items:** Add each child `ProductVariant` to the cart with matching quantities using the `AddLineItem` action.
5. **Set child item properties:** Assign an `externalPrice` of $0 and populate `parentLineItemId` to establish linkage to the parent (bundle lineItem).
6. **Handle updates and removals:** Ensure bundle quantity changes or removals propagate to child `lineItems`.

### UI Considerations

- Hide child `lineItems` in the cart UI to reduce clutter — unless your use case requires the customer to select specific product variants to be part of a bundle.
- Prevent direct modifications or removals to child `lineItems` to preserve bundle integrity.

### Other Considerations

When deciding to include child `lineItems` in the Cart or Order through BFF logic, specific business requirements should guide the approach. Key factors to consider include:

- **Inventory Tracking**: Does inventory need to be tracked at the child `lineItem` level?
- **Reporting Needs**: Are separate reports required for the child items within the bundle?

Additionally, if child `lineItems` are added as part of a bundle, ensure cart discounts are built to **exclude** these items to avoid double-discounting. This can be achieved by using predicates tied to the custom `parentLineItemId` field.

### Concluding Thoughts

This approach treats bundles as distinct items, offering significant benefits for categorization and search functionality on your storefront. For example:

- Customers can search for bundles just like any other product.
- You can classify bundles into different categories, making them easier to discover.
- Each bundle can have its own unique images, descriptions, and search slugs, providing flexibility in how bundles are presented to customers.

Additional considerations may be needed such as changes to BFF, orchestration logic, etc.

---

## Part 2: Bundles Hands-On (Implementation Example)

### Bundle `ProductType` that References `ProductVariants`

#### Creating the Bundle `ProductType`

Consider a scenario where you want to create a Product Bundle that comprises specific Product SKUs (i.e., `ProductVariant`), and are OK with a "soft reference". In this scenario, start with defining the `ProductType` as shown below:

```json
{
            "id": "57a5f743-31b1-46ce-9783-ad6cbb600e60",
            "version": 2,
            "versionModifiedAt": "2025-02-25T15:23:43.077Z",
            "createdAt": "2025-02-25T15:12:02.422Z",
            "lastModifiedAt": "2025-02-25T15:23:43.077Z",
            "name": "bundle-type-1",
            "description": "bundle-type-1",
            "classifier": "Complex",
            "attributes": [
                {
                    "name": "bundle-content-skus",
                    "label": {
                        "de-DE": "",
                        "en-GB": "",
                        "en-US": "bundle-content-skus"
                    },
                    "isRequired": false,
                    "type": {
                        "name": "set",
                        "elementType": {
                            "name": "text"
                        }
                    },
                    "attributeConstraint": "None",
                    "isSearchable": false,
                    "inputHint": "SingleLine",
                    "displayGroup": "Other"
                }
            ],
            "key": "bundle-type-1"
        }
```

#### Creating the Bundle `Product` & `ProductVariant`

Once you have the above `ProductType` defined, you can create the "**Slate & Stone**" bundle `Product` & `ProductVariant` (SAS-01) that comprises of a light grey ceramic plate (LCP-02), a harvest plate (HP-01) & rustic bowl (RB-01):

```json
{
    "id": "a7f83d95-87f0-48e3-878a-c2b336f4a736",
    "version": 2,
    "productType": {
        "typeId": "product-type",
        "id": "57a5f743-31b1-46ce-9783-ad6cbb600e60"
    },
    "masterData": {
        "current": {
            "name": {
                "en-US": "slate-and-stone-bundle"
            },
            "description": {
                "en-US": "slate-and-stone-bundle"
            },
            "categories": [],
            "slug": {
                "en-US": "slate-and-stone-bundle"
            },
            "masterVariant": {
                "id": 1,
                "sku": "SAS-01",
                "key": "SAS-01",
                "prices": [],
                "images": [],
                "attributes": [
                    {
                        "name": "bundle-content-skus",
                        "value": [
                            "LCP-02,HP-01,RB-01"
                        ]
                    }
                ],
                "assets": []
            },
            "variants": []
        }
    },
    "key": "slate-and-stone-bundle",
    "taxCategory": {
        "typeId": "tax-category",
        "id": "193570d0-555f-4be2-a172-6ff5639952e6"
    },
    "priceMode": "Standalone",
    "lastVariantId": 1
}
```

#### Setting the Bundle `ProductVariant` Inventory

The inventory for the bundle SKU (SAS-01) is managed separately from the inventories of its individual items. However, there is a method to reduce the inventory of the bundle's components when a bundle is sold (discussed later).

Set the inventory of the bundle SKU SAS-01:

```json
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/inventory' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "sku" : "SAS-01",
  "quantityOnStock" : 10,
  "availableQuantity" : 10
}'

{"id":"c96f6210-e0c4-4509-8d26-b791aa62f19b","version":1,"sku":"SAS-01","quantityOnStock":10,"availableQuantity":10,"reservations":[]}
```

#### Setting the Bundle `ProductVariant` Price

The price for the bundle SKU (SAS-01) is managed independently from the prices of its individual products. Generally, the price of the bundle item is typically lower than the sum of the prices of the individual participating items.

You can choose to use either embedded or standalone pricing. In this example, standalone pricing is used:

```json
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/standalone-prices' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "sku" : "SAS-01",
  "value" : {
    "currencyCode" : "USD",
    "centAmount" : 1599
  }
}'

{
    "id": "11187008-a6a9-4f2f-bf11-d7b37210458f",
    "version": 1,
    "sku": "SAS-01",
    "value": {
        "type": "centPrecision",
        "currencyCode": "USD",
        "centAmount": 1599,
        "fractionDigits": 2
    },
    "active": true
}
```

#### Creating Required `CustomField`

To manage inventory deductions and auto add/remove of the bundle-content items, define a `CustomField` on the `lineItem` called `parentLineItemId`:

```json
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/types' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "key": "parent-lineitem-id",
  "name": {
    "en": "parentLineItemId"
  },
  "description": {
    "en": "Custom type for child lineitems that are part of a bundle"
  },
  "resourceTypeIds": [
    "line-item"
  ],
  "fieldDefinitions": [
    {
      "name": "parentLineItemId",
      "label": {
        "en": "LineItem ID of the parent, bundle item"
      },
      "required": false,
      "type": {
        "name": "String"
      }
    }
  ]
}'
```

#### Adding a Bundle Item to a Cart

When a bundle item such as SAS-01 is added to the `Cart` with the inventory mode set to `ReserveOnOrder` (`None` and `TrackOnly` aren't covered here, since they are simpler to implement than `ReserveOnOrder`), the following logic needs to be implemented by the BFF:

**Step 1:** Add the SAS-01 `lineItem` to the `Cart`:

```json
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/carts' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
    "key": "kmb-order-test-1740510055040",
    "currency": "USD",
    "country": "US",
    "shippingMode": "Single",
    "shippingAddress": {...},
    "inventoryMode":"ReserveOnOrder",
    "lineItems": [
      {
        "sku": "SAS-01",
        "quantity": 1}
    ]
  }
  '
```

The response will include the cart with the bundle `lineItem` ID (e.g., `b6e9bbac-36ed-4ddb-8ae8-989638067e8d`) for SAS-01, which is needed to link the child items.

**Step 2:** Since the bundle product `lineItem` has the `bundle-content-skus` attribute defined, iterate through this list and add the "child" `lineItems` to the cart:

- Set `LineItemPriceMode` to `ExternalPrice` with a value of $0 for all child line items.
- Set the `CustomField` `parentLineItemId` on the child line items to match the bundle product's lineItem ID.

```json
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/carts/8298a8e0-0a8a-48d0-857e-7f32511f0b80' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
    "version": 5,
    "actions": [
        {
            "action" : "addLineItem",
            "sku" : "LCP-02",
            "quantity" : 1,
            "externalPrice":{
                "currencyCode":"USD",
                "centAmount":0
            },
            "custom":{
                "type":{
                    "key":"parent-lineitem-id",
                    "type":"line-item"
                },
                "fields":{
                    "parentLineItemId":"b6e9bbac-36ed-4ddb-8ae8-989638067e8d"
                }
            }
        },
        {
            "action" : "addLineItem",
            "sku" : "HP-01",
            "quantity" : 1,
            "externalPrice":{
                "currencyCode":"USD",
                "centAmount":0
            },
            "custom":{
                "type":{
                    "key":"parent-lineitem-id",
                    "type":"line-item"
                },
                "fields":{
                    "parentLineItemId":"b6e9bbac-36ed-4ddb-8ae8-989638067e8d"
                }
            }
        },
        {
            "action" : "addLineItem",
            "sku" : "RB-01",
            "quantity" : 1,
            "externalPrice":{
                "currencyCode":"USD",
                "centAmount":0
            },
            "custom":{
                "type":{
                    "key":"parent-lineitem-id",
                    "type":"line-item"
                },
                "fields":{
                    "parentLineItemId":"b6e9bbac-36ed-4ddb-8ae8-989638067e8d"
                }
            }
        }
    ]
}'
```

Performing the above actions ensures that inventory is reduced for the child items that comprise the bundle, along with reducing the inventory of the bundle item.

### Special Considerations

#### Product Discounts

- Given that the child items are added to the cart with an external price of $0, product discounts should **not** impact these items.
- Product discounts on the bundle items will apply as usual.

#### Cart Discounts

- It is recommended to build cart discount predicates to **exclude** lineItems where the `CustomField` `parentLineItemId` is defined.

#### Multi-quantity Purchases

- If a customer purchases multiple quantities of bundle items, the corresponding number of child items will need to be added to the Cart by the BFF layer.

#### Lineitem Edits

- Custom UI logic may be necessary to either not show the child line items on the website's UI, or to prevent end-users from editing the child `lineItem` details.

#### Removing the Bundle Item from the Cart

- Custom BFF logic needs to be added to **auto-remove** the child `lineItems` when the bundle item is removed from the Cart.

#### Handling "OutOfStock" Errors

- If the platform returns an `OutOfStock` error for the bundle item or any of the child `lineItems`, the BFF layer needs to handle this as **one single entity** and prevent the sale of the bundle product.

---

## Part 3: Reference Option Decision Guide

When modeling the `bundleInfo` attribute that links a bundle product to its components, four options exist:

| Option | Attribute Type | Pros | Cons |
|--------|----------------|------|------|
| **Product hard reference** | `Set<product reference>` | Clickable in Merchant Center; good for manually-maintained bundles | Import order dependency — cannot reference a product that doesn't exist yet; references the product as a whole, not a specific variant |
| **Custom-object hard reference** | `Set<custom-object reference>` | CoCo can hold variant-level detail and arbitrary JSON; flexible | Import order complexity; CoCo must be expanded or fetched separately on PDP/PLP — less efficient than inline variant data |
| **Products/variants soft reference** | `Set<text>` (SKU or product key) | Can reference a specific variant; import order irrelevant (no hard link) | Not clickable in Merchant Center; if a variant is removed the SKU becomes a dangling reference |
| **Products/variants soft reference as JSON** | `text` (escaped JSON string) | All soft-reference benefits + structured custom metadata per component (quantity, slot, notes) | JSON string must be parsed; no schema enforcement |

**Recommendation from PS engagements:** `text` with an escaped JSON value (the fourth option) is the most flexible for automated systems. Use `Product hard reference` only when bundles are maintained manually in Merchant Center and the import-order dependency is manageable.

### Import-order Risk with Hard References

If bundle creation is automated (Import API), a bundle product cannot be created if any of its referenced component products do not yet exist in CT. Mitigation: use the Import API with a dependency-aware ordering, or accept a 48-hour eventual-consistency window (Import API creates missing dependencies within that window). For large catalog imports, this dependency tracking adds significant orchestration complexity — prefer soft references.

### Bidirectional bundleId + parentId Pattern

An alternative to the `parentLineItemId`-only approach is a **bidirectional** link using two custom fields on the `line-item` type:

- `bundleId` — set on the **bundle (parent) line item** with a unique identifier for that bundle instance in the cart
- `parentId` — set on each **child line item**, pointing to the parent's `bundleId`

This is more robust than a unidirectional `parentLineItemId` because:

1. **Cart replication works correctly.** When a cart is replicated (re-order, quote request creation), new line item IDs are generated. A `parentLineItemId` pointing to the old line item ID breaks. `bundleId`/`parentId` use a stable business identifier — the link survives replication.
2. **Dynamic/configurable bundles.** For build-to-order bundles where the customer assembles a configuration on the PDP, the `bundleId` can encode the configuration (e.g., a hash of selected options). This lets you determine whether an add-to-cart should create a new bundle line item or increment the quantity of an existing one.
3. **Bidirectional traversal.** Finding all children of a bundle: `lineItems.filter(li => li.custom.parentId === bundleId)`. Finding the parent of a child: `lineItems.find(li => li.custom.bundleId === childParentId)`.

### Dynamic and Configurable Bundles

Static bundles have fixed components. Two more patterns exist:

**Choice bundles:** The bundle has a fixed price, but customers pick components from defined groups (e.g., "any jacket + any trousers from these categories at €199"). Implementation: use two categories (or product selections) to define the groups; the storefront guides the customer through selection. The cart contains the bundle product (with its own price) plus the selected component line items at €0.

**Hybrid bundles:** Some components are fixed and some are customer-selectable (e.g., a specific phone model + a charger + a case chosen from N options). Model the fixed components as standard `bundleInfo` entries and the selectable slot as a category or attribute reference. The cart structure is the same: bundle at full price, all components at €0.

**Price-per-component bundles with discount:** If the bundle price is the sum of component prices minus a discount (rather than a fixed price), add all components at their normal prices with a custom field marking them as bundle participants, then apply a cart discount predicate filtered to that custom field. Note: this approach is not self-discoverable — there is no single "bundle price" to display on a PLP. Use this only when the discount mechanics are the primary value, not the bundle as a purchasable product.
