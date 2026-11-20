---
name: source-access
description: "Getting catalog data out of a running source system when there is no export: what access to ask for and why it must be read-only by construction, the table list, credentials, the one-time snapshot the adapter reads instead of the live system, and where the platform pages are (Magento, Shopify)."
metadata:
  contentType: REFERENCE
---

# No export: access and the snapshot

Read this at step 0, before sizing, when the user has a running shop, PIM or
database but no export, or offers access instead of files. Every other page
assumes files under `source-export/`. This page is how they get there.

- [The rule: the adapter reads a snapshot, never the live system](#the-rule-the-adapter-reads-a-snapshot-never-the-live-system)
- [What to ask for, in this order](#what-to-ask-for-in-this-order)
- [Access must be read-only by construction](#access-must-be-read-only-by-construction)
- [Name the tables, and leave the rest out](#name-the-tables-and-leave-the-rest-out)
- [Credentials and client tools](#credentials-and-client-tools)
- [Taking the snapshot](#taking-the-snapshot)
- [An API as the source](#an-api-as-the-source)
- [Derived stores are not the source](#derived-stores-are-not-the-source)
- [Platform pages](#platform-pages)

## The rule: the adapter reads a snapshot, never the live system

Take the data out once, into files under `source-export/`, and do everything
after that against those files: sizing, discovery, the adapter, every rerun.

- **Reruns stay comparable.** The adapter runs dozens of times. Against a live
  system, products and prices change between runs, and a difference in the feed
  can no longer be traced to the code or to the shop.
- **The snapshot is the record.** The counts in `DECISIONS.md` and
  `MODEL-REVIEW.md` are reproducible only against a fixed input.
- **Access can end early.** Once the snapshot exists, the business can revoke
  the access, and no credentials stay with the engagement.
- **Production carries no load** from the adapter's reruns.

Never point the adapter at the live system. A live read after the snapshot
needs a question the snapshot cannot answer and the user's yes, and goes in
`DECISIONS.md`.

## What to ask for, in this order

Ask the business, in chat. Never look for a way in yourself: default
passwords, credentials in container or deployment files, open ports.

1. **An export the platform produces itself**, such as an admin product export.
   No credentials change hands. Check what it leaves out: attribute definitions,
   option lists, tax rules and stock locations are often missing, and become
   interview questions or a second request.
2. **A dump of named tables, taken by someone who already has access.** The
   most complete source. Give them the table list (below).
3. **Read access you use once, to take the snapshot yourself**, if neither is
   possible. A replica is better than the primary.

Give the reason with each option and let the business choose: their
administrator's preference is a valid answer. The snapshot rule holds on
every path.

## Access must be read-only by construction

Ask for access that cannot write, not access that can and is promised not to:
a database user granted only `SELECT`, a read replica, an API role that has
no write permission. A one-time read does not justify holding write access to
the customer's production catalog.

- **Check what an API's read permission includes before asking for it.** Some
  platforms grant reading and changing the catalog through one permission, so
  a read-only integration does not exist. Then the API is the wrong path for
  this: say why, and ask for an export or database access instead.
- **Never ask for** an admin login, a server or container shell, or a database
  administrator account. Do not reach the database through the host's
  container runtime or a root account, even when the tools are on the machine:
  that bypasses the access the business chose.
- **Check what you were given before using it** (MySQL:
  `SHOW GRANTS FOR CURRENT_USER()`; an API token: the scopes it reports). If it
  is broader than asked, the whole database instead of the listed tables, read
  only what the catalog needs, tell the business, and say it can be narrowed
  now or dropped once the snapshot exists. A token with any write scope is not
  read access: ask for a read-only one instead.

## Name the tables, and leave the rest out

Give whoever grants the access or takes the dump the list of tables the
catalog needs, and nothing more:

- **In**: products and their attribute values, attribute definitions and option
  labels, variant links, categories and product-category links, prices, stock,
  images, URL keys, stores, websites and locales, tax classes.
- **Out**: customers, addresses, orders, carts, quotes, payments, sessions,
  admin users, anything holding authentication data. Customers and orders are
  opt-in ([entity-coverage.md](entity-coverage.md#in-step-0-which-entities-are-in-scope)),
  and tables left out never have to be trusted as unread.
- **Configuration tables** often hold encrypted secrets next to the harmless
  settings. Ask for the few rows the migration needs (locale, currencies, base
  URLs, tax settings) as a query result, not for the table.

Write the list into `migration/SOURCE-ACCESS.md` for the business to pass on,
with the facts you need back: the platform version and edition, whether
modules that move the data are installed (multi-source inventory, content
staging), and any table prefix. Say that the list comes from general knowledge
of the platform, to be checked against their installation.

## Credentials and client tools

- The business puts the credentials in a file at the engagement root, such as
  `source.env`, mode `600`, listed in the engagement's `.gitignore` before the
  first commit. Not in chat, and not in `INTERVIEW.md`, `DECISIONS.md`, the
  adapter or the config, which are committed.
- Pass them to the client through its option file or the environment, never as
  a command-line argument, which other processes can read. For MySQL, write a
  temporary `--defaults-extra-file` with mode `600` and delete it after use.
- Never print the secret. When showing the file, mask the value.
- If a client is missing, show the install step and wait for the user's yes.
  Prefer a driver installed inside `migration/` over a system-wide install, and
  if it has to be system-wide, say so: it outlives the engagement.

## Taking the snapshot

- **A dump of the named tables is the default shape**: it is what an
  administrator produces, and the file is the snapshot. MySQL:
  `mysqldump --single-transaction --hex-blob` with the table list.
- **In one read-only transaction**, so the tables agree with each other. When
  you copy the tables yourself through read-only access, open it with
  `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY` and write one file
  per table.
- **Decimals as text**, never through a float, so every price keeps its digits
  ([why](pricing-and-money.md#convert-on-the-digit-string-never-through-a-float)).
  A dump keeps them as written; a copy script must write them as strings.
- Under `source-export/<system>-<version>-<date>/`, with a manifest: the time
  taken, the source version, the tables and their row counts.
- A `DECISIONS.md` entry: which access was granted and by whom, when it was
  used, the tables and the counts. Then tell the business the access can be
  revoked.

Then carry on with step 0 as for any export. Profile the snapshot, not
documentation about the platform:
[source-discovery.md](source-discovery.md#the-rule).

## An API as the source

An API pulled once into files is a snapshot like any other, and the same rules
hold: read-only access, one pull, files under `source-export/`, the adapter
reading the files. Keep the extractor separate from the adapter, so the feed
can be regenerated without the API.

- **Version and fields from the vendor, not from memory.** Take the API
  version from the vendor's documentation and every field name from it or the
  schema itself (GraphQL introspection). A guessed field fails only when the
  extractor runs, and a deprecated one fails the whole query once a later
  version removes it.
- **Compare the version that answered.** Some APIs serve a newer version than
  the one requested when it is no longer supported, and say so in a response
  header. Stop on a difference rather than map data from a schema the extractor
  was not written for, and record the version in the snapshot's manifest.
- **Prefer the vendor's bulk export to paging** for a whole catalog. A bulk job
  that ends failed or cancelled is not a snapshot, even when it left a partial
  file: run it again.
- **The token goes only to the vendor's API host.** A result file downloaded
  from a signed URL on another host needs no token; sending it there leaks it.
- **Ask before the first request.** The extractor reads the live system with
  the business's credentials: show the command and the endpoints it calls,
  and wait for a yes.

## Derived stores are not the source

Search indexes, caches and storefront APIs hold what the shop shows, not the
catalog. They leave out disabled products and admin-only data, a search index
often leaves out variants that are not shown on their own, and all of them are
rebuilt from the database. Use them to cross-check a count at most.

## Platform pages

What these rules mean for one platform, its access paths, the tables to ask
for and the questions to ask first, is in `sources/`:

- [Magento 2.4 and Adobe Commerce](sources/magento.md)
- [Shopify](sources/shopify.md)
