# IDP CT User Creation Flows

Customers using external IDPs often need to sync profile information between the external IDP system and commercetools.

## Okta InLine Hooks

https://developer.okta.com/docs/reference/api/inline-hooks/

The Registration Hook allows developers to integrate custom code into the profile creation / registration flow.

## Auth0 Actions

https://auth0.com/docs/customize/actions/actions-overview

"Actions are used to customize and extend Auth0's capabilities with custom logic.

The processes that can be extended in this way are called flows. Each flow is made up of one or more triggers and represents the logical pipeline through which information moves during a single point in the Auth0 journey. Multiple Actions can be added to a trigger, with each Action executing in the order in which it was placed. Some triggers are executed synchronously, blocking the flow in which they are involved, and some are executed asynchronously, as indicated in the table below."

Auth0 actions can be used to persist the customer profile information to commercetools during creation (Pre-registration) and during login.

**Pre-User Registration Flow:** https://auth0.com/docs/customize/actions/flows-and-triggers/pre-user-registration-flow

Here the actions are used to create a new user in commercetools and to persist profile metadata in the commercetools resource.

**Login Flow:** https://auth0.com/docs/customize/actions/flows-and-triggers/login-flow

Here the actions can be used to retrieve customer information from commercetools if required and then to enrich the user profile.

## Azure API Connectors

https://learn.microsoft.com/en-us/azure/active-directory-b2c/api-connectors-overview?pivots=b2c-user-flow

## Example IDP Profile / Customer Creation Flow

In some cases, such as utilizing an [external OAuth server](https://docs.commercetools.com/api/authorization#requesting-an-access-token-using-an-external-oauth-server) for token validation and the `/me` endpoints, it is necessary to establish an Access Token scoped to a particular customer. In these scenarios, the commercetools Customer ID must be persisted to the IDP. When creating the Access Token, this ID should be included in the scope as [outlined here](https://docs.commercetools.com/api/authorization#handling-permissions-for-customer-accounts-or-anonymous-sessions).

External IDP identifiers can be stored in the `externalID` field of the customer resource. However, additional customization may be required which can be achieved by creating a custom customer type.

## Creating a customer custom type

To record metadata from the IDP or application in the customer resource, a custom customer resource type will be required. Creating a custom type allows you to extend the customer resource schema to add attributes needed to record external attributes.

**Types Documentation:** https://docs.commercetools.com/api/projects/types

The LabD terraform provider is widely adopted by commercetools customers for managing customizations to the commercetools schema.

https://github.com/labd/terraform-provider-commercetools

### Terraform Customer Custom Type Example

```javascript
resource "commercetools_customer" "idp-customer-example" {
  key = "idp-customer-example"
  roles = ["Customer"]
  name = {
      en-US = "IDP Customer Example"
  }
  description = {
      en-US = "IDP Customer Example"
  }
  field {
    name = "idp-profile-id"
    label = {
      en-US = "IDP Profile Id"
    }
    type {
      name = "String"
    }
  }
  field {
    name = "idp-profile-creation-datetime"
    label = {
      en-US = "IDP Profile Creation DateTime"
    }
    type {
      name = "DateTime"
    }
  }  
}
```
