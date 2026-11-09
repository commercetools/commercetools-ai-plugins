---
name: Repository connection
description: Connect a coding agent to a commercetools Project through a managed MCP Server with Merchant Center sign-in, configured per repository.
metadata:
  contentType: REFERENCE
---

# Repository connection

Your coding agent reads and configures a Project while you build. Each developer signs in as
themselves, so no secret sits in the repository.

Connect one Project first. Offer more once that one works.

## Rules

- **Create the server with the user's own Merchant Center sign-in, not an API client.** The script in
  step 2 uses the session the user's sign-in stores, so no secret is created or pasted. The
  Merchant Center form is the fallback when the script can't run.
- **Write the connection with the script (step 3), not by hand.** It checks the URL against the
  project, merges into `.mcp.json` without touching other servers, and prints the next step. Don't
  use an agent's own `mcp add` command either.
- **Relay the printed next step; don't run it.** Sign-in needs the user's browser, and the tools
  only load when this conversation is reopened in a new process, which you can't do. Reopening keeps
  the conversation, so the setup continues where it stopped. For that step, don't offer
  `!`-prefixed in-session commands instead. The one exception is the Merchant Center sign-in of
  step 2 (`scripts/sign-in.mjs`): it needs no reopened conversation, so you run it yourself in the
  background and relay its URL.
- **Tools follow the environment.** Development gets **All**: letting the agent set up and
  configure the project is the point, and read-only would defeat it. Production gets **All read**,
  always. Other environments are the user's call.
- **Production is not detectable.** The Project resource has no environment flag, on REST or
  GraphQL. Never infer it from configuration: implementations mirror settings across environments,
  and misconfigured production projects are common. Ask for further projects (step 2), and treat
  `prod`, `production` or `live` in the project key or name as production. The absence of a marker
  means nothing.
- **Don't research or search.** Look for configuration only in the repository and the paths your
  agent's section names, never across the filesystem. Don't invent scoping (no launcher scripts, wrappers, aliases, or config
  directories inside the workspace), and never add test entries to the user's configuration to
  learn a format.

## Steps

1. **Check what exists.** A `mcp.{region}.commercetools.com` URL in the agent's MCP configuration is
   a connection. After sign-in, the reopened conversation continues here.

   - **Its tools are available**: call `read_project`. It proves the connection end to end and
     returns the Project's display name:

     > Connected to `{projectKey}`: `{project display name}`.
     >
     > Connect another project?

     Suggest setting that name on the MCP Server in the Merchant Center. For another project,
     continue with step 2.
   - **Its tools aren't available**: sign-in or approval is missing. Run the step 3 script again
     with the same URL. It changes nothing and prints the next step.
   - **No connection**: continue with step 2.

