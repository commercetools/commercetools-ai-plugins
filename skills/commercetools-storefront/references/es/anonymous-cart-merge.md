# Anonymous Cart Merge

## Overview

Anonymous cart merge refers to the process of combining an anonymous (guest) cart with an authenticated customer's cart when a customer signs in during or after a guest session.

## Related Context (from the Carts Q&A page)

**Q: Does platform cart merge work when a customer uses external authentication?**

**A:** No, it's only available with CoCo sign-in flow with password.

**Q: If a customer has an anonymous cart and a customer cart — both have the same line item, but there is a custom field on one and not the other — if they do cart merging will the 2 line items be merged or continue as 2 separate line items in the resultant cart?**

**A:** Separate values for custom fields or separate custom fields at the line level will not merge the qty/cart line items. It will keep them separate.

**Q: Anonymous Carts and Sign-in Carts — Do we have a way to restrict guest checkout/anonymous carts checkout using commercetools APIs?**

**A:** Yes, commercetools can support this. You can restrict a cart conversion into order if the cart is an anonymous cart. During checkout, an anonymous cart can be converted into a customer cart when a customer signs in. You can choose `AnonymousCartSignInMode` to either merge with any existing cart of the customer or you can choose to keep the anonymous cart as a new cart upon sign-in.

## Key Rules

* Platform-native cart merge is triggered during the customer sign-in flow via the `AnonymousCartSignInMode` setting.
* `AnonymousCartSignInMode` options:
  * **MergeWithExistingCustomerCart** — merges the anonymous cart into the existing customer cart.
  * **UseAsNewActiveCustomerCart** — keeps the anonymous cart as a new active cart for the signed-in customer.
* Cart merge only works with the CoCo (Composable Commerce) password-based sign-in flow. It does **not** work with external authentication.
* Line items with different custom field values are treated as separate line items and will not have their quantities merged.
