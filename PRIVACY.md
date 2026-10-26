# Privacy

This page describes the data the commercetools AI plugins handle. The plugin talks to commercetools in two ways, both through `docs.commercetools.com`:

1. **Documentation and API tools.** The Knowledge MCP server and the skills' `scripts/*.mjs` helpers search the documentation, look up API schemas, and validate queries. That is what they are for.
2. **Usage reporting.** Editor hooks report which skill was used and which of its files were read. The script that connects a repository to a commercetools MCP Server reports once whether that worked. Neither fetches anything or interrupts you.

Both are ordinary requests to the commercetools documentation website. The [commercetools privacy notice](https://commercetools.com/privacy) covers how commercetools processes the data: hosting, logging, retention, and your rights and how to exercise them.

## Always sent

These are part of the requests themselves, or sent by AI tools that offer no way to turn reporting off:

- **What is asked:** search terms, the schema or resource names looked up, and the GraphQL queries or REST requests sent for validation.
- **Skill and file:** the skill name and the file read inside it, for example `references/core/cart.md`.
- **AI tool:** the AI app and model, as they report themselves, and the plugin version.
- **Request data:** time, network address, and how the client identifies itself (user agent, MCP client name and version). In a cloud-hosted AI app, the network address is the provider's server, not yours.

## Sent unless you opt out

- **Email domain:** the part after the @ of the email address configured in git (`git config user.email`), or of the address your editor signs you in with when it provides one (Cursor). Read once and stored next to the installation ID. Delete that file to have it read again.
- **Installation ID:** a random value stored in `~/.commercetools/`, or in your temp directory when that isn't writable. It tells installations apart, not people, and contains nothing derived from you or your machine. Delete the file to start fresh.
- **Session ID:** a value that groups the requests of one agent session: random, or a one-way hash of the AI tool's own session ID.
- **commercetools project key and region:** only when the agent already knows them from your conversation or from files it read for the task (it is told never to look for them), or from the MCP server URL you pasted when connecting a repository. Kept for the rest of that session.
- **Connection outcome:** whether connecting a repository to a commercetools MCP Server worked, for example `added` or `project-mismatch`. Never the server URL, the repository path, or the file.

## Never sent

Your name, the part of your email address before the @, account details, credentials, environment variables, file contents, your own file paths, or your code.

## Opting out

Usage reporting is on by default. To turn it off:

- In Claude Code, turn off the plugin's **Share usage data** setting, offered when you install the plugin and later under `/config`.
- In any tool, set the environment variable:

  ```bash
  export COMMERCETOOLS_AI_PLUGIN_TELEMETRY=0
  ```

Either one stops everything under [Sent unless you opt out](#sent-unless-you-opt-out). Nothing is read or stored for it while reporting is off. The variable is read per process, so setting it in one shell or project doesn't affect another. Opting out doesn't delete the stored installation ID.

Some AI tools let you change neither the plugin setting nor environment variables. There, the data under [Sent unless you opt out](#sent-unless-you-opt-out) can be sent.

Questions about this plugin: <support@commercetools.com>. For data protection requests, use the contact in the [commercetools privacy notice](https://commercetools.com/privacy).
