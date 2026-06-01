# HIPAA, HDA, PHI, ePHI

## Common Fields in Records that contain PHI

**Ask yourself:**
*Could this health information possibly be used to identify a customer/patient of our customer?*

**If yes, or possible, it is highly likely that the data falls under HIPAA or HDS.**

Examples of common fields in PHI that create regulated health information:

- MRNs - Medical Record Numbers
- Full Names
- Mailing Addresses
- Social Security Numbers
- Dates of Birth
- Phone or Fax Numbers
- Email Addresses
- Link/URL
- Insurance Information
- Driver's License Numbers or Vehicle Identifiers
- Biometric Identifies (such as fingerprints, or full face images)
- IP Address
- Health Plan Beneficiary Numbers
- Other unique identifying codes or numbers

## Examples of what is *Not* considered PHI

- Anonymized regional statistics on a disease (such as COVID-19)
- Education Records
- Employee Records

---

## Important Terms

- **Business Associate:** commercetools is a ("BA") of our customers who are processing Protected Health Information (PHI) in Composable Commerce.
- **BAA = Business Associate Agreement**
- **Covered Entities:** our customers. Also noting that some customers could be Business Associates of other covered entities.

---

## Important Information

### Requirements for processing Health Information on commercetools

- Audit Log Premium ("ALP")
- Cloud Provider: Operate on GCP
- MFA enabled on all of their admin accounts via their IAM/SSO
- MSA/GTC/SLA — This includes the required legal documents that are linked to the MSA
- BAA (for HIPAA) - Business Associate Agreement
- DPA (for HDS)

### What will be in scope

- CoCo - Availability and Support - Not currently available. Will be announced when the Product/GTM roadmap for 2024 has been finalized.
- Audit Log Premium

### What is out of scope

- **commercetools FrontEnd**
- **Customers with time sensitive life safety services along with first responder services and organizations.** For example: hospital emergency departments, ambulance dispatchers, natural disaster rescue teams are out of scope.
- **FedRAMP (US)** — Organizations that also require FedRAMP, a risk authorization management program in the US.
- **AWS** — Composable Commerce on AWS

### Key Contacts

- Security Officer: Larry Fritsche
- Privacy Officer: (to be determined)
