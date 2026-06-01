# Project Migration

## Migrating Projects Using Support

Projects can be copied as long as they are on the same cloud instance. Migrating projects from one cloud instance to another is not supported by the commercetools support team.

> "For project copies there's no cost from what I understand but it's not a thing we do over and over for customers either as it can be abused. There is a general checklist that is sent to the customer prior to copying projects to make sure everything is set from their side. The time it takes depends a lot on the size of the project being copied."
>
> — support

To initiate a project copy, have the customer create a support ticket. They will be required to complete the checklist described below.

---

## Unsupported Migration Events

There is **no support** for migrating customer projects between:

- **Regions** (e.g., GCP US to GCP EMEA)
- **Clouds** (e.g., AWS to GCP)

> "There is no support to move between instances at the moment. It is all manual and takes the devs too long so Andrea says no now. Hence terraform and project sync are the only way forward."
>
> — Brian Tompkins, 4/17/2023

The recommended alternatives for cross-instance or cross-region migration are:

- **Terraform** (for infrastructure/configuration)
- **commercetools-project-sync** (for data synchronization between projects)

---

## Support Checklist for Migrating (Project Copy)

When a customer requests a project copy via support, the support team sends the following checklist:

> "Please note that a project copy can be done by us but we generally do not offer this as a regular service. You can replicate the data yourself by importing and exporting it with the help of the CLI tools and the import API if needed.
>
> If you are interested in us doing a project copy for you, please answer these first questions:
>
> 1. Why are you looking to replicate the project?
>
> 2. Are your product images hosted on the commercetools platform?
>
> 3. If yes, do you need us to copy them to the target project?
>
> 4. Do you need the source project suspended? (We will not suspend the source project by default, and its latest changes might not replicate into the copy.)
>
> Additionally, if you would like to move forward, please create the new project you want to copy into and provide us the new project name.
>
> Thank you and kind regards,
> The commercetools Support Team"

---

## Key Rules Summary

| Scenario | Supported? | Notes |
|---|---|---|
| Copy within same cloud instance | Yes | Via support ticket; not offered as a regular service |
| Migrate between regions (e.g., GCP US → GCP EMEA) | No | Manual, not feasible per support policy |
| Migrate between clouds (e.g., AWS → GCP) | No | Manual, not feasible per support policy |
| Self-service data replication | Yes | Use CLI tools, Import API, or commercetools-project-sync |

---

## Self-Service Alternatives

For customers who cannot wait for a support-assisted copy, or who need cross-region/cross-cloud migration, the following self-service approaches are available:

- **commercetools CLI tools** — for exporting and importing data
- **Import API** — for programmatic data import
- **commercetools-project-sync** — for syncing resources between two CTP projects (GitHub: https://github.com/commercetools/commercetools-project-sync)
- **Terraform** — for recreating project configuration and infrastructure
