# Business Units, Stores, and Company-Specific Pricing

**Source:** 2024 Revised Channels and Stores (Expert Services / CSE Americas)

---

## Business Units Overview

A Business Unit represents a Company or a Division within a company. Business Units let you model the hierarchical structure of a B2B customer's organization and tie that structure to access rights, pricing, and catalog.

A Business Unit:
- Stores general company information (name, addresses)
- Determines the product catalog and prices available to the company (via stores, product selections, and channels)
- Is either a `Company` (top-level) or a `Division` of a company
- Can be organized hierarchically (parent–child tree structure)
- Has **Associates** assigned — commercetools Customer entities that hold roles (`Admin`, `Buyer`)

### Associate Roles

| Role | What They Can Do |
|------|-----------------|
| `Admin` | Administrate the Business Unit and purchase on its behalf |
| `Buyer` | Purchase on behalf of the Business Unit |

Custom associate roles can be defined for more granular permission control.

---

## Business Unit API Structure

```json
{
  "id": "d1ddf98d-72ae-4a02-b2ea-192eb6b756b5",
  "key": "my-company",
  "name": "myCompany",
  "status": "Active",
  "storeMode": "Explicit",
  "stores": [
    {
      "typeId": "store",
      "key": "store1"
    }
  ],
  "unitType": "Company",
  "associates": [
    {
      "customer": {
        "typeId": "customer",
        "id": "c6716d41-a436-4895-be73-a73130e22d65"
      },
      "roles": ["Admin"]
    }
  ],
  "topLevelUnit": {
    "typeId": "business-unit",
    "key": "my-company"
  }
}
```

Key fields:
- **`storeMode`**: `Explicit` — stores are explicitly set on this unit; `FromParent` — stores are inherited from the parent Business Unit
- **`unitType`**: `Company` (top-level) or `Division`
- **`topLevelUnit`**: reference to the root of the hierarchy

---

## Company-Specific Pricing Model

The platform supports fully isolated pricing per buyer company using the stores + channels architecture:

```
Buyer Company X → Store A → Channel A → Price A
Buyer Company X / Division 1 → Store B → Channel B → Price B
Buyer Company Y → Store C → Channel C → Price C
```

Each store carries its own distribution channels, meaning product projections through that store only return the prices tied to those channels. Different companies see entirely different price lists even for the same SKU.

This is the preferred architecture for **individually negotiated B2B pricing** — avoid custom types or custom objects to hold negotiated prices; use proper channel-based embedded prices instead.

---

## Cart Creation with Business Unit and Store

When creating a cart for a B2B buyer, reference both the Business Unit and the Store. The platform enforces that the store must belong to the referenced Business Unit:

```json
{
  "currency": "USD",
  "shipping": [],
  "customShipping": [],
  "businessUnit": {
    "key": "my-company"
  },
  "store": {
    "key": "store1"
  }
}
```

The cart will then use only the channels and product selections defined on `store1`, which must be one of the stores of `my-company`.

---

## Full B2B Example: Company with Two Business Units

A walkthrough of the reference implementation from the slide deck:

1. **Create the Company** (top-level Business Unit)
2. **Create two Division Business Units** as children of the Company
3. **Create two stores**, one per Division — each with its own distribution channel and supply channel
4. **Create two product selections**, one per store
5. **Add a product** with two different prices — one per distribution channel
6. **Create carts**: one per Business Unit, both referencing the same SKU
   - Each cart uses its Division's store, which uses its channel, which matches the channel-specific price
   - Result: each cart gets the correct negotiated price for that business unit

This demonstrates that channel-based pricing isolation is fully automatic once the store/channel/price associations are correctly configured.

---

## Approval Rules and Flows (B2B)

Business Units support approval workflows for orders and quotes. Associates with the appropriate roles can define approval rules (e.g., "orders above $10,000 require manager approval"). This is built on top of the Quote and Staged Quote resources. Stores and channels provide the catalog/pricing context; approval flows govern the order authorization process.

---

## Key Gotchas

- **`storeMode: FromParent` on a Division means it inherits the parent's stores.** If you want a Division to have its own distinct store (and thus its own pricing), set `storeMode: Explicit` and assign stores directly to the Division.
- **Carts referencing a Business Unit are constrained to that unit's stores.** Trying to use a store not associated with the Business Unit on the cart will result in an error.
- **Associates are modeled as commercetools Customer entities.** They are not a separate user type — they are Customers with a role binding in a Business Unit. This means B2B buyers go through the same authentication flows as B2C customers (password flow, token exchange).
- **Business Unit hierarchy is flexible but queries require awareness of the tree.** If you query orders for a top-level Company, you do not automatically get orders from Divisions — you need to query each level or use the `topLevelUnit` filter.
