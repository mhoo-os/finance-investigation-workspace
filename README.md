# Finance Investigation Workspace

This repository contains the narrow, synthetic-only MHO-229 prototype and the staging-only MHO-231 deployment contract. It does not connect to providers, contain client data, or authorize production deployment.

## What the slice proves

- Exact synthetic bank and Clover JSON bytes are written once under content-addressed keys in the `EVIDENCE` R2-compatible binding. Existing bytes must match their key or ingestion stops.
- SHA-256 receipts, artifact metadata, normalized rows, monthly coverage, and deterministic reconciliation findings are written to D1.
- January 2026 is complete: two bank rows and two Clover rows.
- One deposit is deterministically matched at $100.00; one deliberate $1.50 settlement difference is an open anomaly.
- Normalized records and reconciliation findings are derived from the preserved JSON rows, and every result stores an exact evidence object key and JSON-pointer row reference.

`src/ingest.js` exports the deliberate fixture-ingestion function. Locally it is called before the preview starts. The in-memory local adapter explicitly sets `DEPLOYMENT_ENV=local`; every missing, empty, or unsupported deployment mode returns 503 before routing or binding access. Staging exposes ingestion only as the `POST /ops/seed-synthetic` route after Cloudflare Access authentication and the server-side `DATA_CLASSIFICATION=SYNTHETIC_ONLY` check. The local read endpoint is public only with that synthetic-only boundary. In staging, every asset and API path additionally requires a verified Cloudflare Access assertion; missing Access configuration returns 503 and invalid or absent assertions return 401. Non-synthetic artifact paths are always rejected.

## Local checks and preview

```sh
npm test
npm run coverage
npm run check
npm start
```

`npm start` seeds dependency-free, in-memory R2- and D1-compatible local bindings, starts the Worker adapter on `http://127.0.0.1:8787`, and serves the data-driven [preview](public/index.html). The UI displays loading, empty, failure, and ready states from `/api/investigation`; it never hard-codes a successful investigation. Stop it with Ctrl-C.

`wrangler.jsonc` binds the explicitly named staging Worker, D1 database, and R2 bucket. The [staging runbook](docs/staging-runbook.md) records the Access decision gate, controlled deployment, evidence receipt, rollback, and approval-gated teardown procedure. Never use a production database, bucket, route, or DNS zone.

## Evidence custody

Each R2 key includes the artifact's SHA-256. The write uses an R2 create-only condition plus the platform SHA-256 integrity option. A retry verifies any existing object's bytes and preserves the first D1 import receipt rather than overwriting either side of the custody record. D1 rejects update/delete, conflicting `INSERT OR REPLACE`, and conflicting UPSERT attempts for evidence artifacts, import receipts, and normalized records; exact `INSERT OR IGNORE` retries remain idempotent. The import clock is injectable for deterministic tests and records the real import time in normal use.

The read API independently re-opens every reported R2 object, hashes its exact bytes against the immutable D1 receipt, and dereferences every normalized record's JSON pointer. It also recomputes monthly coverage and reconciliation findings from those verified records. It returns no investigation data if an object is missing, bytes or receipt metadata differ, a pointer fails to identify the expected source row, normalized rows do not cover the source artifact, or stored coverage/findings differ from the recomputed results.

The investigator preview shows the content-addressed R2 object key, SHA-256 receipt, and exact JSON pointer for every coverage row and reconciliation finding. No successful preview values are hard-coded in the browser bundle.

## Repository setup and status

The canonical repository is `mhoo-os/finance-investigation-workspace`; its default
branch is `main`. Read [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) before
working here. This repository preserves the standalone synthetic prototype.
Native `@mhoo/finance` belongs to `mhoo-os/mhoo-twenty-next` under accepted
[ADR-0009](https://github.com/mhoo-os/mhoo/blob/92e43a7b9a59570c76729fb5f8850c66bda6ef78/ADR/0009-finance-six-year-forensic-review.md).
Neither the project name nor a successful synthetic run authorizes real data.

Evidence snapshot, checked 2026-09-08 (recheck before acting):

- [MHO-229](https://linear.app/mhoo/issue/MHO-229) is Done. [PR #1](https://github.com/mhoo-os/finance-investigation-workspace/pull/1)
  merged as `9de7f22fb15afa2b4f69a0b405f2d377dd33dc4a`; its
  [CI receipt](https://github.com/mhoo-os/finance-investigation-workspace/actions/runs/33765649939)
  and [preview source](public/index.html) describe the local synthetic slice.
- [MHO-231](https://linear.app/mhoo/issue/MHO-231) is In Review. [PR #2](https://github.com/mhoo-os/finance-investigation-workspace/pull/2), head
  `8fa8e3eafe0be600109d2fb76cb771dab785d91d`, contains separate staging work with a
  [successful CI receipt](https://github.com/mhoo-os/finance-investigation-workspace/actions/runs/33940423375).
  This candidate integrates that staging source with the setup instructions from
  main at `a335d9f50d0aa65cbb3558dc66e328e18316a94f`. The receipt above is historical;
  use PR #2's current-head checks for reconciliation proof. Source merge readiness
  is separate from staging deployment and operational acceptance. The exact
  hostname, allowed principal, team domain, audience and separate Access execution
  authorization remain deployment gates; do not guess them.

Accepted [ADR-0015](https://github.com/mhoo-os/mhoo/blob/1120e155df9fe999d95a0d43153145c838769328/ADR/0015-portable-finance-clover-products.md)
selects this existing repository as the Finance product destination while preserving
MHO-229/231 as separate synthetic scope. Native source stays in `mhoo-twenty-next`
until reviewed extraction; this reconciliation adds no adapter or duplicate UI.

Use Node.js 24, matching [CI](.github/workflows/ci.yml). Run `npm ci` first.
[package.json](package.json) defines the tests and syntax checks above, plus
`npm run deploy:check`, a staging packaging **dry run** with no deployment.
`npm run preview` aliases `npm start`. There is no application build or live
deployment script. CI on pull requests and main performs checks and the dry run
only; source merge does not configure Access, migrate, seed, or deploy staging.

Before probes or tests, consult the issue's existing checkpoint and linked PR/CI
receipts. Keep subsequent results in that same run ledger, including exact source,
environment, result, evidence location, and invalidation conditions. Follow the
handoff rules in [AGENTS.md](AGENTS.md); do not create another tracking system.
