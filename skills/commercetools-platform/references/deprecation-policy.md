# Deprecation Policy Q&A and Discussion

This document provides an overview of our deprecation policy and answers to common questions raised by customers regarding deprecated features. The information below is compiled from an internal discussion and is intended for general reference.

---

## Overview

When deprecating functionality, we encourage customers to migrate to improved solutions. Existing implementations remain functional after deprecation, but we advise transitioning to avoid potential issues in the future. Note that our approach may differ based on whether features are in public beta or have reached General Availability (GA).

---

## Customer Questions & Detailed Responses

### 1. Migration Timelines for Deprecated Features

**Question:**
How much time do customers have to switch to the new functionality for both public beta and GA features?

**Answer:**

- For GA features, we generally do not set a migration timeline — deprecated functionality remains available indefinitely unless there is a significant change that would impact production projects.
- For beta features, the deprecation process is accompanied by a clearly communicated timeline.
- _Note:_ SDKs may require a separate version switch as they are not automatically updated.

---

### 2. Handling Inability to Comply with Migration Timelines

**Question:**
What happens if a customer is unable to comply with the migration timeline?

**Answer:**
In cases where migration timelines pose challenges, we engage in individual communication with the affected customer. We work closely with them to minimize disruptions and ensure that any changes do not break production projects.

---

### 3. Detecting Usage of Deprecated Features

**Question:**
How do you detect whether a customer is still using a feature that is planned for deprecation?

**Answer:**
We implement additional logging for deprecated features. Usage is monitored by analyzing API calls, and we typically review logs from the past 30 days to determine active usage.

- **Logs Retention:** We only have 30 days of log retention available, which serves as the window for detecting usage.

---

### 4. Process When Undocumented Features Are Involved

**Question:**
If a deprecated feature remains in the source code but is removed from the documentation, how long does it typically stay in the codebase?

**Answer:**

- For GA features, undocumented changes are not common; the feature should remain fully supported.
- For beta features, deprecation is usually accompanied by an announcement with a defined timeline.
- In cases where undocumented fields (often considered internal) are discontinued, we first identify the projects that rely on them and proactively reach out to the affected customers.

---

### Additional Clarifications

#### Log Analysis Scope

**Question:**
Do we look at the logs only for production projects, or any type of project?

**Answer:**

- The focus is primarily on production projects; however, the scope of log analysis can vary depending on the feature.
- We aim to be thorough while prioritizing production environments to ensure stability.

#### Documenting Deprecation Practices

**Question:**
Is there a document that we can share with a customer about our deprecation practices?

**Answer:**

- While public documentation covers the basics, our internal wiki provides a more detailed view of our deprecation practices.

---

## Internal Deprecation Process (from [Deprecating functionality])

When product management decides to deprecate a feature, the goal is to **hide it from documentation** so it will not be used for newer projects, while continuing to make it available via the API for a defined period to allow migration. For bug fixes, existing functionality can be replaced without a deprecation phase. Even for public beta features, a **three months notice** is required before introducing a breaking change.

### Three Phases of Deprecation

#### Phase 1: Mark Feature as Deprecated

- **RAML specification:** Mark with the `markDeprecated` annotation. This hides the feature from docs but keeps it in generated SDKs. Add a comment referencing the replacement feature with URN-style links.
  - For deprecated fields: remove from JSON examples, declare as optional if not already.
  - Do NOT remove from the RAML spec (kept for historic reasons).
- **REST API reference docs:** Move documentation for deprecated types/methods out of the main API reference page.
- **Offerings site:** Add to the [Deprecations and Removals](https://docs.commercetools.com/offering/deprecations-and-removals) page.
- **GraphQL schema:** Use the standard `@deprecated` directive:

```graphql
type ProductVariant {
  ...
  imageUrl: String! @deprecated(reason: "Please use 'imageUrls' instead")
}
```

In Sangria (the GraphQL library used in the sphere backend):

```scala
Field(
  "imageUrl",
  StringType,
  resolve = _.value.imageUrl,
  deprecationReason = Some("Please use 'imageUrls' instead")
),
```

- **Public announcement:** Published as a release note describing: what is deprecated, what to use instead, and (if known) when the deprecation phase ends.

Example release note format:

```yaml
---
date: '2020-09-16'
title: Query Custom Objects in a container
description: >-
  Custom Objects in a container can now be queried without the 'where' parameter
  for it. The "container" where parameter as well as access to the objects by
  'id' have been deprecated.
slug: 2020-09-16-query-custom-objects-in-container
type:
  - enhancement
  - deprecation
topics:
  - Extensibility
---
```

#### Phase 2: Monitor Usage of Feature

For GraphQL features, deprecated field usage is tracked via:

- Grafana dashboard: https://grafana.sre.europe-west1.gcp.commercetools.com/d/000000261/ctp-graphql
- Log entries containing: `Detected deprecated field usage in GraphQL` (includes project key, field name, GraphQL type)
- Humio dashboards "GraphQL deprecations" in EU and US

#### Phase 3: Remove Deprecated Feature

After the deprecation phase ends (as announced):

- **RAML:** Replace `markDeprecated` annotation with `deprecated` annotation to prevent SDK generation.
- **Offerings site:** Remove rendered RAML types/endpoints; add them to tables with dates and links.
- **GraphQL:** Delete from schema code and public SDL file.
- **Public announcement:** Release note announcing end of life, referencing the original deprecation announcement.

---

## Summary

| Feature Type | Migration Deadline | Undocumented Field Handling |
|---|---|---|
| GA Features | None set — remains functional indefinitely (unless production-breaking change) | Not removed without proactive customer notification |
| Beta Features | Clearly communicated timeline with announcement | Announced with defined timeline |

- **Detection method:** API call log analysis (30-day retention window), primarily focusing on production projects.
- **Customer communication:** Individual outreach for customers still using soon-to-be-removed features.
- **Public documentation:** [API Contract — Deprecation](https://docs.commercetools.com/offering/api-contract#deprecation) and [Deprecations and Removals](https://docs.commercetools.com/offering/deprecations-and-removals).

---

_This document is intended for internal use and general reference on deprecation practices and customer communications._
