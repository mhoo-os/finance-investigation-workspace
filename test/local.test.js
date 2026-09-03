import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalAssets, createSeededLocalEnvironment, startLocalWorkspace } from '../src/local.js';

test('local asset binding serves the preview and rejects missing files', async () => {
  const assets = createLocalAssets();
  const page = await assets.fetch(new Request('http://local.test/'));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="app"/);
  assert.equal((await assets.fetch(new Request('http://local.test/missing.txt'))).status, 404);
  assert.equal((await assets.fetch(new Request('http://local.test/%E0%A4%A'))).status, 400);
  assert.equal((await createLocalAssets('/tmp/finance-preview-missing').fetch(new Request('http://local.test/'))).status, 404);
});

test('local start command seeds storage and serves API plus UI', async () => {
  const workspace = await startLocalWorkspace({ port: 0, now: () => new Date('2026-09-03T12:00:00.000Z') });
  try {
    const page = await fetch(workspace.url);
    const api = await fetch(`${workspace.url}/api/investigation`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Finance Investigation Workspace/);
    assert.equal(api.status, 200);
    assert.equal((await api.json()).receipts.length, 2);
    assert.equal((await fetch(`${workspace.url}/api/investigation`, { method: 'POST', body: '' })).status, 405);
    workspace.env.ASSETS.fetch = async () => { throw new Error('asset failure'); };
    assert.equal((await fetch(`${workspace.url}/missing`)).status, 500);
  } finally {
    await workspace.close();
  }
});

test('local environment uses the real clock by default', async () => {
  const env = await createSeededLocalEnvironment();
  assert.equal(env.DB.tables.importReceipts.size, 2);
  assert.ok([...env.DB.tables.importReceipts.values()].every((receipt) => !Number.isNaN(Date.parse(receipt.importedAt))));
});
