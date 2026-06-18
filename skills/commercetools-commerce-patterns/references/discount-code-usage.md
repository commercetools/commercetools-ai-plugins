# Discount Code Usage

---

How to retrieve discount code usage / application counts.

## Option 1: Via GraphQL Query

```graphql
{
  discountCodes {
    results {
      id
      applicationCount
    }
  }
}
```

## Option 2: Via CSV Export from Merchant Center

When you're on the discount code list UI, select all the codes in the list and click on export. Then on the export UI, go to the next screen after you choose the data you need to export. On this UI, choose the option **"Select fields from an imported CSV"**, where you'd provide your CSV based on the format provided in the [commercetools documentation](https://docs.commercetools.com/merchant-center/export-data#use-a-csv-template-file-to-export).
