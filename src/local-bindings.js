import { sha256Hex } from './fixture.js';

const cloneTables = (tables) => structuredClone(tables);
const sortBy = (rows, key) => [...rows].sort((left, right) => String(left[key]).localeCompare(String(right[key])));

export class MemoryD1 {
  constructor() {
    this.tables = {
      evidenceArtifacts: new Map(),
      importReceipts: new Map(),
      normalizedRecords: new Map(),
      monthlyCoverage: new Map(),
      reconciliationFindings: new Map(),
    };
  }

  prepare(sql) {
    return {
      bind: (...values) => ({ sql, values }),
      all: async () => ({ results: this.#select(sql) }),
    };
  }

  async batch(statements) {
    const snapshot = cloneTables(this.tables);
    try {
      for (const statement of statements) this.#apply(statement);
    } catch (error) {
      this.tables = snapshot;
      throw error;
    }
    return statements.map(() => ({ success: true }));
  }

  #apply({ sql, values }) {
    if (sql.startsWith('INSERT OR IGNORE INTO evidence_artifacts')) {
      const [objectKey, sourceKind, sha256, bytes, rowCount] = values;
      if (!this.tables.evidenceArtifacts.has(objectKey)) {
        this.tables.evidenceArtifacts.set(objectKey, { objectKey, sourceKind, sha256, bytes, rowCount });
      }
      return;
    }
    if (sql.startsWith('INSERT OR IGNORE INTO import_receipts')) {
      const [receiptId, objectKey, sha256, importedAt] = values;
      if (!this.tables.importReceipts.has(receiptId)) {
        this.tables.importReceipts.set(receiptId, { receiptId, objectKey, sha256, importedAt });
      }
      return;
    }
    if (sql.startsWith('INSERT OR IGNORE INTO normalized_records')) {
      const [id, sourceKind, postedOn, amountCents, recordType, artifactKey, sourceRow] = values;
      if (!this.tables.normalizedRecords.has(id)) this.tables.normalizedRecords.set(id, { id, sourceKind, postedOn, amountCents, recordType, artifactKey, sourceRow });
      return;
    }
    if (sql.startsWith('INSERT OR IGNORE INTO monthly_coverage')) {
      const [month, bankRows, cloverRows, status] = values;
      if (!this.tables.monthlyCoverage.has(month)) this.tables.monthlyCoverage.set(month, { month, bankRows, cloverRows, status });
      return;
    }
    if (sql.startsWith('INSERT OR IGNORE INTO reconciliation_findings')) {
      const [id, type, status, expectedCents, observedCents, bankRecordId, cloverRecordId, explanation] = values;
      if (!this.tables.reconciliationFindings.has(id)) this.tables.reconciliationFindings.set(id, { id, type, status, expectedCents, observedCents, bankRecordId, cloverRecordId, explanation });
      return;
    }
    throw new Error(`Unsupported local D1 statement: ${sql}`);
  }

  #select(sql) {
    if (sql.includes('FROM monthly_coverage')) return sortBy(this.tables.monthlyCoverage.values(), 'month');
    if (sql.includes('FROM reconciliation_findings')) return sortBy(this.tables.reconciliationFindings.values(), 'id');
    if (sql.includes('FROM normalized_records')) return sortBy(this.tables.normalizedRecords.values(), 'id');
    if (sql.includes('FROM evidence_artifacts')) return sortBy(this.tables.evidenceArtifacts.values(), 'objectKey');
    if (sql.includes('FROM import_receipts')) return sortBy(this.tables.importReceipts.values(), 'objectKey');
    throw new Error(`Unsupported local D1 query: ${sql}`);
  }
}

export class MemoryR2 {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    const raw = typeof value === 'string' ? value : new TextDecoder().decode(value);
    if (options.sha256 && await sha256Hex(raw) !== options.sha256) throw new Error(`R2 SHA-256 mismatch: ${key}`);
    if (options.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
    const object = {
      key,
      raw,
      size: new TextEncoder().encode(raw).byteLength,
      customMetadata: { ...options.customMetadata },
      httpMetadata: { ...options.httpMetadata },
    };
    this.objects.set(key, object);
    return { ...object };
  }

  async get(key) {
    const object = this.objects.get(key);
    if (!object) return null;
    const bytes = new TextEncoder().encode(object.raw);
    return { ...object, arrayBuffer: async () => bytes.slice().buffer };
  }
}

export function createMemoryEnvironment({ assets } = {}) {
  return {
    ASSETS: assets,
    DATA_CLASSIFICATION: 'SYNTHETIC_ONLY',
    DB: new MemoryD1(),
    EVIDENCE: new MemoryR2(),
  };
}
