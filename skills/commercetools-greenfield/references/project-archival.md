# Archival of OS Projects

## Strategy

Help our customers and partners to get their projects into production by provision of best practices and production ready generalised services and integrations.

*Notice: Even if discussed projects can not be used as it is right out of the box then at least it can serve as reference implementation with best practices applied.*

## Operations

There are 3 options to create additional features/enhancements based on the available OS solutions:

1. Partner or customer copies/forks the solution and adjusts it to their needs
2. Partner or customer implements the feature and creates a Github pull request. PS reviews and releases it for them.
3. Partner or customer requests a paid implementation by PS. PS provides it as open source.

**The Process is simple:**

- For options 2 and 3: The partner or customer creates a support ticket.
- For any feature or bug case: The partner or customer creates first a Github issue.

---

## OS Projects No Longer Maintained by Professional Services

The following projects have been archived or handed over. Each entry describes the original purpose, handover status, and outcome.

### commercetools-mc-custom-objects-starter
- **GitHub:** https://github.com/commercetools/commercetools-mc-custom-objects-starter
- **Handover status:** FINISHED — set to archived

### commercetools-bundles-starter
- **GitHub:** https://github.com/commercetools/commercetools-bundles-starter/tree/master
- **Category:** Bundles
- **Decision:** "This is a product and not an engineering decision. We do not want to maintain the dynamic bundling application." — Andrea Stubbe
- **Handover status:** FINISHED — set to archived
- **Description:** The Commercetools Bundles starter project contains two Merchant Center custom applications for managing product bundles. Product bundles are several goods or services that are sold to customers as a single combined package.
- **Production ready:** Yes

### commercetools-sync-java
- **GitHub:** https://github.com/commercetools/commercetools-sync-java
- **Decision platform PM:** CoCo/PIM
- **Handover status:** FINISHED — PIM (with Yacine Gasmi) has topic ownership. That decision on long-term future will be made in the future. Maintaining (including the unfinished SDK v2 migration) and reacting to urgent bugs done by Sarah Lander and Lam Tran (Developer Tooling team — donating time, not taking over).
- **Description:** Allows importing/syncing any data into CTP API. Supported scenarios: Sync/Import into CTP from external sources such as CSV, XML, JSON, Web-Services; Sync from CTP project A to CTP project B.
- **Scope:** Products, Categories, Custom types, Product types, Inventories
- **Used by:** Geberit, AUDI, Coeur De Lion, World of Books, REWE, Yamaha, Dodenhof
- **Production ready:** Yes

### sphere-product-import
- **GitHub:** https://github.com/sphereio/sphere-product-import
- **Decision platform PM:** CoCo/PIM
- **Handover status:** FINISHED — same ownership arrangement as commercetools-sync-java. Repository archived on 3/27/2025.
- **Description:** Allows importing product, price, product discounts from predefined JSON format. Also provides tools for update actions generation.
- **Scope:** Products, prices, product discounts
- **Used by:** ZEG, SABU, Carhartt, Coeur De Lion, Merkur

### commercetools-adyen-integration
- **GitHub:** https://github.com/commercetools/commercetools-adyen-integration
- **Category:** Payment
- **Decision:** No interest to maintain by Checkout. Move to customer.
- **Handover status:** FINISHED — Integrated Offerings will take care of it until final handover to Adyen is completed.
- **Description:** Microservice which simplifies shop's integration of Adyen payment provider: Mapping of CTP checkout data to Adyen, Handling Adyen specific server-to-server communication, Handling/mapping of asynchronous Adyen payment notifications.
- **Used by:** LEGO, Moonpig
- **Production ready:** Yes

### commercetools-project-sync
- **GitHub:** https://github.com/commercetools/commercetools-project-sync
- **Category:** Sync between CT Projects
- **Decision:** Hand over to Lego. PIM group owns strategic direction.
- **Handover status:** FINISHED — same Developer Tooling arrangement as sync-java.
- **Description:** Based on commercetools-sync-java library; provides a dockerized, extendable (with option of CLI) tool to synchronize CTP resources between 2 or more CTP projects.
- **Scope:** All resources supported by commercetools-sync-java
- **Used by:** LEGO (and many others per usage stats)

### commercetools-subscriptions
- **GitHub:** https://github.com/commercetools/commercetools-subscriptions
- **Category:** Checkout Subscriptions
- **Decision:** CSE takes over or deprecate
- **Handover status:** ARCHIVED — Qantas informed about deprecation.
- **Description:** Cron job based service which identifies subscriptions in the cart, manages subscriptions, reminders, and triggers subscription orders based on the schedule.
- **Scope:** Identify subscriptions, generate order based on schedule, before delivery reminder, support of cutoff days.
- **Used by:** Qantas

### k8s-charts
- **GitHub:** https://github.com/commercetools/k8s-charts
- **Category:** Deployment
- **Decision:** Deprecate
- **Handover status:** ARCHIVED
- **Description:** Provides a set of helm charts configurations which can be used as template for automated deployment of different services to Kubernetes (tested on GCP only).
- **Used by:** Carhartt, Coeur de Lion, Merkur, ZEG, SABU

