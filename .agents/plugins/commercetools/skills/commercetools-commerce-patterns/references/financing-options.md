# Financing Options

### How to setup financing options to be displayed in the PDP

**Q:** Need to allow display of financing options for specific products:

- 0% financing for 18 months
- 0% financing for 12 months
- etc.

Need to include specific text and additional information about each financing option.

**A:** There are two ways to do it, none of them perfect and each has its own pros and cons. Using product discounts is not a good fit for two reasons: 1) only one product discount is applied and 2) there is no support for custom fields to add the necessary information. Two viable options are:

### Option 1: Custom Fields on the Price

Setup the financing options as a set of custom fields in the price (one record for each financing option).

**Pros:**
- Retrieved with the product information

**Cons:**
- Requires setup for each variant and can be confusing to the user
- For each price, requires one additional price for the period when the financing is available

### Option 2: Custom Objects Associated with the Product

Use a set of custom objects associated with the product (same for all variants). Each custom object will contain one financing option's information.

**Pros:**
- Can be set at product level

**Cons:**
- Need to check the validity period; not enough to expand when the product is retrieved
- Is maintained in the custom object (via the API or custom app)

---

### Additional Answers

**Option 1 alternative:** Could be implemented using product discounts with custom fields — however, product discounts do not support custom fields, so this approach is not currently viable.

**Option 2 best option:** Probably the best option is to use a **cart discount**.

**Con:** Cannot be displayed for the PDP (or PLP)

**Pros:**
- Can be defined for a number of products (by category, brand, etc.)
- Validity period is set for the discount
- Supports custom fields to save all the necessary information for each financing option
