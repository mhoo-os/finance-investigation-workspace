# Finance Investigation Workspace

This is the narrow, synthetic-only MHO-229 prototype. It does not deploy, connect to providers, use OAuth or credentials, or contain client data.

## What the slice proves

- Exact synthetic bank and Clover JSON bytes are written to the `EVIDENCE` R2-compatible binding.
- SHA-256 receipts, artifact metadata, normalized rows, monthly coverage, and deterministic reconciliation findings are written to D1.
- January 2026 is complete: two bank rows and two Clover rows.
- One deposit is deterministically matched at $100.00; one deliberate $1.50 settlement difference is an open anomaly.
- Every record and finding stores an exact evidence object key and JSON-pointer row reference.

`src/ingest.js` exports the deliberate local fixture-ingestion function. It is not exposed as an HTTP route, so the Worker has no data-mutating public endpoint.

## Local checks and preview

```sh
npm test
npm run check
npm run preview
```

The preview command copies the static, accessible [preview](public/index.html) into a local ignored artifact. It is an inspectable synthetic UI state only; it does not start a Worker or deploy anything.

Apply `schemas/0001_synthetic_finance.sql` only to a disposable local D1-compatible database, then call `ingestSyntheticEvidence` from a local harness with local `DB` and `EVIDENCE` bindings. Never use a production database or bucket.
