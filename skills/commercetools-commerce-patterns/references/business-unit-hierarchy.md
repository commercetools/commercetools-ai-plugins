# Business Unit Hierarchy

**Source:** Cross-reference from commercetools B2B documentation and `composable-ai-skills/skills/commercetools-api/references/b2b-patterns.md`

---

## Overview

The Business Unit (BU) hierarchy is the structural backbone of commercetools B2B. It models the real-world organisational structure of a buying company — from the top-level corporate entity down through divisions, subsidiaries, and teams — and controls how associates, stores, and permissions are scoped.

---

## Conceptual Hierarchy

```
Organization (top-level Company BU)
└── Division / Region (Division BU)
    └── Team / Department (Division BU)
        └── Individual Buyer Account (Division BU)
```

commercetools represents all levels using the **Business Unit** resource. There are two `unitType` values:

| `unitType` | Description |
|---|---|
| `Company` | The root of a BU tree. Has no parent. |
| `Division` | Any non-root node. Must reference a parent BU. |

A BU tree can be up to **10 levels deep**. Each BU has exactly **one** parent (or none, for `Company` BUs).

---

## Key Concepts

### Stores and Business Units

- Stores are assigned to a Business Unit via the `stores` array on the BU resource.
- A Store on a BU scopes all carts and orders created within that BU to that Store's catalogue, price, and inventory scope.
- A BU can reference multiple Stores; a Store can be linked to multiple BUs.
- Associates can only act on carts/orders belonging to the BUs they are explicitly assigned to, even if the same Store is linked to another BU.

### Associate Roles and Inheritance

- Associates are linked to a BU via the `associates` array, which specifies which `associateRoles` they hold within that BU.
- Role inheritance flows **downward**: roles granted on a parent BU are inherited by all descendant BUs, unless explicitly overridden.
- This allows centralised role management at high levels of the hierarchy while still supporting fine-grained overrides at lower levels.

### Store Inheritance

- When a BU has `storeMode: FromParent`, it inherits the store assignments of its nearest ancestor that explicitly defines stores.
- When `storeMode: Explicit`, the BU uses only the stores listed on its own `stores` array.

---

## Common B2B Hierarchy Patterns

### Flat (single-level)

```
Company BU
├── Buyer Account A
├── Buyer Account B
└── Buyer Account C
```

Suitable for simple B2B portals where all buyer accounts are peers.

### Regional / Divisional

```
Company BU  (global)
├── Division BU  (EMEA)
│   ├── Division BU  (Germany)
│   └── Division BU  (France)
└── Division BU  (APAC)
    └── Division BU  (Australia)
```

Useful when pricing, catalogues, or associates are region-specific.

### Cost-Centre / Department

```
Company BU  (Enterprise Customer)
└── Division BU  (Procurement Department)
    ├── Division BU  (IT Budget)
    └── Division BU  (Facilities Budget)
```

Enables spend controls and approval rules at the department level.

---

## API Resource Summary

- **Create BU:** `POST /business-units`
- **Get BU:** `GET /business-units/{id}` or `GET /business-units/key={key}`
- **Get BU tree:** Use `GET /business-units` with predicate `topLevelUnit(id="{companyId}")` to retrieve all descendants.
- **As-Associate context:** All buyer-facing mutations must go through the `asAssociate` API path to enforce permission checks (see `as-associate-api.md`).

---

## Limitations

| Constraint | Value |
|---|---|
| Maximum hierarchy depth | 10 levels |
| Parents per BU | 1 |
| Stores per BU | Unlimited (practical limits apply) |
| Associates per BU | Unlimited |
