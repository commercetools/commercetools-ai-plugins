---
name: hosting-cloudflare
description: How Cloudflare Pages meets the hosting contract for a Merchant Center Custom Application, and what onboard.mjs runs when deployment help is on (wrangler whoami, pages project, pages deploy).
metadata:
  contentType: REFERENCE
---

# Cloudflare Pages

Source: [Deploy to Cloudflare Pages](https://docs.commercetools.com/merchant-center-customizations/deployment/cloudflare.md), which uses the Git integration and dashboard settings; this file uses Wrangler (4.x, flags from its `--help`) with a direct upload of the local build. Follow `other.md` for the procedure, including the confirmation before the deploy. If a command differs from what the CLI prints, trust the CLI.

- **Production URL:** `https://<project>.pages.dev`, or a custom domain attached to the project. The project domain is stable; every deploy also gets a hashed `https://<hash>.<project>.pages.dev` URL, which is never used.
- **Build:** `pnpm build`, output in `public`.
- **Rewrite:** none to write. Without a `404.html` in the output, Pages serves the root for every path that is not a static asset, which is the single-page behaviour the Merchant Center proxy needs. The host check proves it on the deeper path.
- **Deploy:** `wrangler pages deploy public --project-name <project> --branch main --commit-dirty=true`, to the production branch.
- **Env vars:** only when the config uses [`${env:...}` placeholders](https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/custom-application-config.md#use-variable-placeholders). The build runs locally here and the upload is direct, so set them in the shell or a dotenv file before `pnpm build`. The Pages project's environment variables only apply to builds Cloudflare runs from Git.

## What the session runs with deployment help on

The session's review screen is the consent for everything below; on the manual path, show each command and get the user's explicit yes before running it, as in step 4 of [other.md](./other.md).

1. `wrangler whoami --json`. Not signed in: the session asks for an API token with Pages edit rights, carried as `CLOUDFLARE_API_TOKEN` in the environment, or the user runs `wrangler login` in another terminal and presses Enter. With several accounts the user picks one; its id travels as `CLOUDFLARE_ACCOUNT_ID`, because Wrangler refuses to choose without a terminal.
2. `wrangler pages project list --json`. The project named after the app folder is reused, with its `.pages.dev` domain as the production URL. Otherwise `wrangler pages project create <name> --production-branch main`, and the URL is read from the "It will be available at" line. A name Cloudflare refuses is asked for again.
3. Patches the config with the project URL, builds, deploys. One deploy is enough: the domain is known before the build.
4. A redirect to a Cloudflare Access login page, or a 401/403, means Cloudflare Access covers the domain; the host check fails at once and says where to remove the Access application.
