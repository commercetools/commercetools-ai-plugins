# Rate Limits and Platform Limits

## What Is a Limit?

A limit is a known constraint of the platform. After a limit is exceeded, the platform may:

- Become unstable
- Not function
- Become slow

Most documented limits can be changed per project upon request to commercetools support. Undocumented limits are not strict — they must be evaluated on a case-by-case basis. Some limits are documented publicly; others are internal only because they "sound too bad" or have not yet been fully implemented.

---

## Product Catalog Limits

### Documented (Public)
- Max 100 variants per product _(configurable, depends on overall complexity of product data model)_
- Max 10,000 categories per project
- Max 500 update actions per single request
- Max JSON document size: 16 MB _(above 10 MB can be problematic; recommended average: 100 KB; large documents should not exceed 2 MB)_
- Max 1,000 product types per project
- Searchable field content: max 10,922 characters
- Max 50 product/variant attributes indexed each
- Max 100 Attribute Groups per project
- Max 100 million Product Tailoring per project

### Undocumented (Internal — Performance Guidelines for Safe Area)
- Up to 100K products per product type

---

## Pricing & Discount Limits

### Documented (Public)
- Max 100 embedded prices per variant _(configurable; some projects have limit of 700)_
- Max 50,000 standalone prices per variant
- Max 500 active product discounts at the same time
- Max 10 cart discounts associated to a Discount Code
- Max 100 active cart discounts without a discount code _(configurable; base + 100 per store)_
- Max 500 Cart Discount Stores per cart discount
- Max 10 Discount Codes per Cart
- Max 10 Discount Codes to Cart Discounts
- Max 100 Discount Groups per project, 100 Cart Discounts per group

### Undocumented (Internal — Performance Guidelines for Safe Area)
- Up to 500 cart discounts that require a discount code in total (if a customer needs MC support)
- Up to 1M Discount Codes per Project (active and non-active)
- Up to 1M Cart Discounts per Project (active and non-active)
- Up to 50K Product Discounts per Project (active and non-active)
- Up to 150 line items/custom line items in the cart _(above those numbers cart calculation takes approx. 2 seconds)_

### Note on Discount Code Predicates
The nginx configuration enforces a maximum request body size of no more than 10 MB. The provable theoretical maximum size a `predicate` can be is slightly less than 10 MB uncompressed. Any `predicate` definition larger than a couple hundred kilobytes is **strongly recommended** to be load tested in a non-production environment so its impact can be assessed.

---

## Storefront Search Limits (Product Projection Search)

### Documented (Public)
- Max size of a searchable field: 10,922 characters
- Max terms per facet: 200 _(configurable)_
- Max 500 elements fetched per query
- Max pagination offset: 10,000
- Full-text search: first 256 characters of query parameter only _(configurable up to 1,024)_
- Max 50 expressions in Product Search
- Max 100 elements fetched in Product Search
- Max 10,000 offset in Product Search
- Max 256-character query in Product Search

### Undocumented (Internal — Performance Guidelines)
- 1M products per project
- 15 locales per project
- 3M variants per project
- 20 suggestion keywords per product
- 100 Channels per project

> Generally, if you see the undocumented limits would be exceeded, using another solution for search is recommended.

---

## Carts, Orders & Shopping Lists Limits

### Documented (Public)
- Max 10 discount codes per Cart
- Max 250 line items per Shopping List
- Max 100 text line items per Shopping List
- Cart deletion after 90 days since last modification _(configurable)_
- Shopping List deletion after 360 days since last modification _(configurable)_
- Max JSON size: 16 MB
- Max 100,000 Order Edits per Project
- Max 10M Shopping Lists per Project _(auto-deletes least recently modified if exceeded)_
- Max 10M Carts per Project _(auto-deletes least recently modified if exceeded)_
- Max 100 Shipping Methods per Project
- Max 100 Zones per Project
- Order Search: 3-month data retention

