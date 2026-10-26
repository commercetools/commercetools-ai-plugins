---
name: commercetools-custom-application
description: "Create a Merchant Center Custom Application and get it into the main nav: asks for your details in chat, scaffolds the app in its own git repo, deploys it to a host such as Vercel, registers it, installs it in the Organizations you choose (all projects or an allowlist), and opens the app. Use when the user wants a custom app or nav item, or it only works on localhost. Not for Custom Views, or for Connect service, event and job connectors (see commercetools-connect)."
when_to_use:
  - "Creating a new Merchant Center Custom Application and getting it into the main nav of a Project"
  - "Registering, deploying, or installing an existing custom app built with create-mc-app"
  - "A custom app that works on localhost but is not showing up in the Merchant Center menu"
  - "Installing a custom app into several Organizations, all projects or a project allowlist for each"
metadata:
  contentType: SKILL
  area:
    - Foundations
  docsSearch:
    products:
      - Composable Commerce
---

# Merchant Center Custom Application, zero to nav

End state: a Custom Application on a static host, registered in the user's Organization, Ready, installed in every Organization the user chose (all projects, or an allowlist per Organization), and in those Projects' main menu.

Assumed: the user has a commercetools Project and is in the `Administrators` Team of an Organization. "Nothing configured" means no custom app yet, not no account. No Project: stop and say so.

## How this skill works

The procedure lives in `scripts/`, not here. Registration is a dozen order-dependent calls, and its failures (wrong `applicationId` in the build, URL mismatch, Draft state) show up far from their cause. So the scripts read the real Merchant Center state, pick the next step, and act. A rerun after any interruption resumes. Your job: gather inputs, run the scripts in order, and handle what scripts cannot: the email click and, with deployment help off, the deploy.

Every script prints JSON. Read `ok`, `error`, `stoppedAt`, and `checks[].detail`; never assume a step worked. Run them as `node <skill-dir>/scripts/<name>.mjs`.

The scripts carry the procedure; the Merchant Center facts around it (what an `entryPointUriPath` may be, which permissions a Team needs, what a host must do) come from the documentation, so:

1. <!-- ct:docs-search:begin -->
   **Docs search (required, run first)** — The first time you use this skill in a session you must run this before answering. It gathers the latest verified documentation as your primary grounding, filtered to the products this skill covers. Use this script for documentation search while working with this skill; the Knowledge MCP covers everything else. Always confirm details against retrieved documentation rather than the skill text alone:

   ```bash
   node "<this skill's directory>/scripts/docs-search.mjs" \
     --query "Merchant Center Custom Application <the user's situation: register, deploy, install, permissions, host>" \
     --app-name "<host app: claude-code, claude-chat, cursor, codex, copilot — or the host's own name>" \
     --model "<current-model>" \
     --commercetools-project-key "<if known>" \
     --commercetools-region "<if known>" \
     --limit 5
   ```

   Pass the commercetools project key and region (as in `api.{region}.commercetools.com`) only if already in your context; otherwise omit both. Never search files or ask the user for them.
   <!-- ct:docs-search:end -->

2. Then run Step 0. Headless is the only route, always, whether or not the user has a terminal. The manual steps are for redoing one piece by hand, or for when you cannot run commands.

## Step 0: run headless (the whole flow, from nothing)

Headless is the only route. You run `headless.mjs` and the user answers in chat, whether or not they have a terminal. Do not offer or run `onboard.mjs`. The protocol (exit codes, the plan file shape, what each step may ask for) is in [headless.md](./references/headless.md); read it first.

Start by asking the user for the form data. Nothing touches their account until they have answered it and confirmed the last screen, and no answer is filled in for them.

