CREATE TABLE IF NOT EXISTS evidence_artifacts (
  object_key TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('BANK', 'CLOVER')),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  CHECK (object_key LIKE 'evidence/synthetic/sha256/%')
);

CREATE TABLE IF NOT EXISTS import_receipts (
  receipt_id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL REFERENCES evidence_artifacts(object_key),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  imported_at TEXT NOT NULL,
  UNIQUE(object_key, sha256)
);

CREATE TABLE IF NOT EXISTS normalized_records (
  record_id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('BANK', 'CLOVER')),
  posted_on TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  record_type TEXT NOT NULL CHECK (record_type IN ('DEPOSIT', 'SETTLEMENT')),
  artifact_key TEXT NOT NULL REFERENCES evidence_artifacts(object_key),
  source_row TEXT NOT NULL,
  CHECK (artifact_key LIKE 'evidence/synthetic/sha256/%')
);

CREATE TABLE IF NOT EXISTS monthly_coverage (
  month TEXT PRIMARY KEY,
  bank_rows INTEGER NOT NULL,
  clover_rows INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status = 'COMPLETE')
);

CREATE TABLE IF NOT EXISTS reconciliation_findings (
  finding_id TEXT PRIMARY KEY,
  finding_type TEXT NOT NULL CHECK (finding_type IN ('MATCHED_DEPOSIT', 'SETTLEMENT_DIFFERENCE')),
  status TEXT NOT NULL CHECK (status IN ('MATCHED', 'OPEN')),
  expected_cents INTEGER NOT NULL,
  observed_cents INTEGER NOT NULL,
  bank_record_id TEXT NOT NULL REFERENCES normalized_records(record_id),
  clover_record_id TEXT REFERENCES normalized_records(record_id),
  explanation TEXT NOT NULL
);
