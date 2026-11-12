// "Today" for the practice screens is a UTC calendar day, so everyone sees the same problem and the same drill on the same day wherever they are.

const DAY_MS = 86400000;

/** The whole days since 1970 (UTC) a moment is in. */
export const dayNumber = (now = Date.now()) => Math.floor(now / DAY_MS);

/** The day as "2026-11-12" (UTC): the name of a drill's mark, and what the API is told. */
export const dayName = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** The day number of a "2026-11-12" name, or null when it is not a real day. */
export function dayFromName(name) {
  if (typeof name !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(name)) return null;
  const at = Date.parse(`${name}T00:00:00Z`);
  return Number.isNaN(at) || dayName(at) !== name ? null : dayNumber(at);
}
