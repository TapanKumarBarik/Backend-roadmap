// What a SQL job is, in one place: the worker of the practice screens (sql-worker.js) loads this file, and so do the checks of the problems
// (scripts/lib/sqlEngine.mjs, with Node), so a problem is checked with the very code the browser runs it with. It needs SQLite, as sql.js gives it
// (`SQL`, the module initSqlJs resolves), and nothing else.
//
// A job is { type: 'run', data, setups, query, maxRows } or { type: 'schema', data, sampleRows }:
//   data     SQL that creates and fills the tables of a problem
//   setups   a list of lists of statements: the query runs once on a fresh database for each, with that list applied after `data` ([] is the data as it is)
//   query    the learner's SQL; the last result it produces is the answer
// The answer is { runs: [{ columns, rows, truncated } | { error }], ms } for a run, and { tables: [...] } for a schema.

/** A database with `data` in it, and then each of `setup` (statements that change the data, for the checks on other data). */
function sqlOpenDatabase(SQL, data, setup) {
  const db = new SQL.Database();
  db.exec(data);
  for (const statement of setup) db.exec(statement);
  return db;
}

/**
 * Runs the SQL and returns the last result it produced: { columns, rows, truncated }, or { error } (a mistake in the SQL, or SQL that gives no table).
 * A result is cut after `maxRows` rows (the page says how many), so a query that never stops giving rows, a recursive one, is stopped here.
 */
function sqlRunQuery(db, sql, maxRows) {
  let last = null;
  try {
    for (const statement of db.iterateStatements(sql)) {
      const columns = statement.getColumnNames();
      const rows = [];
      let truncated = false;
      while (statement.step()) {
        if (rows.length >= maxRows) { truncated = true; break; }
        rows.push(statement.get());
      }
      if (columns.length) last = { columns, rows, truncated };
    }
  } catch (error) {
    return { error: String((error && error.message) || error) };
  }
  return last || { error: 'The SQL ran, but it did not return a table. A query ends with SELECT.' };
}

/** The tables of a database: name, columns with their types, how many rows, and the first `sampleRows` of them. */
function sqlDescribe(db, sampleRows) {
  const names = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return (names.length ? names[0].values : []).map(([name]) => {
    const quoted = `"${name.replace(/"/g, '""')}"`;
    const columns = db.exec(`PRAGMA table_info(${quoted})`)[0].values.map(([, column, type, , , primary]) => ({ name: column, type: type || '', primary: primary > 0 }));
    const count = db.exec(`SELECT COUNT(*) FROM ${quoted}`)[0].values[0][0];
    const sample = db.exec(`SELECT * FROM ${quoted} LIMIT ${sampleRows}`);
    return { name, columns, rows: count, sample: sample.length ? sample[0].values : [] };
  });
}

/** Does one job (see the top of this file) and returns its answer. */
function sqlHandle(SQL, job) {
  if (job.type === 'schema') {
    const db = sqlOpenDatabase(SQL, job.data, []);
    try { return { tables: sqlDescribe(db, job.sampleRows) }; } finally { db.close(); }
  }
  const started = performance.now();
  const runs = job.setups.map((setup) => {
    const db = sqlOpenDatabase(SQL, job.data, setup);
    try { return sqlRunQuery(db, job.query, job.maxRows); } finally { db.close(); }
  });
  return { runs, ms: Math.round(performance.now() - started) };
}
