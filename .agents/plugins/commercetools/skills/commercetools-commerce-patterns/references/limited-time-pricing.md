# Pattern for Limited Time Pricing

Imagine you're planning a seasonal promotion on your e-commerce platform, aiming to temporarily lower prices on select products to boost sales. To streamline this process, you need a way to import multiple price adjustments at once, each with a definite validity period — such as one week.

This guide explains how to handle such scenarios effectively using **commercetools** `import API`, while utilizing the `validFrom` and `validUntil` properties of `embeddedPrices` and `standalonePrices`.

## Creating the Limited Time Pricing Record

Consider a product that is usually priced at $16.99 on your website. You want to offer an end-of-season sale on this product that is valid for a week starting January 26th, 2025.

In order to achieve this, you can build a price reduction import object as shown below:

### Using Embedded Prices

When using [embedded prices](https://docs.commercetools.com/api/pricing-and-discounts-overview#embedded-prices), create the following **embedded price** import resource specifying the **validity range** (from January 26th through February 1st in our example), the **product** and **product variant** keys, and the **temporary price** ($9.99 in our case):

```json
{
    "key" : "embedded-tpr-jan-2025",
    "country" : "US",
    "validFrom" : "2025-01-26T00:00:00.000Z",
    "validUntil" : "2025-02-01T00:00:00.000Z",
    "productVariant" : {
      "typeId" : "product-variant",
      "key" : "ISP-01"
    },
    "product" : {
      "typeId" : "product",
      "key" : "ivory-plate"
    },
    "value" : {
      "type" : "centPrecision",
      "currencyCode" : "USD",
      "centAmount" : 999
    }
  }
```

For additional details, refer to the documentation: [Importing Embedded Prices](https://docs.commercetools.com/api/import-export/price#embeddedpriceimportrequest)

### Using Standalone Prices

When using [standalone prices](https://docs.commercetools.com/api/pricing-and-discounts-overview#standalone-prices), create the following **standalone price** import resource specifying the **validity range**, the **product variant SKU**, and the **temporary price** ($9.99 in our case):

```json
{
    "key" : "standalone-tpr-jan-2025",
    "sku" : "ISP-01",
    "value" : {
      "type" : "centPrecision",
      "currencyCode" : "USD",
      "centAmount" : 999
    }
  }
```

For additional details, refer to the documentation: [Importing Standalone Prices](https://docs.commercetools.com/api/import-export/standalone-price)

## Uploading multiple price records using the Import API

As described in the commercetools [documentation](https://docs.commercetools.com/api/import-export/overview), up to 20 price records (either embedded prices or standalone prices) can be uploaded using the `Import API` at a time. At a high level, this process entails:

### Creating an Import Container

The first step of starting the import process is creating an import container using the following API call:

```json
curl --location 'https://import.us-central1.gcp.commercetools.com/{your-project-key}/import-containers' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "key" : "order-import-container-embedded-prices"
}'

{
    "key": "order-import-container-embedded-prices",
    "version": 1,
    "createdAt": "2025-01-25T04:34:22.248Z",
    "lastModifiedAt": "2025-01-25T04:34:22.248Z"
}
```

For additional information on import containers and best practices, refer to [this document](https://docs.commercetools.com/api/import-export/best-practices#using-import-containers-effectively).

### Uploading prices to the Import Container

Once the import container is created, use the following API call to upload the reduced prices with dates to the import container:

**Embedded Prices:**

```json
curl --location 'https://import.us-central1.gcp.commercetools.com/{your-project-key}/prices/import-containers/order-import-container-embedded-prices' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "type" : "price",
  "resources" : [ {
    "key" : "tpr-jan-2025",
    "country" : "US",
    "validFrom" : "2025-01-26T00:00:00.000Z",
    "validUntil" : "2025-02-01T00:00:00.000Z",
    "productVariant" : {
      "typeId" : "product-variant",
      "key" : "ISP-01"
    },
    "product" : {
      "typeId" : "product",
      "key" : "ivory-plate"
    },
    "value" : {
      "type" : "centPrecision",
      "currencyCode" : "USD",
      "centAmount" : 999
    }
  }]
}'

{
    "operationStatus": [
        {
            "operationId": "{import-operation-id}",
            "state": "processing"
        }
    ]
}
```

Using the `operationId` returned in the above response, you may use the following API call to determine the status of your import operation:

```json
curl --location 'https://import.us-central1.gcp.commercetools.com/{your-project-key}/import-operations/{import-operation-id}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data ''
```

**Standalone Prices:**

```json
curl --location 'https://import.us-central1.gcp.commercetools.com/{your-project-key}/standalone-prices/import-containers/order-import-container-embedded-prices' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
  "type" : "standalone-price",
  "resources" : [ {
    "key" : "standalone-tpr-jan-2025",
    "sku" : "ISP-01",
    "value" : {
      "type" : "centPrecision",
      "currencyCode" : "USD",
      "centAmount" : 999
    }
  } ]
}'

{
    "operationStatus": [
        {
            "operationId": "{import-operation-id}",
            "state": "processing"
        }
    ]
}
```

Using the `operationId` returned in the above response, you may use the following API call to determine the status of your import operation:

```json
curl --location 'https://import.us-central1.gcp.commercetools.com/{your-project-key}/import-operations/{import-operation-id}' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data ''
```

## Considerations when setting the 'validFrom' & 'validUntil' values

When setting a limited-time price, keep in mind that it will temporarily override the product's regular price. For example, SKU `ISP-01` will be available for **$9.99 from January 26, 2025, to February 2, 2025**.

Once this period ends, the SKU will return to its regular price of $16.99.

**\*\*In certain business scenarios, **multiple alternate prices** for the same product may need to be active simultaneously. For example, a "Cyber Monday" price might apply to an item already on temporary clearance. These situations require case-by-case handling and are beyond the scope of this document.**

## Limited Time Pricing vs. Product Discounts

[Product Discounts](https://docs.commercetools.com/merchant-center/product-discounts) provide an alternative way to temporarily reduce a product's price based on specific conditions or predicates. These discounts show up as a **strikethrough** price in the Merchant Center, making them visually distinct.

If your business relies on an external pricing system to manage both regular and temporary product prices, the **Limited Time Pricing** approach in this document may be a better fit than Product Discounts.

Additionally, if downstream systems (such as your **Order Management System**) require information about whether a product was sold at a reduced price (i.e., non-discounted reduced price), you can **extend** the Limited Time Pricing pattern by leveraging [Custom Fields](https://docs.commercetools.com/api/projects/custom-fields). Use this to capture additional details, such as the marketing campaign associated with the special price, ensuring that data is preserved in the customer's order history.
