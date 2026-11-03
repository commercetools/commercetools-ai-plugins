# Switching the project to Modular, and waiting when it needs a copy

Read this when step 0 settles on `Modular` (or the largest product has over 100
variants), or when `preflight` reports `catalog-model-mismatch`,
`catalog-model-needs-copy` or `catalog-model-in-migration`. The pipeline loads
into either catalog model but never converts a project's existing variants from
one to the other, so what comes next depends on one fact: whether the project
holds products.

Greenfield means zero products. Categories and ProductTypes do not depend on the
catalog model; products do, because their variants are embedded under `Classic`
and standalone resources under `Modular`.

## What `preflight` reports, and what to do

| `preflight` reports | The project | Do |
| :--- | :--- | :--- |
| `catalog-model-mismatch`, "holds no products" | Greenfield | [Switch it](#greenfield-project-switch-it), on the user's yes |
| `catalog-model-needs-copy` | Holds products with embedded variants | [Stop and wait](#a-project-with-products-stop-and-wait) |
| `catalog-model-in-migration` | Partway through the staged migration | Do not load; [finish the migration first](#a-project-in-inmigration) |
| `catalog-model-mismatch`, "could not tell" | Product count unreadable | Add `view_products` and run `preflight` again. An unread count is not a zero |
| `catalog-model-mismatch`, project `Modular`, config `Classic` | Either | Set `target.catalogModel` to `Modular` and re-run `plan`; or, if the project holds no products and Classic is what the user wants, switch it back as below |

## Greenfield project: switch it

1. **Ask first.** The switch changes the project's setting, so it is a write to
   the customer's project. Name the project key and the change (`Classic` to
   `Modular`), say that it needs `manage_project_settings` on the API Client,
   and wait for an explicit yes. The request to migrate the catalog is not that
   yes, because the user has not seen what this step does.
2. Run:

   ```bash
   npm run pipeline -- preflight --config ../migration/migration.config.json --switch-catalog-model
   ```

   It reads the project and counts its products again immediately before the one
   `setProductCatalogModel` action, and changes nothing if a product has appeared
   since. `--apply` never implies it. The same action sent by hand works too
   ([Project API](https://docs.commercetools.com/api/projects/project.md#set-product-catalog-model));
   the flag adds the re-count and the log line.
3. **Log it**: project key, timestamp, previous and new model, who authorised it.
   `catalog-model-switched` is printed to stdout and nowhere else.
4. If you changed `target.catalogModel` to get here, re-run `plan`. The import
   shape is decided at map time, so the config alone is not enough. If the config
   already said `Modular` when `plan` ran, the plan already has the right shape.

To switch an empty project back, set `target.catalogModel` to `Classic`, re-run
`plan`, and run the same flag. A project that holds products is refused in both
directions, so after a trial load run `teardown` first.

## A project with products: stop and wait

The variants of existing products are embedded, and `Modular` needs them as
standalone Variant resources. Moving a project from one to the other is the
staged [Modular Catalog migration](https://docs.commercetools.com/guides/migration-guides/modular-catalog-migration.md):
dual-write, a Variant copy job that only commercetools support runs, a rollout
of Modular reads, the `InMigration` state, `Modular`, and a cleanup job at least
30 days after embedded writes stop. This pipeline does none of it, and no flag of
its own gets around it.

1. **Stop and say so, before more adapter work.** Tell the user that the target
   project holds the number of products `preflight` named, that moving it to
   `Modular` needs a step only commercetools support can run, and that the
   migration waits for it. Record the wait as an open question with an owner in
   `INTERVIEW.md` and `DECISIONS.md`: a wait nobody wrote down becomes a
   migration nobody resumes.
2. **Ask whether `Modular` is needed at all.** `Classic` takes up to 100 variants
   per product. If no product has more, the cheaper way out is
   `target.catalogModel: Classic` and a re-run of `plan`, with no copy job.
   Over 100, `Modular` is the only model that fits and the wait is the price.
   Do not split products to fit `Classic`.
3. **Check what the copy job requires**, in the guide's
   [prerequisites](https://docs.commercetools.com/guides/migration-guides/modular-catalog-migration.md#all-products-use-standalone-prices):
   every product on Standalone Prices (the job fails while any variant still
   carries an embedded price, and `preflight` reports how many products do), the
   [API Client scopes](https://docs.commercetools.com/guides/migration-guides/modular-catalog-migration.md#api-client-scopes)
   the guide lists, and a full run on a non-production project first.
4. **Have the project owner request the copy job** from commercetools support,
   as the guide's
   [request section](https://docs.commercetools.com/guides/migration-guides/modular-catalog-migration.md#request-the-variant-copy-job-and-product-search-support-for-inmigration-mode)
   describes: region, project key, a time window, confirmation that all products
   use Standalone Prices, and Product Search's `InMigration` mode if the project
   uses it. The job drops existing standalone Variants before it copies, so one
   that exists only as a standalone Variant is lost; that is why the guide has the
   customer's integrations write both representations in the meantime.
5. **Wait for the job to succeed and for support's consistency report**, which
   lists the products whose embedded and standalone variant counts differ. Do not
   poll, retry or load in the meantime. The user says when the job has succeeded
   and what the report showed.
6. **Finish the guide until the project is on `Modular`**, then confirm it:
   `preflight` prints `model Modular`. Set `target.catalogModel` to `Modular` if
   it does not say so, re-run `plan`, run `preflight`, and continue with the
   workflow's load step.

## A project in InMigration

`InMigration` is the middle of the staged migration. In it, every Variant write
has to reach both the embedded and the standalone representation, and a load
writes only one. A variant written only as embedded data is not visible to carts,
orders or discount matching, which resolve standalone Variants, so the two drift
apart. Do not load. Finish the migration with the project owner, confirm that
`preflight` prints `model Modular`, then continue as in the last step above.

## Checklist

- [ ] Step 0 recorded whether the target project holds products.
- [ ] An empty project was switched only after an explicit yes, with the flag or
      by hand, and the change is in `DECISIONS.md`.
- [ ] For a project with products, the user was told before more adapter work,
      the wait is an open question with an owner, and nothing loaded until the
      copy job had succeeded and `preflight` reported `Modular`.
- [ ] `plan` was re-run after any change of `target.catalogModel`.
