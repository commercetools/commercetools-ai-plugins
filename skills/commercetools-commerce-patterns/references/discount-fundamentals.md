# Discount Fundamentals

---

## Part 1: Discounts Topics

### Use of "Price - Customer group ID" on product discounts

It is a little bit confusing: If "Price - Customer group ID" is used in a product discount predicate; the product discount is applied to prices defined for a specific customer group. If a customer that belongs to the group but the price is a price that applies to all customer groups the discount will not apply.

This can work only if they have specific prices for the customer group.

Example: Price - Customer group ID is My_Customer_Group — if the price used in the line item is not specifically defined for this customer group (for example a default price for all channels, customer groups, countries, etc) then the discount will not apply even if the customer belongs to that customer group.

---

**Q: I have a use case where a specific promotion is available if the signed-in user is the artist that designed a specified product. On the current site, if you are an artist and it's your product, it would show on the PDP that you are getting a discount.**

From the API, it seems like you can't apply this type of promotion at the product level, but you can do it at the cart level (using the user assigned to the cart). This means that it's not automatically applicable when showing the PDP.

Is this correct?

**Answer:** Yes, this use case can be achieved using cart discounts and the assigned user on cart. However, for PDP they can store the artist id or their unique identifier (i.e. user id) to match and show eligible discounts using front-end customization. If the design is stored as product/sku in ct then there should be a product attribute defining this user-id.

---

**Q: I have a use case where different promotions may be applied based on the direct artist discount, groups you may belong to or general promotions. The system should choose the best combination of promotions. I think we could do this using promotion sorting and early exit from stacked promotions, but it seems a little tricky at the user level and would probably be easy to make a mistake. Is there some way to do this?**

**Answer:** Stacked promotions can be used along with combinations of user specific discounts. The carts will need to have a custom field at cart or line level to indicate the artist's promotion eligibility which can be applied in cart discount predicates.

---

**Q: If commercetools applies a set of promotions, how do we see which ones were applied? From the API, it seemed like only single promotions were displayed. What if they stack?**

**Answer:** The cart should show all discounts at line level including matched discounts. It also shows the applied discount codes.

---

**Q: Can customers use Cart-discounts or Product-discounts endpoint to search for applicable discounts potentially for PDP pages or showing applicable discounts for a signed-in customer? See below scenarios:**

i) Search for all applicable discounts for a signed-in customer using customer email or custom fields on customer resources?

ii) Can cart discounts be queried by custom fields values? For example, search all cart-discounts where customer-type is "Employee" (here the customer-type is a custom field on a cart discount)

iii) Search for all discount codes for a particular customer-group or search discounts codes using custom fields?

These scenarios work well only when a cart is configured and the cart has these fields out of the box or through custom fields. Customer is looking for finding applicable promotions even before customer builds a cart and browsing as a signed-in customer.

**Answer:** This can be implemented by creating a "ghost" cart in the background for the customer on the PDP which was then able to calculate any discounts applicable to the product, they then dispose of the cart. The advantage of this is you could also expand it to take into account what is already in their cart or even their customer group etc.

---

**Q: How to support a use case where customer can see all applicable discounts when they're signed-in (not on the PDP page but may be on their my account page)?**

**Answer:** There is no native API support for this. Theoretically there is a query endpoint for discounts which you could use to search for all applicable discounts for the product, but it wouldn't calculate the value for a customer. Additionally, these endpoints may not be performant for a large customer.

---

**Q: BOGO Type of discount - Cart Discount Use Case & Solution**

Buy 2 for $99 Polos. Expected outcome:

- 2 items in cart - Buy 2 for $99
- 3 items in cart – 2 for $99, 3rd at full price
- 4 items in cart – 2 for $99 applies, so total is $198
- 5 items in cart – 2 for $99 applies to 4 items, 5th item is full price

