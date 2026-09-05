import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workspace = new URL('..', import.meta.url).pathname;
const wrangler = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname;
const hash = 'a'.repeat(64);
const objectKey = `evidence/synthetic/sha256/bank/${hash}/bank.json`;

function execute(state, ...arguments_) {
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'DB', '--env', 'staging', '--local', '--persist-to', state, ...arguments_], {
    cwd: workspace,
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test('local D1 rejects conflicting replacement and upsert writes while preserving identical replays', () => {
  const state = mkdtempSync(join(tmpdir(), 'mho-231-d1-'));
  try {
    for (const file of ['schemas/0001_synthetic_finance.sql', 'schemas/0002_staging_append_only.sql']) {
      const result = execute(state, '--file', file);
      assert.equal(result.status, 0, result.output);
    }
    const seed = [
      `INSERT INTO evidence_artifacts VALUES ('${objectKey}', 'BANK', '${hash}', 10, 1)`,
      `INSERT INTO import_receipts VALUES ('receipt-1', '${objectKey}', '${hash}', '2026-09-04T00:00:00.000Z')`,
      `INSERT INTO normalized_records VALUES ('bank-1', 'BANK', '2026-01-01', 100, 'DEPOSIT', '${objectKey}', '/transactions/0')`,
    ];
    for (const statement of seed) assert.equal(execute(state, '--command', statement).status, 0);

    for (const statement of [
      `INSERT OR REPLACE INTO evidence_artifacts VALUES ('${objectKey}', 'BANK', '${hash}', 11, 1)`,
      `INSERT OR REPLACE INTO import_receipts VALUES ('receipt-1', '${objectKey}', '${hash}', 'later')`,
      `INSERT OR REPLACE INTO normalized_records VALUES ('bank-1', 'BANK', '2026-01-01', 101, 'DEPOSIT', '${objectKey}', '/transactions/0')`,
      `INSERT INTO normalized_records VALUES ('bank-1', 'BANK', '2026-01-01', 101, 'DEPOSIT', '${objectKey}', '/transactions/0') ON CONFLICT(record_id) DO UPDATE SET amount_cents = excluded.amount_cents`,
    ]) {
      const result = execute(state, '--command', statement);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /immutable evidence|append-only/);
    }

    for (const statement of [
      `INSERT OR IGNORE INTO evidence_artifacts VALUES ('${objectKey}', 'BANK', '${hash}', 10, 1)`,
      `INSERT OR IGNORE INTO import_receipts VALUES ('receipt-1', '${objectKey}', '${hash}', '2026-09-04T00:00:00.000Z')`,
      `INSERT OR IGNORE INTO normalized_records VALUES ('bank-1', 'BANK', '2026-01-01', 100, 'DEPOSIT', '${objectKey}', '/transactions/0')`,
    ]) assert.equal(execute(state, '--command', statement).status, 0);

    const result = execute(state, '--command', 'SELECT bytes FROM evidence_artifacts; SELECT amount_cents FROM normalized_records;');
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /"bytes": 10/);
    assert.match(result.output, /"amount_cents": 100/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});
