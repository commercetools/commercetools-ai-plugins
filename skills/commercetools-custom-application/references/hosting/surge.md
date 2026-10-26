---
name: hosting-surge
description: How Surge meets the hosting contract for a Merchant Center Custom Application (chosen URL, 200.html rewrite, deploy).
metadata:
  contentType: REFERENCE
---

# Surge

Source: [Deploy to Surge](https://docs.commercetools.com/merchant-center-customizations/deployment/surge.md). Follow `other.md` for the procedure, including the confirmation before the deploy.

- **Production URL:** you choose it: `https://<project>.surge.sh`. It is known before deploying, so requirement 1 of `other.md` needs no create or reserve step.
- **Build:** as in `other.md`, output in `public`.
- **Rewrite:** Surge serves `200.html` for unknown paths. Copy the built file rather than renaming it as the guide does, so `index.html` still serves the root: `cp public/index.html public/200.html`. Re-copy after every build.
- **Deploy:** `surge public https://<project>.surge.sh`
