---
name: hosting-netlify
description: How Netlify meets the hosting contract for a Merchant Center Custom Application, and what onboard.mjs runs when deployment help is on (status, teams, sites:create, netlify.toml, deploy --prod --no-build).
metadata:
  contentType: REFERENCE
---

# Netlify

Source: [Deploy to Netlify](https://docs.commercetools.com/merchant-center-customizations/deployment/netlify.md), which uses the Git integration and dashboard settings; this file uses the CLI (netlify-cli 27, flags from its `--help`) so the settings live in the repo. Follow `other.md` for the procedure, including the confirmation before the deploy. If a command differs from what the CLI prints, trust the CLI.

- **Production URL:** `https://<site>.netlify.app`, or a custom domain. The site name is known once the site exists, so the site is created or linked first. The CLI renames a site when the name is taken (a numeric suffix), so the URL is read from its output, never assumed.
- **Build:** `pnpm build` (the starter's `build` script is `mc-scripts build`), publish directory `public`.
- **Rewrite:** `netlify.toml` in the project root:

  ```toml
  [build]
    command = "pnpm build"
    publish = "public"

  [[redirects]]
    from = "/*"
    to = "/index.html"
    status = 200
  ```

  The `status = 200` is what makes it a rewrite and not a redirect.
- **Deploy:** `netlify deploy --prod --no-build --dir public --site <name> --json` after building. The `url` key of the JSON is the production URL; `deploy_url` is the per-deploy one and is never used.
- **Env vars:** only when the config uses [`${env:...}` placeholders](https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/custom-application-config.md#use-variable-placeholders). The build runs locally here and the deploy uploads it as is, so set them in the shell or a dotenv file before `pnpm build`. The site's build environment settings only apply to builds Netlify runs itself.

## What the session runs with deployment help on

The session's review screen is the consent for everything below; on the manual path, show each command and get the user's explicit yes before running it, as in step 4 of [other.md](./other.md).

1. `netlify status --json`. Not signed in: the session asks for a personal access token, carried as `NETLIFY_AUTH_TOKEN` in the environment (never on the command line), or the user runs `netlify login` in another terminal and presses Enter.
2. Linked site (`linked: true`): its `site-name` and `site-url` are used. Otherwise `netlify teams:list --json`; with several teams the user picks one (the CLI would take the default by itself, which is exactly what must not happen), then `netlify sites:create --name <app folder> --account-slug <team> --json`.
3. Writes `netlify.toml`, patches the config with the site URL, builds, deploys. If the deploy lands on a different URL than planned, the config is patched to that URL and deployed once more.
4. A 401 or 403 from the host is Netlify site protection (a password or visitor access control); the host check fails at once and says where to turn it off.