### Undocumented (Internal — Performance Guidelines for Safe Area)
- Up to 25 line items per cart _(interacts with number of discounts; can be changed)_
- Up to 10M Orders per project ("active orders" that can be changed, searched for, etc.)
- Up to 10M Payments per project

---

## Customers Limits

### Documented (Public)
- Max 10,000 Customer Groups per Project _(previously 1K; now 10K)_
- Max 10M Customers per Project
- Max 500 Customer Groups per customer

---

## Business Units Limits

### Documented (Public)
- Max 5 levels in the hierarchy of any Business Unit
- Max 4,000 Divisions per Business Unit (including all direct and indirect children)
- Max 2,000 Associates per Business Unit (excluding inherited Associates)
- Max 5 Associate Role assignments per Associate
- Max 500 Business Unit Customer Groups

---

## Subscriptions, Extensions, External OAuth, Custom Objects

### Documented (Public)
- Max 50 Subscriptions per project _(can be increased to up to 100 via internal request)_
- Max 25 Extensions per project
- Max 2,000 ms response time per extension call _(changeable, but platform and user experience will suffer)_
- Max 10,000 ms (10 s) response time for payment-related API extensions _(self-service since Dec 2021)_
- Max 100 update actions per extension response _(hard limit: 1,000; increase requires approval)_
- Max 500 ms response time per External OAuth call
- Max 10M refresh tokens
- Max 20M Custom Objects per project _(changeable; ask why before approving; forward large requests to Product Management)_
- Max 3 expansion paths per API Extension
- Max 1,000 Import Containers per project
- Import Operations: auto-deleted 48 hours after creation
- Import Requests: max 20 resources per request

---

## Stores

### Documented (Public)
- Max 300,000 Stores per project
- Max 100 Product Distribution Channels per store
- Max 100 Inventory Supply Channels per store
- Max 100 Product Selections per store

---

## Other Limits

### Documented (Public)
- Max 100 Tax Categories per Project
- Max 100 Shipping Methods per Project
- Max 100 Zones per Project
- Query "total" field is limited to 10,000
- Max query offset: 10,000
- Max 500 elements per query
- Reference expansion depth: max 3 levels
- GraphQL complexity threshold: 20,000 (queries above this are rejected)
- Max 50 active Payment Methods per customer/associate; 100 inactive; 1M unassigned per project

### Authorization
- External OAuth 2.0 introspection: 500 ms response requirement
- Concurrent login attempts: only one at a time (concurrent attempts result in a generic error)

### Audit Log
- Basic tier: 1 year retention
- Premium tier: 3 year retention

---

## Quota / Limit Increase Process

### Always ask for:
- Region and project key
- The exact number of resources they need the limit raised to
- All project keys that require the increase

### Increases That Require No Approval:
- Limit increase is **≤ 50%** of the original limit (inform Christoph in the ticket)
- The production project has already been approved and they ask for the same limit on another project for the same customer
- Adyen/payment extension timeout increases (automatically handled since Dec 2021 release)

### Standard Process:
1. When passing to approver: use **Assigned Team: Limit Approver**, place on hold with a 2-day due date
2. If there is a cost related to the raised limit, question whether the increase is required on non-prod projects
3. After approval of production project updates: use **Assigned Team: Support Admin**
4. Raise limit in Monster; paste the Monster response into the ticket

### Key Limits and Their Approvers

