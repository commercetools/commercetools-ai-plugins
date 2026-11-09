---
name: getting-the-pipeline
description: "How to fetch the latest release of the pipeline as a source archive, install it and run its tests, and the version line to record in DECISIONS.md before the first stage."
metadata:
  contentType: REFERENCE
---

# The pipeline copy

Read this before the first stage: how the pipeline is fetched and verified, and the line that records which release ran. The stages themselves are in [running-the-pipeline.md](running-the-pipeline.md).

## Getting the pipeline

The pipeline is a separate repository with tagged
[releases](https://github.com/commercetools/ct-catalog-migration-pipeline/releases).
Fetch the source archive of the **latest release** into the engagement, **beside**
`migration/` and never inside it. The archive carries no git history, so what you
get is ordinary files that belong to the engagement: commit them with it, and
change them where the engagement needs it (see
[Upgrading, and changes to the copy](#upgrading-and-changes-to-the-copy)). The
engagement's own files (config, adapter, decision log) stay in `migration/`, never
in the pipeline directory, which an upgrade replaces.

**Ask before you fetch and install it.** The archive is code from the internet,
and `npm ci` installs its dependencies on the user's machine. Resolve the latest
release first, then show the user the tag, the archive URL, the directory it will
go into and the commands below, and wait for the yes, or let them run the commands
themselves. A request to migrate a catalog is not that yes.

```bash
gh release view --repo commercetools/ct-catalog-migration-pipeline --json tagName --jq .tagName
```

That reads one release record and changes nothing. Without the GitHub CLI, take the
tag of the newest release from the releases page. Use the tag and never a branch:
the tag is what the decision log and these pages refer to.

After the yes, from the engagement root:

```bash
mkdir ct-catalog-migration-pipeline
curl -fsSL "https://github.com/commercetools/ct-catalog-migration-pipeline/archive/refs/tags/<tag>.tar.gz" \
  | tar -xz -C ct-catalog-migration-pipeline --strip-components=1
cd ct-catalog-migration-pipeline
npm ci --ignore-scripts   # Node 22+
npm test                  # no network, no credentials — a few seconds
```

`--strip-components=1` drops the archive's top directory, so `package.json` ends up
at the root of `ct-catalog-migration-pipeline/`. `npm ci` installs exactly what the
lockfile says, and `--ignore-scripts` keeps dependency install scripts from running
on the user's machine: the pipeline needs none, and its own CI installs the same way.

**If `ct-catalog-migration-pipeline/` already exists, do not fetch over it.** A second
engagement, a shared directory, a colleague's copy or a copy placed for a change
that is not merged all look like this. Read its version from `package.json` and the
top of `CHANGELOG.md`, tell the user when a newer release exists, and let them
decide ([upgrading](#upgrading-and-changes-to-the-copy)). A copy that contains a
`.git` directory was cloned: leave it, and read its version with
`git describe --tags --always` and its changes with `git status --short`.

**Why files and not a clone.** A clone inside the engagement repository is an
*embedded* repository: `git add -A` records it as a **gitlink** (mode `160000`, no
`.gitmodules` to explain it), which looks tracked and is empty for anyone who clones
the engagement later. An engagement set up that way is unstaged with
`git rm -r --cached -f ct-catalog-migration-pipeline`. A copy without history has
nothing to guard against, so commit it. Its own `.gitignore` keeps `node_modules/`,
`dist/` and `.env*` files out of the commit, which is where `preflight` expects the
credentials file. The engagement's `.gitignore` needs no entry for it, but it must
anchor `feed/` and `out/`
([layout](decision-log.md#where-it-lives--and-the-layout-it-belongs-to)).

Run the tests even for a release you trust. "The four stages ran clean on my feed"
is the tempting substitute and a much weaker signal: a pipeline that works on one
feed says nothing about whether the copy is intact. A few seconds against a stage
misbehaving later for a reason you cannot localise.

## Recording the release

**Record the release in `DECISIONS.md`.** This matters more than it looks: the pages
here name exact diagnostic codes, field names and behaviours, and the skill and the
pipeline are versioned separately. A pairing that has drifted produces
documentation that describes a tool you are not running — which is the single most
common defect class this project has had.

These pages were written against release v0.2.0, the first tagged release. A later
release may add, rename or remove a stage, flag, diagnostic code or fixture they
name; if one named here is absent from your copy, trust the copy and treat the page
as the stale half of the pair. While the version starts with `0`, a minor bump marks
such a change (the feed or config schema, a CLI flag, a diagnostic code, the `plan`
or `key-map` format), so read the `CHANGELOG.md` entries between v0.2.0 and your
release before the first stage.

One line is enough for an unchanged copy:

```
Pipeline: ct-catalog-migration-pipeline v<x.y.z> (GitHub Release)
```

## Upgrading, and changes to the copy

**A change to the copy makes the tag a baseline, not what ran.** Anyone re-running
from the line gets different behaviour with no way to tell why. Record which files
changed, why, and the test result on that copy:

```
Pipeline: ct-catalog-migration-pipeline v<x.y.z> + local changes
  (<n> files: <paths>; <why>); npm test: <n> passing
```

To see what differs, fetch the same tag into a scratch directory the same way, with
the user's yes, and compare it with the copy:

```bash
diff -rq --exclude=node_modules --exclude=dist --exclude=dist-test --exclude='.env*' <scratch> ct-catalog-migration-pipeline
```

List files by name: a file that exists only in the copy appears as `Only in`, and
would otherwise vanish from the record. Because the copy is committed with the
engagement, the change itself is in its history; the line says which files and why.

**Upgrading is a fetch and a diff, not a pull.** Fixes do not arrive by themselves.
Fetch the new release into a scratch directory, diff it against the copy, bring
across what the engagement needs, run `npm ci --ignore-scripts` and `npm test`, and
update the line. A minor release can change the format of the artefacts under
`out/`, so finish a run on the release that started it.
