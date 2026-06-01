# Custom Associate Roles

---

## Overview

commercetools B2B supports fully customisable associate roles. Roles are the primary mechanism for grouping permissions and assigning them to associates within a Business Unit. The platform ships with a set of predefined roles, but projects may create, edit, and delete roles to match their own permission model.

---

## Frequently Asked Questions

### How do you create custom roles in commercetools?

Custom associate roles are created via the Associate Roles API. A detailed walkthrough is available in the Expert Services reference PDF:
[Creating custom roles for B2B customer (PDF)](https://s3-us-west-2.amazonaws.com/secure.notion-static.com/688a4d32-9d0a-4460-852c-f51154499805/Creating_custom_roles_for_B2B_customer.pdf)

### Can roles be grouped above the role level (e.g. "role groups" containing 30+ users)?

No. commercetools does not provide a native concept of "role groups" that sit above individual roles within a Business Unit. Roles themselves group permissions. If a higher-level grouping is needed (e.g. to manage 30+ users uniformly), that logic must be built in a custom service layer that assigns users to BUs with the appropriate roles.

### Can B2B roles be customised from the out-of-the-box set?

Yes. Projects may:
- Create new roles with any combination of permissions.
- Edit existing roles to add or remove permissions.
- Delete roles that are no longer needed.

### Can a user hold multiple roles?

Yes. An associate can be assigned multiple roles within a Business Unit. There is currently no hard platform limit on the number of roles per associate, unless the project reaches edge-case scale (thousands of roles for a single user).

---

## Business Unit Hierarchy and Role Inheritance

### Can Business Units have a parent–child hierarchy?

Yes. A Business Unit can be assigned a single parent Business Unit, creating a tree structure. A BU can only have **one** parent.

### Can properties and roles/permissions be inherited from parent Business Units?

Yes. Roles and permissions configured on a parent Business Unit are inherited by its child Business Units, allowing centralised permission management.

### What are the hierarchy depth limitations?

- Maximum **10 levels** deep.
- Each BU can have only **one** parent.

---

## Stores and Business Units

### How are Stores related to Business Units? Is there data segregation?

When a Store is linked to a Business Unit, carts and orders created within that context are scoped to that Store. The practical implications are:

- Permissions granted to an associate on a BU control visibility of carts and orders for the Stores listed under that BU.
- An associate **cannot** act on behalf of a BU they are not assigned to, even if the same Store is linked to that BU.
- This provides a clear data segregation boundary: Store-scoped data is only accessible through the BU–Associate relationship.
