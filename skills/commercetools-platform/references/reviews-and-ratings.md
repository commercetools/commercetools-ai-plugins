# Reviews & Ratings — Resource Model, Statistics, and Integration Patterns

**Source:** 2023 Reviews & Ratings deck (Expert Services / Customer Success Engineering)

---

## What Are Reviews

Reviews allow customers to evaluate **Products** and **Channels** in commercetools. They are a first-class resource — not stored as custom objects or custom fields — with built-in rating statistics aggregation on the target resource.

Reviews support:
- Star ratings (or any numeric scale)
- Free-text title and body
- Optional approval/moderation workflow via CT State Machines
- Targeting both products and channels
- Customization via Custom Types and Custom Fields

---

## Review Resource Model (`ReviewDraft`)

```
ReviewDraft
  ├─ key (String, optional) — user-specific unique identifier
  ├─ uniquenessValue (String, optional) — enforces one-review-per-X constraint
  ├─ locale (String, optional) — IETF language tag
  ├─ authorName (String, optional)
  ├─ title (String, optional)
  ├─ text (String, optional)
  ├─ rating (Number, optional) — integer between -100 and 100 inclusive
  ├─ target (ResourceIdentifier, optional) — Product or Channel
  ├─ customer (ResourceIdentifier of Customer, optional)
  ├─ state (ResourceIdentifier of State, optional) — for moderation workflows
  └─ custom (CustomFields, optional)
```

**At least one of `title`, `text`, or `rating` must be set** when creating a review.

---

## Rating Field

The `rating` field is a number between **-100 and 100** (inclusive). This flexibility supports multiple rating conventions:

| Convention | Example Values |
|------------|----------------|
| Star rating (1–5) | 1, 2, 3, 4, 5 |
| Like/Dislike | +1 / -1 |
| Percentage | 0 to 100 |

The rating is included in the target resource's `reviewRatingStatistics` **unless** the review is in a State that does not carry the `ReviewIncludedInStatistics` role. This enables draft/pending reviews to exist without skewing the published statistics.

---

## Review Targets

A review `target` can be either a **Product** or a **Channel**:

**Product reviews** — the review applies to the product and all its variants. Ratings aggregate into `reviewRatingStatistics` on the Product Projection.

**Channel reviews** — useful when a merchant operates multiple selling locations (physical stores modeled as Channels). Allows customers to rate specific store locations. Query channel reviews using:

```
GET /{{project-key}}/reviews?where=target(typeId in ("channel") and id in ("<channelId>"))
```

---

## Uniqueness Value — Preventing Duplicate Reviews

The `uniquenessValue` field enforces a uniqueness constraint across the entire project. If a review with the same `uniquenessValue` already exists, the second creation attempt returns a 400 error.

**Common pattern** — combine customer ID and product ID to allow exactly one review per customer per product:

```json
{
  "authorName": "Jane",
  "uniquenessValue": "<customerId>-<productId>",
  "title": "Great product",
  "text": "Would buy again",
  "rating": 5,
  "target": {
    "typeId": "product",
    "id": "<productId>"
  }
}
```

Attempting a second review with the same `uniquenessValue` returns:
```
"statusCode": 400,
"message": "A duplicate value exists for field 'uniquenessValue'."
```

---

## Moderation / Approval Workflow

Reviews support an optional approval process via CT **State Machines**. A review can be placed in a pending/draft state on creation and only transition to a published state after moderation approval. Reviews in a state without the `ReviewIncludedInStatistics` role are excluded from the target's rating statistics.

**Steps:**
1. Define a State Machine with states: `Pending`, `Approved`, `Rejected`
2. Only `Approved` state carries the `ReviewIncludedInStatistics` role
3. New reviews are created with `state: Pending` — they are visible for moderation but do not affect product ratings
4. A moderation service (or Merchant Center custom app) transitions the state to `Approved` or `Rejected`
5. On transition to `Approved`, the rating is included in the product's `reviewRatingStatistics`

**Recommendation:** Use a profanity filter in the moderation step before approving text reviews.

---

## Rating Statistics on Products

When a review with a rating is in a state carrying `ReviewIncludedInStatistics`, the platform automatically maintains `reviewRatingStatistics` on the target Product Projection:

```json
"reviewRatingStatistics": {
  "averageRating": 4.5,
  "highestRating": 5,
  "lowestRating": 2,
  "count": 33,
  "ratingsDistribution": {
    "5": 18,
    "4": 13,
    "3": 1,
    "2": 1
  }
}
```

