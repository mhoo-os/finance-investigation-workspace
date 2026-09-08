# Finance Investigation Workspace working instructions

## Scope and source

- This repository owns the synthetic MHO-229 prototype and the separately
  reviewed MHO-231 staging candidate. Start with [README.md](README.md),
  [CLAUDE.md](CLAUDE.md), the linked issue, and its existing checkpoint/PR.
- Native Finance implementation belongs to `mhoo-os/mhoo-twenty-next` under
  the accepted ADR-0009 linked in README. Do not turn this prototype into a
  second production Finance authority or import real client/provider data.
- Verify origin, remote default branch, exact source head, worktrees, and dirty
  files before edits. Fetch/read remote source before declaring instructions
  absent. Use an isolated branch; preserve other workers' branches and receipts.
- Recheck dated status against the issue and exact PR head. Old task instructions,
  unchecked issue boxes, local stale ADRs, and CI summaries do not override
  current accepted ownership or create permission to resume completed work.

## Reuse the existing run ledger before execution

- Consult the issue's existing checkpoint/evidence index and linked PR/CI receipts
  before tests, probes, or dispatch. Retain their location; do not create a parallel
  ledger. If the checkpoint is unavailable, report the exact missing reference.
- Reuse proof only while its inputs and scope match. Before a rerun, record the
  changed source/configuration/fixture, missing proof, or required freshness that
  invalidated it. Required gates still apply; explain reuse rather than omitting
  checks silently. PR #2 receipts apply to its head, not to main or a new candidate.
- Record each run's actual timestamp, source/script hash, target environment,
  safe command, passed/failed/incomplete result, evidence pointer, proved scope,
  and remaining gaps in the existing ledger. Preserve failures and earlier proof.
  Deployment, restart, configuration or binding changes invalidate related live
  observations. Local and CI proof never establishes deployment or recovery.
- Keep private payloads, credentials, tokens, and production identifiers out of
  Git and public receipts. Use protected evidence references where appropriate.

## Commands and evidence integrity

- Node.js 24 matches `.github/workflows/ci.yml`. `package.json` defines
  `npm test` (Node tests), `npm run coverage` (95% line/branch/function gates),
  and `npm run check` (JavaScript syntax). Run these before a PR as required by
  CLAUDE.md. Install pinned dependencies with `npm ci`; also run
  `npm run deploy:check` for staging packaging only (`--dry-run`). There is no
  application build, lint, or browser-E2E script on this base.
- `npm start` / `npm run preview` seeds disposable in-memory bindings and serves
  localhost. Do not use a production database/bucket. No deployment is authorized
  by these commands or by this setup work.
- Preserve raw synthetic bytes, content-addressed R2 keys, SHA-256 receipts,
  append-safe ingestion, and exact source-row pointers. Fixture changes require
  their focused tests. Do not weaken synthetic classification or integrity gates.
- Preserve existing README content and attribution. Never hand-edit generated
  Mhoo context blocks. Request central catalog changes from the coordinator;
  use its governed generator when applicable, not duplicated architecture text.

## Continue, finish, or escalate

Before continuation or handoff, record the primary issue (or explicitly none), implementation-owning repository, coordinating repo head and retained worker (or none), exact source commit and PR/evidence links, existing run-ledger location, dependencies/blockers and their owners (or explicitly none/unknown), and the authorized next step. Carry this mapping into the handoff and acknowledge the authoritative instructions commit and reading path. Resolve unknown or conflicting ownership with the owning head before dependent work; a project label or issue status does not grant authority or create a new task.

- Continue only the coordinator's explicit issue/repository scope. Existing
  workers retain custody until an acknowledged handoff and notification; do not
  duplicate or interrupt them. Setup documentation is not feature/runtime work.
- Finish with exact base/head, changed files, validation and evidence references,
  unresolved gates, next action/owner, and approval boundary. A proposed PR is not
  merged or available in retained checkouts until their source incorporates it.
- Escalate ownership conflicts, unavailable ledgers, stale candidate proof, or
  required external authorization. MHO-231 staging needs its own owner decisions
  and execution authorization. Never infer merge, deployment, Access/DNS changes,
  credentials, real-data imports, teardown, or cleanup deletion from setup scope.
- When the scoped deliverable is ready for review, report it and wait for handoff;
  do not invent follow-on work or classify unknown files/resources as disposable.
