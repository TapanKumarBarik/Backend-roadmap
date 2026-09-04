export function subtreeStats(node, statusMap) {
  let done = 0, wip = 0, total = 0;
  (function walk(n) {
    if (n.file) {
      total++;
      const s = statusMap[n.file] || 'todo';
      if (s === 'done') done++;
      else if (s === 'wip') wip++;
    }
    (n.children || []).forEach(walk);
  })(node);
  return { done, wip, total };
}

const DAY = 86400000;

// Local midnight, not UTC: "today" has to mean the user's today, or the
// activity strip ends up off by one for most of the world.
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// How many modules were marked done on each of the last `days` days, oldest
// first. Only 'done' counts — 'wip' churns as you move through a module and
// would make the strip measure fidgeting rather than progress.
export function activityByDay(statusMap, timeMap, days = 91, now = Date.now()) {
  const counts = new Map();
  for (const [path, iso] of Object.entries(timeMap)) {
    if (statusMap[path] !== 'done') continue;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) continue;
    counts.set(dayKey(t), (counts.get(dayKey(t)) || 0) + 1);
  }
  const out = [];
  const today = startOfDay(now).getTime();
  for (let i = days - 1; i >= 0; i--) {
    const d = today - i * DAY;
    out.push({ date: dayKey(d), count: counts.get(dayKey(d)) || 0 });
  }
  return out;
}

// Modules completed in the last 7 days vs the 7 before that.
export function weeklyCounts(statusMap, timeMap, now = Date.now()) {
  const weekAgo = now - 7 * DAY;
  const twoWeeksAgo = now - 14 * DAY;
  let thisWeek = 0, lastWeek = 0, total = 0;
  for (const [path, iso] of Object.entries(timeMap)) {
    if (statusMap[path] !== 'done') continue;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) continue;
    total++;
    if (t >= weekAgo) thisWeek++;
    else if (t >= twoWeeksAgo) lastWeek++;
  }
  return { thisWeek, lastWeek, total };
}

// Projected finish date from the recent rate.
//
// Deliberately uses the last 28 days rather than all-time: a burst six months
// ago shouldn't promise a finish date the current pace can't keep. Returns
// null rather than a wild guess when there isn't enough recent activity, or
// when there's nothing left to finish.
export function paceEstimate(statusMap, timeMap, totalModules, now = Date.now()) {
  const windowStart = now - 28 * DAY;
  let recent = 0, done = 0;
  for (const [path, iso] of Object.entries(timeMap)) {
    if (statusMap[path] !== 'done') continue;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) continue;
    done++;
    if (t >= windowStart) recent++;
  }
  // Count of done modules can exceed timeMap's coverage (rows predating
  // updatedAt), so take the larger of the two for "remaining".
  const doneTotal = Object.values(statusMap).filter((s) => s === 'done').length;
  const remaining = Math.max(0, totalModules - Math.max(done, doneTotal));
  if (remaining === 0) return { remaining: 0, perWeek: 0, finishDate: null, done: doneTotal };
  if (recent < 3) return { remaining, perWeek: recent / 4, finishDate: null, done: doneTotal };

  const perWeek = recent / 4;
  const weeksLeft = remaining / perWeek;

  // A specific date is only meaningful about a year out. Past that, the
  // precision is fake — "30 Mar 2029" implies a confidence four weeks of data
  // cannot support, and reads as discouraging rather than informative. Give
  // the magnitude instead, and nothing at all beyond five years.
  if (weeksLeft > 260) return { remaining, perWeek, finishDate: null, years: null, done: doneTotal };
  if (weeksLeft > 52) {
    return {
      remaining,
      perWeek,
      finishDate: null,
      years: Math.round((weeksLeft / 52) * 10) / 10,
      done: doneTotal
    };
  }
  return {
    remaining,
    perWeek,
    finishDate: new Date(now + weeksLeft * 7 * DAY),
    years: null,
    done: doneTotal
  };
}

export function globalCounts(flatFiles, statusMap) {
  let done = 0, wip = 0;
  const total = flatFiles.length;
  flatFiles.forEach((f) => {
    const s = statusMap[f] || 'todo';
    if (s === 'done') done++;
    else if (s === 'wip') wip++;
  });
  return { done, wip, todo: total - done - wip, total };
}