1. Ask the user for the app name first: the entry path, menu label and folder default from it. Then get the questions with `node <skill-dir>/scripts/intake.mjs form --app-name <name> --email <email>` and ask them as written: region, project key, entry path, menu label, contact email, folder, language, hosting. Ask the deployment help question too (`--deploy-help on|off`, below). Validate the answers with `intake.mjs check --answers <file>`.
2. Run `scripts/headless.mjs` with the answers as flags. It checks the tools and runs the Merchant Center sign-in: it prints `[session] https://...` on stderr and waits for the credentials file, so run it where you can read stderr and give the user that URL (exit 3 means it gave up waiting: rerun for a fresh URL). It then exits 4 with a `needs` object listing the Organizations and their projects. This is the Organization picker: ask which Organizations, and all projects or an allowlist for each, write the plan file (`installPlan`), and rerun with `--install-plan <file>`.
3. Exit 0 with `stage: "review"` prints the review: the app's facts, the install targets, the owner Organization and the deployment help setting. Show it whole, and say plainly that the yes covers everything step 4 does: running the `create-mc-app` launcher, installing dependencies, `git init`, creating or linking the host project and deploying (with Connect: a GitHub push and a private Connector published and deployed), and registering and installing in the Merchant Center. Get an explicit yes. With several Organizations it exits 4 with `needs.ctx` `orgId`: ask which one owns the app, rerun with `--org-id <id>`. Nothing in the account changes before the yes.
4. Rerun with `--confirmed`. Do not pass it before the yes. The work, with live progress on stderr: create the app (`create-mc-app`), `git init -b main` in the app folder (the repository root with Connect) with `.mc-onboarding/` gitignored, install dependencies and build, register in Draft (the verification email: ask the user to click it, and rerun after exit 3), deploy, host check, finish registration (Ready, installed everywhere chosen), open the browser. The host check polls on its own while the deploy propagates; a 401/403 or a certificate this machine cannot verify fails at once with what to do. A rerun resumes where it stopped. A step that needs a value the user must give (a team, a token, the production URL) exits 4 with `needs` (`ctx`, `label`, `options` or `env`): ask, then rerun with `--set <ctx>=<value>`, `--production-url <url>`, or the variable named in `needs.env` (tokens and secrets go in the environment only). The provider files under `references/hosting/` say what each host asks and runs.

Deployment help on (the default for Vercel, Netlify, Cloudflare Pages and Connect) creates or links the site, builds locally and deploys, or for Connect pushes a tagged GitHub repository and publishes and deploys a private Connector; for Connect the folder named in the form is the repository root and the app is created one level down. Off, the user deploys and you pass the production URL.

- `--deploy-help on|off` sets deployment help; ask, do not default it.
- `--app-dir <dir>` pointing at an existing app skips creating it and resumes from wherever things stand; repeat `--hosting`, `--deploy-help` and `--org-id`, which are not stored.
- Every command's output goes to `<app-dir>/.mc-onboarding/session.log`; `--help` lists every option.

Do not answer the form or choose Organizations, the owner, or the deployment toggle for the user, and do not answer a `needs` for the user.

## When to use the manual steps

The same work exists as seven separate commands in [manual-steps.md](./references/manual-steps.md): inputs, preflight, scaffold, install targets and registration, deploy, finish, verify. Read it when one piece must be redone by hand, or when you cannot run commands at all and the user runs each one. Otherwise run Step 0. Hosting is a contract, not a provider: [hosting/other.md](./references/hosting/other.md) states it, and the provider files say how Vercel, Netlify, Cloudflare Pages, Surge and Connect meet it.

## Failure reading

| Symptom | Cause | Fix |
| --- | --- | --- |
| App page reloads forever | `entryPointUriPath` in the Merchant Center differs from the config, or `applicationId` is wrong in the build ([proxy router](https://docs.commercetools.com/merchant-center-customizations/concepts/merchant-center-proxy-router.md)) | Compare `window.app.entryPointUriPath` in devtools with the URL; rebuild with the right `applicationId`. |
| `FORBIDDEN` from the settings API | User is not in `Administrators` for the Organization | Add them, or use an Organization where they are. |
| Blank page after install | Host does not rewrite all paths to `index.html` | Run `scripts/verify.mjs`; it says when the rewrite is missing. The rule per provider is in `references/hosting/`. |
| Works on `localhost` but not in the nav | Local dev bypasses registration | Check Ready state and install with `register.mjs`, then Step 7 of the manual steps. |
| Installed but not in the nav | Non-admins need the app's View permission on their Team | [Grant it on the Team](https://docs.commercetools.com/merchant-center/managing-custom-applications.md#assign-team-permissions). Admins see it at once. |
| `register.mjs` stops at `INSTALL_MISMATCH` | The app is installed in that Organization in the other mode (all projects vs allowlist) | The user switches the mode in the Merchant Center ([Update Projects access](https://docs.commercetools.com/merchant-center/managing-custom-applications.md#update-projects-access)) or uninstalls and reruns. Team permissions may need granting again after a reinstall, so ask first. |
| `register.mjs` reports "No progress" | An action ran but state did not change | Inspect the state of the step named in the error. Do not loop. |

## Checklist

- [ ] The user has a Project and is in the `Administrators` Team of the owner Organization
- [ ] Every input came from the user: no guessed Organizations, owner, project key, hosting, or deployment toggle
- [ ] The headless run ended with the app Ready (exit 0 with `productionUrl` and `opened`), or manual Steps 1 to 6 ended with `done: true` from `register.mjs`
- [ ] The app folder is its own git repository (`git init -b main` ran there; the folder has a `.git`)
- [ ] `scripts/verify.mjs` passed against the production URL (the app path and a deeper path both answer 200)
- [ ] The app was seen in the main nav of a deployed Project, or the user confirmed it and the report says the nav was not seen
- [ ] The config change (`applicationId`, `url`) is committed so the next deploy matches what is registered