- `averageRating` is pre-calculated and rounded to 5 decimal places — round further as needed for display
- `ratingsDistribution` is a map of rating value → review count. If a rating value has no reviews, it is absent from the map (not present as `0`)
- Statistics update automatically — no manual aggregation required

---

## Querying Reviews

**Via the Reviews API (REST predicate):**

```
# By author
GET /{{project-key}}/reviews?where=authorName in ("John Doe")

# By rating
GET /{{project-key}}/reviews?where=rating in ("4")

# For a specific product, sorted by rating descending
GET /{{project-key}}/reviews?sort=rating desc&where=target(typeId in ("product") and id in ("<productId>"))

# All channel reviews
GET /{{project-key}}/reviews?where=target(typeId in ("channel"))
```

**Via Product Projections Search (for rating-based product filtering):**

```
# Products with average rating >= 3 (REST)
GET /{{project-key}}/product-projections?staged=false&where=reviewRatingStatistics(averageRating>=3)

# Products with average rating < 4 for a specific product type
GET /{{project-key}}/product-projections?staged=false&where=(reviewRatingStatistics(averageRating<4) and productType(id in ("<productTypeId>")))

# Product Projections Search with filter, facet, and sort
GET /{{project-key}}/product-projections/search
  filter = reviewRatingStatistics.averageRating:range (3 to *)
  facet  = reviewRatingStatistics.averageRating:range (0 to 1),(1 to 2),(2 to 3),(3 to 4),(4 to 5)
  sort   = reviewRatingStatistics.averageRating desc
```

**GraphQL example — search with rating facets and statistics:**

```graphql
{
  productProjectionSearch(
    filters: [{string: "id:\"<product-id>\""}],
    facets: [{model: {range: {
      path: "reviewRatingStatistics.averageRating",
      ranges: [
        {from: "0", to: "1"}, {from: "1", to: "2"},
        {from: "2", to: "3"}, {from: "3", to: "4"}, {from: "4", to: "5"}
      ],
      countProducts: true
    }}}],
    sorts: ["reviewRatingStatistics.averageRating desc"],
    staged: false,
    limit: 10
  ) {
    count
    results {
      id
      reviewRatingStatistics {
        count
        lowestRating
        averageRating
        highestRating
        ratingsDistribution
      }
    }
  }
}
```

---

## Post-Purchase Integration Pattern

The standard flow for collecting a product review after an order:

1. Order is placed and fulfilled
2. A post-purchase email trigger fires (via Subscription on `OrderStateChanged` or fulfillment event)
3. Email contains a review link with a pre-populated `productId` and `customerId` (or a signed token)
4. Customer submits the review form — storefront calls the Reviews API (or `/me/reviews` for customer-scoped creation)
5. Review is created in `Pending` state if moderation is enabled
6. Moderation service approves the review — `reviewRatingStatistics` on the product updates automatically

---

## Key Gotchas

- **`rating` range is -100 to 100, not 1 to 5.** A raw `rating` value of `5` in a 1–5 star system is valid, but document the convention clearly — if a future developer treats it as a percentage scale (0–100), data will be corrupted.
- **Missing `ratingsDistribution` keys mean zero reviews, not an error.** Do not assume all keys (0–5) are present in `ratingsDistribution`. Always use a safe default when rendering the distribution bar.
- **`averageRating` rounds to 5 decimals** — apply your own rounding for display (e.g., round to 1 decimal for a star display, or `Math.round(avg * 2) / 2` for half-star increments).
- **Reviews on products apply to all variants.** There is no variant-level review. If variant-specific reviews are needed, model each variant as a separate product, or store the variant reference in a custom field on the review.
- **`uniquenessValue` is project-global.** Ensure your uniqueness key includes enough context (customer ID + product ID) — a bare customer ID would prevent the customer from reviewing any second product.
- **Custom fields on Reviews are not indexed for search.** You cannot filter reviews by custom field values via the Reviews API predicate. Store searchable metadata in the core review fields (`title`, `text`, `authorName`) or use an external search index.
- **Deleting a review updates `reviewRatingStatistics` automatically.** You do not need to manually recalculate statistics after review deletion or state transition.

---

## API References

- Reviews API: https://docs.commercetools.com/api/projects/reviews
- Reviews Tutorial (Products and Channels): https://docs.commercetools.com/tutorials/review-ratings
- State Machines (for moderation): https://docs.commercetools.com/api/projects/states
