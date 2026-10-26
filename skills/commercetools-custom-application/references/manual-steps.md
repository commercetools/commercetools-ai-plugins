---
name: manual-steps
description: The onboarding session as seven separate commands (inputs, preflight, scaffold, install targets and registration, deploy, finish, verify), for when the agent cannot run commands and the user runs each one, or when one piece must be redone by hand.
metadata:
  contentType: REFERENCE
---

# Manual steps

These are what the headless run does, as separate commands. Run them in order from the skill directory; `<skill-dir>` is where this file's parent `SKILL.md` lives. Every script prints JSON: read `ok`, `error`, `stoppedAt`, and `checks[].detail`. If you can run commands, use the headless run ([headless.md](./headless.md)) instead. Stay here when you cannot run commands at all (the user runs each one) or when one piece must be redone by hand.

## Step 1: gather inputs (manual)

Walk the user through the form one batch at a time:

```
node scripts/intake.mjs form --app-name <name> [--hosting <provider>] [--email <email>]
```

Pass `--hosting` and `--email` only when known; a known provider drops that question. Ask each batch in `batches` in order, unchanged, as multiple-choice questions where the agent supports them. Free-text fields offer a suggestion plus "Type it myself"; accept what the user types. Write the answers to a JSON file keyed by question `id`, then check them:

```
node scripts/intake.mjs check --answers <file>
```

Fix every key in `errors` by re-asking only that question, until `ok: true`. `next` is the Step 2 command. If the user has no Project, stop. Guess nothing.

