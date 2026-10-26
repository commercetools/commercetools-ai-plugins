---
name: hosting-other
description: The three requirements any static host must meet to serve a Merchant Center Custom Application, and the provider-agnostic deploy procedure.
metadata:
  contentType: REFERENCE
---

# Hosting contract (any provider)

A host qualifies if it meets these three requirements. The other files in this folder are how one provider meets them.

1. **A stable `https` URL, known before the build.** [`env.production.url`](https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/custom-application-config.md#envproductionurl) feeds the compiled Content-Security-Policy, so the URL must be in the config before `mc-scripts build` runs. Use the production domain or a custom domain, never a per-deployment URL that changes on every build. If the host only reveals the URL after the first deploy, create or reserve the site first (most CLIs have a create or link command) and read the URL from it.
2. **A rewrite of every path to `index.html` with status 200.** A custom app is a single-page app and the [Merchant Center proxy](https://docs.commercetools.com/merchant-center-customizations/concepts/merchant-center-proxy-router.md) forwards `/:projectKey/:entryPointUriPath/*` to the host. A redirect is not a rewrite: the proxy does not follow it.
3. **The `public/` directory as the published output**, produced by `mc-scripts build` (`pnpm build` in the starter). `mc-scripts build` also compiles `index.html`.

## Procedure

1. Get the production URL (requirement 1).
2. `node <skill-dir>/scripts/patch-config.mjs --app-dir <dir> --url <url>`
3. Add the provider's rewrite rule (requirement 2) to the repo, so it is code and not a dashboard setting.
4. Build. Then show the user the deploy command and get their explicit confirmation before running it: it publishes the app. Deploy with the provider's tooling or Git integration.
5. `node <skill-dir>/scripts/verify.mjs` with the flags in [Step 7 of the manual steps](../manual-steps.md#step-7-verify-in-the-deployed-project), and read `hostCheck.problems`. It tests the app path and a deeper path, so it catches a missing rewrite on any host.
6. Pass the URL to `register.mjs --production-url`.

## Providers with a file here

`vercel.md`, `netlify.md`, `cloudflare.md` and `connect.md` are the hosts with deployment help: the session runs their file for the user. `surge.md` is a manual host. For anything else, the [commercetools Deployment overview](https://docs.commercetools.com/merchant-center-customizations/deployment/overview.md) has a guide per host.
