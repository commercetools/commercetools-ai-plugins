# Item Substitutes

## Q&A

### Q: Does commercetools provide any out-of-the-box (OOB) feature to support item substitution?

**A:** Yes, you can use **product references**.

Define an attribute on a `ProductType` that refers to another product or SKU as a substitute. If there is a need for an item substitute and a product is referencing it, you can add the substitute item to the cart by switching between products — since the original product refers to the substitute.

**Implementation pattern:**

1. Add an attribute to the `ProductType` of type `reference` (pointing to `product` typeId) or `set` of references.
2. Populate this attribute with the ID(s) of the substitute product(s).
3. When the primary product is out of stock or unavailable, the BFF/storefront reads the substitute reference attribute and presents the substitute product(s) to the customer.
4. The customer (or the system, in automated substitution scenarios) can then add the substitute to the cart in place of the original item.
