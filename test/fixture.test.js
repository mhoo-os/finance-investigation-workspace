import assert from 'node:assert/strict';
import test from 'node:test';
import { BANK_ARTIFACT, BANK_OBJECT_KEY, CLOVER_ARTIFACT, CLOVER_OBJECT_KEY, sha256Hex, syntheticDataset } from '../src/fixture.js';

test('preserves two unchanged synthetic artifacts with SHA-256 receipts', async () => {
  const dataset = await syntheticDataset();
  assert.equal(dataset.artifacts.length, 2);
  assert.deepEqual(dataset.artifacts.map((artifact) => artifact.objectKey), [BANK_OBJECT_KEY, CLOVER_OBJECT_KEY]);
  assert.equal(dataset.artifacts[0].raw, BANK_ARTIFACT);
  assert.equal(dataset.artifacts[1].raw, CLOVER_ARTIFACT);
  assert.equal(dataset.artifacts[0].sha256, await sha256Hex(BANK_ARTIFACT));
  assert.equal(dataset.artifacts[1].sha256, await sha256Hex(CLOVER_ARTIFACT));
});

test('normalizes linked records and exposes one match and one deliberate anomaly', async () => {
  const dataset = await syntheticDataset();
  assert.deepEqual(dataset.coverage, { month: '2026-01', bankRows: 2, cloverRows: 2, status: 'COMPLETE' });
  assert.equal(dataset.records.length, 4);
  assert.deepEqual(dataset.findings.map((finding) => finding.status), ['MATCHED', 'OPEN']);
  assert.equal(dataset.findings[0].expectedCents, dataset.findings[0].observedCents);
  assert.equal(dataset.findings[1].expectedCents - dataset.findings[1].observedCents, 150);
});

test('each finding traces to exact source artifact rows', async () => {
  const dataset = await syntheticDataset();
  const records = new Map(dataset.records.map((record) => [record.id, record]));
  for (const finding of dataset.findings) {
    for (const id of [finding.bankRecordId, finding.cloverRecordId]) {
      const record = records.get(id);
      assert.ok(record, `missing normalized record ${id}`);
      assert.match(record.artifactKey, /^evidence\/synthetic\//);
      assert.match(record.sourceRow, /^\/(transactions|settlements)\/\d+$/);
    }
  }
});
