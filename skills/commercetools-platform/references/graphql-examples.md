# GraphQL Examples

## Variants with no Inventory

```graphql
query {
  productProjectionSearch(
    filters: [
      { string: "variants.availability:missing" }
    ],
    staged: true limit: 200) {
    total
    results {
      id
      key
      masterVariant {
        sku
        key
      }
    }
  }
}
```
