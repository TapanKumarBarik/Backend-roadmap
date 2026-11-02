// What the API tests run against: the real Hono app, the real migrations, and an in-memory SQLite database standing
// in for Cloudflare D1. No server, no network, no Cloudflare account.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { sign, SESSION_COOKIE } from '../lib/session.js';

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export const SESSION_SECRET = 'test-secret-not-used-anywhere-else';
export const OWNER_EMAIL = 'owner@example.com';

/** The migration files, oldest first (their names start with a number). */
export function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
}

/** Applies every migration, in order, to a database. */
export function migrate(db) {
  for (const name of migrationFiles()) db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'));
}

/**
 * The part of D1's API the app uses (prepare/bind/all/first/run and batch), on an in-memory SQLite database.
 * `raw` is the database itself, for setting up and inspecting rows in a test.
 */
export function createTestDb({ withMigrations = true } = {}) {
  const raw = new DatabaseSync(':memory:');
  if (withMigrations) migrate(raw);

  const prepare = (sql) => {
    const statement = raw.prepare(sql);
    let values = [];
    const bound = {
      bind(...params) {
        values = params;
        return bound;
      },
      async all() {
        return { results: statement.all(...values), success: true, meta: {} };
      },
      async first() {
        return statement.get(...values) ?? null;
      },
      async run() {
        const result = statement.run(...values);
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      }
    };
    return bound;
  };

  return {
    raw,
    prepare,
    // D1 runs a batch as one transaction: all of it applies, or none of it does.
    async batch(statements) {
      raw.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        raw.exec('COMMIT');
        return results;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    }
  };
}

/** The bindings a request sees. Anything can be overridden per test. */
export function createEnv(overrides = {}) {
  return {
    DB: createTestDb(),
    ADMIN_EMAIL: OWNER_EMAIL,
    SESSION_SECRET,
    SITE_ORIGINS: 'http://localhost:4173',
    ...overrides
  };
}

/** A `cookie` header for a signed-in visitor, signed with the test secret. */
export async function signedInAs(email, { name = 'Test User', sub = `user-${email}`, picture = null, secret = SESSION_SECRET, ttlMs = 60 * 60 * 1000 } = {}) {
  const token = await sign({ sub, email, name, picture, exp: Date.now() + ttlMs }, secret);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
}
