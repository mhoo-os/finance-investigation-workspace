# MHO-231 protected staging runbook

This runbook is only for the synthetic Cloudflare staging environment. Never substitute a production environment, production DNS zone, provider credential, or client file.

## Fixed staging inventory

| Resource | Staging identifier |
| --- | --- |
| Worker | `mhoo-finance-investigation-staging` |
| D1 | `mhoo-finance-investigation-staging` / `a76c68a5-8f57-4470-9537-7e2f49f893e0` |
| R2 | `mhoo-finance-investigation-staging-evidence` |

Inventory these names before any create operation. MHO-231 records that D1 and R2 already exist, so they must be reused.

## Access gate

The Worker fails closed with HTTP 503 when either `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is absent. When both exist, it verifies the Cloudflare Access JWT issuer, audience, lifetime, subject, signing algorithm, signature, and current Access signing key before routing any browser, asset, API, or seed request.

Do not guess the allowed identity. Deployment can remain in the 503 fail-closed state, but it must not be declared investigator-ready until an authorized owner supplies all three of these values:

1. the exact allowed email address or Access group for the staging policy;
2. the exact Cloudflare Access team domain ending in `.cloudflareaccess.com`;
3. the Access application audience (`AUD`) for this Worker.

The team domain and audience should be supplied through Worker secrets or protected staging configuration, never committed. The Access application and allow policy must cover the Worker hostname and every path.

## Controlled deployment and verification

Run only after confirming the active Cloudflare account and the exact branch head:

```sh
git rev-parse HEAD
wrangler whoami
wrangler d1 list --json
wrangler r2 bucket list
npm ci
npm test
npm run coverage
npm run check
npm run deploy:check
```

Apply the migrations to the named staging D1 database, in order:

```sh
wrangler d1 execute DB --env staging --remote --file schemas/0001_synthetic_finance.sql
wrangler d1 execute DB --env staging --remote --file schemas/0002_staging_append_only.sql
```

Deploy only the explicit staging environment. Never deploy the root configuration:

```sh
wrangler deploy --env staging
```

Before Access configuration is supplied, verify a browser path and API path both return the generic 503 fail-closed response. After the authorized owner configures Access, verify an unauthorized browser request and API request are denied by Access, then use an authorized session to seed exactly once:

```sh
curl --fail-with-body --request POST https://STAGING_HOST/ops/seed-synthetic
```

Use the same authorized session to read `/api/investigation`. Record, without tokens or cookies: deployed Git commit, Worker version/deployment ID, staging URL, D1 ID, R2 bucket, the two object keys and SHA-256 receipts, response status evidence, test output, and CI run.

Verify append-only behavior by retrying the unchanged seed (it must remain idempotent), then attempting a different synthetic payload at an already occupied object key through an isolated verification harness. The conditional R2 write must reject it and the stored SHA-256 must remain unchanged. Do not use or adapt client data for this test.

## Rollback

1. Keep the Access application and fail-closed policy in place.
2. Identify the last known-good staging deployment with `wrangler deployments list --env staging`.
3. Roll back only `mhoo-finance-investigation-staging` with `wrangler rollback VERSION_ID --env staging --name mhoo-finance-investigation-staging`; enter the exact recorded version ID and a reason when prompted.
4. Re-run unauthorized browser/API checks before any authorized read.
5. Do not delete or rewrite R2 evidence, import receipts, or normalized records during an application rollback.

If a safe prior deployment cannot be identified, disable the staging Worker route or leave the Worker missing Access configuration so it returns 503. Do not redirect traffic to another environment.

## Teardown

Teardown requires separate explicit approval because evidence deletion is destructive.

1. Remove or disable the staging Worker route first and confirm it is unreachable.
2. Delete the staging Worker only after recording its final deployment receipt.
3. Export or record the synthetic custody manifest if evidence must be retained for review.
4. Delete only the D1 database ID and R2 bucket named in the inventory table.
5. Remove the matching Access application and policy last.
6. Confirm no production resource or DNS record changed.

Never run teardown commands with a wildcard, an unresolved environment variable, or an unverified account.
