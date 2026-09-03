import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestSyntheticEvidence } from '../src/ingest.js';
import { createMemoryEnvironment } from '../src/local-bindings.js';
import worker from '../src/worker.js';

const seededEnvironment = async () => {
  const env = createMemoryEnvironment({ assets: { fetch: async () => new Response('asset') } });
  await ingestSyntheticEvidence(env, { now: () => new Date('2026-09-03T12:00:00.000Z') });
  return env;
};

const withoutErrorOutput = async (operation) => {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await operation();
  } finally {
    console.error = originalError;
  }
};

test('Worker returns source-traceable synthetic investigation data', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/investigation'), await seededEnvironment());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.classification, 'SYNTHETIC_ONLY');
  assert.equal(payload.access, 'PUBLIC_SYNTHETIC_READ_ONLY');
  assert.equal(payload.coverage[0].status, 'COMPLETE');
  assert.deepEqual(payload.findings.map((finding) => finding.status), ['MATCHED', 'OPEN']);
  assert.ok(payload.findings.every((finding) => finding.trace.length === 2));
  assert.ok(payload.receipts.every((receipt) => /^[a-f0-9]{64}$/.test(receipt.sha256)));
});

test('Worker rejects non-GET API requests', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/investigation', { method: 'POST' }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});

test('Worker fails closed when the synthetic-only boundary is absent', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/investigation'), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Synthetic-only data boundary is unavailable.' });
});

test('Worker returns a generic error for incomplete source traces', async () => {
  const env = await seededEnvironment();
  env.DB.tables.normalizedRecords.delete('clover-settlement-match-001');
  await withoutErrorOutput(async () => {
    const response = await worker.fetch(new Request('https://example.test/api/investigation'), env);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Investigation data is unavailable.' });
  });
});

test('Worker fails closed when referenced R2 evidence was deleted', async () => {
  const env = await seededEnvironment();
  const [objectKey] = env.EVIDENCE.objects.keys();
  env.EVIDENCE.objects.delete(objectKey);
  await withoutErrorOutput(async () => {
    const response = await worker.fetch(new Request('https://example.test/api/investigation'), env);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Investigation data is unavailable.' });
  });
});

test('Worker fails closed when referenced R2 evidence bytes were tampered with', async () => {
  const env = await seededEnvironment();
  const evidence = env.EVIDENCE.objects.values().next().value;
  evidence.raw = evidence.raw.replace('10000', '99999');
  await withoutErrorOutput(async () => {
    const response = await worker.fetch(new Request('https://example.test/api/investigation'), env);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Investigation data is unavailable.' });
  });
});

test('Worker fails closed when an evidence JSON pointer is invalid', async () => {
  const env = await seededEnvironment();
  const record = env.DB.tables.normalizedRecords.values().next().value;
  record.sourceRow = '/transactions/99';
  await withoutErrorOutput(async () => {
    const response = await worker.fetch(new Request('https://example.test/api/investigation'), env);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Investigation data is unavailable.' });
  });
});

test('Worker fails closed when a valid evidence pointer identifies a different record', async () => {
  const env = await seededEnvironment();
  const record = env.DB.tables.normalizedRecords.values().next().value;
  record.sourceRow = '/transactions/1';
  await withoutErrorOutput(async () => {
    const response = await worker.fetch(new Request('https://example.test/api/investigation'), env);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Investigation data is unavailable.' });
  });
});

test('Worker rejects a forged MATCHED link whose IDs, dates, and amounts disagree', async () => {
  const env = await seededEnvironment();
  const finding = env.DB.tables.reconciliationFindings.get('matched-deposit-1');
  finding.cloverRecordId = 'clover-settlement-anomaly-002';
  await withoutErrorOutput(async () => {
    const response = await worker.fetch(new Request('https://example.test/api/investigation'), env);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Investigation data is unavailable.' });
  });
});

test('Worker rejects forged finding amounts or status', async () => {
  for (const mutate of [
    (finding) => { finding.expectedCents += 1; },
    (finding) => { finding.status = 'OPEN'; },
  ]) {
    const env = await seededEnvironment();
    mutate(env.DB.tables.reconciliationFindings.get('matched-deposit-1'));
    await withoutErrorOutput(async () => {
      const response = await worker.fetch(new Request('https://example.test/api/investigation'), env);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'Investigation data is unavailable.' });
    });
  }
});

test('Worker rejects forged coverage counts', async () => {
  const env = await seededEnvironment();
  env.DB.tables.monthlyCoverage.get('2026-01').bankRows += 1;
  await withoutErrorOutput(async () => {
    const response = await worker.fetch(new Request('https://example.test/api/investigation'), env);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Investigation data is unavailable.' });
  });
});

test('Worker rejects artifacts and records outside the synthetic namespace', async () => {
  const artifactEnv = await seededEnvironment();
  const artifact = artifactEnv.DB.tables.evidenceArtifacts.values().next().value;
  artifact.objectKey = 'client/evidence.json';
  await withoutErrorOutput(async () => {
    assert.equal((await worker.fetch(new Request('https://example.test/api/investigation'), artifactEnv)).status, 500);
  });

  const recordEnv = await seededEnvironment();
  const record = recordEnv.DB.tables.normalizedRecords.values().next().value;
  record.artifactKey = 'client/evidence.json';
  await withoutErrorOutput(async () => {
    assert.equal((await worker.fetch(new Request('https://example.test/api/investigation'), recordEnv)).status, 500);
  });
});

test('Worker does not leak non-Error database failures', async () => {
  const env = { DATA_CLASSIFICATION: 'SYNTHETIC_ONLY', DB: { prepare: () => { throw 'database detail'; } } };
  await withoutErrorOutput(async () => {
    const response = await worker.fetch(new Request('https://example.test/api/investigation'), env);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Investigation data is unavailable.' });
  });
});

test('Worker delegates non-API requests to static assets', async () => {
  const response = await worker.fetch(new Request('https://example.test/'), { ASSETS: { fetch: async () => new Response('preview') } });
  assert.equal(await response.text(), 'preview');
});
