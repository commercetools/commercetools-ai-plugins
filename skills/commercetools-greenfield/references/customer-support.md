# Customer Support Engagement

## How to Engage Support

Customers engage commercetools support by creating a **support ticket**. Support tickets are used for:

- Requesting project copies (same cloud instance only)
- Requesting limit increases (see also: rate-limits.md)
- Reporting bugs or issues

Support does **not** handle cross-cloud or cross-region project migrations. See project-migration.md for details.

---

## What Requires Advance Notice / Pre-Qualification

Before a support-assisted project copy proceeds, the customer must complete a pre-qualification checklist. Support will not begin the copy without answers to the following questions:

1. **Why are you looking to replicate the project?**
2. **Are your product images hosted on the commercetools platform?**
3. **If yes, do you need us to copy them to the target project?**
4. **Do you need the source project suspended?**
   - Note: The source project will NOT be suspended by default. Its latest changes might not replicate into the copy.

Additionally, the customer must:

- Create the new target project themselves in advance
- Provide the new project name to support

---

## Service Level and Expectations

- Project copies are **not offered as a regular service** — they are available on a case-by-case basis and should not be used repeatedly for the same customer, as this can be abused.
- There is **no cost** for project copies from a platform fee perspective, but they are not routine.
- **Turnaround time** depends heavily on the size of the project being copied.
- Self-service replication is possible and recommended as the primary approach — using CLI tools and the Import API.

---

## What Support Will and Will Not Do

| Request Type | Supported by Support? |
|---|---|
| Copy project within same cloud instance | Yes (via support ticket + checklist) |
| Suspend source project after copy | Only if explicitly requested by customer |
| Migrate between regions (GCP US → GCP EMEA) | No |
| Migrate between clouds (AWS → GCP) | No |
| Assist with self-service import/export | Guidance only; customer does the work |

---

## Key Quote on Support Policy

> "There is no support to move between instances at the moment. It is all manual and takes the devs too long so Andrea says no now. Hence terraform and project sync are the only way forward."
>
> — Brian Tompkins, 4/17/2023
