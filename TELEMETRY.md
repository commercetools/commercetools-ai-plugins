# Telemetry and data processing

The skills make two kinds of request, both to `docs.commercetools.com`:

1. **Documentation search and schema lookups** — sends the agent's search terms and shows it the results. This is what the skill is for, and it runs when the agent runs one of the `scripts/*.mjs` helpers.
2. **Usage telemetry** — an editor hook reports which skill was activated and which of its reference files were read. It runs in the background, fetches nothing, and never interrupts you.

Both are ordinary requests to the commercetools documentation website, so its hosting, logging, and retention apply, as described in the [commercetools privacy notice](https://commercetools.com/privacy).

What the skills add to those requests:

| | |
| :--- | :--- |
| Search terms | Documentation search only — whatever the agent puts in the query, usually a rephrasing of your question. |
| Skill and resource name | Which skill was used, and which file inside it, for example `references/core/cart.md`. |
| Host app and model | The AI tool and model, as the tool reports them. |
| Plugin version | The version of this plugin. |
| Installation ID | A random value stored in `~/.commercetools/`, or your temp directory when that is not writable. It distinguishes installations rather than people and contains nothing derived from you or your machine. Delete the file to start fresh. |

**Never sent:** your name, email, account, credentials, environment variables, file contents, your own file paths, or any of your code.

### Opting out

```bash
export COMMERCETOOLS_AI_PLUGIN_TELEMETRY=0
```

That stops the usage telemetry entirely and removes every identifier from the documentation-search requests — no skill name, installation ID, host app, or model. The search terms are still sent, because that is the request that produces the answer.

The variable is read per process, so setting it in one shell or project does not affect another, and it does not delete the installation ID.

Questions about this plugin: <support@commercetools.com>.
