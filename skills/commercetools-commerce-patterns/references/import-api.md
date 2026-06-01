# Import API

## Container Design for Import API

The Import API uses **containers** as the unit of organization for import operations. Each container holds a set of import operations (e.g., create customer requests).

Key design rules:
- Send import operations as batches of **20 requests** per single input to a container.
- Recommended container size: **200,000 operations** per container.
- Run up to **5 containers in parallel** for optimal throughput.
- Maintain a **60-second interval** between each batch request sent to a container (safe interval when processing 5 containers concurrently).

## Async Processing

Import API operations are processed **asynchronously**. There is no guaranteed order of execution—even if operations are sent sequentially, the platform does not guarantee that they will be processed in that order. This applies both within a single container and across multiple containers.

To ensure the latest version of a resource is reflected, you must confirm that the previous import operation has completed before sending an update for the same resource.

A notification service was planned for Q3/2023 (beta) to help with this ordering challenge.

## Delta Imports

Import API for customers requires the **whole object** to be passed. Therefore, for delta updates where whole customer objects cannot be passed, use the regular customer APIs (via Java sync or HTTP API calls) with update actions on the customer resource.

Best practice: put all updates for a single customer resource in **one request** to reduce the number of individual API calls.

For multithreaded delta updates via regular APIs: send a maximum of **20 requests in multi-threaded mode** for optimal performance.

## Q&A

### Q: Is it possible to use "importAPI" to delete prices?

**A:** Import API currently doesn't have update actions, and there is no endpoint to directly remove prices. As a workaround, you can use `ProductDraftImport` — this updates the whole product resource, so an existing price object that is not supplied in the input will be removed.

`productDraftImport` should only be used when the import data is large enough to justify its use.

Reference: https://docs.commercetools.com/import-export/product-draft

### Q: Are requests executed in a specific order? I may have a resource modified more than once causing two import requests being sent for the same resource. How can I ensure the latest is the one last imported?

**A:** The platform cannot guarantee the order requests are executed, even if the operations are sent sequentially. There is no order guaranteed within the same container or across containers. The only way to ensure you always have the newest version is to make sure the previous one was imported before sending the next.

A notification service was planned for Q3/2023 (beta) that may help with this.

### Q: What is the difference between the import product variant endpoint vs product variant patch?

**A:** Main differences are:

- `product-variant` import removes images and removes **all attributes that are not sent** with the update; `product-variant-patch` endpoint allows updating only specific attributes, and attributes not mentioned are **preserved as-is**.
- `product-variant-patch` can only modify/update **existing** variants, while `product-variant` import can also **create new** variants.

### Q: Is it possible to gather specific data regarding success/failure from import requests?

**A:** In some cases, yes. Using Humio, it is possible to execute a query of this nature:

```json
source =  "commercetools-importer"
| message = "Resource was resolved: false"
| fields.type = "order"
```

From here, it is possible to export the results specifying the appropriate field to `CSV`, specifying the field `fields.resourceKey`.