**Challenge:** The current setup removes the promo from the cart when you have 3 or 5 items in the cart. This is due to the qualifiers targeting it when there are only 2 items in cart and 4 items in cart. I've looked at multi-buy as an alternative, but it doesn't work because you can only target with a % off and because products in the promotion are at different price points you can't get the $99 fixed price. There are screenshots attached of the cart discount conditions.

Is there another way to get to the outcome they are after using our promotions engine?

**Solution:** You can implement this use case as below:

1. Add the even qty items (2, 4, 6, and so on) as one line item on cart with a line item custom field defined and single qty item (qty=1) as a separate line item on the cart. The cart will add separate line items if custom fields/its values are different.

2. Create a fixed price cart discount with Cart Promotion Rule & Cart Qualifier as below:

3. Fixed price for each line item = 49.5 if the double qty sells for 99 (half the original price)

4. **Promotion Rule** -> `product.id` or `sku = "xyz"` and `custom.<line_item_custom_field_name> = "<custom value>"`

5. **Cart Qualifier Rule** -> `lineItemExists(quantity = 2) = true` or `lineItemExists(quantity = 4) = true` or `lineItemExists(quantity = 6) = true`

Alternatively, you may also use bundle price option as Jaime suggested, however the above will work without changing the product data model and by applying small custom logic on cart line items to set custom fields.

---

**Q: Gift with Purchase Use Case: Solution to implement gift with purchase where customer can choose one from a given selection of items as a gift?**

Details: Customer buys item X which makes them eligible for a gift with purchase, however, they get to choose one item from the list of 10 items instead of the one predefined product as a gift. Our current promotion rules allow a predefined product as a gift but does not offer a selection of choices to customer. Multibuy promotions option at line level also doesn't solve this.

**Solution:** This can be solved by not using gift promotions rather a 100% discount and using a hidden category/10 skus as a rule to give 100% on. That category/skus can be maintained in code in frontend or rather as information in original product - item X.

---

**Q: Exclude Discounts: has anyone come up with a way to exclude discounts from applying if the item in the cart is already participating in a cart discount? I can achieve this when an item is participating in a product discount but not for cart discount.**

**Solution:** To solve this they can apply a little custom logic to make the VIP cart discount exclusive.

1. Use a custom field on cart discount of 2-for-1 discount to mark as "Not to combine with VIP" or any appropriate flag/indicator if this discount cannot be combined with VIP or any other discount.

2. When adding a 2-for-1 cart discount to the cart, update a custom field on the cart to mention that this discount cannot be combined with VIP discount.

3. Configure the VIP cart discount predicate to check for cart discount custom attribute where its value is NOT "VIP Discount" or the expected value.

   In this scenario the VIP discount won't get applied based on the predicates.

4. Additionally, you can use custom fields on VIP discount as well to consider for the vice-versa scenario where 2-for-1 discount cannot be applied if VIP discount exists on a cart.

---

**Q: Standalone promotions - Can we use it?**

Yes, you may use our Discounts endpoint API (Cart Discounts, Product Discounts, Discount Codes) to query for discounts in commercetools. To be able to use automatic cart discounts efficiently, a dummy cart or a real cart is more appropriate to see if a cart is eligible for such discounts where no discount code is required.

---

**Q: Coupons and promotions - external validations for discount codes in commercetools - can we do it?**

API extensions cannot be created on discounts resources therefore, this validation flow will have to be a custom logic that you may have to implement by applying custom logic. A better way to manage this would be to have a feed come from your coupons system either via nightly job or a cron job (every 15/30/60 mins?) to commercetools and then update the validity on discount codes in commercetools so that the discounts in commercetools are valid and can be used on carts & checkout.

---

**Q: A customer has a coupon code that gives the customer free shipping. They are referencing the cart for the list of shipping methods. Do they need to add the shipping method onto the cart before they get to checkout — so that it can be visually applied? It's more of a user experience issue than the coupon not working. They are trying to see how to solve so that the customer sees it as free shipping prior to getting to the payment part of checkout.**

