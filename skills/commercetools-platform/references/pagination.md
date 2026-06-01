# Building queries for paginating resources

## Example

```javascript
query {
  products(limit:500, offset:10000, sort:"createdAt desc") {
    count
    total
    offset
    results {
      id
    }
  }
}
```

The Coco platform will limit the offset for any query to 10000 items. This can be problematic for customers needing to traverse resources with large collection.

## Exception when offset > 10000 is used

```javascript
{
  "data": null,
  "errors": [
    {
      "message": "Malformed parameter: offset: The offset parameter must be in the range of [0..10000]",
      "path": [
        "products"
      ],
      "locations": [
        {
          "line": 12,
          "column": 3
        }
      ],
      "extensions": {
        "code": "InvalidInput"
      }
    }
  ]
}
```

## Note

The graphQL endpoint used to not enforce the offset limit. Recently a release included a change to enforce the limit.

## Handling Large Data Sets

See related documentation:

- https://docs.commercetools.com/api/general-concepts#paging
- https://docs.commercetools.com/api/general-concepts#iterating-over-all-elements

The recommendation is to build code that is capable of iterating collections. This code would use the resource ids and a sort on the id. The code would be called until the resulting collection was empty. This pattern allows the code to traverse the collection without issue.

Ids are stored in binary and provide a unique sort. They are sorted, however not by their string representation but by their binary encoding (which does not follow the "visual" string order).

UUID: `00010203-0405-4007-8009-0a0b0c0d0e0f`

is saved in Binary as: `07 40 05 04 03 02 01 00 0f 0e 0d 0c 0b 0a 09 80`

It is possible for a customer request to return a collection > 10,000 items. To help with reducing the collection size, the customer should use a where predicate that reduces the collection size. For example, using a date time parameter can help to narrow the search window and reduce the result collection size.

**Q:** Examples on how to iterate over a large data set when offset can not be used

**A:** Depending on the data required using REST call will be more efficient than graphQL; as a thumb rule when more than 1/2 of the product data is required a REST call will be more efficient, otherwise graphQL may be a better choice.

The following function facilitates iteration over all records given a query based on REST call and can be used as an example:

- https://github.com/commercetools/commercetools-sdk-java-v2/blob/615f3c4e0f3f2166a4699c61751ab46bee30db78/commercetools/commercetools-sdk-java-api/src/main/java/com/commercetools/api/client/QueryAll.java#L160

And an example using it:

- https://github.com/commercetools/commercetools-sdk-java-v2/blob/a6e9a5f4840cc050d9240de1bff64ffb0d1675f1/commercetools/internal-docs/src/test/java/example/ExamplesTest.java#L287

The following one is an example of fetching results using graphQL and the implementation code:

- https://github.com/commercetools/commercetools-cli-scripts/blob/0436d21ff95c0dd34757dc4b81c50f38b8921523/examples/pagination/run.js#L29C1-L30C1
- https://github.com/commercetools/commercetools-cli-scripts/blob/0436d21ff95c0dd34757dc4b81c50f38b8921523/utils/client.js#L104
