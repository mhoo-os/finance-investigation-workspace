import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticDataset } from '../src/fixture.js';
import { ingestSyntheticEvidence } from '../src/ingest.js';
import { createMemoryEnvironment } from '../src/local-bindings.js';

test('ingestion writes preserved evidence and D1 normalization statements', async () => {
  const env = createMemoryEnvironment();
  const importedAt = new Date('2026-09-03T12:00:00.000Z');
  const dataset = await ingestSyntheticEvidence(env, { now: () => importedAt });
  for (const artifact of dataset.artifacts) {
    const stored = await env.EVIDENCE.get(artifact.objectKey);
    assert.equal(new TextDecoder().decode(await stored.arrayBuffer()), artifact.raw);
    assert.equal(stored.customMetadata.sha256, artifact.sha256);
  }
  assert.equal(env.DB.tables.evidenceArtifacts.size, 2);
  assert.equal(env.DB.tables.importReceipts.size, 2);
  assert.equal(env.DB.tables.normalizedRecords.size, 4);
  assert.equal(env.DB.tables.reconciliationFindings.size, 2);
  assert.deepEqual([...env.DB.tables.importReceipts.values()].map((receipt) => receipt.importedAt), [importedAt.toISOString(), importedAt.toISOString()]);
});

test('reingestion keeps evidence and first-import receipts immutable', async () => {
  const env = createMemoryEnvironment();
  const first = await ingestSyntheticEvidence(env, { now: () => new Date('2026-09-03T12:00:00.000Z') });
  await ingestSyntheticEvidence(env, { now: () => new Date('2026-09-04T12:00:00.000Z') });
  assert.equal(env.EVIDENCE.objects.size, 2);
  assert.equal(env.DB.tables.importReceipts.size, 2);
  assert.ok([...env.DB.tables.importReceipts.values()].every((receipt) => receipt.importedAt === '2026-09-03T12:00:00.000Z'));
  assert.deepEqual([...env.EVIDENCE.objects.keys()], first.artifacts.map((artifact) => artifact.objectKey));
});

test('ingestion rejects a hash collision at an immutable evidence key', async () => {
  const env = createMemoryEnvironment();
  const dataset = await syntheticDataset();
  await env.EVIDENCE.put(dataset.artifacts[0].objectKey, '{"tampered":true}');
  await assert.rejects(ingestSyntheticEvidence(env), /Immutable evidence hash mismatch/);
  assert.equal(env.DB.tables.evidenceArtifacts.size, 0);
});

test('ingestion rejects an invalid import clock', async () => {
  await assert.rejects(ingestSyntheticEvidence(createMemoryEnvironment(), { now: () => new Date('invalid') }), /invalid date/);
});

test('ingestion rejects an evidence object that disappears during a conditional write', async () => {
  const env = createMemoryEnvironment();
  env.EVIDENCE = { put: async () => null, get: async () => null };
  await assert.rejects(ingestSyntheticEvidence(env), /Evidence object disappeared/);
});

test('local R2 verifies declared hashes for text and byte uploads', async () => {
  const env = createMemoryEnvironment();
  await assert.rejects(env.EVIDENCE.put('key', 'value', { sha256: 'wrong' }), /R2 SHA-256 mismatch/);
  const bytes = new TextEncoder().encode('value');
  await env.EVIDENCE.put('key', bytes);
  assert.equal((await env.EVIDENCE.get('key')).size, bytes.byteLength);
  assert.equal(await env.EVIDENCE.get('missing'), null);
});

test('local D1 rolls back unsupported batches and rejects unknown queries', async () => {
  const env = createMemoryEnvironment();
  const valid = env.DB.prepare('INSERT OR IGNORE INTO evidence_artifacts (object_key, source_kind, sha256, bytes, row_count) VALUES (?, ?, ?, ?, ?)')
    .bind('evidence/synthetic/sha256/bank/hash/file.json', 'BANK', 'a'.repeat(64), 1, 1);
  await assert.rejects(env.DB.batch([valid, { sql: 'UNSUPPORTED', values: [] }]), /Unsupported local D1 statement/);
  assert.equal(env.DB.tables.evidenceArtifacts.size, 0);
  await assert.rejects(env.DB.prepare('SELECT nope').all(), /Unsupported local D1 query/);
});
