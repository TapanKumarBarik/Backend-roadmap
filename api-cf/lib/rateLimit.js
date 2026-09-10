// The fixed-window per-user throttle every write endpoint shares. Best-effort
// by design (a concurrent double-post in the same instant can slip through) —
// an acceptable trade for a personal-scale site. One row per (user, bucket)
// in the rate_limits table; bucket is 'feed' | 'books' | 'messages' |
// 'suggestions' | 'comments'.

import { first, run } from './d1.js';

export async function checkRateLimit(env, userId, bucket, windowMs, max) {
  const row = await first(
    env, 'SELECT window_start, count FROM rate_limits WHERE user_id = ?1 AND bucket = ?2',
    userId, bucket
  );
  const now = Date.now();

  if (!row || now - new Date(row.window_start).getTime() > windowMs) {
    await run(
      env,
      `INSERT INTO rate_limits (user_id, bucket, window_start, count) VALUES (?1, ?2, ?3, 1)
       ON CONFLICT(user_id, bucket) DO UPDATE SET window_start = ?3, count = 1`,
      userId, bucket, new Date(now).toISOString()
    );
    return true;
  }
  if (row.count >= max) return false;
  await run(
    env, 'UPDATE rate_limits SET count = count + 1 WHERE user_id = ?1 AND bucket = ?2',
    userId, bucket
  );
  return true;
}
