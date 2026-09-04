import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const schema = [
  readFileSync(new URL('../schemas/0001_synthetic_finance.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../schemas/0002_staging_append_only.sql', import.meta.url), 'utf8'),
].join('\n');

const createDatabase = () => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(schema);
  database.exec(`
    INSERT INTO evidence_artifacts VALUES ('evidence/synthetic/sha256/bank/${'a'.repeat(64)}/bank.json', 'BANK', '${'a'.repeat(64)}', 10, 1);
    INSERT INTO import_receipts VALUES ('receipt-1', 'evidence/synthetic/sha256/bank/${'a'.repeat(64)}/bank.json', '${'a'.repeat(64)}', '2026-09-04T00:00:00.000Z');
    INSERT INTO normalized_records VALUES ('bank-1', 'BANK', '2026-01-01', 100, 'DEPOSIT', 'evidence/synthetic/sha256/bank/${'a'.repeat(64)}/bank.json', '/transactions/0');
  `);
  return database;
};

test('staging custody tables reject updates and deletes', () => {
  const database = createDatabase();
  for (const statement of [
    "UPDATE evidence_artifacts SET bytes = 11",
    "DELETE FROM evidence_artifacts",
    "UPDATE import_receipts SET imported_at = 'later'",
    "DELETE FROM import_receipts",
    "UPDATE normalized_records SET amount_cents = 101",
    "DELETE FROM normalized_records",
  ]) {
    assert.throws(() => database.exec(statement), /append-only/);
  }
  database.close();
});

test('staging schema rejects non-synthetic evidence namespaces', () => {
  const database = createDatabase();
  assert.throws(() => database.exec(`INSERT INTO evidence_artifacts VALUES ('client/evidence.json', 'BANK', '${'b'.repeat(64)}', 10, 1)`), /CHECK constraint failed/);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM evidence_artifacts').get().count, 1);
  database.close();
});
