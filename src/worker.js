const json = (value, status = 200) => new Response(JSON.stringify(value, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function listInvestigation(env) {
  const [coverage, findings, records, artifacts, receipts] = await Promise.all([
    env.DB.prepare('SELECT month, bank_rows AS bankRows, clover_rows AS cloverRows, status FROM monthly_coverage ORDER BY month').all(),
    env.DB.prepare('SELECT finding_id AS id, finding_type AS type, status, expected_cents AS expectedCents, observed_cents AS observedCents, bank_record_id AS bankRecordId, clover_record_id AS cloverRecordId, explanation FROM reconciliation_findings ORDER BY finding_id').all(),
    env.DB.prepare('SELECT record_id AS id, source_kind AS sourceKind, posted_on AS postedOn, amount_cents AS amountCents, record_type AS recordType, artifact_key AS artifactKey, source_row AS sourceRow FROM normalized_records ORDER BY record_id').all(),
    env.DB.prepare('SELECT object_key AS objectKey, source_kind AS sourceKind, sha256, bytes, row_count AS rowCount FROM evidence_artifacts ORDER BY object_key').all(),
    env.DB.prepare('SELECT receipt_id AS receiptId, object_key AS objectKey, sha256, imported_at AS importedAt FROM import_receipts ORDER BY object_key').all(),
  ]);
  const byId = new Map(records.results.map((record) => [record.id, record]));
  return {
    coverage: coverage.results,
    artifacts: artifacts.results,
    receipts: receipts.results,
    findings: findings.results.map((finding) => ({ ...finding, trace: [byId.get(finding.bankRecordId), byId.get(finding.cloverRecordId)].filter(Boolean) })),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/investigation' && request.method === 'GET') return json(await listInvestigation(env));
    return env.ASSETS.fetch(request);
  },
};
