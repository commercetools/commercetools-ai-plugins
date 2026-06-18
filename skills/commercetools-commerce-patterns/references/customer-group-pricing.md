# Customer Groups Based Pricing

---

**Please provide recommendations / best practices for setting up customer groups and special pricing**

Customer groups are typically used in conjunction with Currency Code, Country and Channel to define a rich set of price rules. These are price selection parameters.

**Price selection parameters include:**

- CurrencyCode
- Country
- Customer Group (single group; on Product Projection search / price selection, the parameter is `priceCustomerGroup`)
- Customer Group Assignments (multi-group resolution; on Product Projection search / price selection, the parameter is `priceCustomerGroupAssignments`)
- Channel
- PriceDate (represented as `validFrom` and `validTo`)

---

1. If price currency and additional price selection parameters are included in product projection search, the platform will use price selection logic to return the matching price to the customer.
   - Reference: https://docs.commercetools.com/api/projects/products#price-selection

2. When adding lineItems to carts, the platform will use the currency and additional price selection parameters to select the same price. In order for price selection to work when calling `addLineItem`, the price selection parameters (i.e. `currencyCode`, `country`, `customerGroup`...) must be present on the cart. See: https://docs.commercetools.com/api/projects/carts

3. When defining pricing that includes price selection criteria, it is recommended to include a default price within the variant pricing model that can be used as a fall back.

---

## Customer Group associated with a price

Customer groups assigned to pricing within the product catalog **cannot be deleted** without first removing the pricing entries utilizing the customer group. If a deletion request for a customer group contained in product pricing is made, the platform will return a `400` exception containing the message:

> "Can not delete a source while it is referenced from at least one 'product'."

In this situation, it would be required to first create the new customer group, modify all discounts referencing the existing customer group and then delete the existing customer group from the platform.
