// What a mark earned: the difference between the game before it and after it. Pure; the screen shows it (components/game/Reward.jsx).

/**
 * `before` and `after` are computeGame() results. Returns null when nothing was earned (a module marked "in progress", or un-marked), otherwise
 * { xp, level, levelUp, badges, track, path, capstone }: the XP gained, the level now, the new level if the reader just reached one, the badges
 * just earned, and whether a whole track, path or capstone was just finished.
 */
export function rewardBetween(before, after) {
  const xp = after.xp - before.xp;
  const had = new Set(before.badges.filter((b) => b.earned).map((b) => b.id));
  const badges = after.badges.filter((b) => b.earned && !had.has(b.id));
  if (xp <= 0 && !badges.length) return null;
  return {
    xp: Math.max(0, xp),
    level: after.level,
    levelUp: after.level.n > before.level.n ? after.level : null,
    badges,
    track: after.stats.tracks > before.stats.tracks,
    path: after.stats.paths > before.stats.paths,
    capstone: after.stats.capstones > before.stats.capstones
  };
}

/** True when the reward is worth more than a quiet toast: a level, a badge, a whole track or path. */
export const isBigReward = (reward) => !!reward && (!!reward.levelUp || reward.badges.length > 0 || reward.track || reward.path);
