# Custom Objects

Custom objects are built to store arbitrary JSON data for which there is no resource in commercetools but needs to be stored in commercetools for commerce purposes. Data stored in custom objects can be expanded easily in API queries. For example: Product Types or Customer Resources can contain references to custom objects. Or standalone records of data can be created using custom objects.

Example usages of custom objects are:

i) You need to list vendors/suppliers of a product

ii) You need to reference additional referential details of a particular attribute of a SKU. i.e. Alias names/supplier sku/manufacturer sku list mapping

iii) You need to attach an invoice to an order

---

## Q&A

### 1. Can the custom objects limit be raised to million?

Yes. However the following must be considered:

Custom objects should be constructed in a pattern containing a container per resource, where the custom objects key is an identifier. This will result in a performant lookup within the commercetools platform.

---

### 2. Are other commercetools customers using custom objects above the stated platform limit of 20 million custom objects?

Yes. We have multiple customers using custom objects above the stated platform limit.

---

### 3. Will custom object queries be performant?

1. The design should be built assuming custom objects with an average size in KBs.

2. If you have millions of custom objects with an average size >= 1MB and complex query patterns cannot be performant.

3. Complex query patterns would include performing queries for ranges, not defined, not equal, checking array values, etc.

4. If custom objects are constructed following commercetools documentation and best practices; and the size of custom objects is limited to KBs, platform queries should be performant.

5. The auto indexer tool shall index the value field of custom objects, if the query follows commercetools recommended best practices.

6. Bulky static data should be stored in custom objects keeping the custom fields for essential values. Keeping cart data in particular light weight has a direct impact on performance as well as avoiding size limits.

---

### 4. Data design review before adopting custom objects patterns

It is important to review data design prior to adopting custom objects patterns. Data tightly coupled (1:1) with commercetools resources may be better stored directly within resource attributes as JSON blobs. For example, small amounts of customer specific information related to preferences, etc.

---

## Limitations of Custom Objects

i) Custom objects don't offer search features. You can query against contents within a custom object with below constraint:

> Exact match on key/value pair within the value is possible: `where=value(myKey="myValue")` should return any Custom Objects with a field `myKey` with a value of `myValue`

ii) When you edit the custom objects to modify contents, the content should be resubmitted as there is no provision to make delta changes on custom objects.
