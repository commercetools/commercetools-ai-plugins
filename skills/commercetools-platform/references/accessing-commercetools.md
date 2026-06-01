# Accessing commercetools & Authorization

## Accessing commercetools

**Q: How to address security concerns regarding API client secrets/client credentials?**

For enhanced security, you can rotate the client credentials frequently. Store them in a secured vault and apply strong access management policy with least privileged access configured on different API clients in commercetools.

---

## Authorization

**Q: How do we create a token (login) for the user whose AuthenticationMode is ExternalAuth?**

You can use External Auth (such as Okta or any external IDP provider) where the token is provided by the external auth service/IDP provider and commercetools can authenticate a token with this external auth service.

Please refer to the details here:

- https://docs.commercetools.com/api/projects/customers#authenticationmode
- https://docs.commercetools.com/api/authorization#requesting-an-access-token-using-an-external-oauth-server

---

**Q: Is it possible to use both auth options (External Auth & commercetools auth API)?**

It's not recommended for performance reasons, however, it's possible to implement both using a fallback option. See below:

1. The setting is at Project level so once you enable the External Auth, commercetools considers that you'll do external auth.
2. However, you may also use commercetools auth API as a fallback.
3. In this scenario, commercetools will check with external auth or your auth server (middle layer service between your IDP/Firebase or any other auth provider and commercetools) to validate the token. If it fails then there is a fallback option where it checks internally and validates the token — therefore, both External & Internal Auth will work.

---

**Q: What are the limitations of using External Auth?**

1. Cart merge only works for password flow so technically it works only for customers using commercetools auth.
2. Me endpoints are available if you can scope the tokens to a customer_id or external_id and use an external introspection service for the social users.
3. Using External Auth could be performance intensive.

---

**Q: When should externalAuth be used?**

ExternalAuth shouldn't be used unless the customer has to — i.e., a mobile app connecting directly with CoCo.

ExternalAuth only benefits `/me` endpoints. Customers shouldn't be using `/me` endpoints unless they are directly connecting their client application (SPA or Mobile App) to CoCo. If they have a server application (or even an API Gateway or lightweight BFF) they should be doing auth validation there and then using the regular Client Credentials flow into CoCo.

ExternalAuth is only meant to allow user assignment to tokens for use with `/me` endpoints. Using `/me` endpoints should only be done when the client app connects directly to CoCo. In every other scenario the external auth call should be done at the gateway or server app. Once authentication passes, the call can then be made to CoCo with the customer identifier on it (either a CoCo Customer ID or an external id if customer records aren't brought into CoCo).

More information: https://docs.commercetools.com/api/me-endpoints-overview#when-to-use
