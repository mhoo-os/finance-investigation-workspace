const encoder = new TextEncoder();

// These exact strings are the preserved evidence bytes. Keep their whitespace stable.
export const EVIDENCE_PREFIX = 'evidence/synthetic/sha256';

export const BANK_ARTIFACT = `{
  "source":"synthetic-bank",
  "month":"2026-01",
  "transactions":[
    {"id":"bank-deposit-match-001","postedOn":"2026-01-15","amountCents":10000,"description":"Clover settlement"},
    {"id":"bank-deposit-anomaly-002","postedOn":"2026-01-22","amountCents":4200,"description":"Clover settlement"}
  ]
}`;

export const CLOVER_ARTIFACT = `{
  "source":"synthetic-clover",
  "month":"2026-01",
  "settlements":[
    {"id":"clover-settlement-match-001","settledOn":"2026-01-15","netCents":10000,"batch":"SYN-001"},
    {"id":"clover-settlement-anomaly-002","settledOn":"2026-01-22","netCents":4050,"batch":"SYN-002"}
  ]
}`;

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function dereferenceArtifact(raw, pointer) {
  if (!pointer.startsWith('/')) throw new Error(`Invalid JSON pointer: ${pointer}`);
  return pointer.slice(1).split('/').reduce((value, segment) => {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    if (value === null || value === undefined || !(key in Object(value))) {
      throw new Error(`JSON pointer does not resolve: ${pointer}`);
    }
    return value[key];
  }, JSON.parse(raw));
}

function validateArtifact(parsed, { source, month, rowsKey, amountKey, dateKey }) {
  if (parsed.source !== source || parsed.month !== month || !Array.isArray(parsed[rowsKey])) {
    throw new Error(`Invalid ${source} synthetic artifact contract`);
  }
  for (const row of parsed[rowsKey]) {
    if (typeof row.id !== 'string' || typeof row[dateKey] !== 'string' || !Number.isInteger(row[amountKey])) {
      throw new Error(`Invalid ${source} synthetic row`);
    }
  }
}

async function buildArtifact({ filename, sourceKind, raw, rowsKey, source, month, amountKey, dateKey }) {
  const parsed = JSON.parse(raw);
  validateArtifact(parsed, { source, month, rowsKey, amountKey, dateKey });
  const sha256 = await sha256Hex(raw);
  return {
    objectKey: `${EVIDENCE_PREFIX}/${sourceKind.toLowerCase()}/${sha256}/${filename}`,
    sourceKind,
    raw,
    sha256,
    rows: parsed[rowsKey],
    rowsKey,
    amountKey,
    dateKey,
    month: parsed.month,
  };
}

export async function syntheticDataset({ bankRaw = BANK_ARTIFACT, cloverRaw = CLOVER_ARTIFACT } = {}) {
  const [bank, clover] = await Promise.all([
    buildArtifact({ filename: 'bank-january-2026.json', sourceKind: 'BANK', raw: bankRaw, rowsKey: 'transactions', source: 'synthetic-bank', month: '2026-01', amountKey: 'amountCents', dateKey: 'postedOn' }),
    buildArtifact({ filename: 'clover-january-2026.json', sourceKind: 'CLOVER', raw: cloverRaw, rowsKey: 'settlements', source: 'synthetic-clover', month: '2026-01', amountKey: 'netCents', dateKey: 'settledOn' }),
  ]);

  const records = [bank, clover].flatMap((artifact) => artifact.rows.map((row, index) => ({
    id: row.id,
    sourceKind: artifact.sourceKind,
    postedOn: row[artifact.dateKey],
    amountCents: row[artifact.amountKey],
    recordType: artifact.sourceKind === 'BANK' ? 'DEPOSIT' : 'SETTLEMENT',
    artifactKey: artifact.objectKey,
    sourceRow: `/${artifact.rowsKey}/${index}`,
  })));

  const bankRecords = records.filter((record) => record.sourceKind === 'BANK');
  const cloverRecords = records.filter((record) => record.sourceKind === 'CLOVER');
  const findings = bankRecords.map((bankRecord, index) => {
    const candidates = cloverRecords.filter((record) => record.postedOn === bankRecord.postedOn);
    if (candidates.length !== 1) throw new Error(`Expected one Clover settlement for ${bankRecord.postedOn}`);
    const cloverRecord = candidates[0];
    const matched = bankRecord.amountCents === cloverRecord.amountCents;
    return {
      id: matched ? `matched-deposit-${index + 1}` : `settlement-difference-${index + 1}`,
      type: matched ? 'MATCHED_DEPOSIT' : 'SETTLEMENT_DIFFERENCE',
      status: matched ? 'MATCHED' : 'OPEN',
      expectedCents: bankRecord.amountCents,
      observedCents: cloverRecord.amountCents,
      bankRecordId: bankRecord.id,
      cloverRecordId: cloverRecord.id,
      explanation: matched
        ? 'Exact synthetic bank deposit and Clover settlement amount/date match.'
        : `Deliberate synthetic $${((bankRecord.amountCents - cloverRecord.amountCents) / 100).toFixed(2)} difference; review source rows before drawing a conclusion.`,
    };
  });

  return {
    artifacts: [bank, clover],
    records,
    coverage: { month: bank.month, bankRows: bank.rows.length, cloverRows: clover.rows.length, status: 'COMPLETE' },
    findings,
  };
}
