// A line in the audit log (table audit_log): who did what to what. Called by every admin action that changes something, after it has
// succeeded. Best effort by design: a failure to write the log must not undo or fail the action it records.
import { run } from './d1.js';
import { timeId } from './util.js';

/**
 * @param {*} env
 * @param {{ email?: string } | null} session the admin who acted
 * @param {string} action a short verb phrase, e.g. 'article approved'
 * @param {string} [target] what it was done to (an id, a handle, an address)
 * @param {string} [detail] anything worth keeping with it
 */
export async function audit(env, session, action, target = '', detail = '') {
  try {
    await run(env, 'INSERT INTO audit_log (id, actor, action, target, detail, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
      timeId(3), session?.email || 'unknown', action, String(target).slice(0, 200), String(detail).slice(0, 500), new Date().toISOString());
  } catch { /* the record is a courtesy to the owner; the action has happened */ }
}
