import { dereferenceArtifact, sha256Hex } from './fixture.js';

const json = (value, status = 200) => new Response(JSON.stringify(value, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const SYNTHETIC_ONLY = 'SYNTHETIC_ONLY';
const SOURCE_CONTRACTS = {
  BANK: { dateKey: 'postedOn', amountKey: 'amountCents', recordType: 'DEPOSIT' },
  CLOVER: { dateKey: 'settledOn', amountKey: 'netCents', recordType: 'SETTLEMENT' },
};

function requireEvidence(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyPreservedEvidence(env, artifacts, receipts, records) {
  requireEvidence(receipts.length === artifacts.length, 'Evidence receipts do not match artifacts');
  await Promise.all(artifacts.map(async (artifact) => {
    const artifactReceipts = receipts.filter((receipt) => receipt.objectKey === artifact.objectKey);
    requireEvidence(artifactReceipts.length === 1, `Artifact receipt is missing or ambiguous: ${artifact.objectKey}`);
    const [receipt] = artifactReceipts;
    requireEvidence(receipt.sha256 === artifact.sha256, `Artifact receipt hash does not match: ${artifact.objectKey}`);
    requireEvidence(artifact.objectKey.includes(`/${artifact.sourceKind.toLowerCase()}/${artifact.sha256}/`), `Artifact key is not content-addressed: ${artifact.objectKey}`);

    const preserved = await env.EVIDENCE.get(artifact.objectKey);
    requireEvidence(preserved !== null, `Preserved evidence is missing: ${artifact.objectKey}`);
    requireEvidence(typeof preserved.arrayBuffer === 'function', `Preserved evidence body is unavailable: ${artifact.objectKey}`);
    const bytes = await preserved.arrayBuffer();
    requireEvidence(bytes.byteLength === artifact.bytes, `Preserved evidence size does not match: ${artifact.objectKey}`);
    requireEvidence(await sha256Hex(bytes) === receipt.sha256, `Preserved evidence hash does not match: ${artifact.objectKey}`);

    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const artifactRecords = records.filter((record) => record.artifactKey === artifact.objectKey);
    for (const record of artifactRecords) {
      const contract = SOURCE_CONTRACTS[record.sourceKind];
      requireEvidence(contract !== undefined, `Unsupported evidence source: ${record.sourceKind}`);
      requireEvidence(record.sourceKind === artifact.sourceKind, `Record source does not match its artifact: ${record.id}`);
      requireEvidence(record.recordType === contract.recordType, `Record type does not match its source: ${record.id}`);
      const source = dereferenceArtifact(raw, record.sourceRow);
      requireEvidence(source.id === record.id, `Evidence pointer identifies the wrong record: ${record.id}`);
      requireEvidence(source[contract.dateKey] === record.postedOn, `Evidence pointer date does not match: ${record.id}`);
      requireEvidence(source[contract.amountKey] === record.amountCents, `Evidence pointer amount does not match: ${record.id}`);
    }
  }));

  for (const record of records) {
    requireEvidence(artifacts.some((artifact) => artifact.objectKey === record.artifactKey), `Record artifact is missing: ${record.id}`);
  }
}

async function listInvestigation(env) {
  const [coverage, findings, records, artifacts, receipts] = await Promise.all([
    env.DB.prepare('SELECT month, bank_rows AS bankRows, clover_rows AS cloverRows, status FROM monthly_coverage ORDER BY month').all(),
    env.DB.prepare('SELECT finding_id AS id, finding_type AS type, status, expected_cents AS expectedCents, observed_cents AS observedCents, bank_record_id AS bankRecordId, clover_record_id AS cloverRecordId, explanation FROM reconciliation_findings ORDER BY finding_id').all(),
    env.DB.prepare('SELECT record_id AS id, source_kind AS sourceKind, posted_on AS postedOn, amount_cents AS amountCents, record_type AS recordType, artifact_key AS artifactKey, source_row AS sourceRow FROM normalized_records ORDER BY record_id').all(),
    env.DB.prepare('SELECT object_key AS objectKey, source_kind AS sourceKind, sha256, bytes, row_count AS rowCount FROM evidence_artifacts ORDER BY object_key').all(),
    env.DB.prepare('SELECT receipt_id AS receiptId, object_key AS objectKey, sha256, imported_at AS importedAt FROM import_receipts ORDER BY object_key').all(),
  ]);
  const byId = new Map(records.results.map((record) => [record.id, record]));
  const traceableFindings = findings.results.map((finding) => {
    const trace = [byId.get(finding.bankRecordId), byId.get(finding.cloverRecordId)].filter(Boolean);
    if (trace.length !== 2) throw new Error(`Finding is missing a source trace: ${finding.id}`);
    return { ...finding, trace };
  });
  const syntheticArtifacts = artifacts.results.every((artifact) => artifact.objectKey.startsWith('evidence/synthetic/sha256/'));
  const syntheticRecords = records.results.every((record) => ['BANK', 'CLOVER'].includes(record.sourceKind)
    && record.artifactKey.startsWith('evidence/synthetic/sha256/'));
  if (!syntheticArtifacts || !syntheticRecords) throw new Error('Synthetic-only data boundary failed');
  await verifyPreservedEvidence(env, artifacts.results, receipts.results, records.results);

  return {
    classification: SYNTHETIC_ONLY,
    access: 'PUBLIC_SYNTHETIC_READ_ONLY',
    coverage: coverage.results,
    artifacts: artifacts.results,
    receipts: receipts.results,
    findings: traceableFindings,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/investigation') {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
      if (env.DATA_CLASSIFICATION !== SYNTHETIC_ONLY) return json({ error: 'Synthetic-only data boundary is unavailable.' }, 503);
      try {
        return json(await listInvestigation(env));
      } catch (error) {
        console.error(JSON.stringify({ message: 'investigation query failed', errorType: error instanceof Error ? error.name : 'UnknownFailure' }));
        return json({ error: 'Investigation data is unavailable.' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
