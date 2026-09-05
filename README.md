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
