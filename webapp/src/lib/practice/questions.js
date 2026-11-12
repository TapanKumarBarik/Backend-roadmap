// What is worked out from the answers to a set of questions: what picking an option does, how an area or a topic did, which band a score is in, and which area
// to start with. Pure, so the level check and the mock interview share it and it is tested without a browser. A question is { key, topic, choose, options };
// a result is { key, correct } (what the API says when it checks: api/routes/practice.js).

/** What picking `optionId` does to the options already picked: a question with one answer takes the new one, a question with several adds or removes it. */
export const toggled = (question, chosen, optionId) => (question.choose === 'any' ? (chosen.includes(optionId) ? chosen.filter((id) => id !== optionId) : [...chosen, optionId]) : [optionId]);

/** The whole-number percent of `right` in `total` (0 when there is nothing). */
export const percentOf = (right, total) => (total ? Math.round((right / total) * 100) : 0);

/**
 * How each area of the level check did: { id, label, right, total, percent }. A question with no result (it was not answered) counts as missed.
 * @param {{ id: string, label: string, questions: { key: string }[] }[]} areas
 * @param {{ key: string, correct: boolean }[]} results
 */
export function scoreAreas(areas, results) {
  const correct = new Set(results.filter((r) => r.correct).map((r) => r.key));
  return areas.map((area) => {
    const right = area.questions.filter((q) => correct.has(q.key)).length;
    return { id: area.id, label: area.label, right, total: area.questions.length, percent: percentOf(right, area.questions.length) };
  });
}

/** How each topic did across a set of questions, the weakest first (then by topic): [{ topic, right, total, percent }]. */
export function scoreTopics(questions, results) {
  const correct = new Set(results.filter((r) => r.correct).map((r) => r.key));
  const byTopic = new Map();
  for (const q of questions) {
    const now = byTopic.get(q.topic) || { topic: q.topic, right: 0, total: 0 };
    now.total += 1;
    if (correct.has(q.key)) now.right += 1;
    byTopic.set(q.topic, now);
  }
  return [...byTopic.values()].map((t) => ({ ...t, percent: percentOf(t.right, t.total) })).sort((a, b) => a.percent - b.percent || (a.topic < b.topic ? -1 : 1));
}

/** The index of the band a percent is in: `from` lists where each band starts (in order, the first is 0). */
export const bandOf = (percent, from) => from.reduce((band, start, i) => (percent >= start ? i : band), 0);

/** The area to start with: the one that did worst (the first of them on a tie), or null when there are none. */
export const weakestArea = (scores) => scores.reduce((worst, area) => (!worst || area.percent < worst.percent ? area : worst), null);
