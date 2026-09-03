const encoder = new TextEncoder();

// These exact strings are the preserved evidence bytes. Keep their whitespace stable.
export const BANK_OBJECT_KEY = 'evidence/synthetic/bank-january-2026.json';
export const CLOVER_OBJECT_KEY = 'evidence/synthetic/clover-january-2026.json';

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

export async function syntheticDataset() {
  const bank = JSON.parse(BANK_ARTIFACT);
  const clover = JSON.parse(CLOVER_ARTIFACT);
  const [bankHash, cloverHash] = await Promise.all([sha256Hex(BANK_ARTIFACT), sha256Hex(CLOVER_ARTIFACT)]);

  return {
    artifacts: [
      { objectKey: BANK_OBJECT_KEY, sourceKind: 'BANK', raw: BANK_ARTIFACT, sha256: bankHash, rows: bank.transactions },
      { objectKey: CLOVER_OBJECT_KEY, sourceKind: 'CLOVER', raw: CLOVER_ARTIFACT, sha256: cloverHash, rows: clover.settlements },
    ],
    records: [
      { id: 'bank-deposit-match-001', sourceKind: 'BANK', postedOn: '2026-01-15', amountCents: 10000, recordType: 'DEPOSIT', artifactKey: BANK_OBJECT_KEY, sourceRow: '/transactions/0' },
      { id: 'bank-deposit-anomaly-002', sourceKind: 'BANK', postedOn: '2026-01-22', amountCents: 4200, recordType: 'DEPOSIT', artifactKey: BANK_OBJECT_KEY, sourceRow: '/transactions/1' },
      { id: 'clover-settlement-match-001', sourceKind: 'CLOVER', postedOn: '2026-01-15', amountCents: 10000, recordType: 'SETTLEMENT', artifactKey: CLOVER_OBJECT_KEY, sourceRow: '/settlements/0' },
      { id: 'clover-settlement-anomaly-002', sourceKind: 'CLOVER', postedOn: '2026-01-22', amountCents: 4050, recordType: 'SETTLEMENT', artifactKey: CLOVER_OBJECT_KEY, sourceRow: '/settlements/1' },
    ],
    coverage: { month: '2026-01', bankRows: 2, cloverRows: 2, status: 'COMPLETE' },
    findings: [
      { id: 'matched-deposit-001', type: 'MATCHED_DEPOSIT', status: 'MATCHED', expectedCents: 10000, observedCents: 10000, bankRecordId: 'bank-deposit-match-001', cloverRecordId: 'clover-settlement-match-001', explanation: 'Exact synthetic bank deposit and Clover settlement amount/date match.' },
      { id: 'settlement-difference-002', type: 'SETTLEMENT_DIFFERENCE', status: 'OPEN', expectedCents: 4200, observedCents: 4050, bankRecordId: 'bank-deposit-anomaly-002', cloverRecordId: 'clover-settlement-anomaly-002', explanation: 'Deliberate synthetic $1.50 difference; review source rows before drawing a conclusion.' },
    ],
  };
}
