# Finance Investigation Workspace

This is the narrow, synthetic-only MHO-229 prototype. It does not deploy, connect to providers, use OAuth or credentials, or contain client data.

## What the slice proves

- Exact synthetic bank and Clover JSON bytes are written once under content-addressed keys in the `EVIDENCE` R2-compatible binding. Existing bytes must match their key or ingestion stops.
- SHA-256 receipts, artifact metadata, normalized rows, monthly coverage, and deterministic reconciliation findings are written to D1.
- January 2026 is complete: two bank rows and two Clover rows.
- One deposit is deterministically matched at $100.00; one deliberate $1.50 settlement difference is an open anomaly.
- Normalized records and reconciliation findings are derived from the preserved JSON rows, and every result stores an exact evidence object key and JSON-pointer row reference.

`src/ingest.js` exports the deliberate local fixture-ingestion function. It is not exposed as an HTTP route, so the Worker has no data-mutating public endpoint. The read endpoint is deliberately public only when the server-side `DATA_CLASSIFICATION=SYNTHETIC_ONLY` boundary is present; it fails closed otherwise and also rejects non-synthetic artifact paths.

## Local checks and preview

```sh
npm test
npm run coverage
npm run check
npm start
```

`npm start` seeds dependency-free, in-memory R2- and D1-compatible local bindings, starts the Worker adapter on `http://127.0.0.1:8787`, and serves the data-driven [preview](public/index.html). The UI displays loading, empty, failure, and ready states from `/api/investigation`; it never hard-codes a successful investigation. Stop it with Ctrl-C.

`wrangler.toml` documents the equivalent Cloudflare binding contract, including static assets and the synthetic-only flag, but contains placeholder/local identifiers only. No deployment command is provided or authorized. Apply `schemas/0001_synthetic_finance.sql` only to a disposable local D1-compatible database. Never use a production database or bucket.

## Evidence custody

Each R2 key includes the artifact's SHA-256. The write uses an R2 create-only condition plus the platform SHA-256 integrity option. A retry verifies any existing object's bytes and preserves the first D1 import receipt rather than overwriting either side of the custody record. The import clock is injectable for deterministic tests and records the real import time in normal use.

The read API independently re-opens every reported R2 object, hashes its exact bytes against the immutable D1 receipt, and dereferences every normalized record's JSON pointer. It also recomputes monthly coverage and reconciliation findings from those verified records. It returns no investigation data if an object is missing, bytes or receipt metadata differ, a pointer fails to identify the expected source row, normalized rows do not cover the source artifact, or stored coverage/findings differ from the recomputed results.

## Repository setup and status

The canonical repository is `mhoo-os/finance-investigation-workspace`; its default
branch is `main`. Read [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) before
working here. This repository preserves the standalone synthetic prototype.
Native `@mhoo/finance` belongs to `mhoo-os/mhoo-twenty-next` under accepted
[ADR-0009](https://github.com/mhoo-os/mhoo/blob/92e43a7b9a59570c76729fb5f8850c66bda6ef78/ADR/0009-finance-six-year-forensic-review.md).
Neither the project name nor a successful synthetic run authorizes real data.

Evidence snapshot, checked 2026-09-07 (recheck before acting):

- [MHO-229](https://linear.app/mhoo/issue/MHO-229) is Done. [PR #1](https://github.com/mhoo-os/finance-investigation-workspace/pull/1)
  merged as `9de7f22fb15afa2b4f69a0b405f2d377dd33dc4a`; its
  [CI receipt](https://github.com/mhoo-os/finance-investigation-workspace/actions/runs/33765649939)
  and [preview source](public/index.html) describe the local synthetic slice.
- [MHO-231](https://linear.app/mhoo/issue/MHO-231) is In Review. Draft
  [PR #2](https://github.com/mhoo-os/finance-investigation-workspace/pull/2), head
  `8fa8e3eafe0be600109d2fb76cb771dab785d91d`, contains separate staging work with a
  [successful CI receipt](https://github.com/mhoo-os/finance-investigation-workspace/actions/runs/33940423375).
  It is not part of this main-branch slice. Its issue retains owner decisions
  for the exact hostname, allowed principal, and separate Access execution
  authorization; source checks do not establish operational acceptance.

Use Node.js 24, matching [CI](.github/workflows/ci.yml). The commands above come
from [package.json](package.json); `npm run preview` aliases `npm start`.
There is no build or deployment script on this base. Commands from an unmerged
staging branch must not be treated as main-branch commands.

Before probes or tests, consult the issue's existing checkpoint and linked PR/CI
receipts. Keep subsequent results in that same run ledger, including exact source,
environment, result, evidence location, and invalidation conditions. Follow the
handoff rules in [AGENTS.md](AGENTS.md); do not create another tracking system.
