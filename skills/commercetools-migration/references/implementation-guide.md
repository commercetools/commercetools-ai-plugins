# Implementation Guide

**Source:** Implementation Guide deck (Customer Success Engineering, commercetools)

---

## Overview

A commercetools implementation follows a structured progression from initial trial setup through production launch. The CSE Americas team uses a three-phase model: **Getting Started**, **Exploring Advanced Capabilities**, and **From POC to Production**.

---

## Phase 1 — Getting Started

Goal: get a working demo environment up by the end of this phase.

### Steps

1. **Create a Trial / Project**
   - Sign up at the commercetools Merchant Center (North America or EU endpoint)
   - Create a project: [https://docs.commercetools.com/merchant-center/projects.html#creating-a-project](https://docs.commercetools.com/merchant-center/projects.html#creating-a-project)
   - Choose your region at project creation — **project keys and regions are immutable**

2. **Create an API Client**
   - Create an API client scoped for development: [https://docs.commercetools.com/getting-started.html#create-an-api-client](https://docs.commercetools.com/getting-started.html#create-an-api-client)
   - For initial exploration, use `manage_project` scope (wide scope is acceptable for a dev/trial project — never in production)
   - Store credentials securely (environment variables, secrets manager — never in source control)

3. **Import Sample Data**
   - Use the Sunrise sample data set to seed the project with products, categories, and prices: [https://github.com/commercetools/commercetools-sunrise-data](https://github.com/commercetools/commercetools-sunrise-data)
   - Alternatively, load your own data using the CT CLI: [https://docs.commercetools.com/cli-overview.html](https://docs.commercetools.com/cli-overview.html)

4. **Explore the APIs**
   - Walk through the HTTP API tutorial: [https://docs.commercetools.com/http-api-tutorial.html](https://docs.commercetools.com/http-api-tutorial.html)
   - Use Postman collection or an SDK to make calls: [https://docs.commercetools.com/software-development-kits.html](https://docs.commercetools.com/software-development-kits.html)

5. **Launch a Starter App (optional)**
   - Sunrise SPA: [https://github.com/commercetools/sunrise-spa](https://github.com/commercetools/sunrise-spa)
   - Frontend partner starter templates via the marketplace

---

## Phase 2 — Exploring Advanced Capabilities (POC)

Goal: refine the demo into a Proof-of-Concept covering your key use cases.

### POC Best Practices

- **Scope the POC tightly.** Pick one or two difficult or uncertain use cases — ideally current pain points with the incumbent platform. Avoid boiling the ocean.
- **Define success criteria upfront.** Stakeholder sign-off, end-of-sprint demo, documented use cases that work, inputs to business case and ROI.
- **Team structure:**
  - Define roles for your internal team vs SI team before the POC starts
  - Validate SI skill sets against the CT platform (API-first, MACH) — not all SIs have CT-native experience
  - Confirm CI/CD pipeline ownership and serverless/cloud deployment capability

### Key Things to Test in a POC

| Capability | How to explore |
|------------|---------------|
| Subscriptions (async event triggers) | CT Subscriptions API + SQS/Pub-Sub/EventBridge |
| API Extensions (sync behavior injection) | CT API Extensions docs + test Lambda/Cloud Function |
| Custom Merchant Center apps | [https://docs.commercetools.com/custom-applications/](https://docs.commercetools.com/custom-applications/) |
| Integrations from CT Marketplace | [https://marketplace.commercetools.com/](https://marketplace.commercetools.com/) |
| Reference implementations | [https://github.com/commercetools](https://github.com/commercetools) |

---

## Phase 3 — From POC to Production

Goal: finalize architecture, migration, environment strategy, and security for production readiness.

### Architecture Finalization

- Identify all platforms and integrations required (ERP, PIM, OMS, payment PSP, search, CMS)
- Ensure components meet security and compliance requirements (see `hipaa-compliance.md`, `brute-force-ddos.md`)
- Consider API management tools for: API monitoring, advanced authentication, logging, BFF pattern, and orchestration
- Define the integration design — how CT fits with each adjacent system
- Follow CT performance best practices: [https://docs.commercetools.com/best-practices-performance.html](https://docs.commercetools.com/best-practices-performance.html)
- Check platform limits before finalizing design: [https://docs.commercetools.com/http-api-contract](https://docs.commercetools.com/http-api-contract) (see also `rate-limits.md`)

---

## Environment Strategy (Dev / Staging / Prod)

Each environment is a separate CT **project**. There is no built-in environment concept within a single CT project.

### Recommended structure

| Environment | Project Key Convention | Purpose |
|-------------|------------------------|---------|
| Development | `<client>-dev` | Individual developer work, schema iteration, destructive testing |
| Staging / QA | `<client>-staging` | Integration testing, UAT, pre-production validation |
| Production | `<client>-prod` | Live traffic only |

### Key rules for environment management

- **Project keys are permanent.** Establish the naming convention before creating any project. A project key cannot be changed after creation.
- **Promote configuration changes, not manual edits.** Use Infrastructure-as-Code (Terraform) or scripted API calls to propagate type definitions, shipping methods, tax categories, and other configuration from dev → staging → prod.
- **Keep data separate.** Never copy production customer data to dev/staging without proper anonymization.
- **Sync environments regularly.** Use `commercetools-project-sync` ([https://github.com/commercetools/commercetools-project-sync](https://github.com/commercetools/commercetools-project-sync)) to keep non-production environments in sync with production schema changes.

### Environment automation

Automate environment setup with IaC (Infrastructure as Code):
- **Terraform** — use the CT Terraform provider to manage project configuration declaratively
- **CT CLI** — for scripted export/import of configuration resources
- **Import API** — for bulk data operations in automation pipelines

---

## API Client Setup — Production Best Practices

| Client | Recommended Scopes | Notes |
|--------|--------------------|-------|
| Storefront (frontend/BFF) | `view_products`, `view_categories`, `manage_my_orders`, `manage_my_profile`, `create_anonymous_token` | Never expose `manage_*` on client-side |
| Order management (backend) | `manage_orders`, `view_customers` | Backend only; rotate credentials on a schedule |
| Import / data pipeline | `manage_products`, `manage_customers`, `manage_standalone_prices` | Scoped to import resources only |
| Admin / ops scripts | `manage_project` | Short-lived; revoke after use |

**Rotate API client credentials** by creating a new client → updating all consumers → deleting the old client. CT API clients do not have TTL-based expiry by default.

---

## Migration Considerations

When migrating from an incumbent platform to commercetools:

### Data migration planning

1. **Discovery and Gap Analysis** — identify all data to be migrated (products, customers, orders, prices) and map incumbent data models to CT data models
2. **Build Migration Roadmap** — choose approach (big bang vs phased) and define cutover criteria
3. **Extract Data** — export from incumbent system
4. **Import and Verify Data** — load into CT via Import API or SDKs; validate counts and spot-check records
5. **Build Custom Extensions** — reimplement business logic (promotions, tax, shipping) using CT APIs
6. **Migrate User Interface** — substitute incumbent API endpoints with CT endpoints in the frontend

### Customer identity / password migration

Passwords cannot be migrated in plaintext. Common approaches:
- **Lazy migration:** on first login to the new system, authenticate against the incumbent (if still live), then create/update the CT customer with the hashed credentials
- **Password reset flow:** force all customers to reset their password after migration cutover
- **IDP delegation:** use an external identity provider (Auth0, Cognito, Okta) that holds credentials; CT customer is linked via `externalId` (see `idp-user-creation.md`)

### Data migration tooling

| Tool | Best for |
|------|----------|
| Import API | Bulk product, price, category, customer, order import (async, high throughput) |
| CT CLI | Interactive export/import for configuration and moderate data volumes |
| SDKs (Java, TypeScript, Python, Go) | Complex data transformations and conditional import logic |
| commercetools-project-sync | Ongoing synchronization between two CT projects |

---

## Common Implementation Mistakes

| Mistake | Consequence | Correct Approach |
|---------|-------------|------------------|
| Creating production project with a throwaway key | Key is permanent; must create new project and migrate all data to rename | Plan naming convention (`<client>-prod`) before project creation |
| Using `manage_project` scope in production frontend | Full write access exposed to browser or mobile client | Scope API clients to minimum required; use BFF for writes |
| Manually applying config changes per-environment | Config drift between dev/staging/prod; hard-to-reproduce bugs | Use Terraform or scripted API calls to promote changes |
| Big-bang data migration without phased validation | Hard to debug import failures at scale | Phase the migration; validate each resource type before proceeding |
| Not setting `externalId` on imported records | Cannot reliably correlate CT records with source system | Always set `externalId` to the source system's primary key during import |
| Storing secrets in source code | Credential exposure | Use environment variables or a secrets manager (AWS Secrets Manager, Vault, GCP Secret Manager) |
| Not testing extensions under load | Extension timeout at production traffic; entire API call fails | Load test extensions; ensure p99 response time is under 1.5 seconds for synchronous extensions |
