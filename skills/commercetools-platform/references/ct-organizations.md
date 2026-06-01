# CT Organizations

## Hierarchy Recap

**Organization → Project → Store**

- **Organization**: the top-level billing/access container. Multiple projects live inside one org. Use separate orgs to enforce strict access control between teams (e.g., separate prod org from non-prod org so dev teams cannot touch production).
- **Project**: a fully isolated data environment. Projects do not share customers, products, orders, types, or API clients. Splitting into projects means fully duplicating all configuration and accepting that no data is shared.
- **Store**: a scoping layer within a project. Stores share the project's data but filter it via Product Selections and channel scoping. Use stores for multi-brand, multi-region, or multi-channel storefronts that share the same underlying catalog and customer base.

## Q&A

### Q: Can we have different organizations to maintain access control between non-prod and prod environments?

Yes. Use a separate organization for production. This ensures that team members with access to non-prod environments cannot access the production project. It's the recommended approach when strict prod/non-prod separation is required.

---

## Single Project vs Multiple Projects — Decision Guide

The ideal scenario is a single CT project per solution domain with no cross-project data sharing. Every cross-project requirement (shared customers, shared products, merged orders) becomes an integration burden. Before splitting into multiple projects, answer these questions:

### Products

- Will products be sold in more than one region, and are the SKUs identical across regions?
- If product data is synced from a master PIM, will it be modified in the regional instance — or is the PIM the single source of truth for all regions?
- Do product attributes (name, description, content, legal copy) vary by country? If yes, localized strings within one project handle this without splitting.
- Are promotions and pricing modifications shared across regions, or region-specific?

### Cart & Checkout

- Can customers share a cart between the proposed projects? (CT has no native cross-project cart sharing.)
- Will customers have a shared account across projects? (CT customer records are project-scoped — a shared identity requires an external IDP and `externalId` linking.)
- Can a customer shop and ship from more than one project in a single order? (Not natively possible — requires custom orchestration.)
- Will tax display differ by region (tax-inclusive in EU vs tax-exclusive in NA/Asia)? This can be handled with tax categories and store-level configurations within one project.
- Is there a single payment provider or multiple? Multiple providers can be configured in one project.
- What transaction currency is shown to the customer? Multi-currency is supported within one project.
- Can a customer see their full order history across all regions/brands? If yes, a single project (or external order history service) is needed — orders are not shareable across projects.

### Fulfillment

- Is the WMS or OMS system shared across regions, or per-region? If shared, a single project feeding one OMS is simpler than merging orders from multiple projects.
- Will orders from all regions need to be merged for fulfillment, reporting, or customer service?

### Process & Team

- Are there separate teams managing products in Merchant Center per region? Separate projects give cleaner MC access boundaries, but stores + MC user permissions can achieve the same within one project.
- Are there separate teams managing promotions per region?

### Security & Compliance

- Is there a legal or regulatory requirement for data to reside in a specific geographic region? CT projects are tied to a specific region/cloud (e.g., `us-central1.gcp`, `europe-west1.gcp`). If data residency is required per region, separate projects in the appropriate CT region are necessary.

## Rule of Thumb

**Use multiple stores (not projects) for multi-region or multi-brand scenarios where the underlying catalog and customer base overlap.** Use multiple projects only when true data isolation is required — separate legal entities, separate compliance domains, or hard data residency requirements. Every data-sharing requirement between projects must be solved with custom sync code, which compounds in cost as the number of shared entities grows.
