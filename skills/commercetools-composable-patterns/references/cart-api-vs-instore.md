# Cart API vs InStore Cart API

**commercetools** offers two separate endpoints for Cart functionality, the **in-store Cart API** **endpoint** (`/in-store/key={{store-key}}/carts`) and the **Cart API endpoint** (`/carts`).

## Creating Carts using the Cart API & In-Store Cart API

To create a Cart using the Cart API and pass store-specific context, make the following API call passing the store-based information as highlighted below:

```json
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/carts' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
    "key": "kmb-order-test-1740062431567",
    "currency": "USD",
    "country": "US",
    "shippingMode": "Single",
    "store":{
        "key":"b2c-retail-store",
        "typeId":"store"
    },
    "shippingAddress": {
        "title": "My Address",
        "salutation": "Mr.",
        "firstName": "Example",
        "lastName": "Person",
        "country": "US",
        "key": "exampleKey"
    },
    "lineItems": [
      {
        "sku": "CST-01",
        "quantity": 1}
    ]
  }
  '
```

To create a Cart using the In-Store Cart API and pass store-specific context, make the following API call passing the store-based information as highlighted below:

```json
curl --location 'https://api.us-central1.gcp.commercetools.com/kmb-core-commerce-lab/in-store/key=b2c-retail-store/carts' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer' \
--data '{
    "key": "kmb-order-test-1740064258153",
    "currency": "USD",
    "country": "US",
    "shippingMode": "Single",
    "shippingAddress": {
        "title": "My Address",
        "salutation": "Mr.",
        "firstName": "Example",
        "lastName": "Person",
        "country": "US",
        "key": "exampleKey"
    },
    "lineItems": [
      {
        "sku": "CST-01",
        "quantity": 1}
    ]
  }
  '
```

## How are these API calls different?

As illustrated above, while either call may be leveraged to create store-specific Carts, there are some important callouts to keep in mind:

* There is no difference between the two endpoints when creating a Cart, and both provide similar performance. The product team confirmed this in the following Slack thread: https://commercetools.slack.com/archives/CCJPSJ2NP/p1739434215319699?thread_ts=1739305806.023479&cid=CCJPSJ2NP

* Carts created via the **In-Store Cart API** can also be accessed through the **Cart API** within the same Project.

* Carts created using the **Cart API** without a store reference **cannot** be accessed through the **In-Store Cart API**.

* Carts created using the **Cart API** with a store reference **are** accessible through the **In-Store Cart API** for that specific store.
