// Thin wrapper over the D1 binding (env.DB). Table Storage's getEntity /
// listEntities / upsertEntity are gone — every call site now issues real
// parameterized SQL, so this only needs three shapes: many rows, one row,
// and a write.

export async function all(env, sql, ...params) {
  const res = await env.DB.prepare(sql).bind(...params).all();
  return res.results || [];
}

export async function first(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).first();
}

export async function run(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).run();
}

// A batch of writes in one round-trip. Each entry is [sql, ...params].
export async function batch(env, statements) {
  if (!statements.length) return [];
  return env.DB.batch(statements.map(([sql, ...params]) => env.DB.prepare(sql).bind(...params)));
}
