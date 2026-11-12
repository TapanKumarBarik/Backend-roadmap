// Spaced review: what a reader got wrong, and the problems they have solved, come back after a while, and the gap grows each time they are right. It is
// the Leitner system: an item sits in a box, the box says how long until it is due (game.config.json -> review.intervalsDays: 1, 3, 7, 14, 30 days), a right
// answer moves it to the next box and a wrong one back to the first. Pure: the state, the key, the answer and today come in, the new state goes out. The state
// is kept on the reader's device (components and hooks save it); it is a plain object { key: { box, due } } with `due` a day as "2026-11-12".
import { dayFromName, dayName } from './days.js';

const DAY_MS = 86400000;

/** What names a question and a coding problem in the queue. */
export const questionItem = (key) => `q:${key}`;
export const problemItem = (slug) => `c:${slug}`;
export const isQuestionItem = (item) => item.startsWith('q:');
export const isProblemItem = (item) => item.startsWith('c:');
export const itemRef = (item) => item.slice(2);

/** The day `n` days after `day` (both as "2026-11-12"). */
export const addDays = (day, n) => dayName(dayFromName(day) * DAY_MS + n * DAY_MS);

/**
 * The state after `item` was answered (`correct` or not) on `today`. A right answer moves an item that is in the queue one box on (the last box stays); a wrong
 * one puts it back in the first. An item that is not in the queue is added by a wrong answer, or by a right one when `addIfNew` (a coding problem just solved);
 * otherwise (a question answered right that was never missed) nothing changes. The state given is not changed.
 * @param {Record<string, { box: number, due: string }>} state
 * @param {{ intervals: number[], addIfNew?: boolean }} rules
 */
export function record(state, item, correct, today, rules) {
  const { intervals, addIfNew = false } = rules;
  const known = state[item];
  if (!known && correct && !addIfNew) return state;
  const box = known && correct ? Math.min(known.box + 1, intervals.length - 1) : 0;
  return { ...state, [item]: { box, due: addDays(today, intervals[box]) } };
}

/** The items due on `today` or before, the longest waiting first (then the lower box, then by name so the order is stable). */
export function dueItems(state, today) {
  return Object.entries(state)
    .filter(([, { due }]) => due <= today)
    .sort(([a, x], [b, y]) => (x.due < y.due ? -1 : x.due > y.due ? 1 : x.box - y.box || (a < b ? -1 : 1)))
    .map(([item]) => item);
}

/** What the queue holds: all of it, and what is due on `today`. */
export const counts = (state, today) => ({ total: Object.keys(state).length, due: dueItems(state, today).length });

/** The state without `item`. */
export function forget(state, item) {
  const { [item]: gone, ...rest } = state; // eslint-disable-line no-unused-vars
  return rest;
}
