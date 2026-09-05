CREATE TRIGGER IF NOT EXISTS evidence_artifacts_no_conflicting_insert
BEFORE INSERT ON evidence_artifacts
WHEN EXISTS (
  SELECT 1 FROM evidence_artifacts
  WHERE object_key = NEW.object_key
    AND (source_kind IS NOT NEW.source_kind OR sha256 IS NOT NEW.sha256 OR bytes IS NOT NEW.bytes OR row_count IS NOT NEW.row_count)
) BEGIN
  SELECT RAISE(ABORT, 'evidence_artifacts conflicts with immutable evidence');
END;

CREATE TRIGGER IF NOT EXISTS evidence_artifacts_no_update
BEFORE UPDATE ON evidence_artifacts BEGIN
  SELECT RAISE(ABORT, 'evidence_artifacts is append-only');
END;

CREATE TRIGGER IF NOT EXISTS evidence_artifacts_no_delete
BEFORE DELETE ON evidence_artifacts BEGIN
  SELECT RAISE(ABORT, 'evidence_artifacts is append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_receipts_no_conflicting_insert
BEFORE INSERT ON import_receipts
WHEN EXISTS (
  SELECT 1 FROM import_receipts
  WHERE receipt_id = NEW.receipt_id OR (object_key = NEW.object_key AND sha256 = NEW.sha256)
)
AND NOT EXISTS (
  SELECT 1 FROM import_receipts
  WHERE receipt_id = NEW.receipt_id
    AND object_key = NEW.object_key
    AND sha256 = NEW.sha256
    AND imported_at = NEW.imported_at
) BEGIN
  SELECT RAISE(ABORT, 'import_receipts conflicts with immutable evidence');
END;

CREATE TRIGGER IF NOT EXISTS import_receipts_no_update
BEFORE UPDATE ON import_receipts BEGIN
  SELECT RAISE(ABORT, 'import_receipts is append-only');
END;

CREATE TRIGGER IF NOT EXISTS import_receipts_no_delete
BEFORE DELETE ON import_receipts BEGIN
  SELECT RAISE(ABORT, 'import_receipts is append-only');
END;

CREATE TRIGGER IF NOT EXISTS normalized_records_no_conflicting_insert
BEFORE INSERT ON normalized_records
WHEN EXISTS (
  SELECT 1 FROM normalized_records
  WHERE record_id = NEW.record_id
    AND (source_kind IS NOT NEW.source_kind OR posted_on IS NOT NEW.posted_on OR amount_cents IS NOT NEW.amount_cents OR record_type IS NOT NEW.record_type OR artifact_key IS NOT NEW.artifact_key OR source_row IS NOT NEW.source_row)
) BEGIN
  SELECT RAISE(ABORT, 'normalized_records conflicts with immutable evidence');
END;

CREATE TRIGGER IF NOT EXISTS normalized_records_no_update
BEFORE UPDATE ON normalized_records BEGIN
  SELECT RAISE(ABORT, 'normalized_records is append-only');
END;

CREATE TRIGGER IF NOT EXISTS normalized_records_no_delete
BEFORE DELETE ON normalized_records BEGIN
  SELECT RAISE(ABORT, 'normalized_records is append-only');
END;
