import assert from 'node:assert/strict';
import test from 'node:test';
import { BANK_ARTIFACT, CLOVER_ARTIFACT, dereferenceArtifact, EVIDENCE_PREFIX, sha256Hex, syntheticDataset } from '../src/fixture.js';

test('preserves two unchanged synthetic artifacts with SHA-256 receipts', async () => {
  const dataset = await syntheticDataset();
  assert.equal(dataset.artifacts.length, 2);
  assert.equal(dataset.artifacts[0].raw, BANK_ARTIFACT);
  assert.equal(dataset.artifacts[1].raw, CLOVER_ARTIFACT);
  assert.equal(dataset.artifacts[0].sha256, await sha256Hex(BANK_ARTIFACT));
  assert.equal(dataset.artifacts[1].sha256, await sha256Hex(CLOVER_ARTIFACT));
  for (const artifact of dataset.artifacts) {
    assert.match(artifact.objectKey, new RegExp(`^${EVIDENCE_PREFIX}/${artifact.sourceKind.toLowerCase()}/${artifact.sha256}/`));
  }
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
  const artifacts = new Map(dataset.artifacts.map((artifact) => [artifact.objectKey, artifact]));
  for (const finding of dataset.findings) {
    for (const id of [finding.bankRecordId, finding.cloverRecordId]) {
      const record = records.get(id);
      assert.ok(record, `missing normalized record ${id}`);
      const artifact = artifacts.get(record.artifactKey);
      assert.ok(artifact, `missing artifact ${record.artifactKey}`);
      const source = dereferenceArtifact(artifact.raw, record.sourceRow);
      assert.equal(source.id, record.id);
      assert.equal(source[artifact.dateKey], record.postedOn);
      assert.equal(source[artifact.amountKey], record.amountCents);
    }
    assert.equal(finding.expectedCents, records.get(finding.bankRecordId).amountCents);
    assert.equal(finding.observedCents, records.get(finding.cloverRecordId).amountCents);
  }
});

test('rejects invalid or unresolved evidence pointers', () => {
  assert.throws(() => dereferenceArtifact(BANK_ARTIFACT, 'transactions/0'), /Invalid JSON pointer/);
  assert.throws(() => dereferenceArtifact(BANK_ARTIFACT, '/transactions/9'), /does not resolve/);
});

test('rejects malformed synthetic artifact envelopes and rows', async () => {
  const bank = JSON.parse(BANK_ARTIFACT);
  for (const mutate of [
    (value) => { value.source = 'real-bank'; },
    (value) => { value.month = '2026-02'; },
    (value) => { value.transactions = {}; },
    (value) => { value.transactions[0].id = 7; },
    (value) => { value.transactions[0].postedOn = null; },
    (value) => { value.transactions[0].amountCents = 100.5; },
  ]) {
    const malformed = structuredClone(bank);
    mutate(malformed);
    await assert.rejects(syntheticDataset({ bankRaw: JSON.stringify(malformed) }), /Invalid synthetic-bank/);
  }
});

test('rejects reconciliation without exactly one same-day settlement', async () => {
  const clover = JSON.parse(CLOVER_ARTIFACT);
  clover.settlements[0].settledOn = '2026-01-16';
  await assert.rejects(syntheticDataset({ cloverRaw: JSON.stringify(clover) }), /Expected one Clover settlement/);
});
