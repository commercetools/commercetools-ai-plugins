# Ensuring Data Integrity in commercetools (WIP-v0.0)

## Validation Process for External Imports

Consider a scenario where your business is preparing to import large volumes of data—such as customer records—into **commercetools**, and you need to validate this imported data against the records in your existing legacy system.

While there are manual methods for performing data comparisons—such as using the **Merchant Center** [**Export functionality**](https://docs.commercetools.com/merchant-center/export-data) or fetching sample datasets via the [**commercetools APIs**](https://docs.commercetools.com/api) (for example, the [**Product API**](https://docs.commercetools.com/api/projects/products) or the [**Customer API**](https://docs.commercetools.com/api/projects/customers))—this document focuses on implementing an automated approach by **making the use of** [**Subscriptions**](https://docs.commercetools.com/api/projects/subscriptions) & [**Custom Fields**](https://docs.commercetools.com/api/projects/custom-fields).

Use of [Keys as Identifiers](https://docs.commercetools.com/merchant-center/export-data#use-keys-as-identifiers): All Composable Commerce resources—such as Products, Customers, etc.—support a user-defined "key" that serves as a unique identifier.

While setting a key is not mandatory in draft requests, we strongly recommend doing so—especially when utilizing import/export functionalities. This practice ensures consistency and reliability in data handling across systems.

## Using Subscriptions and CustomFields to automate Data Validation

This approach involves defining [Custom Fields](https://docs.commercetools.com/api/projects/custom-fields)—such as `isValidated`, `externalReferenceId`, and `migrationDate`—on the Composable Commerce resource to:

- Indicate whether the resource has been validated against the corresponding record in the legacy system (`isValidated`).
- Maintain referential integrity with the legacy record (`externalReferenceId`).
- Record the date of data migration (`migrationDate`).

We also recommend enhancing the schema of the object in the **legacy system** to store similar metadata—for example, the commercetools resource ID as the `externalReferenceId` and the migration date.

> This information can be useful for internal audits and tracking.

Next, you'll set up a [Subscription](https://docs.commercetools.com/api/projects/subscriptions) that triggers a [Message](https://docs.commercetools.com/api/projects/messages) to your [Destination](https://docs.commercetools.com/api/projects/subscriptions#destination) whenever a resource is created—such as `CustomerCreated`, `OrderCreated`, and so on.

Upon receiving the message, a serverless function on your end will:

- Retrieve the resource from **commercetools**.
- Retrieve the corresponding resource from your legacy system.
- Compare the two records in order to:
  - Prepare updates to the Composable Commerce JSON, if required.
  - Prepare the `setCustomType` action to assign values for the `isValidated`, `externalReferenceId` & `migrationDate` [Custom Fields](https://docs.commercetools.com/api/projects/custom-fields) of the Composable Commerce resource.
  - Apply similar updates to the legacy system's resource.
- Submit the required updates to commercetools as an array of `actions` (`setCustomType` and other required updates) via a POST request.

For the purposes of this write-up, we'll demonstrate these operations using the **Customer** resource.

---

### Creating the [CustomFields](https://docs.commercetools.com/api/projects/custom-fields)

Start by creating the `isValidated`, `externalReferenceId`, and `migrationDate` Custom Fields on the Customer resource, as shown in the examples below:

```json
{
  "key" : "validatedCustomer",
  "name" : {
    "en" : "isValidated"
  },
  "description" : {
    "en" : "Indicates if an imported customer record was validate against an external system"
  },
  "resourceTypeIds" : [ "customer" ],
  "fieldDefinitions" : [ {
    "name" : "isValidated",
    "label" : {
      "en" : "Is Validated"
    },
    "required" : false,
    "type" : {
      "name" : "Boolean"
    },
    {
    "name" : "externalReferenceId",
    "label" : {
      "en" : "External Reference Id"
    },
    "required" : false,
    "type" : {
      "name" : "String"
    },
    {
    "name" : "migrationDate",
    "label" : {
      "en" : "Migration Date"
    },
    "required" : false,
    "type" : {
      "name" : "DateTime"
    }
  } ]
}
```

As an alternative, you may choose to define the `isValidated` field as an integer to hold a ternary value (e.g., 0 indicating the default/unvalidated state, 1 indicating the record was validated, and -1 to represent an error condition).

Once these are created, users can also view these fields in the **Merchant Center**.

---

### Setting up a Subscription

Create a [Subscription](https://docs.commercetools.com/api/projects/subscriptions) to the `CustomerCreated` [Message](https://docs.commercetools.com/api/projects/messages) to a [Destination](https://docs.commercetools.com/api/projects/subscriptions#destination) of your choice. Below is a sample payload for setting up a Subscription to a GCP Pub/Sub topic:

```json
{
  "destination" : {
    "type": "GoogleCloudPubSub",
    "projectId": "kmb-core-****-****",
    "topic": "kmb-ct-*****"
  },
  "messages" : [ {
    "resourceTypeId" : "customer",
    "types" : ["CustomerCreated" ]
  } ],
  "key" : "customer-created-test-queue"
}
```

Following this setup, commercetools will publish a test message to your Destination, as shown below:

```json
{"notificationType":"ResourceCreated","projectKey":"kmb-core-****-****","resource":{"typeId":"subscription","id":"a7c1fb22-b164-4b4b-****-*******"},"resourceUserProvidedIdentifiers":{"key":"customer-created-test-queue"},"version":1,"modifiedAt":"2025-04-01T16:07:22.335Z"}
```

Once this Subscription is in place, the following Message will be published to your Destination every time a Customer is created:

```json
{
    "notificationType": "Message",
    "projectKey": "kmb-core-commerce-lab",
    "id": "6be1d202-898c-4888-****-*********",
    "version": 1,
    "sequenceNumber": 1,
    "resource": {
        "typeId": "customer",
        "id": "e0d70d4e-fc4e-44e4-****-************"
    },
    "resourceVersion": 1,
    "type": "CustomerCreated",
    "customer": {
        "id": "e0d70d4e-fc4e-44e4-****-************",
        "version": 1,
        "versionModifiedAt": "2025-04-01T16:12:07.129Z",
        "lastMessageSequenceNumber": 1,
        "createdAt": "2025-04-01T16:12:07.129Z",
        "lastModifiedAt": "2025-04-01T16:12:07.129Z",
        "lastModifiedBy": {
            "clientId": "**************",
            "isPlatformClient": false
        },
        "createdBy": {
            "clientId": "*************",
            "isPlatformClient": false
        },
        "email": "johndoe@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "password": "****IXY=",
        "addresses": [],
        "shippingAddressIds": [],
        "billingAddressIds": [],
        "isEmailVerified": false,
        "customerGroupAssignments": [],
        "stores": [],
        "authenticationMode": "Password"
    },
    "createdAt": "2025-04-01T16:12:07.129Z",
    "lastModifiedAt": "2025-04-01T16:12:07.129Z",
    "createdBy": {
        "clientId": "4W4G78A9p*********",
        "isPlatformClient": false
    },
    "lastModifiedBy": {
        "clientId": "4W4G78A9*********",
        "isPlatformClient": false
    }
}
```

---

### Creating the Data Validation Cloud Function

With the **Custom Fields** and **Subscription** in place, implement a Cloud Function (or AWS Lambda, or your preferred serverless function) that will:

1. Retrieve the Customer resource from commercetools using the resource ID (`customer.id`). A sample request is shown below:

    ```json
    GET {{host}}/{{project-key}}/customers/{{customer-id}}
    ```

2. Retrieve the corresponding resource from your legacy system.

3. Compare the two records to:
   - Make updates to the commercetools JSON, if required.
   - Prepare the `setCustomType` action to assign values for the `isValidated`, `externalReferenceId`, and `migrationDate` Custom Fields of the commercetools resource.
   - Apply similar updates to the legacy system's resource.

4. Submit the required updates to commercetools as an array of actions (`setCustomType` and any other necessary updates) via a POST request:

    ```json
    {
        "version": {{customer-version}},
        "actions": [
            {
                "action" : "setCustomType",
                "type" : {
                  "id" : "{{customer-type-id}}",
                  "typeId" : "type"
                },
                "fields" : {
                  "isValidated" : true,
                  "externalReferenceId" : "123-456-7890",
                  "migrationDate" : "2025-03-04T16:12:07.129Z"
                }
              }
        ]
    }
    ```

---

### High Level Diagram

```none
graph LR
    A[Customer Created in commercetools] --> B[Subscription sends Message to Destination]
    B --> C[External Cloud Function triggered]
    C --> D[Get Customer from commercetools]
    C --> E[Get Customer from Legacy System]
    D --> F[Compare Records]
    E --> F
    F --> G[Prepare Update Actions]
    G --> H[Set Custom Fields<br>isValidated, externalReferenceId, migrationDate]
    H --> I[POST Update to commercetools]
    I --> J{Update Successful?}

    J -->|Yes| K[Update Legacy System]

    J -->|No| E1[Check Error Type]

    E1 -->|400/404| L1[Log Error<br>Customer ID]
    L1 --> M1[Exit or Alert Ops]

    E1 -->|409 Conflict| L2[Fetch Latest Version from commercetools]
    L2 --> F

    E1 -->|5xx Server Error| L3[Retry with Exponential Backoff]
    L3 -->|Retry Limit Not Hit| I
    L3 -->|Retry Limit Exceeded| M3[Log & Alert]

    style A fill:#E3F2FD,stroke:#2196F3,stroke-width:2px
    style B fill:#E3F2FD,stroke:#2196F3,stroke-width:2px
    style C fill:#E3F2FD,stroke:#2196F3,stroke-width:2px
    style D fill:#FFFDE7,stroke:#FDD835,stroke-width:2px
    style E fill:#FFFDE7,stroke:#FDD835,stroke-width:2px
    style F fill:#F1F8E9,stroke:#8BC34A,stroke-width:2px
    style G fill:#F3E5F5,stroke:#9C27B0,stroke-width:2px
    style H fill:#E8F5E9,stroke:#4CAF50,stroke-width:2px
    style I fill:#E3F2FD,stroke:#2196F3,stroke-width:2px
    style J fill:#FFF3E0,stroke:#FB8C00,stroke-width:2px
    style E1 fill:#FFF3E0,stroke:#FB8C00,stroke-width:2px
    style L1 fill:#FFEBEE,stroke:#F44336,stroke-width:2px
    style L2 fill:#FFFDE7,stroke:#FDD835,stroke-width:2px
    style L3 fill:#E1F5FE,stroke:#039BE5,stroke-width:2px
    style M1 fill:#FFCDD2,stroke:#D32F2F,stroke-width:2px
    style M3 fill:#F8BBD0,stroke:#EC407A,stroke-width:2px
    style K fill:#FFEBEE,stroke:#F44336,stroke-width:2px
```

This process provides a clear record of validated resources and simplifies the identification of unvalidated ones using the Custom Fields.
