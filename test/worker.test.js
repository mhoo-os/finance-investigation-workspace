import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestSyntheticEvidence } from '../src/ingest.js';
import { createMemoryEnvironment } from '../src/local-bindings.js';
import worker from '../src/worker.js';
import { accessRequest, accessVerificationEnvironment, withAccessCertificates } from '../support/access-fixture.js';

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
  assert.equal(payload.coverage[0].trace.length, 4);
  assert.ok(payload.coverage[0].trace.every((record) => /^[a-f0-9]{64}$/.test(record.sha256)));
  assert.deepEqual(payload.findings.map((finding) => finding.status), ['MATCHED', 'OPEN']);
  assert.ok(payload.findings.every((finding) => finding.trace.length === 2));
  assert.ok(payload.findings.flatMap((finding) => finding.trace).every((record) => /^[a-f0-9]{64}$/.test(record.sha256)));
  assert.ok(payload.receipts.every((receipt) => /^[a-f0-9]{64}$/.test(receipt.sha256)));
});

test('Worker rejects non-GET API requests', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/investigation', { method: 'POST' }), { DEPLOYMENT_ENV: 'local' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});

test('Worker fails closed when the synthetic-only boundary is absent', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/investigation'), { DEPLOYMENT_ENV: 'local' });
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
  const env = { DEPLOYMENT_ENV: 'local', DATA_CLASSIFICATION: 'SYNTHETIC_ONLY', DB: { prepare: () => { throw 'database detail'; } } };
  await withoutErrorOutput(async () => {
    const response = await worker.fetch(new Request('https://example.test/api/investigation'), env);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Investigation data is unavailable.' });
  });
});

test('Worker delegates non-API requests to static assets', async () => {
  const response = await worker.fetch(new Request('https://example.test/'), { DEPLOYMENT_ENV: 'local', ASSETS: { fetch: async () => new Response('preview') } });
  assert.equal(await response.text(), 'preview');
});

test('Worker fails closed for missing, empty, and unsupported deployment modes before assets or APIs', async () => {
  for (const deploymentEnvironment of [undefined, '', 'production', 'stagin']) {
    const env = { ...await seededEnvironment(), DEPLOYMENT_ENV: deploymentEnvironment };
    for (const path of ['/', '/api/investigation']) {
      const response = await worker.fetch(new Request(`https://example.test${path}`), env);
      assert.equal(response.status, 503, `${String(deploymentEnvironment)} ${path}`);
      assert.deepEqual(await response.json(), { error: 'Staging access protection is unavailable.' });
    }
  }
});

test('staging fails closed before Access configuration is complete', async () => {
  const env = { ...await seededEnvironment(), DEPLOYMENT_ENV: 'staging' };
  const response = await worker.fetch(new Request('https://example.test/'), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Staging access protection is unavailable.' });
});

test('staging rejects requests without a valid Access assertion', async () => {
  const env = { ...await seededEnvironment(), ...accessVerificationEnvironment() };
  const response = await worker.fetch(new Request('https://example.test/api/investigation'), env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Cloudflare Access authentication is required.' });
});

test('staging serves binding-backed data and assets only after Access verification', async () => {
  const env = { ...await seededEnvironment(), ...accessVerificationEnvironment() };
  await withAccessCertificates(async () => {
    const api = await worker.fetch(await accessRequest('https://example.test/api/investigation'), env);
    assert.equal(api.status, 200);
    assert.equal((await api.json()).access, 'CLOUDFLARE_ACCESS_PROTECTED');
    const asset = await worker.fetch(await accessRequest('https://example.test/'), env);
    assert.equal(asset.status, 200);
    assert.equal(await asset.text(), 'asset');
  });
});

test('staging seed route is Access-protected, synthetic-only, and idempotent', async () => {
  const env = { ...createMemoryEnvironment({ assets: { fetch: async () => new Response('asset') } }), ...accessVerificationEnvironment() };
  await withAccessCertificates(async () => {
    const method = await worker.fetch(await accessRequest('https://example.test/ops/seed-synthetic'), env);
    assert.equal(method.status, 405);
    assert.equal(method.headers.get('allow'), 'POST');

    const seeded = await worker.fetch(await accessRequest('https://example.test/ops/seed-synthetic', { method: 'POST' }), env);
    assert.equal(seeded.status, 201);
    const receipt = await seeded.json();
    assert.equal(receipt.seeded, true);
    assert.equal(receipt.artifacts.length, 2);

    const repeated = await worker.fetch(await accessRequest('https://example.test/ops/seed-synthetic', { method: 'POST' }), env);
    assert.equal(repeated.status, 201);
    assert.equal(env.EVIDENCE.objects.size, 2);
  });
});

test('staging seed route fails closed on classification and storage errors', async () => {
  const wrongClassification = { ...createMemoryEnvironment(), ...accessVerificationEnvironment(), DATA_CLASSIFICATION: 'CLIENT_DATA' };
  const failedStorage = { ...createMemoryEnvironment(), ...accessVerificationEnvironment(), EVIDENCE: { put: async () => { throw new Error('private storage detail'); } } };
  await withAccessCertificates(async () => {
    assert.equal((await worker.fetch(await accessRequest('https://example.test/ops/seed-synthetic', { method: 'POST' }), wrongClassification)).status, 503);
    await withoutErrorOutput(async () => {
      const response = await worker.fetch(await accessRequest('https://example.test/ops/seed-synthetic', { method: 'POST' }), failedStorage);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'Synthetic staging seed failed.' });
    });
  });
});

test('seed route is absent outside staging', async () => {
  const response = await worker.fetch(new Request('https://example.test/ops/seed-synthetic', { method: 'POST' }), await seededEnvironment());
  assert.equal(response.status, 404);
});