2. **Create the server.** Ask for the Project:

   > Paste the Merchant Center URL of the project you want to connect. Normally your development
   > project.
   >
   > `https://mc.{region}.commercetools.com/{projectKey}/welcome`
   >
   > Don't have it? Log in at https://identity.commercetools.com/ and copy the URL from your browser.

   An API host plus project key works too. Extract region and project key, and check the region
   against the [hosts list](https://docs.commercetools.com/api/general-concepts.md#hosts). If it
   isn't there, ask again rather than guessing.

   For every project after the first, also ask:

   > Which environment is `{projectKey}`: development, staging, production, or something else?

   Create the server with the script, run from this skill's root. Use `--environment development`
   for a development project and `--environment production` for production or any other
   environment, which gives read-only tools:

   ```bash
   node scripts/create-managed-mcp-server.mjs --region "<region>" --project "<projectKey>" --environment "<development|production>"
   ```

   Without `--confirmed` it changes nothing and prints the plan. Show the plan to the user and wait
   for an explicit yes, because the next run creates a server in their Project. Then run the same
   command with `--confirmed`. It prints the **MCP server URL**: use it in step 3 and skip the form.

   - **It exits 4 with `needs.ctx` `signIn`**: there is no Merchant Center session, it expired, or
     it cannot call the API. Show the user `needs.command` (`scripts/sign-in.mjs`) and say that it
     opens a Merchant Center sign-in and runs `mc-scripts` through `npx`, which can download it.
     Wait for an explicit yes. Then run it in the background and read its stderr. Show the user the sign-in URL it prints: they open it in a browser and finish
     there. This is the same `mc-scripts login --mc-api-url` the custom-application scripts use.
     It leaves a Merchant Center session token in `~/.commercetools/mc-credentials.json`, valid
     for about an hour, which the create script reads to call the Merchant Center API as the user.
     The script passes the project and the one scope that managing MCP servers needs
     (`manage_mcp_servers`), and no API client is involved. A session made by another login, for
     another project or without that scope is replaced rather than reused. The sign-in script
     ends the login it started when it finishes. A matching session finishes immediately and
     prints no URL. When it prints `"ok": true`, run the create script again. If the create script
     still reports a missing scope, `needs.command` carries `--force`.
   - **The sign-in exits 3**: the user didn't finish in time. Run it again for a new URL.
   - **A finished-login notice** from the session, such as a background task completing, only
     means the sign-in ended. It is not approval to create the server: the plan still needs the
     user's explicit yes.
   - **It exits 1**: usually the user's Merchant Center role can't manage MCP servers in that
     Project. Report the error and use the form below.

   Fallback: send the user to the form:

   > Create the MCP server: `https://mc.{region}.commercetools.com/{projectKey}/settings/mcp-servers/new`
   >
   > - **Authorization method**: **OAuth / Identity**
   > - **Server key**: `coding-agent`
   > - **Tools**: **Group select** → **All** for a development project, **All read** for production
   > - After saving, make sure the server is **enabled** with the toggle on its detail page
   >
   > Then paste the **MCP server URL** here.

   For production, or a key or name with a production marker, say it plainly:

   > `{projectKey}` is production. Use **All read**, so nothing can be changed there through the agent.

   Leave **Name** and **Description** empty. Step 1 fills in the name from a verified value. Field
   details: [Create an MCP Server](https://docs.commercetools.com/merchant-center/managed-mcp-servers.md#create-an-mcp-server).

   Group selections pick up new tools automatically. That suits development, and **All read** stays
   read-only as they arrive. Tool selection guards against accidents. The security boundary is
   the signer's Merchant Center permissions; see
   [tool filtering](https://docs.commercetools.com/api/managed-mcp-servers-overview.md#tool-filtering-by-merchant-center-permissions).

3. **Write the connection.** For Claude Code, VS Code with Copilot and GitHub Copilot CLI, run this
   from this skill's root, with the repository root as `--dir`:

   ```bash
   node scripts/connect-repository-mcp.mjs --url "<MCP server URL>" --project "<projectKey>" --dir "<repository root>" --agent "<claude-code|vscode|copilot-cli>" --model "<current-model>"
   ```

   It names the connection `ct-{projectKey}`, which prefixes every tool call and approval prompt so
   the target Project stays visible. Relay its "Tell the user" block verbatim, then stop.

   An error is a hard stop: report it, and don't edit the file by hand. If the run itself is blocked,
   give the user the same command with the script's absolute path. Don't report the connection as
   working before `read_project` succeeds.

   For other agents, see their section.

## Per agent

Claude Code, VS Code with Copilot and GitHub Copilot CLI share the repository's `.mcp.json`, written
by the script. The file uses the portable format all three read, so one committed file serves a
mixed team.

### Claude Code

Use `--agent claude-code`, also in desktop-hosted sessions: the script detects those itself.

- **Terminal**: the printed command signs in, then reopens this conversation with
  `claude --continue`, which asks once to approve the server.
- **Desktop app**: sessions there can't sign in, but load the server without approval. The printed
  command only signs in from a terminal; the user then comes back to this conversation. Don't tell
  them to exit or close anything.
- **The sign-in page shows `invalid_client` or "Not found"**: Claude kept a stored sign-in for
  `ct-{projectKey}` from a server that has since been deleted or recreated, and the auth server no
  longer knows it. Check that the server exists and is enabled, then have the user clear the stored
  sign-in in their own terminal and repeat the sign-in. The `--settings` flag is needed because the
  server comes from `.mcp.json` and is not yet approved:

  ```bash
  claude --settings '{"enabledMcpjsonServers":["ct-{projectKey}"]}' mcp logout ct-{projectKey}
  ```

  The sign-in command needs an interactive terminal: it fails when run through the `!` prefix.

### Visual Studio Code with Copilot

Use `--agent vscode`. There is no terminal step: in a trusted workspace, VS Code starts the server
when the next chat message is sent. `MCP: List Servers` in the Command Palette shows its state.

If the repository keeps its servers in `.vscode/mcp.json` (top-level `servers`) instead of
`.mcp.json`, add the entry there by hand, as `"ct-{projectKey}": { "type": "http", "url": "<url>" }`.

### GitHub Copilot CLI

Use `--agent copilot-cli`. The printed step reopens this conversation with `copilot --continue`,
where the user signs in with `/mcp auth ct-{projectKey}`. Project-level servers load after folder
trust. `copilot mcp login` doesn't exist, `copilot mcp add` writes only to the user configuration,
and `copilot mcp list` and `copilot -p` skip project-level servers, so none of them can check the
file.

### OpenAI Codex

Not covered by the script: Codex has no per-project MCP configuration. Say so first:

> Codex has no per-project MCP configuration. This goes in `~/.codex/config.toml` and will be
> available in your other Codex projects too. Add it?

```bash
codex mcp add ct-<projectKey> --url <url> && codex mcp login ct-<projectKey> && codex resume --last "Signed in. Continue the commercetools MCP setup: verify the new connection, then ask whether to connect another project"
```

It adds the connection, signs in through the browser, and reopens this conversation. If they decline,
stop and leave them the URL. Sign-in part only: `codex mcp login ct-<projectKey>`

### Cursor

Per-project configuration in the project's Cursor directory. Remote servers declare a `url`. The
user signs in from Cursor's MCP settings.

### Other agents

Ask the user where their agent keeps MCP configuration and how it signs in.

## Checklist

- [ ] Existing connections checked first; an available one verified with `read_project`
- [ ] One Project connected before offering more
- [ ] Server created with `scripts/create-managed-mcp-server.mjs` after the user approved its plan; the form only as fallback
- [ ] Sign-in run in the background with its URL relayed to the user; the session file named; the `manage_mcp_servers` scope and no API client
- [ ] **OAuth / Identity**, not **API client credentials**
- [ ] **All** for development, **All read** for production, stated for every project
- [ ] Environment asked for every project after the first; a production marker treated as production
- [ ] Nothing inferred from Project configuration
- [ ] Connection written with `scripts/connect-repository-mcp.mjs`, not by hand; an error treated as a hard stop
- [ ] The printed next step relayed verbatim, not run; success claimed only after `read_project`
