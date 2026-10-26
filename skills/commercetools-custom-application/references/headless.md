---
name: headless
description: The onboarding session without a terminal, for an agent that can run commands. Every input is a flag, every run prints one JSON result, and a value only the user can give comes back as a "needs" object to answer and rerun with.
metadata:
  contentType: REFERENCE
---

# The headless run

`scripts/headless.mjs` is the only route, with no screens. The user never opens a shell. You gather every input in chat, run the script, read one JSON object from stdout, and act on the exit code. Step events go to stderr as `[<step-id>] <type>  <detail>`. Every command's full output is in `<app-dir>/.mc-onboarding/session.log` (`log` in the result); read it when a step fails. Rerunning the same command resumes: finished steps are skipped from what exists on disk and in the Merchant Center.

## The sequence

1. Start by asking the user for the form data, in chat, before running anything that touches their account. Ask the app name first: the other defaults derive from it. Then, as in Step 1 of the manual steps: `node <skill-dir>/scripts/intake.mjs form --app-name <name>` gives the batches, `intake.mjs check --answers <file>` validates the answers. Hosting is whatever the user already uses; Vercel, Netlify, Cloudflare Pages and Connect have deployment help.
2. Sign in and list the install targets. Run the script with the form's answers and no plan:

   ```
   node <skill-dir>/scripts/headless.mjs --app-name <name> --region <region> --project-key <key> \
     --entry-point <path> --menu-label <label> --contact-email <email> --app-dir <dir> \
     --template <starter-typescript|starter> --hosting <provider> [--deploy-help on|off]
   ```

   It checks the tools and the session. With no valid session it starts the login, prints `[session] https://...` on stderr and waits for the credentials file: give the user that URL and let the run wait. Then it exits 4 with `needs.ctx` set to `installPlan` and `needs.options`, the Organizations the user administers with their projects.
3. Ask the user where to install: which Organizations, and all projects or an allowlist for each. Write the plan file, a JSON array with one entry per Organization: `orgId`, `orgName`, `allProjects` (true or false), `projectKeys` (empty when `allProjects` is true, at least one key otherwise).
4. Get the review: the same command plus `--install-plan <file>`. Exit 0 with `stage: "review"`. Show `review` to the user in full: the app (name, entry point, region, folder, template, project key, menu label), contact email, hosting, the plan, the owner Organization, deployment help. When the plan names several Organizations and no `--org-id` was given, it exits 4 with `needs.ctx` set to `orgId` and the options: ask, rerun with `--org-id <id>`. Nothing in the account has changed yet.
5. Get an explicit yes to that review. Then the same command plus `--confirmed`. It creates the app, runs `git init -b main` in the app folder (the repository root with Connect; init only, no commit or remote), builds, registers, deploys, checks the host, finishes registration, and ends with `productionUrl` and `opened`.
6. Act on the exit code (table below). A need is answered with `--set <field>=<value>`, or the named environment variable for a secret, and the same command again.
7. Finish as in Step 7 of the manual steps: `opened` is the Merchant Center URL of the app inside a Project. Open it, or hand it to the user, and confirm the menu item. Do not report success from exit 0 alone.

Do not pass `--confirmed` before the user has seen the review and said yes. Do not choose Organizations, the owner, the hosting or the deployment help setting (`--deploy-help on|off`, default on for hosts that have it) for the user.

## Exit codes

| Code | Meaning | What to do |
| --- | --- | --- |
| 0 | Done, or the review was printed (no `--confirmed`). | Show the review, or finish with `opened`. |
| 1 | A step failed: `failedAt` and `error` (or `error` alone for an unexpected failure). | Read the error and the log, fix the cause, rerun. |
| 2 | Bad or missing input: `errors` keyed by field. | Ask for the field, rerun. |
| 3 | A step was still waiting after `--poll-limit` polls: `at`. | Rerun; it resumes. Usual causes: the verification email (ask the user to click the link) or a login not finished (the run ends that login; the rerun starts a new one and prints a new URL). |
| 4 | A step needs a value: `needs` with `ctx`, `label`, and `options`, `env` or `hint`. | Ask the user, rerun with the answer. |

## What a step may need

| `needs.ctx` | When | Answer with |
| --- | --- | --- |
| `installPlan` | No plan file yet. | Write the file, add `--install-plan <file>`. |
| `orgId` | The plan names several Organizations. | `--org-id <id>` from `options`. |
| `productionUrl` | Deployment help off: the user deployed. | `--production-url <https url>`. |
| `vercelTeam` | The Vercel login has several teams. | `--set vercelTeam=<id>` from `options`. |
| `vercelToken` | The Vercel CLI is not signed in. | `VERCEL_TOKEN` |
| `netlifyTeam` | The Netlify account has several teams. | `--set netlifyTeam=<slug>` from `options`. |
| `netlifyToken` | The Netlify CLI is not signed in. | `NETLIFY_AUTH_TOKEN` |
| `cfAccount` | The Cloudflare login has several accounts. | `--set cfAccount=<id>` from `options`. |
| `cfProject` | Cloudflare refused the Pages project name. | `--set cfProject=<name>` |
| `cfToken` | Wrangler is not signed in. | `CLOUDFLARE_API_TOKEN` |
| `ctClientId` | Connect: the API client for the Project. | `CTP_CLIENT_ID` (or `--set ctClientId=<id>`) |
| `ctClientSecret` | Connect: its secret. | `CTP_CLIENT_SECRET` |
| `ghVisibility` | Connect: the GitHub repository to create. | `--set ghVisibility=public` or `private`. |

A secret travels in the environment of the command, never in a flag: the script refuses `--set` for `vercelToken`, `netlifyToken`, `cfToken` and `ctClientSecret` (exit 2), and no token appears in a subprocess command line or in the log. Polling waits (the verification email, the host check after a deploy, Connect publishing and deploying) poll by themselves every `--poll` seconds, up to `--poll-limit` times per run. The sign-in polls every 2 seconds regardless, so the default limit of 60 gives the user about two minutes; pass a larger `--poll-limit` when they may be slower.

`--app-dir <dir>` pointing at an existing app resumes an interrupted run from wherever it stands. Region, entry point, project key, name and menu label are read from its config. Repeat `--hosting`, `--deploy-help` and `--org-id` (and for Connect, the repository folder as `--app-dir`), because they are not stored. `--install-plan` may be omitted when `<app-dir>/install-plan.json` exists. Add `--confirmed`. `node <skill-dir>/scripts/headless.mjs --help` lists every option.
