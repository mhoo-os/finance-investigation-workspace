CREATE TABLE IF NOT EXISTS evidence_artifacts (
  object_key TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  row_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS import_receipts (
  receipt_id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL REFERENCES evidence_artifacts(object_key),
  sha256 TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  UNIQUE(object_key, sha256)
);

CREATE TABLE IF NOT EXISTS normalized_records (
  record_id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  posted_on TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  record_type TEXT NOT NULL,
  artifact_key TEXT NOT NULL REFERENCES evidence_artifacts(object_key),
  source_row TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monthly_coverage (
  month TEXT PRIMARY KEY,
  bank_rows INTEGER NOT NULL,
  clover_rows INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reconciliation_findings (
  finding_id TEXT PRIMARY KEY,
  finding_type TEXT NOT NULL,
  status TEXT NOT NULL,
  expected_cents INTEGER NOT NULL,
  observed_cents INTEGER NOT NULL,
  bank_record_id TEXT NOT NULL REFERENCES normalized_records(record_id),
  clover_record_id TEXT REFERENCES normalized_records(record_id),
  explanation TEXT NOT NULL
);
