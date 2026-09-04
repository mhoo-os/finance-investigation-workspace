CREATE TRIGGER IF NOT EXISTS evidence_artifacts_no_update
BEFORE UPDATE ON evidence_artifacts BEGIN
  SELECT RAISE(ABORT, 'evidence_artifacts is append-only');
END;

CREATE TRIGGER IF NOT EXISTS evidence_artifacts_no_delete
BEFORE DELETE ON evidence_artifacts BEGIN
  SELECT RAISE(ABORT, 'evidence_artifacts is append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_receipts_no_update
BEFORE UPDATE ON import_receipts BEGIN
  SELECT RAISE(ABORT, 'import_receipts is append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_receipts_no_delete
BEFORE DELETE ON import_receipts BEGIN
  SELECT RAISE(ABORT, 'import_receipts is append-only');
END;

CREATE TRIGGER IF NOT EXISTS normalized_records_no_update
BEFORE UPDATE ON normalized_records BEGIN
  SELECT RAISE(ABORT, 'normalized_records is append-only');
END;

CREATE TRIGGER IF NOT EXISTS normalized_records_no_delete
BEFORE DELETE ON normalized_records BEGIN
  SELECT RAISE(ABORT, 'normalized_records is append-only');
END;
