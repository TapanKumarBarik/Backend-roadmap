// Everything the game knows about a reader at one moment, in one object: the counts, the XP and level, the streak, the badges, the week and what
// was done today. Pure (`now` comes in), so the screen, the reward on a mark and the tests all see the same numbers.
import { dayKey } from '../curriculum/progressStats.js';
import { libraryStats, xpOf, levelOf } from './stats.js';
import { activeDays, withStreakWindow, currentStreak, longestStreak, weekOf, doneOn, frozenDays, weekStart } from './activity.js';
import { badgeStates } from './badges.js';

/**
 * @param {{ index: any, statusMap: any, timeMap: any, paths: any[], serverStreak?: { currentStreak: number } | null, now?: number }} input
 *   `index` is buildIndex(tree); `paths` the resolved learning paths; `serverStreak` what the account says (only for a signed-in reader).
 * @param {any} config game.config.json
 */
export function computeGame({ index, statusMap, timeMap, paths, serverStreak = null, now = Date.now() }, config) {
  const stats = libraryStats(index, statusMap, paths, config.keys);
  const today = dayKey(now);
  let days = activeDays(statusMap, timeMap);
  if (serverStreak && serverStreak.currentStreak > 0) days = withStreakWindow(days, serverStreak.currentStreak, today);
  // a missed day does not end a streak when a freeze covers it (config.streak.freezesPerWeek)
  const frozen = frozenDays(days, today, { perWeek: config.streak.freezesPerWeek, weekStartsOn: config.weekStartsOn });
  const covered = new Set([...days, ...frozen]);
  const streak = currentStreak(covered, today);
  const thisWeek = weekStart(today, config.weekStartsOn);
  const usedThisWeek = [...frozen].filter((day) => weekStart(day, config.weekStartsOn) === thisWeek).length;
  const xp = xpOf(stats, config.xp);
  return {
    stats,
    xp,
    level: levelOf(xp, config.levels),
    streak,
    longest: longestStreak(covered),
    freezesLeft: Math.max(0, config.streak.freezesPerWeek - usedThisWeek),
    studiedToday: days.has(today),
    doneToday: doneOn(statusMap, timeMap, today),
    week: weekOf(days, today, config.weekStartsOn, frozen),
    badges: badgeStates(config.badges, { ...stats, streak }),
    today
  };
}
