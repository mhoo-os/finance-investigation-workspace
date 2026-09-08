import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { ingestSyntheticEvidence } from '../src/ingest.js';
import { MemoryR2 } from '../src/local-bindings.js';

const workspace = new URL('..', import.meta.url).pathname;
const wrangler = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname;
const hash = 'a'.repeat(64);
const objectKey = `evidence/synthetic/sha256/bank/${hash}/bank.json`;

function execute(state, ...arguments_) {
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'DB', '--env', 'staging', '--local', '--persist-to', state, ...arguments_], {
    cwd: workspace,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, output: `${result.stdout}${result.stderr}` };
}

const sqlLiteral = (value) => {
  if (typeof value === 'number') return String(value);
  if (value === null) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
};

const renderStatement = ({ sql, values }) => {
  let index = 0;
  const rendered = sql.replaceAll('?', () => sqlLiteral(values[index++]));
  assert.equal(index, values.length);
  return `${rendered};`;
};

function localD1(state) {
  return {
    prepare(sql) {
      return { bind: (...values) => ({ sql, values }) };
    },
    async batch(statements) {
      const result = execute(state, '--command', statements.map(renderStatement).join('\n'));
      if (result.status !== 0) throw new Error(result.output);
      return statements.map(() => ({ success: true }));
    },
  };
}

function applyMigrations(state) {
  for (const file of ['schemas/0001_synthetic_finance.sql', 'schemas/0002_staging_append_only.sql']) {
    const result = execute(state, '--file', file);
    assert.equal(result.status, 0, result.output);
  }
}