| Resource | Standard Limit | Approval Threshold | Approver/Team |
|---|---|---|---|
| Carts | 10M | No approval ≤ 15M | Carts team / #carts-and-orders |
| Cart Discounts (active, no code) | 100 | No approval ≤ 150 | #sphere-foundation |
| Cart Discount Stores | 500 | Requires approval | #sphere-foundation |
| Inventory Supply Channels per Store | 100 | Requires approval | #context Slack |
| Product Distribution Channels per Store | 100 | Requires approval | #context Slack |
| Product Selections per Store | 100 | Requires approval | #context Slack |
| Customers | 10M | Requires approval | #customers-product-team PM/EM |
| Customer Groups per customer | 500 | Requires approval | #customers-product-team PM/EM |
| Customer Groups | 10,000 | Requires approval | #customers-product-team PM/EM |
| Business Unit maxDivisions | 4,000 | Requires approval | #customers-product-team PM/EM |
| Business Unit maxDepthLimit | 5 levels | Requires approval | #customers-product-team PM/EM |
| maxAssociates per Business Unit | 2,000 | Requires approval | #customers-product-team PM/EM |
| maxAssociateRoles per Associate | 5 | Requires approval | #customers-product-team PM/EM |
| Custom Objects | 20M | No approval ≤ 30M | API Extensibility team / #extensibility-team |
| API Extension timeout (payment) | 10,000 ms | Already at max | Self-service via setTimeoutInMs |
| API Extension timeout (general) | 2,000 ms | No approval ≤ 3s | API Extensibility team / #extensibility-team |
| Extension update actions per response | 100 | Hard max: 1,000 | API Extensibility team / #extensibility-team |
| Order Edits | 100,000 | No approval ≤ 150K | Orders team / #carts-and-orders |
| Embedded prices per variant | 100 | No approval ≤ 150 | #sphere-foundation |
| Standalone prices per variant | 50,000 | Not a hard limit | Priceless team |
| Variants per product | 100 | No approval ≤ 150 | PDM team / #pdm-team |
| Active Product Discounts | 500 | Requires approval | Priceless team |
| Query offset | 10,000 | Only for product-projection/search | API Extensibility / Search team |
| Refresh tokens | 10M | Requires approval | API Access team / #api-access-team |
| Shipping Methods | 100 | Requires approval | Carts team / #carts-and-orders |
| Shopping Lists | 10M | Requires approval | Carts team / #carts-and-orders |
| Shopping List line items | 250 | Requires approval | Carts team / #carts-and-orders |
| Shopping List text line items | 100 | Requires approval | Carts team / #carts-and-orders |
| Stores | 500 (default) | Requires approval | Context team / #context |
| Tax Categories | 100 | Requires approval | Carts team / #carts-and-orders |
| Zones | 100 | Requires approval | Carts team / #carts-and-orders |
| Categories | 10,000 | Requires approval | Context team / #context |
| Subscriptions | 50 | Max 100; request via GitHub | Distributed systems team |
| Product Search limit | 100 | Soft limit for now | Marko / Search |

### Hard Limits (Cannot Be Increased)
- Max searchable field size: 10,922 characters
- Max terms per facet: 200
- Max elements fetched in search: 500
- Max search offset: 10,000

### Merchant Center Notes on Limits
- Shipping methods: MC does not support more than 200 shipping methods — custom tooling needed
- Stores: when filtering by store, MC order list and customer list only load 500 stores
- Zones: only 100 zones displayed in MC (Project Settings → International → Zones)
- Subscriptions: above 50, not yet available in Monster — must open GitHub request

---

## Limits Monitoring (Internal)

- **Project Custom Limits Dashboard:** https://grafana.sre.europe-west1.gcp.commercetools.com/d/KrZb4XZGk/project-custom-limits
  - Filter by project and collection
  - Y-Axis: usage percentage (50%–100%)
  - Orange area above 80% highlights projects close to hitting the limit
  - Alert sent to #project-custom-limits when a project reaches ≥ 80%
- **Object count queries:**
  - EU/AU: [Humio](https://cloud.humio.com/ctp-eu/dashboards/event-store/event-store/Project%20DBs%20%26%20Collection%20Statistics?dashboardId=OgIgoj6mUDztaHnXnzZfjvW53H9QEMnx)
  - US: [Humio](https://cloud.us.humio.com/ctp-us/dashboards/event-store/event-store/Project%20DBs%20%26%20Collection%20Statistics?dashboardId=IaUXgpSlgXGY3caxgjbWfJXaDDo4FdMz)
