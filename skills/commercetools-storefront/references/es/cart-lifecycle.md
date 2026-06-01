# Cart Lifecycle

## Questions

**Q: How to limit product localized attributes to populate in the cart values for specific locales?**

**A:** Set a store with specific locales in the cart as follows:

```
"store" : {
  "typeId" : "store",
  "key" : "store1"
}
```

Very useful to reduce the size of the cart!

Note: setting the locale in the cart does not have the same effect — all the values (for all locales in the project) are copied to the cart.

---

**Q: Is it possible to modify currency on a cart?**

**A:** No, a cart currency once set upon creation cannot be modified.

---

**Q: Impact of `updateProductData` on `recalculateCart` update action**

**A:** See below:

* When this parameter is passed as `true`, the recalculate action will update the product, variant, and product type data on the cart. Due to this, the taxes on the cart gets removed and the taxes need to be set again.

* When this parameter is not passed (default value is `false`) or set as `false`, the product data doesn't get updated with latest snapshot. The taxes do not get reset due to this.

---

**Q: If a customer has an anonymous cart and a customer cart — both have the same line item, but there is a custom field on one and not the other — if they do cart merging will the 2 line items be merged or continue as 2 separate line items in the resultant cart?**

**A:** Separate values for custom fields or separate custom fields at the line level will not merge the qty/cart line items. It will keep them separate.

---

**Q: Does platform cart merge work when a customer uses external authentication?**

**A:** No, it's only available with CoCo sign-in flow with password.

---

**Q: Anonymous Carts and Sign-in Carts — Do we have a way to restrict guest checkout/anonymous carts checkout using commercetools APIs?**

**A:** Yes, commercetools can support this. You can restrict a cart conversion into order if the cart is an anonymous cart. During checkout, an anonymous cart can be converted into a customer cart when a customer signs in. You can choose `AnonymousCartSignInMode` to either merge with any existing cart of the customer or you can choose to keep the anonymous cart as a new cart upon sign-in.

---

**Q: What is `deleteDaysAfterLastModification` setting?**

**A:** This configuration is used on Carts and ShoppingLists. It suggests number of days after which a resource is deleted since its last modification. It is set at project level for global setting from where a default setting is applied. If not set, a default 90 days is available on all projects. It can be modified on carts and shopping lists using the update action `setDeleteDaysAfterLastModification`.

---

**Q: What are template carts and its use cases?**

**A:** Template carts are same as carts except that it is used to define specific type of carts. For example, a cart template can be created when customers need to implement subscription orders or re-orders at periodic intervals where the content of the items in cart are pre-defined. Those carts should be created with a longer `deleteDaysAfterLastModification` so that they don't get deleted. They should also be modified based on the parameter setting to keep them alive. A custom type/custom field on carts is recommended to set to easily identify such carts. A `replicate cart` function should be used on such carts to create a replica of this template cart and place order during order and checkout.

The use cases involve:

1. Reorders
2. Subscription Orders
3. Regular POs in case of B2B
4. Use them instead of shopping lists when external pricing info needs to be stored

---

**Q: If we have two simultaneous carts, one by customer and another by background processes. Can they co-exist without any impact on one-another?**

**A:** Yes, these carts can co-exist without any impact. We recommend that you assign a custom cart-type on the carts created by background process for better identification and management.

---

**Q: Cart Reference on the order — how long does an ordered cart stay in system? Does it count towards the 10M limit?**

**A:** Carts stay in commercetools until it reaches its validity time (based on `DeleteDaysAfterModification` value) or when your project hits the 10M carts limit, whichever occurs first. This is true for ordered carts too, therefore you may not find an ordered cart in commercetools after it's deleted. Ordered carts are also counted towards the limit until they're deleted from the project.

If you need cart data in long term for BI Reporting, please use subscriptions and send cart data to an external analytics or datawarehousing system where cart data can remain for longer duration if you need it for future, or have a custom field on cart/order to assign required value if you need them in future.

---

**Q: Is it possible that a cart can be deleted automatically after 2 hours if it hasn't been modified? Though cart can be deleted automatically by providing the number of days in the `deleteDaysAfterLastModification` attribute.**

**A:** The lowest value this field can take is 1 day as it's a number data type. If you set this attribute with 1, it will delete after a day. However, if you need to delete carts within hours, you will need to use delete cart by ID or Key action.