test('local D1 rejects conflicting replacement and upsert writes while preserving identical replays', () => {
  const state = mkdtempSync(join(tmpdir(), 'mho-231-d1-'));
  try {
    applyMigrations(state);
    const secondHash = 'b'.repeat(64);
    const secondObjectKey = `evidence/synthetic/sha256/bank/${secondHash}/bank.json`;
    const seed = [
      `INSERT INTO evidence_artifacts VALUES ('${objectKey}', 'BANK', '${hash}', 10, 1)`,
      `INSERT INTO evidence_artifacts VALUES ('${secondObjectKey}', 'BANK', '${secondHash}', 10, 1)`,
      `INSERT INTO import_receipts VALUES ('receipt-1', '${objectKey}', '${hash}', '2026-09-04T00:00:00.000Z')`,
      `INSERT INTO normalized_records VALUES ('bank-1', 'BANK', '2026-01-01', 100, 'DEPOSIT', '${objectKey}', '/transactions/0')`,
    ];
    for (const statement of seed) assert.equal(execute(state, '--command', statement).status, 0);

    for (const statement of [
      `INSERT OR REPLACE INTO evidence_artifacts VALUES ('${objectKey}', 'BANK', '${hash}', 11, 1)`,
      `INSERT OR REPLACE INTO import_receipts VALUES ('receipt-1', '${objectKey}', '${hash}', 'later')`,
      `INSERT OR REPLACE INTO normalized_records VALUES ('bank-1', 'BANK', '2026-01-01', 101, 'DEPOSIT', '${objectKey}', '/transactions/0')`,
      `INSERT INTO evidence_artifacts VALUES ('${objectKey}', 'BANK', '${hash}', 11, 1) ON CONFLICT(object_key) DO UPDATE SET bytes = excluded.bytes`,
      `INSERT INTO import_receipts VALUES ('receipt-1', '${objectKey}', '${hash}', 'later') ON CONFLICT(receipt_id) DO UPDATE SET imported_at = excluded.imported_at`,
      `INSERT INTO normalized_records VALUES ('bank-1', 'BANK', '2026-01-01', 101, 'DEPOSIT', '${objectKey}', '/transactions/0') ON CONFLICT(record_id) DO UPDATE SET amount_cents = excluded.amount_cents`,
    ]) {
      const result = execute(state, '--command', statement);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /immutable evidence|append-only/);
    }

    for (const alias of ['rowid', '_rowid_', 'oid']) {
      for (const statement of [
        `INSERT OR REPLACE INTO evidence_artifacts (${alias}, object_key, source_kind, sha256, bytes, row_count) VALUES (1, '${secondObjectKey}/collision-${alias}', 'BANK', '${secondHash}', 10, 1)`,
        `INSERT OR REPLACE INTO import_receipts (${alias}, receipt_id, object_key, sha256, imported_at) VALUES (1, 'receipt-${alias}', '${secondObjectKey}', '${secondHash}', 'later')`,
        `INSERT OR REPLACE INTO normalized_records (${alias}, record_id, source_kind, posted_on, amount_cents, record_type, artifact_key, source_row) VALUES (1, 'bank-${alias}', 'BANK', '2026-01-02', 100, 'DEPOSIT', '${secondObjectKey}', '/transactions/1')`,
      ]) {
        const result = execute(state, '--command', statement);
        assert.notEqual(result.status, 0, `${alias}: ${result.output}`);
        assert.match(result.output, /immutable evidence/);
      }
    }

    for (const statement of [
      `INSERT OR IGNORE INTO evidence_artifacts VALUES ('${objectKey}', 'BANK', '${hash}', 10, 1)`,
      `INSERT OR IGNORE INTO import_receipts VALUES ('receipt-1', '${objectKey}', '${hash}', '2026-09-04T00:00:00.000Z')`,
      `INSERT OR IGNORE INTO normalized_records VALUES ('bank-1', 'BANK', '2026-01-01', 100, 'DEPOSIT', '${objectKey}', '/transactions/0')`,
    ]) assert.equal(execute(state, '--command', statement).status, 0);

    const result = execute(state, '--command', "SELECT object_key, bytes FROM evidence_artifacts WHERE rowid = 1; SELECT receipt_id, imported_at FROM import_receipts WHERE rowid = 1; SELECT record_id, amount_cents FROM normalized_records WHERE rowid = 1;");
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, new RegExp(objectKey));
    assert.match(result.output, /"bytes": 10/);
    assert.match(result.output, /"receipt_id": "receipt-1"/);
    assert.match(result.output, /"imported_at": "2026-09-04T00:00:00.000Z"/);
    assert.match(result.output, /"record_id": "bank-1"/);
    assert.match(result.output, /"amount_cents": 100/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('actual ingestion against local D1 keeps first receipts across different clocks and concurrent retries', async () => {
  const state = mkdtempSync(join(tmpdir(), 'mho-231-ingest-d1-'));
  try {
    applyMigrations(state);
    const env = { DB: localD1(state), EVIDENCE: new MemoryR2() };
    const firstClock = new Date('2026-09-04T00:00:00.000Z');
    const competingClock = new Date('2026-09-04T00:00:01.000Z');
    await Promise.all([
      ingestSyntheticEvidence(env, { now: () => firstClock }),
      ingestSyntheticEvidence(env, { now: () => competingClock }),
    ]);
    await ingestSyntheticEvidence(env, { now: () => new Date('2026-09-05T00:00:00.000Z') });

    const readback = execute(state, '--command', 'SELECT receipt_id, object_key, sha256, imported_at FROM import_receipts ORDER BY receipt_id', '--json');
    assert.equal(readback.status, 0, readback.output);
    const receipts = JSON.parse(readback.stdout)[0].results;
    assert.equal(receipts.length, 2);
    assert.equal(new Set(receipts.map(({ imported_at: importedAt }) => importedAt)).size, 1);
    assert.ok([firstClock.toISOString(), competingClock.toISOString()].includes(receipts[0].imported_at));
    assert.equal(env.EVIDENCE.objects.size, 2);
    for (const receipt of receipts) {
      const object = await env.EVIDENCE.get(receipt.object_key);
      assert.notEqual(object, null);
      assert.equal(object.customMetadata.sha256, receipt.sha256);
    }
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});
