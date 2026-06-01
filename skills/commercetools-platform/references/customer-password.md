# Customer Password Management

**Q: Change Password Flow — How to change/reset password in parallel in 3rd party system/ATG & commercetools**

For this, you may build an API call to update password to commercetools when they're modified in your system or ATG. You can use the Reset Customer Password option (https://docs.commercetools.com/api/projects/customers#password-reset-of-customer). In this case, you can obtain a token by providing the customer email address, and then use this token to reset the customer's password.

The above option does not require the customer's existing password. However, you may also change the password using old & new password options (see: https://docs.commercetools.com/api/projects/customers#password-reset-of-customer). Both of these options can be managed from your API service layer and do not require the customer to connect to commercetools directly. This can be propagated based on changes from ATG.

---

**Q: Are hashed passwords migrated with the project sync tool?**

commercetools cannot copy any hashed passwords even using the project sync tool as there is no way for commercetools to decrypt them and copy. Therefore, using the project sync tool will copy all other customer information but not the passwords. It is better to create a production project and use it to manage your real customer profiles. Using this tool will require your customers to reset their passwords at login as commercetools won't have a password, or you may have to set a default password from your side.

---

**Q: Change password help by customer care — How to modify the passwords in commercetools & 3rd party system or ATG in parallel and also in future in commercetools**

One option to handle this easily is via Merchant Center. Your customer care may have limited access to the Merchant Center and modify the customer's password in ATG as well as Merchant Center when the customer calls them to set a password.

Or you may use the same option of resetting the password via the API layer explained in the first option. You may also send the reset password link to the customer if you'd like.