| Input | Notes |
| --- | --- |
| Project key | A Project in the owner Organization, used as `--initial-project-key` when scaffolding. Install targets are chosen in Step 4. |
| Region | [Cloud identifier](https://docs.commercetools.com/merchant-center-customizations/concepts/merchant-center-api.md#cloud-identifiers): `gcp-eu`, `gcp-us`, `gcp-au`, `aws-eu`, `aws-us`. Must match the Project. |
| `entryPointUriPath` | [Unique per region, with reserved names rejected](https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/custom-application-config.md#entrypointuripath). It also names the user permissions, so it is hard to change later. |
| Menu label | What the nav shows. Defaults to the app name. |
| Maintainer contact email | Required once per Organization. Gets a verification email. |
| App directory | Where to scaffold. |
| Hosting provider | Whatever the user already uses. If none, suggest one that is written up (Vercel, Netlify, Cloudflare Pages, Surge, or Connect, which hosts the app itself); do not assume. For Connect read [hosting/connect.md](./hosting/connect.md) before Step 3: it changes the folder layout and the package manager. |

## Step 2: preflight

```
node scripts/preflight.mjs --region <region> --entry-point <path> --hosting <provider>
```

Fix every `ok: false` before continuing. The usual ones: no or expired session (`detail` holds the exact `npx @commercetools-frontend/mc-scripts login --mc-api-url ...` command, which opens a browser), and a missing or logged-out hosting CLI (`detail` names the install and login command). The user runs each command in their terminal, then preflight runs again. The app does not exist yet, which is why login goes through `npx`.

## Step 3: scaffold

This downloads and runs a package and then installs dependencies. Show the command and get the user's explicit yes before running it (on the session path, the review screen is that yes).

```
npx @commercetools-frontend/create-mc-app@latest <app-dir> --template starter-typescript \
  --entry-point-uri-path <path> --initial-project-key <project-key> \
  --cloud-identifier <region> --package-manager pnpm --yes
```

Use `--template starter` for plain JavaScript. Then set `mainMenuLink.defaultLabel` in `custom-application-config.mjs` to the menu label.

The app is a static bundle: the Merchant Center loads it from the host URL inside the nav, so nothing runs locally and there is no local checkpoint. The starter already fetches data through the Merchant Center API gateway (`/graphql` with `X-Graphql-Target: ctp`, via `useMcQuery`), so it works against the user's Project with no extra wiring. For a different commercetools API, change `oAuthScopes` in the config to the scopes it needs, and keep them minimal: the Merchant Center grants the app exactly these.

`create-mc-app` can exit with `ERR_PNPM_IGNORED_BUILDS` on pnpm 10 and later even though the scaffold finished, and every `pnpm` command in the app fails afterwards: the scaffold has no decision on dependency install scripts. This script denies every undecided one in `pnpm-workspace.yaml` and proves it by installing again:

```
node scripts/allow-builds.mjs --app-dir <app-dir>
```

Show it and get the user's yes before running it, right after scaffolding: it runs `pnpm install`. It is safe to rerun, never changes an existing `allowBuilds` decision, and exits 0 only when `pnpm install` succeeds. If the user wants a package's install script to run, they set it to `true` in `pnpm-workspace.yaml` themselves. Do not approve builds for them.

Make the app folder its own git repository (the repository root with Connect), even when it sits inside another repository. Only initialise: no commit, no remote. From `<app-dir>`:

```
git init -b main
echo '.mc-onboarding/' >> .gitignore
```

The second line keeps the onboarding session log out of the repository.

Then run `pnpm build` in the app directory to confirm it compiles. Do not run `pnpm start` as a checkpoint: locally the app appears in the nav without registration, so it proves nothing about the deployed result.

## Step 4: choose install targets, then register (first pass, no URL yet)

Choose where the app gets installed. This is a terminal picker, not a model task, and it needs the Merchant Center session from Step 2:

```
node scripts/install-plan.mjs --region <region> --out <app-dir>/install-plan.json
```

The user runs it in their own terminal, because it takes keystrokes. It is a tree of Organizations with their projects. Ticking an Organization alone means all projects (the default); ticking projects under it makes an allowlist, which installs only those. An empty allowlist is refused. Without a terminal, `--list` prints the Organizations and projects as JSON so the plan file can be written by hand; `--vim` gives modal keys. `node scripts/install-plan.mjs --help` and `node scripts/register.mjs --help` print every option and key; read those instead of guessing flags. Do not choose Organizations or projects for the user.

```
node scripts/register.mjs --app-dir <app-dir> --install-plan <app-dir>/install-plan.json --contact-email <email>
```

This is the first command that changes the user's account (it sets the Organization's contact and creates the app in Draft), so show it with the plan it will apply and get the user's explicit confirmation first; the session's review screen is that confirmation on the session path. Do the same before every run of Step 6, which also changes the account (URL, Ready, installs), and say so when the plan would remove an installed project.

`--project-key <key>` is a shorthand: it adds that project in the Organization that owns the app and never removes or narrows an existing install. `--install-plan` matches exactly, so an allowlist that omits an installed project removes it. Do not combine the two.

Check `steps` and `stoppedAt`. If the Organization has no verified contact yet, it sets the email and stops with exit code 3 at `VERIFY_EMAIL`: the user clicks the link in their inbox, then the same command runs again. With a verified contact it skips straight on. Either way it ends by creating the app in Draft through [`mc-scripts config:sync:ci`](https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/cli.md#configsyncci), writing the returned ID into `env.production.applicationId`, and stopping at `DEPLOY` (exit code 3).

If it reports several Organizations, pass `--org-id`. Never pick one for the user.

The `applicationId` must be in the config before the production build, because the build embeds it. That is why registration comes before deploy. The registered URL is a placeholder until Step 6.

## Step 5: deploy

Hosting is a contract, not a provider: a stable `https` URL known before the build, a rewrite of every path to `index.html` (status 200), and `public/` as the output. Read [hosting/other.md](./hosting/other.md) for the procedure and the contract, then the user's provider file if one exists ([vercel.md](./hosting/vercel.md), [netlify.md](./hosting/netlify.md), [cloudflare.md](./hosting/cloudflare.md), [connect.md](./hosting/connect.md), [surge.md](./hosting/surge.md)). For any other host, apply the contract with that host's tooling and the [commercetools Deployment overview](https://docs.commercetools.com/merchant-center-customizations/deployment/overview.md).

Order matters: learn the production URL, write it into the config with `scripts/patch-config.mjs`, then build and deploy. [The URL feeds the compiled Content-Security-Policy](https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/custom-application-config.md#envproductionurl); deploying before it is set ships the placeholder host in the headers and forces a second deploy. Show the user the deploy command and get their explicit confirmation before running it: it publishes the app.

Then run `scripts/verify.mjs` before touching registration. It fetches the app path and a deeper path and fails with a specific message when the host lacks the rewrite or answers with a redirect. That is the most common hosting failure, and it looks the same on every provider.

## Step 6: finish registration

```
node scripts/register.mjs --app-dir <app-dir> --install-plan <app-dir>/install-plan.json --production-url <url>
```

It writes the URL into the config, syncs it, moves the app to Ready, and installs it in every plan target. A target whose allowlist differs from what is installed is updated to match exactly. The script does not switch a target between all projects and an allowlist: it stops at `INSTALL_MISMATCH` (exit code 3) and the user decides. Otherwise expect exit code 0 and `done: true`. The config file now holds the registered URL, so tell the user it changed and that it must be committed and pushed for the next deploy to match what is registered. Leave the commit and push to them: Step 3 made the repository without a remote. If they ask you to do it, show the commit and the push and get their explicit yes first.

## Step 7: verify in the deployed project

```
node scripts/verify.mjs --production-url <url> --project-key <key> --entry-point <path> --region <region>
```

The same host check as in Step 5, now against the final state. Where Node cannot verify the host's certificate (corporate TLS inspection), the check falls back to curl, which trusts the system keychain; `hostCheck.via` says which answered. It prints `openInBrowser`, the Merchant Center URL of the app inside the Project. The workflow ends only when that page has been opened.

- With a browser automation tool, navigate to `openInBrowser`. If the page lands on the login screen, ask the user to sign in in that window, then continue. Take a snapshot and confirm two things: the menu item (the menu label) is in the main nav, and the app content renders. Report what the snapshot showed.
- If browser automation is not available, give the user the `openInBrowser` URL, ask them to open it and confirm the menu item, and say plainly that you did not see the nav.

Do not report success from `done: true` or a passing host check alone.
