---
name: hosting-vercel
description: How Vercel meets the hosting contract for a Merchant Center Custom Application, and what onboard.mjs runs when deployment help is on (link, teams, build, prebuilt deploy, the Aliased domain).
metadata:
  contentType: REFERENCE
---

# Deploy to Vercel

Run these in the app directory, after `register.mjs` has written `env.production.applicationId`. The procedure and requirements are in `other.md`; this file is how Vercel meets them. Source: [Deploy to Vercel](https://docs.commercetools.com/merchant-center-customizations/deployment/vercel.md), which uses the Git integration and dashboard settings; this file uses the CLI (63.1.2, flags from its `--help`) so the settings live in the repo. If a command differs from what the CLI prints, trust the CLI.

## 1. Build settings as code

Create `vercel.json` so the settings are in the repo and not a dashboard checkbox:

```json
{
  "framework": null,
  "buildCommand": "pnpm build",
  "outputDirectory": "public",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

`"framework": null` with an explicit rewrite replaces the docs' Create React App preset: the preset guesses the rewrite, the file states it. The rewrite is required (requirement 2 in `other.md`).

## 2. Link first, to learn the production URL

`vercel link --yes` creates the Vercel project. Show it and get the user's explicit yes first (the session's review screen is that yes on the session path).

```
vercel link --yes
```

This creates the Vercel project without deploying.

- **Several teams.** Without a terminal the CLI refuses to pick ("Multiple teams found"). List them with `vercel teams ls`, let the user pick, and add `--scope <team>` to every Vercel command.
- **Not signed in** ("No existing credentials found"). Either `vercel login` in another terminal, or a token from the Vercel account settings passed as `--token`.
- **Production domain.** `https://<project-name>.vercel.app`, where the name is what the CLI reports for the linked project (`.vercel/project.json`, or `vercel project inspect`). When the name is taken in another team, Vercel appends a suffix (`<name>-pi.vercel.app`), so the `Aliased` line of the deploy output is the source of truth. Never use the `https://<project>-<hash>-<team>.vercel.app` deployment URL: it changes on every deploy.
- **Deployment Protection.** In its default (Standard) mode it covers deployment URLs and previews, not the production domain. If the production domain answers 401 or 403, protection covers all deployments and must be turned off in the project settings, or the Merchant Center proxy cannot reach the app.

## 3. Write the URL into the config, build locally, deploy that build

```
node <skill-dir>/scripts/patch-config.mjs --app-dir . --url https://<project-name>.vercel.app
vercel pull --yes --environment production
vercel build --prod
vercel deploy --prebuilt --prod
```

The URL goes in before the build because [`env.production.url`](https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/custom-application-config.md#envproductionurl) feeds the compiled Content-Security-Policy. `vercel pull` fetches the project settings and production environment into `.vercel/`, which `vercel build` needs. Building locally with `vercel build` and uploading with `--prebuilt` keeps the pnpm version and the `allowBuilds` decisions on the user's machine, where they are already proven, instead of trusting a remote build. Outside the session's review screen, show the user the deploy command and get their confirmation before running it: it publishes the app. If the `Aliased` line of the deploy names a different domain, patch the config to that domain and deploy once more. Environment variables only matter if the config uses `${env:...}` placeholders in production; they resolve at the local build. The starter's `CTP_INITIAL_PROJECT_KEY` is development only.

## 4. Check the host

Run `scripts/verify.mjs` (see `other.md`). If the `Aliased` line showed a different domain than the one in the config, stop: patch the config to match, and redeploy.

## 5. Hand back to register.mjs

Pass the URL as `--production-url` in [Step 6 of the manual steps](../manual-steps.md#step-6-finish-registration). The config already holds it, so the sync only has to push it to the Merchant Center.

## What the session runs with deployment help on

The session's review screen is the consent for everything below; on the manual path, show each command and get the user's explicit yes before running it, as in step 4 of [other.md](./other.md).

The same commands, in this order: `vercel link --yes` (several teams become a list to pick from; a missing login asks for a token as a secret input), write `vercel.json`, patch the config with the planned domain, `vercel pull`, `vercel build --prod`, `vercel deploy --prebuilt --prod`, then a rebuild with the `Aliased` domain when it differs from the planned one. A 401 or 403 from the production domain fails the host check at once with the Deployment Protection explanation above.
