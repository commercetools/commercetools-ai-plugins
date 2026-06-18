# Store Credit Best Practices

## Introduction

Several retailers offer **Store Credit** to customers, which accrues over time or through refunds and can be redeemed towards eligible goods and services. These credits are commonly **non-transferable**, typically do not have an expiration date, and cannot be used for "cash-like" purchases, such as gift cards.

The authorizer and issuer of Store Credit is usually the retailer themselves or a third-party system (e.g., [Voucherify](https://www.voucherify.io/)). While implementation details vary based on business requirements and integrations, this document provides high-level guidance and best practices for managing Store Credit using out-of-the-box Composable Commerce resources in **commercetools**.

## Architectural Boundaries: What Not to Store in commercetools

- **Storage of PCI Data**: It is important to note that the commercetools platform is neither **PCI certified** nor **PCI compliant** by design. Therefore, storing any credit card, debit card, or non-tokenized payment information directly within commercetools (e.g., in Custom Fields) is not allowed. While _**Store Credit balances**_ themselves are not typically subject to PCI standards, the financial instruments used to fund or purchase that credit must be handled through a secure, PCI-compliant payment service provider (PSP).

- **commercetools as the Primary Issuer (of Store Credit)**: commercetools should not be treated as the system of record for the _**initial issuance or generation**_ of Store Credit. Because Composable Commerce does not offer a native Store Credit resource type, logic for credit creation, validation, and liability tracking is best managed by a specialized **third-party system** (such as [Voucherify](https://www.voucherify.io/) or a dedicated ERP).

- **commercetools as the Source of Truth for Usage Tracking (of Store Credit)**: While commercetools captures _**transient**_ store credit data — specifically when it is applied as a payment method during checkout — it should not be used as the **permanent system of record** for credit usage. Because orders are often enriched, split, or modified by an **Order Management System (OMS)** or an **ERP** after they leave commercetools, the definitive history of credit consumption should reside in your **data warehouse** or **OMS**.

- **Concurrency risks and Distributed Locking:** Since the **Source of Truth** for the balance exists in an external system, commercetools cannot natively _**"lock"**_ or _**"reserve"**_ that balance during the checkout process. It is recommended that retailers either implement a **microservices pattern** (leveraging their BFF) or utilize an [**API Extension**](https://docs.commercetools.com/api/projects/api-extensions#top) to perform a real-time _**reservation**_ or _**hold**_ call to the external ledger. Without this synchronous validation, there is a risk of concurrent transactions allowing a customer to exceed their available credit limit.

## Architectural Alignment: What to Store in commercetools

While the external ledger remains the **source of truth** for financial liability, commercetools should be utilized to store specific metadata required for a seamless customer experience. This includes **eligibility flags**, _**transient**_ balances for rapid frontend display, and **tokenized references** to ensure a secure and efficient checkout flow.

The following section explores how to model this store credit data by leveraging native **commercetools Composable Commerce** entities.

### Approach 1: Extending the Customer Resource

Leverage **Custom Fields** to extend the [**Customer**](https://docs.commercetools.com/api/projects/customers) resource. This allows you to store metadata that is retrieved automatically whenever the customer profile is loaded, making it ideal for high-performance read-only requirements. Key fields to include are:

- `hasStoreCredit` (boolean): A flag indicating whether a customer has been issued store credit, useful for conditionally rendering UI components.
- `storeCreditNumber` (string): A _**tokenized**_ representation of the store credit account or card number.
- `storeCreditBalance` (money): A field indicating the _**transient**_ store credit balance for display purposes.

These fields should be kept updated using a **background or cron job** that synchronizes with the external ledger (the source of truth) on a periodic basis (e.g., every 24 hours).

### Approach 2: Leveraging Custom Objects

Utilize [**Custom Objects**](https://docs.commercetools.com/api/projects/custom-objects) (Key-Value Documents) to hold Store Credit-specific information, then associate that object with the **Customer** resource via a **Custom Field Reference**. Because Custom Objects can store any JSON-structured data, they provide a flexible container for the credit metadata.

**Implementation Steps:**

1. **Create a Custom Object** (e.g., in a container named `customer-store-credit`) to hold information such as:
   - `hasStoreCredit` **(Boolean):** A flag for conditional UI rendering.
   - `storeCreditNumber` **(String):** A _**tokenized**_ account or card reference.
   - `storeCreditBalance` **(Money):** The _**transient**_ balance for frontend display.

2. **Associate the Object** to the Customer record using a Custom Field (e.g., `storeCreditInfo`) defined as a **Reference** to a `key-value-document`.

### Approach 3: Using the Payment Methods API

The [**Payment Methods API**](https://docs.commercetools.com/api/projects/payment-methods#top) provides a native, structured way to manage a customer's tokenized payment instruments within commercetools. Unlike Custom Objects, this resource is purpose-built for the checkout lifecycle and supports advanced querying via predicates.

**Implementation Steps:**

1. **Define a Custom Type:** Create a Custom Type for the `payment-method` resource to hold non-native metadata such as `hasStoreCredit` (Boolean) and `storeCreditBalance` (Money).

2. **Create the Payment Method:** Generate a `PaymentMethodDraft` to represent the Store Credit. Set the `method` to a free-form label that identifies the instrument (for example, "StoreCredit") and include the tokenized account reference.

3. **Query by Customer:** Retrieve the credit information by querying the endpoint with a customer predicate:
   ```
   GET {{host}}/{{project-key}}/payment-methods?where=customer(id="CUSTOMER_ID")
   ```

## Recommendation

Using the native **Payment Methods API**, the recommended approach is to use this resource for storing and managing Store Credit metadata as described in Approach 3.

This API provides the most semantically correct and secure method for managing payment instruments within **commercetools Composable Commerce**.

If you prefer to keep the credit ledger externally managed, the recommended fallback is **Approach 2: Leveraging Custom Objects**. This alternative provides a similar level of operational security by keeping credit data read-only within the Merchant Center while maintaining a clean separation from core Customer profile data.