### kubernetes-custom-ui
- **GitHub:** https://github.com/commercetools/kubernetes-custom-ui
- **Category:** Export Automation UI
- **Decision:** Hand over to Carhartt
- **Handover status:** ARCHIVED
- **Description:** Microservice with dedicated/customizable UI which allows monitoring and triggering of new jobs deployed on GCP Kubernetes. Utilizes CTP project for users management/login.
- **Scope:** Show deployed cron jobs, enforce immediate execution of scheduled cron jobs, trigger manual single job execution.
- **Used by:** Carhartt

### commercetools-payone-integration
- **GitHub:** https://github.com/commercetools/commercetools-payone-integration
- **Category:** Payment
- **Decision:** No interest to maintain by Checkout. Deprecate or move to customer.
- **Handover status:** ARCHIVED
- **Description:** Microservice which simplifies shop's integration of Payone payment provider: Mapping of CTP checkout data to Payone, Handling Payone specific server-to-server communication, Handling/mapping of asynchronous Payone payment notifications.
- **Used by:** Carhartt, Coeur de Lion, Wilo, ZEG, Dodenhof

### commercetools-payment-integration-java
- **GitHub:** https://github.com/commercetools/commercetools-payment-integration-java
- **Category:** Payment
- **Decision:** Deprecate
- **Handover status:** ARCHIVED
- **Description:** Supplements payment integration services like Payone; simple Java library providing convenience methods for payment/transaction creation and handling (trigger handle URL, process request/response).
- **Used by:** Carhartt, Coeur de Lion

### commercetools-paypal-plus-integration
- **GitHub:** https://github.com/commercetools/commercetools-paypal-plus-integration
- **Category:** Payment
- **Decision:** Move to customer
- **Handover status:** ARCHIVED
- **Description:** Microservice which simplifies shop's integration of PayPal Plus payment provider.
- **Scope:** Credit card, Direct debit (SEPA), Paypal, Invoice. Integration is generic so might support any newly added mode by PayPal Plus.
- **Used by:** ZEG

### commercetools-order-to-confirmation-email-processor
- **GitHub:** https://github.com/commercetools/commercetools-order-to-confirmation-email-processor
- **Decision:** Deprecate
- **Handover status:** ARCHIVED
- **Description:** Service run as a cron job to ensure that for each commercetools OrderCreated message an order confirmation e-mail is sent.

### commercetools-email-retry-processor
- **GitHub:** https://github.com/commercetools/commercetools-email-retry-processor
- **Decision:** Hand over to Carhartt
- **Handover status:** ARCHIVED
- **Description:** Service run as a cron job to ensure that in case of potential downtime of an e-mail provider, an e-mail can be sent/retried asynchronously. Supports multi-tenancy.
- **Used by:** Carhartt

### commercetools-connectors-step-java
- **GitHub:** https://github.com/commercetools/commercetools-connectors-step-java
- **Decision:** Hand over to customers or deprecate
- **Handover status:** ARCHIVED
- **Description:** Example implementation which allows importing XML data provided by STIBO STEP system.
- **Scope:** Category Type Import, Category Import, Product Type Import, Product Import, Stock Import. Limitations: Not really generic; does not utilize commercetools-sync-java.
- **Used by:** Baywa (initially), Geberit (as inspiration)

### commercetools-node-variant-reassignment
- **GitHub:** https://github.com/commercetools/commercetools-node-variant-reassignment
- **Decision:** Hand over to ZEG
- **Handover status:** ARCHIVED
- **Description:** Node.js utility complementing product sync/import module by automatic conflict resolution and reassignment of variants from one product to another.
- **Limitations:** Currently for Node.js applications only.
- **Used by:** ZEG

### commercetools-payment-to-order-processor
- **GitHub:** https://github.com/commercetools/commercetools-payment-to-order-processor
- **Category:** Payment
- **Decision:** Deprecate
- **Handover status:** ARCHIVED
- **Description:** Scheduled processor ensures that for every successful payment and valid cart an order can still be asynchronously created.
- **Used by:** Carhartt, Coeur de Lion

### sphere-brickfox-connector
- **GitHub:** https://github.com/sphereio/sphere-brickfox-connector
- **Decision:** Deprecate
- **Handover status:** DELETED — no change in repo since 2016, archived in 2019.
- **Description:** Set of generic/configurable connectors to sync data between Brickfox and SPHERE.IO.
- **Used by:** Department47 (Trendfabrik)

### commercetools-aem-connector
- **GitHub:** https://github.com/commercetools/commercetools-aem-connector
- **Decision:** Hand over to Yamaha
- **Handover status:** ARCHIVED
- **Scope:** Products
- **Used by:** Yamaha

### commercetools-sap-connector
- **Category:** Import/Export
- **Decision:** Delete (no repo)
- **Handover status:** FINISHED (idea stage only)
- **Description:** Module that is directly integrated with SAP and directly makes calls against commercetools API. Should not be a separate library and not require separate environment and SFTP.
- **Scope:** Products, Categories, Orders, Customers

### commercetools-salesforce-connector
- **Category:** Import/Export
- **Decision:** Delete (no repo)
- **Handover status:** FINISHED (idea stage only)

---

## Additional Steps Checklist

- [ ] Check feedback after 6 months of archival for commercetools-mc-custom-objects-starter and commercetools-bundles-starter, then decide on deletion (target date: 8/31/2023)
- [x] Draft additional legal letter to paying contributors of open source projects — won't do
- [x] Ask Mike Stevenson to check this list
- [x] Sync with Sam Woodley about communication within GTM org
- [x] Thorsten Bayer informed the GTM org in "GTM newsroom" conf call on 11th of April
