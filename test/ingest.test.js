import assert from 'node:assert/strict';
import test from 'node:test';
import { BANK_OBJECT_KEY, CLOVER_OBJECT_KEY } from '../src/fixture.js';
import { ingestSyntheticEvidence } from '../src/ingest.js';

test('ingestion writes preserved evidence and D1 normalization statements', async () => {
  const objects = new Map();
  const statements = [];
  const env = {
    EVIDENCE: { put: async (key, value) => objects.set(key, value) },
    DB: {
      prepare: (sql) => ({ bind: (...values) => ({ sql, values }) }),
      batch: async (batch) => statements.push(...batch),
    },
  };
  const dataset = await ingestSyntheticEvidence(env);
  assert.equal(objects.get(BANK_OBJECT_KEY), dataset.artifacts[0].raw);
  assert.equal(objects.get(CLOVER_OBJECT_KEY), dataset.artifacts[1].raw);
  assert.equal(statements.length, 11);
  assert.equal(statements.filter((statement) => statement.sql.includes('normalized_records')).length, 4);
  assert.equal(statements.filter((statement) => statement.sql.includes('reconciliation_findings')).length, 2);
});
