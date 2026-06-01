# Customer Profiles

## Q&A

### Q: How to handle customer accounts while using external auth based on the platform documentation as below:

```plaintext
If you want to use external OAuth tokens with the /me endpoints, you'll have to add an already existing customer account, or an anonymous session, into the scope. For a customer account, add customer_id:{id}, for an anonymous session, add anonymous_id:{id} to the scope.
The synchronization of customer accounts between the external service and the commercetools platform should, for performance reasons, not be done during the token verification. Ideally, the customer accounts have been created before a token for the customer is issued to be used with the commercetools platform.
```

**Answer:** It is not a good idea to create customer profiles on the fly during external auth validation. Customer profiles should be created separately.

If they still wish to, they have a 500 ms time limit to do so. We will not raise that limit. If the whole process including the customer creation does not succeed within 500 ms, the call will fail.

Alternatively, if you are using an external identity provider, you may not need to create customers in commercetools unless there are other reasons. If you are able to pass a consistent "anonymous_id" based on the external identity provider, you don't need to create customers at all in CT, and still get the benefit of `/me` endpoints. The only downside is that you don't get to use "customer group" pricing in CT.

---

### Q: Let's say I want to create a custom property in a customer resource that has a list of complex objects (for example: each customer has a list of prescriptions).

Do we have a way to model this on commercetools as we can do for product types (https://docs.commercetools.com/tutorials/nested-types)?

We have different options for these type of scenarios depending upon exact use cases. Below are a few alternatives:

**Option 1.** Use custom fields on customer resources. The custom field with string data type can hold json structured values. Or you can create enum/set type of attribute to hold values in an array. Please Refer - https://docs.commercetools.com/api/projects/custom-fields

**Option 2.** Use custom objects to store arbitrary json formatted data when there is a requirement which cannot be supported using out of the box fields or objects. Please refer: https://docs.commercetools.com/api/projects/custom-objects

---

### Q: How to migrate customer profiles between projects or loading into commercetools?

Below options can be used to migrate profiles in commercetools.

i) Project Sync

ii) Java Sync

iii) Import API