- Assuming that the coupon code is set with cart discount where free shipping is the target for that discount to be applied on a cart.

- When the coupon code for free shipping is added to cart, it will show the discount code as "Matches Cart" (as long as the cart qualifies with the cart discount condition) — Jockey can use this info to show the eligibility of free shipping to their customer.

- Now on checkout, when customer adds shipping address and chooses a shipping method or when Jockey adds a shipping method based on the shipping address, the shipping charges will automatically be discounted as the cart discount is active. Meaning if the shipping charge was $20, it will show the shipping fee of $20 as price but it will also show discounted shipping price as zero under shipping info.

Long story short, they don't need to add shipping address to know the eligibility of a free shipping discount code.

---

**Q: For cart discounts and discount codes. Are there any restrictions for updating the validity dates for cart discounts and discount codes?**

**Example: If a coupon code has expired. Are we able to go into the Merchant Center and update the expiry?**

You can edit/extend the validity dates. There is no restriction on modifying those dates.

---

**Q: Direct Discount Limitations**

If direct discounts are present:

- discount codes: NOT supported (blocked)
- cart discounts: NOT supported (blocked)
- product discounts: Supported (allowed)

---

## Part 2: Discount Solutions to Un-supported Scenarios

**Q: Following discount scenario not supported today:**

The scenario is as follows: If a customer buys more than one units of a specific product they want the first unit to be for example $50 and the rest to have a 20% discount.

Tiered prices does not support it, because the price applies to all units and the customer wants to charge the first one a different (higher) price. In addition if there are other conditions for this discount to apply that can be added to a cart discount predicate but not for prices.

Multibuy discounts also do not provide a solution, for example buy 1 get 1 with 20% discount works great for 2 units but not for 3 (only even numbers).

**A:** Product board entry has been added. The way to resolve this is programmatically, with an API extension called each time a line is added/removed. The extension will check the quantity and will add a direct discount as necessary or a custom line item with a negative price.

---

**Q: Following discount requirement not supported today.**

The use case is as follows: If a customer buys 1 product A and one product B, they want to provide a specific discount (absolute or percent) to one of the products (A or B). They are trying to achieve a discounted price for the pair without implementing bundles.

Multibuy does not provide a solution because if the predicate requires for example SKU to be either product A OR product B then for example 2 units of product A will get the discount.

---

## Key Platform Limits (Discounts)

These limits are undocumented or partially documented — validate with Product/Support for current values:

| Limit | Value | Note |
|-------|-------|------|
| Cart discounts per project (active + inactive) | 1,000,000 | Undocumented |
| Cart discounts requiring codes (with MC support) | 500 | Undocumented; support ticket needed above this |
| Cart discounts per discount code | 10 | Documented |
| Discount codes per cart | 10 | Documented |
| Active product discounts per project | 500 | Documented |
| Cart discounts per Discount Group | 100 | Documented |
| Discount Groups per project | 100 | Documented |

---

## Discount Type Quick Reference

**Product Discounts:**
- Can only be used with platform pricing (not ExternalAmount/ExternalRate)
- Applied at product variant level, before items are added to the cart
- Do NOT stack — only the highest-ranked (lowest sortOrder value) applies per variant
- Max 500 active at once

**Cart Discounts:**
- Work with platform or external pricing
- Applied when items are added to the cart
- Stack by default unless `stackingMode: "StopAfterThisDiscount"` is set
- Rounding: if discounted price ends in exactly 0.5 cents, rounds in favor of the customer (half-down)

**Shipping Promotions — Three Ways:**
1. Via shipping method's `freeAbove` threshold in Project Settings
2. As a Cart Discount with `target.type: "shipping"`
3. Via discount codes linked to a shipping cart discount

**A:** Product board entry has been added. The way to resolve this is programmatically, with an API extension called each time a line is added/removed. The extension will check how many pairs of product A and product B are in the cart and will add a direct discount as necessary or a custom line item with a negative price.
