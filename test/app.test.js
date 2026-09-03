import assert from 'node:assert/strict';
import test from 'node:test';
import { boot, loadInvestigation, renderView } from '../public/app.js';

const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const safePayload = {
  classification: 'SYNTHETIC_ONLY',
  access: 'PUBLIC_SYNTHETIC_READ_ONLY',
  coverage: [{ month: '2026-01', status: 'COMPLETE', bankRows: 2, cloverRows: 2 }],
  artifacts: [{ objectKey: 'evidence/synthetic/sha256/bank/hash/file.json', rowCount: 2 }],
  receipts: [{ objectKey: 'evidence/synthetic/sha256/bank/hash/file.json', sha256: 'abc123', importedAt: '2026-09-03T12:00:00.000Z' }],
  findings: [{ status: 'OPEN', expectedCents: 4200, observedCents: 4050, explanation: '<review>', trace: [{ artifactKey: 'evidence/synthetic/sha256/bank/hash/file.json', sourceRow: '/transactions/1' }] }],
};

test('client loads only a complete synthetic-only payload', async () => {
  assert.equal((await loadInvestigation(async () => response(safePayload))).status, 'ready');
  assert.equal((await loadInvestigation(async () => response({ ...safePayload, findings: [] }))).status, 'empty');
  assert.equal((await loadInvestigation(async () => response({ ...safePayload, coverage: [] }))).status, 'empty');
  assert.equal((await loadInvestigation(async () => response({ ...safePayload, coverage: null }))).status, 'empty');
  assert.equal((await loadInvestigation(async () => response({ ...safePayload, findings: null }))).status, 'empty');
  assert.equal((await loadInvestigation(async () => response({ ...safePayload, classification: 'CLIENT_DATA' }))).status, 'error');
  assert.equal((await loadInvestigation(async () => response({ ...safePayload, access: 'PRIVATE' }))).status, 'error');
  assert.equal((await loadInvestigation(async () => response({}, 500))).status, 'error');
});

test('client renders loading, empty, error, and escaped ready states', () => {
  assert.match(renderView({ status: 'loading' }), /Loading synthetic evidence/);
  assert.match(renderView({ status: 'empty' }), /No synthetic evidence yet/);
  assert.match(renderView({ status: 'error' }), /Investigation unavailable/);
  const ready = renderView({ status: 'ready', data: safePayload });
  assert.match(ready, /\$42\.00/);
  assert.match(ready, /\$1\.50/);
  assert.match(ready, /abc123/);
  assert.match(ready, /&lt;review&gt;/);
  assert.doesNotMatch(ready, /<review>/);

  const matched = renderView({
    status: 'ready',
    data: {
      ...safePayload,
      receipts: [],
      findings: [{ ...safePayload.findings[0], status: 'MATCHED', expectedCents: 10000, observedCents: 10000 }],
    },
  });
  assert.match(matched, /Matched deposit/);
  assert.match(matched, /missing/);
});

test('client boot uses the browser fetch default', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response(safePayload);
  try {
    const root = { innerHTML: '' };
    await boot(root);
    assert.match(root.innerHTML, /Loaded synthetic-only/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('client boot replaces loading state with fetched data', async () => {
  const root = { innerHTML: '' };
  await boot(root, async () => response(safePayload));
  assert.match(root.innerHTML, /Deterministic reconciliation/);
});
