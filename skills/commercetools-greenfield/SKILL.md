---
name: commercetools-greenfield
description: End-to-end new commercetools implementation — project bootstrap, API client scoping strategy, environment topology (dev/staging/prod), phased go-live, launch readiness, disaster recovery, and implementation lifecycle orchestration. Invokes per-surface skills as subroutines. Use for new implementation planning and project setup questions.
when_to_use:
  - "Starting a new ct implementation from scratch"
  - "Project key naming convention, API client scoping, OAuth scope minimization"
  - "Environment topology design: dev, staging, production"
  - "Implementation phases: design → build → data migration → go-live"
  - "Launch readiness review, pre-launch checklist, load testing approach"
  - "Disaster recovery: SLA/SLO, RTO/RPO, CT vs customer responsibilities"
  - "Deciding which surface skills to activate (storefront, MC app, Connect, integrations)"
  - "Order of operations for environment setup and data seeding"
metadata:
  contentType: SKILL
  area:
    - platform
    - b2c
    - b2b
---

# commercetools Greenfield Implementation

End-to-end lifecycle for new commercetools implementations — from project creation through production launch and post-launch operations.

## Key Takeaways

**Scope your API clients to the minimum required from day one.** commercetools uses granular OAuth scopes. Every client should have exactly the scopes it needs, nothing more. Frontend clients should never hold `manage_*` scopes. Establish your client scoping strategy during project design — it is harder to narrow scopes in production than to start narrow.

**Project keys are immutable — plan your naming convention upfront.** Once a project is created with a key, that key cannot be changed without a full data migration. Common pattern: `<client>-<environment>` (e.g., `acme-prod`, `acme-staging`). Never create a production project with a throwaway name.

**Region migration requires a full data export and reimport.** CT does not provide a cross-region project migration tool. Export all data via the Import API or CT export tools, create a new project in the target region, and reimport. Coordinate with the CS team and notify support in advance.

**Environment build order matters.** Before loading any business data: create the project → configure tax categories → create product types → create channels and stores → configure shipping methods → then import catalog data. Inverting this order causes reference errors and requires rework.

**Global vs. store-specific customers is an irreversible architectural decision.** Make this choice during design. There is no built-in migration path from store-specific to global customers or vice versa.

**For launch readiness, request rate limit increases 2 weeks minimum before the event.** Include projected peak RPS in the request to commercetools support. Cache warm your CT data before opening traffic. Test your integration layer's behavior at CT rate limit boundaries.

**Change History API Basic plan only tracks Merchant Center changes.** API and Import API changes are invisible on Basic. If compliance or audit requirements need API-level change tracking, verify the plan before committing to Change History as your audit mechanism.

**HIPAA/PHI: CT is not HIPAA-compliant out of the box for storing ePHI.** For healthcare projects, get explicit confirmation from the commercetools legal team and a BAA before designing any PHI storage in CT.

---

## Reference Index

| Topic | Reference | Source |
|-------|-----------|--------|
| Implementation guide — phases, project/environment setup, API client scoping, data migration steps, common implementation mistakes | [references/implementation-guide.md](references/implementation-guide.md) | ES: Implementation Guide deck |
| Launch readiness — LRR process, pre-launch checklist, load testing, cache warming, rollback plan | [references/launch-readiness.md](references/launch-readiness.md) | ES: Launch Readiness Review deck |
| Disaster recovery — SLA/SLO, RTO/RPO, CT vs customer responsibilities, API resilience patterns, multi-region considerations | [references/disaster-recovery.md](references/disaster-recovery.md) | ES: Disaster Recovery deck |
| Project migration — key change, region migration, data export/import process | [references/project-migration.md](references/project-migration.md) | CSEA: "Customer Support and Migrating Projects" |
| Project archival — OS/demo project archival process, quota impact | [references/project-archival.md](references/project-archival.md) | CSEA: "Archival of OS projects" |
| Accessing CT — OAuth flows, client credentials, password flow, token scopes | [references/accessing-commercetools.md](references/accessing-commercetools.md) | CSEA: "Accessing commercetools" |
| Rate limits — per-resource limits, rate limit headers, quota increase requests | [references/rate-limits.md](references/rate-limits.md) | CSEA + platform docs |
| Change History API — Basic vs Premium comparison, compliance decision guide | [references/change-history.md](references/change-history.md) | ES: Audit/Change history API |
| Customer support — how to engage support, what requires advance notice, SLA tiers | [references/customer-support.md](references/customer-support.md) | CSEA: "Customer Support" |

---

## Surface Skills Invoked

When planning a greenfield implementation, load the following skills based on surfaces being built:

| Surface | Skill |
|---------|-------|
| Any CT project (foundational) | `commercetools-platform` |
| Customer storefront (B2C or B2B) | `commercetools-storefront` |
| ct Checkout product integration | `commercetools-checkout` |
| Commerce domain logic (pricing, discounts, shipping) | `commercetools-commerce-patterns` |
| Custom Merchant Center app | `commercetools-merchant-center-app` |
| Connect connector | `commercetools-connect` |
| CMS/OMS/PIM/ERP integration | `commercetools-integrations` |
| Platform extension (Subscriptions, API Extensions) | `commercetools-extensibility` |

---

## Priority Tiers

### CRITICAL

- **Project keys cannot be changed.** Establish a naming convention before creating any project.
- **Scope API clients to the minimum required from day one.** Never give a frontend client `manage_*` scopes.
- **Global vs. store-specific customers is an irreversible design decision.** Make this choice during project design.
- **Do not store PHI in CT unless you have a BAA.** For healthcare projects, confirm compliance posture with commercetools legal before designing storage.
- **Follow the environment build order.** Create project configuration (tax categories, product types, channels, stores, shipping methods) before importing any catalog or business data.

### HIGH

- **Request rate limit increases 2 weeks minimum before go-live or peak events.** Include projected peak RPS.
- **Validate all API client scopes in staging before production deployment.** Narrow scopes that are missing cause production failures that are hard to diagnose.
- **Change History Basic plan is blind to API-initiated changes.** Verify the plan before committing to it as a compliance mechanism.
- **Region migration requires a full data export and reimport.** Plan region selection at project creation — do not assume it can change later.

### MEDIUM

- **Cache warm CT data before opening production traffic.** Cold caches on a new project cause unnecessary latency spikes at launch.
- **Run a load test in staging with production-scale data before go-live.** CT rate limits are per-project — staging and production have independent limits.
- **`Accept-Encoding: gzip` reduces payload size by 60–80% for list responses.** Always configure this in your integration layer from day one.
- **Password reset tokens expire after 10 minutes by default.** Design email delivery to be fast, or configure a longer expiry upfront.
