# CT Native Search vs. External Search — Decision Framework

**Source:** Product Search QBR Q1 2026 (Alexandra Stolzenberger, commercetools search team); "More powerful product search overview (2026)"

---

## The Core Question

Should the project use CT's native Product Search API (or Product Projection Search) for storefront discovery, or integrate an external search provider (Algolia, Elasticsearch, Constructor, Bloomreach)?

This is one of the first architecture decisions on every implementation. Getting it wrong adds significant TCO and integration overhead.

---

## CT Native Search — When It Wins

CT's goal is to be "good enough to not need a third party" — a dramatically lower bar than "best in class," but the bar that actually matters for winning customers.

**Use CT native search when:**

- The project needs to minimize integration overhead and TCO
- The customer operates across multiple locales and regions
- B2B use cases require filtering/sorting by standalone prices, stores, or product selections
- The catalog is generic (not hyper-niche where domain-specific synonyms and tuning would be essential)
- There is no immediate business requirement for search personalization, A/B testing, or product recommendations
- Time-to-market speed is a priority (no third-party sync pipeline to build and maintain)
- Agentic commerce / AI agents need to query the product index natively (external search requires a separate integration for each agent)

**Real customer examples (CT native search):**
- **NHS Supply Chain** — initially expected to need an additional search solution; discovered CT native search delivered accuracy across a vast range of categories (biscuits to MRI scanners) with trust-specific filtering via product selections
- **Lululemon B2B** — powers their B2B wholesale storefront with full-text search, sorting, and faceted navigation using the Product Search API

---

## External Search — When It's Worth the Cost

External search providers are justified when the business has specific requirements that CT native search does not yet cover:

- **Merchandising and business-user tuning** — a merchandising team needs a visual UI to pin products, boost/bury items, create query rules, and manage synonym dictionaries without API access
- **Advanced personalization and recommendations** — real-time personalization based on behavioral signals, A/B testing of ranking models
- **Predictive autocomplete with typo tolerance** — CT native search does not include out-of-the-box autocomplete or typo correction (as of mid-2026)
- **Built-in search analytics dashboard** — CT does not provide a native search analytics UI (query trends, zero-result rates, click-through)
- **Hyper-specialized domains** — very niche catalogs where domain-specific relevance tuning is critical from day one

**The cost reality:** External search typically adds 20–50% (sometimes up to 100%) of the CT platform cost. A customer paying €395K ACV for CT would pay an additional €80K–€200K for a third-party search tool. This is a frequent reason deals are lost:

> "When we added all those costs together on top of the additional integration costs to put those all together, commercetools came out the most expensive solution and that kind of put it out of reach for us."

---

## CT Native Search Competitive Gaps (as of mid-2026)

| Capability | CT Native | External (e.g. Algolia) |
|---|---|---|
| Faceting, filtering, sorting | Advanced — deep attribute/price/store support | Advanced |
| Full-text search with field boosting | Supported (new Product Search API) | Advanced |
| Standalone price filtering/sorting | Supported | Requires custom index sync |
| Store/product selection scoping | Native | Requires custom index sync |
| Typo tolerance / autocomplete | Not built-in | Best-in-class |
| Merchandising UI for business users | Not available | Strong |
| Built-in search analytics | Not available | Strong |
| AI-powered semantic search | Early access (mid-2026) | Available (varies by provider) |
| TCO | Included in B2C/B2B Commerce bundle | Additional 20–100% of CT cost |

---

## Migration Consideration

If a project starts with an external search provider (e.g., Algolia), it must maintain a product index sync pipeline: products updated in CT must be pushed to the external index. This pipeline adds operational complexity:

- Indexing lag — changes take time to propagate (typically event-driven via CT Subscriptions)
- Dual data model — the external index schema must mirror CT's product model
- Price/inventory freshness — standalone prices and inventory changes require dedicated sync logic
- Multi-store support — scoping results by store requires custom index-level filtering

CT native search eliminates all of this: the index is maintained automatically, always reflects the current product representation, and natively understands the CT data model (stores, product selections, standalone prices, attribute types).

---

## Key Gotchas

- **Product Projection Search does not support standalone prices.** If the project uses `priceMode: Standalone`, use the new **Product Search API** (`/product-search`), not `/product-projections/search`. Using Product Projection Search with standalone prices yields inconsistent results silently.
- **Product Projection Search must be explicitly activated.** It is disabled by default and will return `SearchDeactivated` until enabled via Merchant Center or the `changeProductSearchIndexingEnabled` project update action.
- **Indexing is not real-time.** There is an eventual consistency delay between a product update and that update appearing in search results. Products with many variants, locales, prices, or searchable attributes take longer to index.
- **Automatic deactivation.** Product Projection Search (and the Search Term Suggestions API) are automatically deactivated if no calls are made for 30 consecutive days.
- **Only configured locales are searched.** Queries against locales not configured in the project return no results — no error is returned.
