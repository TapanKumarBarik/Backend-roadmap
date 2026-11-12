// A public profile and a share card say the same few things about a reader: their level, XP, streak, how many problems they have solved, and the badges they
// have earned. This is what those are, how a handle is written, and the line of text that says it; the API (api/routes/profile.js) accepts exactly this.
// Pure, so the page and the API agree and it is tested without a browser.

/** The numbers a snapshot holds, and the most each may be (a bound, not a rule of the game: a number past it is a mistake or an attempt to fill the page). */
export const SNAPSHOT_NUMBERS = { level: 100, xp: 1000000, streak: 5000, longest: 5000, problems: 5000, modules: 5000, quizzes: 5000, drills: 5000, mocks: 5000, plans: 100 };
export const SNAPSHOT_BADGES_MAX = 100;

/** A handle: 3 to 30 characters, lower-case letters, digits and hyphens, starting and ending with a letter or digit. */
export const HANDLE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
/** What a handle cannot be: the words that are, or could become, an address or a role of the site itself. */
export const RESERVED_HANDLES = ['admin', 'administrator', 'api', 'me', 'root', 'support', 'help', 'staff', 'system', 'moderator', 'mod', 'owner', 'backendroadmap', 'official', 'null', 'undefined', 'deleted'];
export const NAME_MAX = 40;

/** Why a handle cannot be used, or null when it can. */
export function handleProblem(handle) {
  if (typeof handle !== 'string' || !HANDLE.test(handle)) return 'format';
  if (handle.includes('--')) return 'format';
  if (RESERVED_HANDLES.includes(handle)) return 'reserved';
  return null;
}

/**
 * The snapshot of a reader's game that a profile or a card shows: { level, levelName, xp, streak, longest, problems, modules, quizzes, drills, mocks, plans, badges }.
 * `game` is what lib/game/game.js computes (`level` is { n, name }), `defs` the badge definitions of game.config.json.
 */
export function snapshotOf(game) {
  return {
    level: game.level.n,
    xp: game.xp,
    streak: game.streak,
    longest: game.longest,
    problems: game.stats.problems,
    modules: game.stats.modules,
    quizzes: game.stats.quizzes,
    drills: game.stats.drills,
    mocks: game.stats.mocks,
    plans: game.stats.plans,
    badges: game.badges.filter((b) => b.earned).map((b) => b.id)
  };
}

/** The line a reader can paste somewhere to say how they are doing. */
export const shareText = ({ name, levelName, xp, streak, problems }, site) => `${name ? `${name} is` : "I'm"} ${/^[aeiou]/i.test(levelName) ? 'an' : 'a'} ${levelName} on ${site.name}: ${xp} XP, ${streak}-day streak, ${problems} coding problems solved. ${site.url}`;
