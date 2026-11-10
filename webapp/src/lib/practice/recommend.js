// What to suggest in Practice: up to a few quizzes for this reader, each with the reason. In order: quizzes in a topic the reader is weak in (from their
// latest try of each quiz), quizzes not taken yet (the easiest first), and quizzes taken a while ago and not finished perfectly. Pure: the catalog, the
// tries and the weak topics are passed in, and the clock is a parameter, so the same input is always the same answer.

const DAY = 86400000;

/**
 * @param {object} input
 * @param {Array<{ slug: string, topic?: string, difficulty?: string }>} input.quizzes the catalog's quizzes, in the order they are listed
 * @param {Array<{ quiz: string, score: number, max: number, at: string }>} [input.attempts] the reader's tries, newest first
 * @param {Array<{ topic: string, percent: number }>} [input.weak] the reader's topics with the share they got right
 * @param {string[]} [input.levels] the difficulty ids from easiest to hardest
 * @param {number} [input.now] milliseconds since the epoch
 * @param {number} [input.limit] how many to suggest
 * @param {number} [input.weakBelow] a topic below this percent is weak
 * @param {number} [input.revisitAfterDays] how long after a try a quiz that was not perfect is suggested again
 * @returns {Array<{ slug: string, kind: 'weak' | 'new' | 'revisit', topic: string, percent?: number, days?: number }>}
 */
export function recommend({ quizzes, attempts = [], weak = [], levels = ['beginner', 'intermediate', 'advanced'], now = Date.now(), limit = 3, weakBelow = 70, revisitAfterDays = 14 }) {
  const latest = new Map(); // newest try of each quiz (the list is newest first)
  const best = new Map();
  for (const a of attempts) {
    if (!a.max) continue;
    if (!latest.has(a.quiz)) latest.set(a.quiz, a);
    const ratio = a.score / a.max;
    if (!best.has(a.quiz) || ratio > best.get(a.quiz)) best.set(a.quiz, ratio);
  }
  const ratioOf = (slug) => { const a = latest.get(slug); return a ? a.score / a.max : 1; };
  const weakTopics = new Map(weak.filter((w) => typeof w.topic === 'string' && w.topic && w.percent < weakBelow).map((w) => [w.topic, w.percent]));
  const rank = (q) => { const i = levels.indexOf(q.difficulty); return i < 0 ? levels.length : i; };
  const picked = [];
  const seen = new Set();
  const add = (q, extra) => { if (!seen.has(q.slug) && picked.length < limit) { seen.add(q.slug); picked.push({ slug: q.slug, topic: q.topic || '', ...extra }); } };

  // Weak topics first, the weakest first; inside a topic the quiz that was done worst, or not at all, comes first.
  const inWeak = quizzes.map((q, order) => ({ q, order })).filter(({ q }) => weakTopics.has(q.topic));
  inWeak.sort((a, b) => weakTopics.get(a.q.topic) - weakTopics.get(b.q.topic) || (latest.has(a.q.slug) ? ratioOf(a.q.slug) : 0.5) - (latest.has(b.q.slug) ? ratioOf(b.q.slug) : 0.5) || a.order - b.order);
  for (const { q } of inWeak) if (!latest.has(q.slug) || ratioOf(q.slug) < 1) add(q, { kind: 'weak', percent: weakTopics.get(q.topic) });

  // Then what has not been tried, the easiest first, in the catalog's order among equals.
  quizzes.map((q, order) => ({ q, order })).filter(({ q }) => !latest.has(q.slug)).sort((a, b) => rank(a.q) - rank(b.q) || a.order - b.order).forEach(({ q }) => add(q, { kind: 'new' }));

  // Then what was tried long ago and not got perfect, the longest ago first.
  const old = quizzes.filter((q) => latest.has(q.slug) && (best.get(q.slug) ?? 0) < 1)
    .map((q) => ({ q, days: Math.floor((now - Date.parse(latest.get(q.slug).at)) / DAY) }))
    .filter(({ days }) => Number.isFinite(days) && days >= revisitAfterDays)
    .sort((a, b) => b.days - a.days);
  for (const { q, days } of old) add(q, { kind: 'revisit', days });
  return picked;
}
