This is an automated CI run. Do not ask any questions, request clarification, or wait for user input at any point. Make reasonable assumptions and proceed autonomously to completion.

## Task
I want to create a production ready microservice for my commercetools connected website.
I want to mark orders that include specific products to have a flag on them "signatureRequired".
If a product added to cart has an attribute called "narcotics" set to true, add this flag to that cart.
Removing that product, and if no other product in the cart has this attribute, then remove the flag.
If the item is doesn't have this attribute, it can freely updated or added.

# Out of Scope
- connector installation
- connector deployment