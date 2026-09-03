import { syntheticDataset } from './fixture.js';

const byteLength = (value) => new TextEncoder().encode(value).byteLength;

export async function ingestSyntheticEvidence(env) {
  const dataset = await syntheticDataset();
  const statements = [];

  for (const artifact of dataset.artifacts) {
    await env.EVIDENCE.put(artifact.objectKey, artifact.raw, { httpMetadata: { contentType: 'application/json' } });
    statements.push(
      env.DB.prepare('INSERT OR REPLACE INTO evidence_artifacts (object_key, source_kind, sha256, bytes, row_count) VALUES (?, ?, ?, ?, ?)')
        .bind(artifact.objectKey, artifact.sourceKind, artifact.sha256, byteLength(artifact.raw), artifact.rows.length),
      env.DB.prepare('INSERT OR REPLACE INTO import_receipts (receipt_id, object_key, sha256, imported_at) VALUES (?, ?, ?, ?)')
        .bind(`sha256:${artifact.sha256}`, artifact.objectKey, artifact.sha256, '2026-01-31T00:00:00.000Z'),
    );
  }
  for (const record of dataset.records) {
    statements.push(env.DB.prepare('INSERT OR REPLACE INTO normalized_records (record_id, source_kind, posted_on, amount_cents, record_type, artifact_key, source_row) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(record.id, record.sourceKind, record.postedOn, record.amountCents, record.recordType, record.artifactKey, record.sourceRow));
  }
  const coverage = dataset.coverage;
  statements.push(env.DB.prepare('INSERT OR REPLACE INTO monthly_coverage (month, bank_rows, clover_rows, status) VALUES (?, ?, ?, ?)')
    .bind(coverage.month, coverage.bankRows, coverage.cloverRows, coverage.status));
  for (const finding of dataset.findings) {
    statements.push(env.DB.prepare('INSERT OR REPLACE INTO reconciliation_findings (finding_id, finding_type, status, expected_cents, observed_cents, bank_record_id, clover_record_id, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(finding.id, finding.type, finding.status, finding.expectedCents, finding.observedCents, finding.bankRecordId, finding.cloverRecordId, finding.explanation));
  }
  await env.DB.batch(statements);
  return dataset;
}
