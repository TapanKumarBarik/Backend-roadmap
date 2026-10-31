import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS_DIR, createTestDb, migrate, migrationFiles } from './helpers.js';

const API_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('migration files are numbered 0001, 0002... with no gap and no repeat', () => {
  const files = migrationFiles();
  assert.ok(files.length >= 1, 'there is at least the first migration');
  files.forEach((name, index) => {
    const expected = String(index + 1).padStart(4, '0');
    assert.ok(name.startsWith(`${expected}_`), `${name} should start with ${expected}_ (two pull requests probably took the same number)`);
    assert.match(name, /^\d{4}_[a-z0-9_]+\.sql$/, `${name} should look like 0002_add_something.sql`);
  });
});

test('every table the API\'s SQL names exists once the migrations have run on an empty database', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const existing = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));

  // SQL in this code base is written with upper-case keywords, and comments are dropped first, so prose such as
  // "JOIN queries" does not read as a table name.
  const named = new Map();
  for (const file of sourceFiles(API_DIR)) {
    const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const [, table] of source.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_][a-z0-9_]*)/g)) {
      if (!named.has(table)) named.set(table, path.relative(API_DIR, file));
    }
  }

  assert.ok(named.size >= 10, `found ${named.size} table names in the SQL; the pattern probably stopped matching`);
  const missing = [...named].filter(([table]) => !existing.has(table)).map(([table, file]) => `${table} (used in ${file})`);
  assert.deepEqual(missing, [], 'tables the code uses but no migration creates');
});

test('running the migrations again changes nothing, as on the production database that already has the first one', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const snapshot = () => JSON.stringify(db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all());
  const before = snapshot();
  assert.doesNotThrow(() => migrate(db));
  assert.equal(snapshot(), before);
});

test('the first migration does not drop or rewrite anything that already exists', () => {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationFiles()[0]), 'utf8');
  assert.doesNotMatch(sql, /\b(DROP|ALTER|DELETE|UPDATE)\b/i, 'the first migration only creates what is missing');
});

test('the test database starts empty and is private to each test', async () => {
  const a = createTestDb();
  const b = createTestDb();
  await a.prepare('INSERT INTO admins (email) VALUES (?1)').bind('someone@example.com').run();
  assert.equal((await a.prepare('SELECT COUNT(*) AS n FROM admins').bind().first()).n, 1);
  assert.equal((await b.prepare('SELECT COUNT(*) AS n FROM admins').bind().first()).n, 0);
});
