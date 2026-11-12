// Badges: each is earned when one of the counts reaches a number (game.config.json.badges). Pure.

/** Every badge with where the reader is on it: { ...badge, value, earned, ratio }. `stats` has the counts and the streak. */
export function badgeStates(defs, stats) {
  return defs.map((badge) => {
    const value = stats[badge.stat] || 0;
    return { ...badge, value, earned: value >= badge.atLeast, ratio: Math.min(1, value / badge.atLeast) };
  });
}

/** Earned badges first (in the order they are listed), then the ones still to earn, nearest to earned first. */
export function sortedBadges(states) {
  const earned = states.filter((b) => b.earned);
  const waiting = states.filter((b) => !b.earned).sort((a, b) => b.ratio - a.ratio);
  return [...earned, ...waiting];
}
